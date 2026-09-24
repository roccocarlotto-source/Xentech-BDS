import assert from "node:assert/strict";
import { test } from "node:test";
import { AppError } from "../utils/AppError";
import { hashToken } from "../lib/resenas/token";
import {
  DIAS_VALIDEZ_DEFAULT,
  MENSAJE_LINK_INVALIDO,
  generarLinkResena,
  listarResenasPublicas,
  moderarResena,
  obtenerFormularioPublico,
  publicarResena,
  type ResenaDeps,
} from "./resena.service";

// Fake en memoria del repositorio: reproduce las reglas que en la base real
// dan el filtro por organización y el UPDATE condicional del token.

const ORG = "org-a";
const OTRA_ORG = "org-b";
const AHORA = new Date("2026-09-24T12:00:00Z");
const DIA = 24 * 60 * 60 * 1000;

interface TokenFila {
  id: string;
  organizationId: string;
  tokenHash: string;
  clienteId: string;
  presupuestoId: string | null;
  venceEn: Date;
  usadoEn: Date | null;
}

interface ResenaFila {
  id: string;
  organizationId: string;
  tokenResenaId: string;
  clienteId: string;
  anonimo: boolean;
  nombreVisible: string | null;
  estrellas: number;
  comentario: string | null;
  moderacion: "APROBADA" | "RECHAZADA";
  moderadoPorId: string | null;
  moderadoEn: Date | null;
  motivoModeracion: string | null;
  createdAt: Date;
}

function crearEntorno(opts: { diasConfig?: number | null; moduloOn?: boolean } = {}) {
  const orgs = [
    { id: ORG, name: "Cartelería Sur", slug: "carteleria-sur", deletedAt: null as Date | null },
    { id: OTRA_ORG, name: "Otra", slug: "otra", deletedAt: null as Date | null },
  ];
  const clientes = [
    { id: "cli-1", organizationId: ORG, nombre: "Ana Pérez", deletedAt: null as Date | null },
    { id: "cli-2", organizationId: OTRA_ORG, nombre: "Beto", deletedAt: null as Date | null },
  ];
  const presupuestos = [
    { id: "pre-1", organizationId: ORG, clienteId: "cli-1", deletedAt: null },
    { id: "pre-2", organizationId: ORG, clienteId: "cli-otro", deletedAt: null },
  ];
  const tokens: TokenFila[] = [];
  const resenas: ResenaFila[] = [];
  const moduloOn = new Set(opts.moduloOn === false ? [] : [ORG, OTRA_ORG]);
  let seq = 0;
  let proximoToken = 0;

  const repo: ResenaDeps["repo"] = {
    async findTokenPorHash(tokenHash) {
      const t = tokens.find((x) => x.tokenHash === tokenHash);
      if (!t) return null;
      const c = clientes.find((x) => x.id === t.clienteId)!;
      return { ...t, cliente: { nombre: c.nombre, deletedAt: c.deletedAt } };
    },
    async findOrganizacion(id) {
      const o = orgs.find((x) => x.id === id && !x.deletedAt);
      return o ? { id: o.id, name: o.name } : null;
    },
    async findOrganizacionPorSlug(slug) {
      const o = orgs.find((x) => x.slug === slug && !x.deletedAt);
      return o ? { id: o.id, name: o.name } : null;
    },
    async findCliente(organizationId, clienteId) {
      const c = clientes.find(
        (x) => x.id === clienteId && x.organizationId === organizationId && !x.deletedAt,
      );
      return c ? { id: c.id } : null;
    },
    async findPresupuesto(organizationId, id) {
      const p = presupuestos.find((x) => x.id === id && x.organizationId === organizationId);
      return p ? { id: p.id, clienteId: p.clienteId } : null;
    },
    async diasValidezToken() {
      return opts.diasConfig ?? null;
    },
    async crearToken(data) {
      tokens.push({ id: `tok-${++seq}`, usadoEn: null, ...data });
    },
    async consumirTokenYCrearResena(data) {
      const t = tokens.find((x) => x.id === data.tokenId);
      if (!t || t.usadoEn || t.venceEn.getTime() <= data.ahora.getTime()) return null;
      t.usadoEn = data.ahora;
      const r: ResenaFila = {
        id: `res-${++seq}`,
        organizationId: data.organizationId,
        tokenResenaId: data.tokenId,
        clienteId: data.clienteId,
        anonimo: data.anonimo,
        nombreVisible: data.nombreVisible,
        estrellas: data.estrellas,
        comentario: data.comentario,
        moderacion: "APROBADA",
        moderadoPorId: null,
        moderadoEn: null,
        motivoModeracion: null,
        createdAt: data.ahora,
      };
      resenas.push(r);
      return { id: r.id };
    },
    async listar(organizationId, moderacion) {
      return resenas
        .filter((r) => r.organizationId === organizationId)
        .filter((r) => !moderacion || r.moderacion === moderacion) as never;
    },
    async findResena(organizationId, id) {
      const r = resenas.find((x) => x.id === id && x.organizationId === organizationId);
      return r ? { id: r.id } : null;
    },
    async moderar(organizationId, id, data) {
      const r = resenas.find((x) => x.id === id && x.organizationId === organizationId);
      if (r) Object.assign(r, data);
    },
    async listarPublicas(organizationId, skip, take) {
      return resenas
        .filter((r) => r.organizationId === organizationId && r.moderacion === "APROBADA")
        .slice(skip, skip + take);
    },
    async resumenPublico(organizationId) {
      const aprobadas = resenas.filter(
        (r) => r.organizationId === organizationId && r.moderacion === "APROBADA",
      );
      return {
        total: aprobadas.length,
        promedio: aprobadas.length
          ? aprobadas.reduce((s, r) => s + r.estrellas, 0) / aprobadas.length
          : null,
      };
    },
  };

  const deps: ResenaDeps = {
    repo,
    moduloHabilitado: async (id) => moduloOn.has(id),
    ahora: () => AHORA,
    generarToken: () => `T${String(++proximoToken).padStart(42, "x")}`,
  };

  return { deps, tokens, resenas, clientes, orgs, moduloOn };
}

