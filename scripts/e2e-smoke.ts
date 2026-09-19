import "dotenv/config";
import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { createApp } from "../src/app";

// Smoke test de punta a punta contra Supabase Auth + Postgres REALES (no
// mocks). Pensado para correr solo desde el workflow manual
// e2e-smoke.yml: acá (sandbox de Cowork) y en el dispositivo de Rocco el
// dominio de Supabase está bloqueado por política de red de la
// organización, así que este script no se puede correr localmente — los
// runners de GitHub Actions sí tienen salida completa (mismo motivo por el
// que prisma:generate y db-migrate.yml corren ahí y no acá, ver CLAUDE.md).
//
// Qué hace, en orden:
//   1. Asegura una organización + dos usuarios de prueba en Supabase Auth
//      (uno de tenant, uno platform admin) -- idempotente, se puede
//      re-correr sin acumular basura.
//   2. Siembra un dataset determinístico de clientes (uno al día, uno
//      atrasado, uno sin datos) para poder verificar /api/clientes/stats.
//   3. Inicia sesión de verdad contra Supabase Auth (password grant) para
//      conseguir JWTs reales -- no tokens fabricados a mano.
//   4. Levanta el servidor real (createApp()) en un puerto efímero y le
//      pega a los endpoints reales con esos JWTs, verificando también el
//      límite de autorización (un tenant no puede pegarle al panel de
//      admin de plataforma).
//
// Los datos de prueba quedan en una organización dedicada ("e2e-smoke") --
// no se tocan ni se leen datos de ningún cliente real de Rocco.

const SUPABASE_URL = requireEnv("SUPABASE_URL");
const SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
const ANON_KEY = requireEnv("SUPABASE_ANON_KEY");

