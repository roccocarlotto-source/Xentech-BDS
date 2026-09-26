import assert from "node:assert/strict";
import { test } from "node:test";
import {
  clasificarRespuestasPendientes,
  type ClasificacionDeps,
  type MensajeSinClasificar,
} from "./clasificacionRespuesta.service";
import { CLASIFICACION_TOOL_NAME } from "../lib/seguimiento/clasificacionRespuesta";
import type { EmailProvider } from "../lib/email/emailProvider";
import type { LlmProvider } from "../lib/llm/types";

const ORG = "org-1";

function mensaje(overrides: Partial<MensajeSinClasificar> = {}): MensajeSinClasificar {
  return {
    id: "msg-1",
    organizationId: ORG,
    presupuestoId: "presu-1",
    clienteId: "cli-1",
    contenido: "¿Me hacen un descuento?",
    presupuesto: {
      estado: "EN_SEGUIMIENTO",
      vendedorId: "user-vendedor",
      creadoPorId: "user-carga",
      descripcion: "Cartel luminoso frontal 3x1m",
    },
    cliente: { nombre: "Panadería La Espiga", personaContacto: "Rosana Fernández" },
    ...overrides,
  };
}

function llmQueClasifica(clasificacion: string, resumen = "resumen de prueba"): LlmProvider {
  return {
    complete: async () => ({
      content: null,
      toolCalls: [
        { id: "1", name: CLASIFICACION_TOOL_NAME, arguments: { clasificacion, resumen } },
      ],
    }),
  };
}

interface Registro {
  guardadas: Array<{ id: string; clasificacion: string; requiereVendedor: boolean }>;
  estados: Array<{ presupuestoId: string; hasta: string }>;
  emails: Array<{ to: string; subject: string; body: string }>;
}

function crearDeps(
  opts: {
    pendientes?: MensajeSinClasificar[];
    llm?: LlmProvider;
    sinProveedorEmail?: boolean;
    claimPerdido?: boolean;
  } = {},
): { deps: ClasificacionDeps; registro: Registro } {
  const registro: Registro = { guardadas: [], estados: [], emails: [] };

  const emailProvider: EmailProvider = {
    enviar: async (email) => {
      registro.emails.push({ to: email.to, subject: email.subject, body: email.body });
      return { ok: true, providerMessageId: "id-1" };
    },
  };

  const deps: ClasificacionDeps = {
    buscarSinClasificar: async () => opts.pendientes ?? [mensaje()],
    guardarClasificacion: async (id, _org, data) => {
      if (opts.claimPerdido) return { count: 0 };
      registro.guardadas.push({
        id,
        clasificacion: data.clasificacionIa,
        requiereVendedor: data.requiereVendedor,
      });
      return { count: 1 };
    },
    actualizarEstadoPresupuestoSiCoincide: async (_org, id, _desde, hasta) => {
      registro.estados.push({ presupuestoId: id, hasta });
    },
    buscarUsuario: async (_org, id) => ({ email: `${id}@carteles.example` }),
    getLlmProvider: () => opts.llm ?? llmQueClasifica("PIDE_DESCUENTO"),
    getEmailProvider: () => (opts.sinProveedorEmail ? null : emailProvider),
    modelo: () => "test-model",
  };
  return { deps, registro };
}

test("sin mensajes pendientes no hace nada", async () => {
  const { deps, registro } = crearDeps({ pendientes: [] });
  const r = await clasificarRespuestasPendientes(20, deps);

  assert.deepEqual(r, { clasificados: 0, avisados: 0, fallidos: 0 });
  assert.equal(registro.guardadas.length, 0);
});

test("un pedido de descuento se guarda, avisa al vendedor y NO toca el estado", async () => {
  const { deps, registro } = crearDeps();
  const r = await clasificarRespuestasPendientes(20, deps);

  assert.equal(r.clasificados, 1);
  assert.equal(r.avisados, 1);
  assert.equal(registro.guardadas[0].requiereVendedor, true);
  assert.equal(registro.estados.length, 0);
  // Va al vendedor del presupuesto, no a quien lo cargó.
  assert.equal(registro.emails[0].to, "user-vendedor@carteles.example");
  assert.match(registro.emails[0].subject, /Rosana Fernández/);
});

