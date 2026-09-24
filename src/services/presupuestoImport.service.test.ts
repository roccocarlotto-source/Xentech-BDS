import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { LlmCompletionParams, LlmCompletionResult, LlmProvider } from "../lib/llm/types";
import {
  extraerDatosPresupuesto,
  extraerTextoDocx,
  previewImportPresupuesto,
  EXTRACCION_TOOL_NAME,
} from "./presupuestoImport.service";
import { AppError } from "../utils/AppError";

// Etapa 4, paso 1 de docs/seguimiento-resenas-diseno.md (§6.2). Mismo
// criterio que orchestrator.test.ts: el LlmProvider se mockea, nunca pega a
// OpenRouter de verdad en un test.

function llmQueDevuelve(argumentos: Record<string, unknown> | null): LlmProvider {
  return {
    complete: async (params: LlmCompletionParams): Promise<LlmCompletionResult> => {
      assert.equal(params.toolChoice, EXTRACCION_TOOL_NAME, "debe forzar la tool de extracción");
      assert.equal(params.tools.length, 1);
      assert.equal(params.tools[0].name, EXTRACCION_TOOL_NAME);
      if (argumentos === null) {
        return { content: "no puedo ayudar con eso", toolCalls: [] };
      }
      return {
        content: null,
        toolCalls: [{ id: "call-1", name: EXTRACCION_TOOL_NAME, arguments: argumentos }],
      };
    },
  };
}

const FIXTURE_PATH = path.join(__dirname, "__fixtures__", "presupuesto-ejemplo.docx");

test("extraerTextoDocx saca el texto plano de un .docx real", async () => {
  const buffer = await readFile(FIXTURE_PATH);
  const texto = await extraerTextoDocx(buffer);
  assert.match(texto, /Panadería La Espiga/);
  assert.match(texto, /Martín Sosa/);
  assert.match(texto, /45\.000/);
});

test("extraerTextoDocx tira AppError (no el error crudo de mammoth/JSZip) si el buffer no es un .docx válido", async () => {
  await assert.rejects(
    () => extraerTextoDocx(Buffer.from("no es un docx")),
    (err: unknown) => err instanceof AppError && err.status === 400,
  );
});

test("extraerDatosPresupuesto mapea los argumentos de la tool a DatosExtraidosPresupuesto", async () => {
  const llm = llmQueDevuelve({
    cliente_nombre: "Panadería La Espiga",
    telefono: "099 345 678",
    email: "rosana.fernandez@laespiga.com.uy",
    items: "Cartel luminoso frontal 3x1m + 2 banners de vidriera",
    monto: 45000,
    moneda: "UYU",
    fecha_emision: "2026-08-12",
    validez: "15 días",
    vendedor: "Martín Sosa",
  });

  const datos = await extraerDatosPresupuesto("texto de prueba", {
    llmProvider: llm,
    extraerTexto: extraerTextoDocx,
    modelo: "test-model",
  });

  assert.deepEqual(datos, {
    clienteNombre: "Panadería La Espiga",
    telefono: "099 345 678",
    email: "rosana.fernandez@laespiga.com.uy",
    items: "Cartel luminoso frontal 3x1m + 2 banners de vidriera",
    monto: 45000,
    moneda: "UYU",
    fechaEmision: "2026-08-12",
    validez: "15 días",
    vendedor: "Martín Sosa",
  });
});

test("extraerDatosPresupuesto conserva null en los campos que la IA no encontró", async () => {
  const llm = llmQueDevuelve({
    cliente_nombre: "Panadería La Espiga",
    telefono: null,
    email: null,
    items: "Cartel luminoso",
    monto: null,
    moneda: null,
    fecha_emision: null,
    validez: null,
    vendedor: null,
  });

  const datos = await extraerDatosPresupuesto("texto de prueba", {
    llmProvider: llm,
    extraerTexto: extraerTextoDocx,
    modelo: "test-model",
  });

  assert.equal(datos.telefono, null);
  assert.equal(datos.monto, null);
  assert.equal(datos.clienteNombre, "Panadería La Espiga");
});

test("extraerDatosPresupuesto tira AppError 502 si la IA no llama la tool", async () => {
  const llm = llmQueDevuelve(null);
  await assert.rejects(
    () =>
      extraerDatosPresupuesto("texto de prueba", {
        llmProvider: llm,
        extraerTexto: extraerTextoDocx,
        modelo: "test-model",
      }),
    (err: unknown) => err instanceof AppError && err.status === 502,
  );
});

test("extraerDatosPresupuesto tira AppError 502 si los argumentos no matchean el schema", async () => {
  const llm = llmQueDevuelve({
    cliente_nombre: "Panadería La Espiga",
    telefono: null,
    email: null,
    items: null,
    monto: "no es un número",
    moneda: null,
    fecha_emision: null,
    validez: null,
    vendedor: null,
  });

  await assert.rejects(
    () =>
      extraerDatosPresupuesto("texto de prueba", {
        llmProvider: llm,
        extraerTexto: extraerTextoDocx,
        modelo: "test-model",
      }),
    (err: unknown) => err instanceof AppError && err.status === 502,
  );
});

test("previewImportPresupuesto rechaza archivos que no son .docx", async () => {
  const llm = llmQueDevuelve(null);
  await assert.rejects(
    () =>
      previewImportPresupuesto(Buffer.from("hola"), "presupuesto.pdf", {
        llmProvider: llm,
        extraerTexto: extraerTextoDocx,
        modelo: "test-model",
      }),
    (err: unknown) => err instanceof AppError && err.status === 400,
  );
});

test("previewImportPresupuesto encadena extracción de texto + IA sobre el fixture real", async () => {
  const llm = llmQueDevuelve({
    cliente_nombre: "Panadería La Espiga",
    telefono: "099 345 678",
    email: "rosana.fernandez@laespiga.com.uy",
    items: "Cartel luminoso frontal 3x1m + 2 banners de vidriera",
    monto: 45000,
    moneda: "UYU",
    fecha_emision: "2026-08-12",
    validez: "15 días",
    vendedor: "Martín Sosa",
  });
  const buffer = await readFile(FIXTURE_PATH);

  const resultado = await previewImportPresupuesto(buffer, "presupuesto-0458.docx", {
    llmProvider: llm,
    extraerTexto: extraerTextoDocx,
    modelo: "test-model",
  });

  assert.equal(resultado.archivoNombre, "presupuesto-0458.docx");
  assert.match(resultado.textoExtraido, /Panadería La Espiga/);
  assert.equal(resultado.datos.clienteNombre, "Panadería La Espiga");
  assert.equal(resultado.datos.monto, 45000);
});