async function rechazaConLinkInvalido(p: Promise<unknown>) {
  await assert.rejects(p, (err: unknown) => {
    assert.ok(err instanceof AppError);
    assert.equal(err.status, 404);
    assert.equal(err.message, MENSAJE_LINK_INVALIDO);
    return true;
  });
}

const publicar = (token: string, extra: Partial<Parameters<typeof publicarResena>[0]> = {}) => ({
  token,
  anonimo: false,
  estrellas: 5,
  comentario: null,
  ...extra,
});

// --- generarLinkResena -------------------------------------------------------

test("genera un token, guarda SOLO su hash y vence a los 30 días por default", async () => {
  const { deps, tokens } = crearEntorno();
  const { token, venceEn } = await generarLinkResena(ORG, { clienteId: "cli-1" }, deps);

  assert.equal(tokens.length, 1);
  assert.equal(tokens[0].tokenHash, hashToken(token));
  assert.ok(!JSON.stringify(tokens).includes(token));
  assert.equal(venceEn.getTime(), AHORA.getTime() + DIAS_VALIDEZ_DEFAULT * DIA);
});

test("usa los días de validez configurados por la organización", async () => {
  const { deps } = crearEntorno({ diasConfig: 7 });
  const { venceEn } = await generarLinkResena(ORG, { clienteId: "cli-1" }, deps);
  assert.equal(venceEn.getTime(), AHORA.getTime() + 7 * DIA);
});

test("no genera links para un cliente de otra organización", async () => {
  const { deps, tokens } = crearEntorno();
  await assert.rejects(
    generarLinkResena(ORG, { clienteId: "cli-2" }, deps),
    /Cliente no encontrado/,
  );
  assert.equal(tokens.length, 0);
});

test("valida que el presupuesto exista y sea del mismo cliente", async () => {
  const { deps } = crearEntorno();
  await generarLinkResena(ORG, { clienteId: "cli-1", presupuestoId: "pre-1" }, deps);
  await assert.rejects(
    generarLinkResena(ORG, { clienteId: "cli-1", presupuestoId: "pre-2" }, deps),
    /no es de ese cliente/,
  );
  await assert.rejects(
    generarLinkResena(ORG, { clienteId: "cli-1", presupuestoId: "pre-x" }, deps),
    /Presupuesto no encontrado/,
  );
});