const MEMBER_EMAIL = "e2e-tenant@xentech-smoke.test";
const PLATFORM_ADMIN_EMAIL = "e2e-platform-admin@xentech-smoke.test";
const ORG_SLUG = "e2e-smoke";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Falta la variable de entorno ${name}`);
  }
  return value;
}

const failures: string[] = [];
function assert(condition: unknown, message: string): void {
  if (!condition) failures.push(message);
}

async function adminFetch(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      ...init.headers,
    },
  });
}

async function findAuthUserIdByEmail(email: string): Promise<string | undefined> {
  const perPage = 200;
  for (let page = 1; page <= 10; page++) {
    const res = await adminFetch(`/auth/v1/admin/users?page=${page}&per_page=${perPage}`);
    if (!res.ok) return undefined;
    const body = (await res.json()) as { users?: Array<{ id: string; email?: string }> };
    const users = body.users ?? [];
    const match = users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (match) return match.id;
    if (users.length < perPage) return undefined;
  }
  return undefined;
}

// Idempotente: si el usuario ya existe (de una corrida anterior) le
// refresca la contraseña (el admin puede pisarla sin saber la anterior) en
// vez de fallar.
async function ensureAuthUser(email: string): Promise<{ id: string; password: string }> {
  const password = randomBytes(18).toString("base64url");

  const create = await adminFetch("/auth/v1/admin/users", {
    method: "POST",
    body: JSON.stringify({ email, password, email_confirm: true }),
  });

  if (create.ok) {
    const created = (await create.json()) as { id: string };
    return { id: created.id, password };
  }

  const existingId = await findAuthUserIdByEmail(email);
  if (!existingId) {
    throw new Error(
      `No se pudo crear ni encontrar el usuario ${email}: ${create.status} ${await create.text()}`,
    );
  }

  const update = await adminFetch(`/auth/v1/admin/users/${existingId}`, {
    method: "PUT",
    body: JSON.stringify({ password }),
  });
  if (!update.ok) {
    throw new Error(
      `No se pudo actualizar la contraseña de ${email}: ${update.status} ${await update.text()}`,
    );
  }
  return { id: existingId, password };
}

async function signIn(email: string, password: string): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: ANON_KEY },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    throw new Error(`No se pudo iniciar sesión como ${email}: ${res.status} ${await res.text()}`);
  }
  const body = (await res.json()) as { access_token: string };
  return body.access_token;
}

interface OrganizationAgentTogglesDto {
  organizationId: string;
  organizationName: string;
  toggles: Record<string, boolean>;
}

async function main() {
  const prisma = new PrismaClient();

  console.log("Sembrando organización + usuarios de prueba en Supabase Auth...");
  const org = await prisma.organization.upsert({
    where: { slug: ORG_SLUG },
    update: {},
    create: { name: "E2E Smoke Test", slug: ORG_SLUG },
  });

  const member = await ensureAuthUser(MEMBER_EMAIL);
  const platformAdmin = await ensureAuthUser(PLATFORM_ADMIN_EMAIL);

  await prisma.user.upsert({
    where: { id: member.id },
    update: { organizationId: org.id, email: MEMBER_EMAIL, role: "ADMIN", deletedAt: null },
    create: { id: member.id, organizationId: org.id, email: MEMBER_EMAIL, role: "ADMIN" },
  });

  await prisma.platformAdmin.upsert({
    where: { id: platformAdmin.id },
    update: { email: PLATFORM_ADMIN_EMAIL },
    create: { id: platformAdmin.id, email: PLATFORM_ADMIN_EMAIL },
  });

  // Dataset determinístico: se borra y se vuelve a crear en cada corrida,
  // así los números de /api/clientes/stats son siempre los mismos.
  await prisma.cliente.deleteMany({ where: { organizationId: org.id } });

  const hoy = new Date();
  const haceDiez = new Date(hoy);
  haceDiez.setDate(haceDiez.getDate() - 10);
  const haceSesenta = new Date(hoy);
  haceSesenta.setDate(haceSesenta.getDate() - 60);

  await prisma.cliente.createMany({
    data: [
      {
        organizationId: org.id,
        nombre: "E2E Al día",
        cuotaMonto: 1000,
        cuotaPeriodicidad: "MENSUAL",
        cuotaUltimoPago: haceDiez,
      },
      {
        organizationId: org.id,
        nombre: "E2E Atrasado",
        cuotaMonto: 1000,
        cuotaPeriodicidad: "MENSUAL",
        cuotaUltimoPago: haceSesenta,
      },
      { organizationId: org.id, nombre: "E2E Sin datos" },
    ],
  });

  console.log("Iniciando sesión de verdad contra Supabase Auth (password grant)...");
  const memberToken = await signIn(MEMBER_EMAIL, member.password);
  const adminToken = await signIn(PLATFORM_ADMIN_EMAIL, platformAdmin.password);

  console.log("Levantando el servidor real y pegándole con los JWT reales...");
  const app = createApp();
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  const base = `http://127.0.0.1:${port}`;

  async function call(path: string, token: string, init: RequestInit = {}): Promise<Response> {
    return fetch(`${base}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...init.headers,
      },
    });
  }

  // --- Usuario de tenant ---
  const meRes = await call("/api/me", memberToken);
  const me = (await meRes.json()) as { organizationId?: string; isPlatformAdmin?: boolean };
  assert(meRes.status === 200, `GET /api/me (tenant) esperaba 200, dio ${meRes.status}`);
  assert(
    me.organizationId === org.id,
    `GET /api/me (tenant): organizationId esperado ${org.id}, dio ${me.organizationId}`,
  );
  assert(me.isPlatformAdmin === false, "GET /api/me (tenant): isPlatformAdmin esperaba false");

  const listRes = await call("/api/clientes", memberToken);
  const lista = (await listRes.json()) as unknown[];
  assert(listRes.status === 200, `GET /api/clientes esperaba 200, dio ${listRes.status}`);
  assert(
    Array.isArray(lista) && lista.length === 3,
    `GET /api/clientes esperaba 3 filas, dio ${Array.isArray(lista) ? lista.length : typeof lista}`,
  );

  const statsRes = await call("/api/clientes/stats", memberToken);
  const stats = (await statsRes.json()) as {
    total?: number;
    alDia?: number;
    atrasado?: number;
    sinDatos?: number;
  };
  assert(statsRes.status === 200, `GET /api/clientes/stats esperaba 200, dio ${statsRes.status}`);
  assert(
    stats.total === 3 && stats.alDia === 1 && stats.atrasado === 1 && stats.sinDatos === 1,
    `GET /api/clientes/stats esperaba {total:3,alDia:1,atrasado:1,sinDatos:1}, dio ${JSON.stringify(stats)}`,
  );

  const createRes = await call("/api/clientes", memberToken, {
    method: "POST",
    body: JSON.stringify({ nombre: "E2E Creado por el smoke test" }),
  });
  const creado = (await createRes.json()) as { id?: string; nombre?: string };
  assert(createRes.status === 201, `POST /api/clientes esperaba 201, dio ${createRes.status}`);
  assert(
    creado.nombre === "E2E Creado por el smoke test",
    "POST /api/clientes: el nombre no coincide",
  );

  if (creado.id) {
    const deleteRes = await call(`/api/clientes/${creado.id}`, memberToken, { method: "DELETE" });
    assert(
      deleteRes.status === 204,
      `DELETE /api/clientes/:id esperaba 204, dio ${deleteRes.status}`,
    );
  }

  // Límite de autorización: un tenant no puede pegarle al panel de admin.
  const tenantIntentaAdmin = await call("/api/admin/organizations", memberToken);
  assert(
    tenantIntentaAdmin.status === 403,
    `GET /api/admin/organizations con JWT de tenant esperaba 403, dio ${tenantIntentaAdmin.status}`,
  );

  // --- Platform admin ---
  const meAdminRes = await call("/api/me", adminToken);
  const meAdmin = (await meAdminRes.json()) as { isPlatformAdmin?: boolean };
  assert(meAdminRes.status === 200, `GET /api/me (admin) esperaba 200, dio ${meAdminRes.status}`);
  assert(meAdmin.isPlatformAdmin === true, "GET /api/me (admin): isPlatformAdmin esperaba true");

  const adminListRes = await call("/api/admin/organizations", adminToken);
  const adminList = (await adminListRes.json()) as OrganizationAgentTogglesDto[];
  assert(
    adminListRes.status === 200,
    `GET /api/admin/organizations esperaba 200, dio ${adminListRes.status}`,
  );
  const orgEntry = Array.isArray(adminList)
    ? adminList.find((o) => o.organizationId === org.id)
    : undefined;
  assert(!!orgEntry, "GET /api/admin/organizations: no aparece la organización de prueba");
  assert(
    orgEntry?.toggles.WHATSAPP === false,
    "GET /api/admin/organizations: WHATSAPP esperaba false antes de togglear",
  );

  const toggleRes = await call(
    `/api/admin/organizations/${org.id}/agent-toggles/WHATSAPP`,
    adminToken,
    {
      method: "PUT",
      body: JSON.stringify({ enabled: true }),
    },
  );
  assert(
    toggleRes.status === 204,
    `PUT .../agent-toggles/WHATSAPP esperaba 204, dio ${toggleRes.status}`,
  );

  const adminListRes2 = await call("/api/admin/organizations", adminToken);
  const adminList2 = (await adminListRes2.json()) as OrganizationAgentTogglesDto[];
  const orgEntry2 = Array.isArray(adminList2)
    ? adminList2.find((o) => o.organizationId === org.id)
    : undefined;
  assert(orgEntry2?.toggles.WHATSAPP === true, "Después del PUT, WHATSAPP debería quedar en true");

  server.close();
  await prisma.$disconnect();

  if (failures.length > 0) {
    console.error("\ne2e-smoke: fallaron las siguientes verificaciones:\n");
    for (const f of failures) console.error(` - ${f}`);
    process.exitCode = 1;
    return;
  }

  console.log("\ne2e-smoke: todo OK contra Supabase Auth + Postgres reales.");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
