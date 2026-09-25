import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Cliente, Presupuesto, User } from "@prisma/client";
import type { LlmCompletionParams, LlmCompletionResult, LlmProvider } from "../lib/llm/types";
import {
  extraerDatosPresupuesto,
  extraerTextoDocx,
  previewImportPresupuesto,
  commitImportPresupuesto,
  EXTRACCION_TOOL_NAME,
  type PresupuestoCommitDeps,
} from "./presupuestoImport.service";
import type { CommitImportPresupuestoInput } from "../schemas/presupuestoImport.schema";
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

// ---------------------------------------------------------------------------
// Etapa 4, paso 2: commitImportPresupuesto -- repos en memoria, nunca Prisma
// real (mismo criterio que resena.service.test.ts).
// ---------------------------------------------------------------------------

const ORG = "org-1";
const OTRA_ORG = "org-2";
const AHORA = new Date("2026-09-25T10:00:00Z");

function entradaBase(
  overrides: Partial<CommitImportPresupuestoInput> = {},
): CommitImportPresupuestoInput {
  return {
    archivoNombre: "presupuesto-0458.docx",
    cliente: { modo: "existente", clienteId: "cli-1" },
    vendedorId: null,
    descripcion: "Cartel luminoso frontal 3x1m",
    monto: 45000,
    moneda: "UYU",
    fechaEmision: new Date("2026-08-12"),
    validoHasta: null,
    datosExtraidos: { items: "Cartel luminoso frontal 3x1m" },
    seguimientoWhatsapp: false,
    consentimientoWhatsappOrigen: null,
    ...overrides,
  };
}

function crearDeps(): {
  deps: PresupuestoCommitDeps;
  crearConConsentimientosLlamadas: unknown[];
} {
  const clientes: Cliente[] = [
    { id: "cli-1", organizationId: ORG, nombre: "Panadería La Espiga" } as Cliente,
    { id: "cli-otra-org", organizationId: OTRA_ORG, nombre: "De otra org" } as Cliente,
  ];
  const usuarios: User[] = [
    { id: "user-vendedor", organizationId: ORG, email: "martin@carteles.example" } as User,
  ];
  let contadorClienteId = 0;
  const crearConConsentimientosLlamadas: unknown[] = [];

  const deps: PresupuestoCommitDeps = {
    clienteRepo: {
      findById: async (organizationId, id) =>
        clientes.find((c) => c.organizationId === organizationId && c.id === id) ?? null,
      create: async (organizationId, data) => {
        contadorClienteId += 1;
        const nuevo = {
          id: `cli-nuevo-${contadorClienteId}`,
          organizationId,
          nombre: data.nombre,
          telefono: data.telefono ?? null,
          email: data.email ?? null,
        } as Cliente;
        clientes.push(nuevo);
        return nuevo;
      },
    },
    userRepo: {
      findById: async (organizationId, id) =>
        usuarios.find((u) => u.organizationId === organizationId && u.id === id) ?? null,
    },
    presupuestoRepo: {
      crearConConsentimientos: async (input) => {
        crearConConsentimientosLlamadas.push(input);
        return { id: "presu-1", ...input } as unknown as Presupuesto;
      },
      // No lo usa este flujo (etapa 4) -- lo usa el job de envío (etapa 5,
      // paso 2, envioJob.ts). Stub sin comportamiento, solo para satisfacer
      // el tipo de PresupuestoRepository.
      actualizarEstadoSiCoincide: async () => ({ count: 0 }),
    },
    ahora: () => AHORA,
  };

  return { deps, crearConConsentimientosLlamadas };
}

test("commitImportPresupuesto usa el clienteId existente tal cual", async () => {
  const { deps, crearConConsentimientosLlamadas } = crearDeps();
  const presupuesto = await commitImportPresupuesto(ORG, "user-1", entradaBase(), deps);

  assert.equal(presupuesto.id, "presu-1");
  assert.equal(crearConConsentimientosLlamadas.length, 1);
  assert.equal((crearConConsentimientosLlamadas[0] as { clienteId: string }).clienteId, "cli-1");
});

test("commitImportPresupuesto rechaza un cliente existente que es de otra organización", async () => {
  const { deps } = crearDeps();
  await assert.rejects(
    () =>
      commitImportPresupuesto(
        ORG,
        "user-1",
        entradaBase({ cliente: { modo: "existente", clienteId: "cli-otra-org" } }),
        deps,
      ),
    (err: unknown) => err instanceof AppError && err.status === 400,
  );
});

test("commitImportPresupuesto crea un Cliente nuevo cuando cliente.modo es 'nuevo'", async () => {
  const { deps, crearConConsentimientosLlamadas } = crearDeps();
  const presupuesto = await commitImportPresupuesto(
    ORG,
    "user-1",
    entradaBase({
      cliente: {
        modo: "nuevo",
        nombre: "Ferretería El Tornillo",
        telefono: "099 111 222",
        email: null,
      },
    }),
    deps,
  );

  assert.ok(presupuesto);
  assert.equal(
    (crearConConsentimientosLlamadas[0] as { clienteId: string }).clienteId,
    "cli-nuevo-1",
  );
});

test("commitImportPresupuesto exige que consentimientoWhatsappOrigen viaje null cuando seguimientoWhatsapp es false", async () => {
  const { deps, crearConConsentimientosLlamadas } = crearDeps();
  await commitImportPresupuesto(
    ORG,
    "user-1",
    entradaBase({ seguimientoWhatsapp: false, consentimientoWhatsappOrigen: "VERBAL_VENDEDOR" }),
    deps,
  );

  // El schema de la ruta ya lo prohíbe (refine), pero el service es la
  // segunda red: nunca manda un origen si seguimientoWhatsapp es false.
  assert.equal(
    (crearConConsentimientosLlamadas[0] as { consentimientoWhatsappOrigen: unknown })
      .consentimientoWhatsappOrigen,
    null,
  );
});

test("commitImportPresupuesto pasa el origen de WhatsApp tal cual cuando seguimientoWhatsapp es true", async () => {
  const { deps, crearConConsentimientosLlamadas } = crearDeps();
  await commitImportPresupuesto(
    ORG,
    "user-1",
    entradaBase({ seguimientoWhatsapp: true, consentimientoWhatsappOrigen: "WHATSAPP_ENTRANTE" }),
    deps,
  );

  assert.equal(
    (crearConConsentimientosLlamadas[0] as { consentimientoWhatsappOrigen: unknown })
      .consentimientoWhatsappOrigen,
    "WHATSAPP_ENTRANTE",
  );
});

test("commitImportPresupuesto resuelve vendedorId contra el repo de usuarios, scoped por organización", async () => {
  const { deps, crearConConsentimientosLlamadas } = crearDeps();
  await commitImportPresupuesto(ORG, "user-1", entradaBase({ vendedorId: "user-vendedor" }), deps);

  assert.equal(
    (crearConConsentimientosLlamadas[0] as { vendedorId: string | null }).vendedorId,
    "user-vendedor",
  );
});

test("commitImportPresupuesto rechaza un vendedorId que no existe en la organización", async () => {
  const { deps } = crearDeps();
  await assert.rejects(
    () => commitImportPresupuesto(ORG, "user-1", entradaBase({ vendedorId: "no-existe" }), deps),
    (err: unknown) => err instanceof AppError && err.status === 400,
  );
});