// --- formulario público ------------------------------------------------------

test("el formulario devuelve solo la organización y el nombre del cliente", async () => {
  const { deps } = crearEntorno();
  const { token } = await generarLinkResena(ORG, { clienteId: "cli-1" }, deps);
  assert.deepEqual(await obtenerFormularioPublico(token, deps), {
    organizacion: "Cartelería Sur",
    nombreCliente: "Ana Pérez",
  });
});

test("token con formato inválido o inexistente: mismo mensaje genérico", async () => {
  const { deps } = crearEntorno();
  await rechazaConLinkInvalido(obtenerFormularioPublico("corto", deps));
  await rechazaConLinkInvalido(obtenerFormularioPublico("z".repeat(43), deps));
});

test("token vencido: inválido", async () => {
  const { deps, tokens } = crearEntorno();
  const { token } = await generarLinkResena(ORG, { clienteId: "cli-1" }, deps);
  tokens[0].venceEn = AHORA;
  await rechazaConLinkInvalido(obtenerFormularioPublico(token, deps));
  await rechazaConLinkInvalido(publicarResena(publicar(token), deps));
});

test("cliente borrado, organización borrada o módulo apagado: inválido", async () => {
  const env1 = crearEntorno();
  const t1 = (await generarLinkResena(ORG, { clienteId: "cli-1" }, env1.deps)).token;
  env1.clientes[0].deletedAt = AHORA;
  await rechazaConLinkInvalido(obtenerFormularioPublico(t1, env1.deps));

  const env2 = crearEntorno();
  const t2 = (await generarLinkResena(ORG, { clienteId: "cli-1" }, env2.deps)).token;
  env2.orgs[0].deletedAt = AHORA;
  await rechazaConLinkInvalido(obtenerFormularioPublico(t2, env2.deps));

  const env3 = crearEntorno();
  const t3 = (await generarLinkResena(ORG, { clienteId: "cli-1" }, env3.deps)).token;
  env3.moduloOn.delete(ORG);
  await rechazaConLinkInvalido(obtenerFormularioPublico(t3, env3.deps));
  await rechazaConLinkInvalido(publicarResena(publicar(t3), env3.deps));
});

// --- publicar ----------------------------------------------------------------

test("publica con nombre: copia el nombre del cliente y marca el token como usado", async () => {
  const { deps, tokens, resenas } = crearEntorno();
  const { token } = await generarLinkResena(ORG, { clienteId: "cli-1" }, deps);

  await publicarResena(publicar(token, { estrellas: 4, comentario: "Muy bien" }), deps);

  assert.equal(resenas.length, 1);
  assert.equal(resenas[0].nombreVisible, "Ana Pérez");
  assert.equal(resenas[0].anonimo, false);
  assert.equal(resenas[0].estrellas, 4);
  assert.equal(resenas[0].comentario, "Muy bien");
  assert.equal(resenas[0].organizationId, ORG);
  assert.equal(resenas[0].moderacion, "APROBADA");
  assert.equal(tokens[0].usadoEn, AHORA);
});

test("publica como anónimo: no guarda el nombre", async () => {
  const { deps, resenas } = crearEntorno();
  const { token } = await generarLinkResena(ORG, { clienteId: "cli-1" }, deps);
  await publicarResena(publicar(token, { anonimo: true }), deps);
  assert.equal(resenas[0].nombreVisible, null);
  assert.equal(resenas[0].anonimo, true);
});

test("un token se usa una sola vez", async () => {
  const { deps, resenas } = crearEntorno();
  const { token } = await generarLinkResena(ORG, { clienteId: "cli-1" }, deps);
  await publicarResena(publicar(token), deps);
  await rechazaConLinkInvalido(publicarResena(publicar(token), deps));
  await rechazaConLinkInvalido(obtenerFormularioPublico(token, deps));
  assert.equal(resenas.length, 1);
});

