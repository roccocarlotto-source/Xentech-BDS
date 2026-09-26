import assert from "node:assert/strict";
import { test } from "node:test";
import {
  procesarRespuestaEmail,
  type RespuestaEmailDeps,
  type RespuestaEmailEntrante,
} from "./respuestaEmail.service";

const ORG = "org-1";
const PRESU = "0f8fad5b-d9cb-469f-a165-70867728950e";
const CLI = "cli-1";

interface Registro {
  bajas: Array<{ organizationId: string; clienteId: string; fecha: Date }>;
  cancelaciones: Array<{ presupuestoId: string; motivo: string }>;
  mensajes: Array<{ presupuestoId: string | null; clienteId: string; contenido: string }>;
}

function crearDeps(overrides: Partial<RespuestaEmailDeps> = {}): {
  deps: RespuestaEmailDeps;
  registro: Registro;
} {
  const registro: Registro = { bajas: [], cancelaciones: [], mensajes: [] };
  const deps: RespuestaEmailDeps = {
    buscarPresupuesto: async (id) =>
      id === PRESU ? { id: PRESU, organizationId: ORG, clienteId: CLI } : null,
    buscarClientePorEmail: async () => null,
    crearMensajeEntrante: async (data) => {
      registro.mensajes.push({
        presupuestoId: data.presupuestoId,
        clienteId: data.clienteId,
        contenido: data.contenido,
      });
    },
    marcarBaja: async (organizationId, clienteId, fecha) => {
      registro.bajas.push({ organizationId, clienteId, fecha });
    },
    cancelarEnviosPendientes: async (_org, presupuestoId, motivo) => {
      registro.cancelaciones.push({ presupuestoId, motivo });
      return { count: 2 };
    },
    ...overrides,
  };
  return { deps, registro };
}

function entrante(overrides: Partial<RespuestaEmailEntrante> = {}): RespuestaEmailEntrante {
  return {
    externalId: "<mensaje-1@correo.test>",
    from: "contacto@panaderia-la-espiga.test",
    to: [`respuestas+${PRESU}@ejemplo.test`],
    texto: "Gracias, lo estoy viendo.",
    fecha: new Date("2026-09-26T12:00:00Z"),
    ...overrides,
  };
}

test("una respuesta normal se registra y no da de baja a nadie", async () => {
  const { deps, registro } = crearDeps();
  const r = await procesarRespuestaEmail(entrante(), deps);

  assert.deepEqual(r, { estado: "procesada", baja: false, enviosCancelados: 0 });
  assert.equal(registro.bajas.length, 0);
  assert.equal(registro.cancelaciones.length, 0);
  assert.equal(registro.mensajes.length, 1);
  assert.equal(registro.mensajes[0].presupuestoId, PRESU);
});

test("una baja marca el consentimiento y cancela los envíos pendientes", async () => {
  const { deps, registro } = crearDeps();
  const r = await procesarRespuestaEmail(entrante({ texto: "BAJA" }), deps);

  assert.deepEqual(r, { estado: "procesada", baja: true, enviosCancelados: 2 });
  assert.deepEqual(registro.bajas, [
    { organizationId: ORG, clienteId: CLI, fecha: new Date("2026-09-26T12:00:00Z") },
  ]);
  assert.equal(registro.cancelaciones[0].presupuestoId, PRESU);
  // La respuesta igual queda registrada, para que se vea en el historial.
  assert.equal(registro.mensajes.length, 1);
});

test("la baja se aplica aunque el registro del mensaje falle por duplicado", async () => {
  const { deps, registro } = crearDeps({
    crearMensajeEntrante: async () => {
      throw Object.assign(new Error("Unique constraint"), { code: "P2002" });
    },
  });

  const r = await procesarRespuestaEmail(entrante({ texto: "baja" }), deps);

  assert.deepEqual(r, { estado: "duplicada" });
  // Lo importante: la baja quedó, aunque el mensaje no se haya podido guardar.
  assert.equal(registro.bajas.length, 1);
  assert.equal(registro.cancelaciones.length, 1);
});

test("un error del insert que NO es de unicidad se propaga", async () => {
  const { deps } = crearDeps({
    crearMensajeEntrante: async () => {
      throw new Error("la base se cayó");
    },
  });
  await assert.rejects(() => procesarRespuestaEmail(entrante(), deps), /la base se cayó/);
});

test("sin tag en el Reply-To, ubica al cliente por su email y no pierde la baja", async () => {
  const { deps, registro } = crearDeps({
    buscarClientePorEmail: async () => ({ id: CLI, organizationId: ORG }),
  });

  const r = await procesarRespuestaEmail(
    entrante({ to: ["respuestas@ejemplo.test"], texto: "no me escriban más" }),
    deps,
  );

  assert.deepEqual(r, { estado: "procesada", baja: true, enviosCancelados: 0 });
  assert.equal(registro.bajas.length, 1);
  // Sin presupuesto identificado no se cancelan envíos de uno puntual: de
  // eso se encarga el chequeo de baja del job antes de cada envío.
  assert.equal(registro.cancelaciones.length, 0);
  assert.equal(registro.mensajes[0].presupuestoId, null);
});

test("el tag apunta a un presupuesto que no existe: cae al respaldo por email", async () => {
  const { deps, registro } = crearDeps({
    buscarPresupuesto: async () => null,
    buscarClientePorEmail: async () => ({ id: CLI, organizationId: ORG }),
  });

  const r = await procesarRespuestaEmail(entrante(), deps);

  assert.equal(r.estado, "procesada");
  assert.equal(registro.mensajes[0].clienteId, CLI);
});

test("si no se puede atribuir la respuesta a nadie, lo dice en vez de inventar", async () => {
  const { deps, registro } = crearDeps({
    buscarPresupuesto: async () => null,
    buscarClientePorEmail: async () => null,
  });

  const r = await procesarRespuestaEmail(entrante({ to: ["respuestas@ejemplo.test"] }), deps);

  assert.deepEqual(r, { estado: "sin_destinatario" });
  assert.equal(registro.mensajes.length, 0);
  assert.equal(registro.bajas.length, 0);
});

test("la línea de baja citada del email original no da de baja", async () => {
  const { deps, registro } = crearDeps();
  const texto = [
    "Perfecto, avancen.",
    "",
    "El vie, 25 sep 2026, Imagen Visual escribió:",
    "> Respondé BAJA si no querés más mensajes.",
  ].join("\n");

  const r = await procesarRespuestaEmail(entrante({ texto }), deps);

  assert.deepEqual(r, { estado: "procesada", baja: false, enviosCancelados: 0 });
  assert.equal(registro.bajas.length, 0);
});
