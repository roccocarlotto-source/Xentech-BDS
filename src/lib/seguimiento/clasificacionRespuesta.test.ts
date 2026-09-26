import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CLASIFICACION_TOOL_NAME,
  clasificarRespuesta,
  consecuenciasDe,
} from "./clasificacionRespuesta";
import { AppError } from "../../utils/AppError";
import type { LlmProvider } from "../llm/types";

function llmQueDevuelve(args: Record<string, unknown> | null): LlmProvider {
  return {
    complete: async () => ({
      content: null,
      toolCalls: args ? [{ id: "1", name: CLASIFICACION_TOOL_NAME, arguments: args }] : [],
    }),
  };
}

test("mapea la tool call a la clasificación y el resumen", async () => {
  const r = await clasificarRespuesta({
    llmProvider: llmQueDevuelve({
      clasificacion: "PIDE_DESCUENTO",
      resumen: "Pregunta si pueden mejorar el precio del cartel frontal.",
    }),
    modelo: "test-model",
    texto: "¿Me hacen un mejor precio?",
  });

  assert.equal(r.clasificacion, "PIDE_DESCUENTO");
  assert.match(r.resumen, /precio/);
});

test("tira 502 si la IA no llama la tool", async () => {
  await assert.rejects(
    () =>
      clasificarRespuesta({
        llmProvider: llmQueDevuelve(null),
        modelo: "test-model",
        texto: "hola",
      }),
    (err: unknown) => err instanceof AppError && err.status === 502,
  );
});

test("tira 502 si la clasificación no es una de las del enum", async () => {
  await assert.rejects(
    () =>
      clasificarRespuesta({
        llmProvider: llmQueDevuelve({ clasificacion: "MUY_INTERESADO", resumen: "algo" }),
        modelo: "test-model",
        texto: "hola",
      }),
    (err: unknown) => err instanceof AppError && err.status === 502,
  );
});

test("tira 502 si falta el resumen", async () => {
  await assert.rejects(
    () =>
      clasificarRespuesta({
        llmProvider: llmQueDevuelve({ clasificacion: "ACEPTA" }),
        modelo: "test-model",
        texto: "dale",
      }),
    (err: unknown) => err instanceof AppError && err.status === 502,
  );
});

// --- la política: qué pasa con cada clasificación ---

test("ACEPTA cierra el presupuesto y avisa al vendedor", () => {
  assert.deepEqual(consecuenciasDe("ACEPTA"), {
    nuevoEstado: "ACEPTADO",
    requiereVendedor: true,
  });
});

test("rechazo y compró en otro lado cierran, pero no hay nada que hacer", () => {
  assert.deepEqual(consecuenciasDe("RECHAZA"), {
    nuevoEstado: "RECHAZADO",
    requiereVendedor: false,
  });
  assert.deepEqual(consecuenciasDe("COMPRO_EN_OTRO_LADO"), {
    nuevoEstado: "RECHAZADO",
    requiereVendedor: false,
  });
});

test("descuento y pedido de llamada avisan al vendedor sin tocar el estado", () => {
  assert.deepEqual(consecuenciasDe("PIDE_DESCUENTO"), {
    nuevoEstado: null,
    requiereVendedor: true,
  });
  assert.deepEqual(consecuenciasDe("QUIERE_LLAMADA"), {
    nuevoEstado: null,
    requiereVendedor: true,
  });
});

test("interesado, lo está pensando y baja no disparan nada", () => {
  for (const c of ["INTERESADO", "LO_ESTA_PENSANDO", "BAJA"] as const) {
    assert.deepEqual(consecuenciasDe(c), { nuevoEstado: null, requiereVendedor: false });
  }
});