test("ACEPTA cierra el presupuesto y también avisa", async () => {
  const { deps, registro } = crearDeps({ llm: llmQueClasifica("ACEPTA", "Dice que avancen.") });
  const r = await clasificarRespuestasPendientes(20, deps);

  assert.equal(r.clasificados, 1);
  assert.deepEqual(registro.estados, [{ presupuestoId: "presu-1", hasta: "ACEPTADO" }]);
  assert.equal(registro.emails.length, 1);
});

test("un rechazo cierra el presupuesto pero no molesta a nadie", async () => {
  const { deps, registro } = crearDeps({ llm: llmQueClasifica("RECHAZA", "No va a avanzar.") });
  await clasificarRespuestasPendientes(20, deps);

  assert.deepEqual(registro.estados, [{ presupuestoId: "presu-1", hasta: "RECHAZADO" }]);
  assert.equal(registro.emails.length, 0);
});

test("sin vendedor asignado, el aviso va a quien cargó el presupuesto", async () => {
  const { deps, registro } = crearDeps({
    pendientes: [
      mensaje({
        presupuesto: {
          estado: "EN_SEGUIMIENTO",
          vendedorId: null,
          creadoPorId: "user-carga",
          descripcion: null,
        },
      }),
    ],
  });
  await clasificarRespuestasPendientes(20, deps);

  assert.equal(registro.emails[0].to, "user-carga@carteles.example");
});

test("sin proveedor de email, la marca en el panel igual queda: el aviso no se pierde", async () => {
  const { deps, registro } = crearDeps({ sinProveedorEmail: true });
  const r = await clasificarRespuestasPendientes(20, deps);

  assert.equal(r.clasificados, 1);
  assert.equal(r.avisados, 0);
  assert.equal(registro.guardadas[0].requiereVendedor, true);
});

test("si otra corrida se adelantó (claim perdido), no avisa dos veces", async () => {
  const { deps, registro } = crearDeps({ claimPerdido: true });
  const r = await clasificarRespuestasPendientes(20, deps);

  assert.equal(r.clasificados, 0);
  assert.equal(registro.emails.length, 0);
  assert.equal(registro.estados.length, 0);
});

test("un mensaje que falla no frena el lote", async () => {
  let llamadas = 0;
  const llmQueFallaLaPrimera: LlmProvider = {
    complete: async () => {
      llamadas += 1;
      if (llamadas === 1) throw new Error("el modelo se cayó");
      return {
        content: null,
        toolCalls: [
          {
            id: "1",
            name: CLASIFICACION_TOOL_NAME,
            arguments: { clasificacion: "INTERESADO", resumen: "ok" },
          },
        ],
      };
    },
  };

  const { deps, registro } = crearDeps({
    pendientes: [mensaje({ id: "msg-1" }), mensaje({ id: "msg-2" })],
    llm: llmQueFallaLaPrimera,
  });

  const r = await clasificarRespuestasPendientes(20, deps);

  assert.equal(r.fallidos, 1);
  assert.equal(r.clasificados, 1);
  assert.equal(registro.guardadas[0].id, "msg-2");
});

test("se clasifica lo que escribió la persona, no la cadena citada", async () => {
  let textoVisto = "";
  const llmEspia: LlmProvider = {
    complete: async ({ messages }) => {
      textoVisto = messages.find((m) => m.role === "user")?.content ?? "";
      return {
        content: null,
        toolCalls: [
          {
            id: "1",
            name: CLASIFICACION_TOOL_NAME,
            arguments: { clasificacion: "INTERESADO", resumen: "ok" },
          },
        ],
      };
    },
  };

  const { deps } = crearDeps({
    pendientes: [
      mensaje({
        contenido: [
          "Me interesa, gracias.",
          "",
          "El vie, 25 sep 2026, Imagen Visual escribió:",
          "> Respondé BAJA si no querés más mensajes.",
        ].join("\n"),
      }),
    ],
    llm: llmEspia,
  });

  await clasificarRespuestasPendientes(20, deps);

  assert.equal(textoVisto, "Me interesa, gracias.");
  assert.doesNotMatch(textoVisto, /BAJA/);
});