test("si el token se consume entre la validación y el guardado, no crea reseña", async () => {
  const { deps, tokens, resenas } = crearEntorno();
  const { token } = await generarLinkResena(ORG, { clienteId: "cli-1" }, deps);
  const original = deps.repo.consumirTokenYCrearResena;
  deps.repo.consumirTokenYCrearResena = async (data) => {
    tokens[0].usadoEn = AHORA; // otro request ganó la carrera
    return original(data);
  };
  await rechazaConLinkInvalido(publicarResena(publicar(token), deps));
  assert.equal(resenas.length, 0);
});

// --- moderación --------------------------------------------------------------

test("moderar: rechaza con motivo, y al re-aprobar limpia el motivo", async () => {
  const { deps, resenas } = crearEntorno();
  const { token } = await generarLinkResena(ORG, { clienteId: "cli-1" }, deps);
  await publicarResena(publicar(token), deps);
  const id = resenas[0].id;

  await moderarResena(ORG, id, "admin-1", { moderacion: "RECHAZADA", motivo: "spam" }, deps);
  assert.equal(resenas[0].moderacion, "RECHAZADA");
  assert.equal(resenas[0].motivoModeracion, "spam");
  assert.equal(resenas[0].moderadoPorId, "admin-1");

  await moderarResena(ORG, id, "admin-1", { moderacion: "APROBADA", motivo: "x" }, deps);
  assert.equal(resenas[0].moderacion, "APROBADA");
  assert.equal(resenas[0].motivoModeracion, null);
});

test("moderar una reseña de otra organización: 404 y no la toca", async () => {
  const { deps, resenas } = crearEntorno();
  const { token } = await generarLinkResena(ORG, { clienteId: "cli-1" }, deps);
  await publicarResena(publicar(token), deps);
  await assert.rejects(
    moderarResena(OTRA_ORG, resenas[0].id, "x", { moderacion: "RECHAZADA", motivo: "m" }, deps),
    /Reseña no encontrada/,
  );
  assert.equal(resenas[0].moderacion, "APROBADA");
});

// --- listado público ---------------------------------------------------------

test("listado público: solo aprobadas, sin datos internos, con promedio", async () => {
  const { deps, resenas } = crearEntorno();
  for (const [estrellas, anonimo] of [
    [5, false],
    [2, true],
    [1, false],
  ] as const) {
    const { token } = await generarLinkResena(ORG, { clienteId: "cli-1" }, deps);
    await publicarResena(publicar(token, { estrellas, anonimo }), deps);
  }
  resenas[2].moderacion = "RECHAZADA";

  const listado = await listarResenasPublicas("carteleria-sur", 1, deps);
  assert.equal(listado.organizacion, "Cartelería Sur");
  assert.equal(listado.total, 2);
  assert.equal(listado.promedio, 3.5);
  assert.equal(listado.totalPaginas, 1);
  assert.deepEqual(
    listado.resenas.map((r) => [r.nombre, r.estrellas]),
    [
      ["Ana Pérez", 5],
      [null, 2],
    ],
  );
  for (const r of listado.resenas) {
    assert.deepEqual(Object.keys(r).sort(), ["comentario", "estrellas", "fecha", "id", "nombre"]);
  }
});

test("listado público: la reseña negativa legítima también se muestra (§5)", async () => {
  const { deps } = crearEntorno();
  const { token } = await generarLinkResena(ORG, { clienteId: "cli-1" }, deps);
  await publicarResena(publicar(token, { estrellas: 1, comentario: "Tardaron mucho" }), deps);
  const listado = await listarResenasPublicas("carteleria-sur", 1, deps);
  assert.equal(listado.resenas[0].estrellas, 1);
});

test("listado público: slug inexistente o módulo apagado dan 404", async () => {
  const { deps, moduloOn } = crearEntorno();
  await assert.rejects(listarResenasPublicas("no-existe", 1, deps), /No encontrado/);
  moduloOn.delete(ORG);
  await assert.rejects(listarResenasPublicas("carteleria-sur", 1, deps), /No encontrado/);
});
