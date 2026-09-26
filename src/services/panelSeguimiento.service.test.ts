import assert from "node:assert/strict";
import { test } from "node:test";
import { solicitarResena, type SolicitarResenaDeps } from "./panelSeguimiento.service";
import { AppError } from "../utils/AppError";

const ORG = "org-1";
const PRESU = "presu-1";
const VENCE = new Date("2026-10-26T00:00:00Z");

interface Registro {
  emails: Array<{ to: string; subject: string; body: string }>;
  linksGenerados: number;
}

function crearDeps(
  opts: {
    estado?: "PENDIENTE" | "ACEPTADO" | "RECHAZADO";
    email?: string | null;
    sinProveedor?: boolean;
    sinUrl?: boolean;
    envioFalla?: boolean;
    noExiste?: boolean;
  } = {},
): { deps: SolicitarResenaDeps; registro: Registro } {
  const registro: Registro = { emails: [], linksGenerados: 0 };

  const deps: SolicitarResenaDeps = {
    buscarPresupuesto: async () =>
      opts.noExiste
        ? null
        : {
            id: PRESU,
            estado: opts.estado ?? "ACEPTADO",
            clienteId: "cli-1",
            cliente: {
              nombre: "Panadería La Espiga",
              personaContacto: "Rosana Fernández",
              email: opts.email === undefined ? "rosana@laespiga.test" : opts.email,
            },
          },
    generarLink: async () => {
      registro.linksGenerados += 1;
      return { token: "tok-123", venceEn: VENCE };
    },
    getEmailProvider: () =>
      opts.sinProveedor
        ? null
        : {
            enviar: async (email) => {
              registro.emails.push({
                to: email.to,
                subject: email.subject,
                body: email.body,
              });
              return opts.envioFalla
                ? { ok: false, error: "Resend respondió 403" }
                : { ok: true, providerMessageId: "id-1" };
            },
          },
    urlPublica: () => (opts.sinUrl ? null : "https://resenas.ejemplo.test/"),
  };

  return { deps, registro };
}

test("presupuesto aceptado: genera el link y lo manda por email", async () => {
  const { deps, registro } = crearDeps();
  const r = await solicitarResena(ORG, PRESU, deps);

  assert.equal(r.emailEnviado, true);
  assert.equal(r.token, "tok-123");
  assert.equal(registro.emails[0].to, "rosana@laespiga.test");
  // El link va absoluto y sin barra doble.
  assert.match(registro.emails[0].body, /https:\/\/resenas\.ejemplo\.test\/r\/tok-123/);
  // Se saluda a la persona, no a la empresa.
  assert.match(registro.emails[0].body, /Rosana Fernández/);
});

test("no se puede pedir reseña de un presupuesto que no está aceptado", async () => {
  const { deps, registro } = crearDeps({ estado: "PENDIENTE" });
  await assert.rejects(
    () => solicitarResena(ORG, PRESU, deps),
    (err: unknown) => err instanceof AppError && err.status === 409,
  );
  // Y no se generó ningún token al pedo.
  assert.equal(registro.linksGenerados, 0);
});

test("presupuesto inexistente: 404", async () => {
  const { deps } = crearDeps({ noExiste: true });
  await assert.rejects(
    () => solicitarResena(ORG, PRESU, deps),
    (err: unknown) => err instanceof AppError && err.status === 404,
  );
});

test("sin email del cliente, el token igual se genera para copiarlo a mano", async () => {
  const { deps, registro } = crearDeps({ email: null });
  const r = await solicitarResena(ORG, PRESU, deps);

  assert.equal(r.emailEnviado, false);
  assert.match(r.motivo!, /no tiene email/);
  assert.equal(r.token, "tok-123");
  assert.equal(registro.emails.length, 0);
});

test("sin APP_PUBLIC_URL no se puede armar el link absoluto, y lo dice", async () => {
  const { deps } = crearDeps({ sinUrl: true });
  const r = await solicitarResena(ORG, PRESU, deps);

  assert.equal(r.emailEnviado, false);
  assert.match(r.motivo!, /APP_PUBLIC_URL/);
  assert.equal(r.token, "tok-123");
});

test("sin proveedor de email, mismo criterio: token sí, envío no", async () => {
  const { deps } = crearDeps({ sinProveedor: true });
  const r = await solicitarResena(ORG, PRESU, deps);

  assert.equal(r.emailEnviado, false);
  assert.match(r.motivo!, /proveedor de email/);
});

test("si el envío falla, devuelve el error del proveedor sin perder el token", async () => {
  const { deps } = crearDeps({ envioFalla: true });
  const r = await solicitarResena(ORG, PRESU, deps);

  assert.equal(r.emailEnviado, false);
  assert.match(r.motivo!, /403/);
  assert.equal(r.token, "tok-123");
});
