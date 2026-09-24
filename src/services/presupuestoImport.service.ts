import mammoth from "mammoth";
import type { Presupuesto, Prisma } from "@prisma/client";
import { AppError } from "../utils/AppError";
import { getLlmProvider } from "../lib/llm/provider";
import type { LlmProvider, LlmToolDefinition } from "../lib/llm/types";
import {
  datosExtraidosPresupuestoSchema,
  type CommitImportPresupuestoInput,
  type DatosExtraidosPresupuesto,
  type PreviewImportPresupuestoResult,
} from "../schemas/presupuestoImport.schema";
import { clienteRepository } from "../repositories/cliente.repository";
import { userRepository } from "../repositories/user.repository";
import {
  presupuestoRepository,
  type PresupuestoRepository,
} from "../repositories/presupuesto.repository";

// Etapa 4, paso 1 de docs/seguimiento-resenas-diseno.md (§6.2):
// "Subida de .docx → texto con mammoth [...] Llamada a Claude con esquema
// fijo [...] Campos no encontrados → null. Nunca inventar datos."
//
// Alcance de este paso: SOLO extracción (preview), sin persistir nada. La
// pantalla de revisión, el matching/alta de Cliente y el guardado del
// Presupuesto + Consentimiento quedan para un paso siguiente -- "una tarea
// por sesión, acotada a una etapa o sub-etapa" (§8).
//
// Explícitamente NO cubierto acá (pendiente, ver el doc): si la plantilla
// usa controles de contenido de Word (`w:sdt`), el diseño pide extraerlos
// de forma determinística primero y usar la IA solo como respaldo -- este
// paso llama a la IA siempre, sobre el texto plano que da mammoth.

export const EXTRACCION_TOOL_NAME = "extraer_datos_presupuesto";

const DEFAULT_EXTRACTION_MODEL = "anthropic/claude-3.5-haiku";

// Mismo criterio que getLlmProvider(): la env var es opcional, con un
// default razonable para no exigir configuración extra solo para probar
// esto -- igual requiere OPENROUTER_API_KEY para funcionar de verdad.
function resolverModelo(): string {
  return process.env.PRESUPUESTO_EXTRACTION_MODEL || DEFAULT_EXTRACTION_MODEL;
}

const EXTRACCION_TOOL: LlmToolDefinition = {
  name: EXTRACCION_TOOL_NAME,
  description:
    "Registra los datos de un presupuesto extraídos de un documento. Llamar exactamente una vez, con TODOS los campos presentes -- usar null en los que no aparezcan en el texto. Nunca inventar ni adivinar un valor.",
  parameters: {
    type: "object",
    properties: {
      cliente_nombre: { type: ["string", "null"], description: "Nombre del cliente" },
      telefono: { type: ["string", "null"], description: "Teléfono de contacto del cliente" },
      email: { type: ["string", "null"], description: "Email de contacto del cliente" },
      // "items", no "vehiculo_o_items" -- ver el comentario en
      // presupuestoImport.schema.ts sobre esta decisión.
      items: {
        type: ["string", "null"],
        description:
          "Descripción de lo presupuestado (carteles, señalética, etc.), tal como aparece en el texto",
      },
      monto: {
        type: ["number", "null"],
        description: "Monto total del presupuesto, sin símbolo de moneda",
      },
      moneda: {
        type: ["string", "null"],
        description: "Código de moneda de 3 letras (ej. UYU, USD) si se puede inferir",
      },
      fecha_emision: {
        type: ["string", "null"],
        description:
          "Fecha de emisión del presupuesto, en formato YYYY-MM-DD si se puede determinar",
      },
      validez: {
        type: ["string", "null"],
        description:
          "Validez del presupuesto tal como figura en el texto (ej. '30 días', una fecha)",
      },
      vendedor: {
        type: ["string", "null"],
        description: "Nombre del vendedor que emitió el presupuesto",
      },
    },
    required: [
      "cliente_nombre",
      "telefono",
      "email",
      "items",
      "monto",
      "moneda",
      "fecha_emision",
      "validez",
      "vendedor",
    ],
    additionalProperties: false,
  },
};

const SYSTEM_PROMPT = `Extraés datos de presupuestos comerciales (empresa de cartelería/señalética) a partir del texto plano de un documento .docx.

Reglas:
- Usá SOLO lo que está escrito en el texto. Si un dato no aparece o no estás seguro, poné null -- nunca inventes ni completes con un valor plausible.
- Llamá a la tool ${EXTRACCION_TOOL_NAME} exactamente una vez, con los 9 campos.
- El monto va como número, sin símbolo de moneda ni separadores de miles.
- La fecha de emisión, si aparece, va como YYYY-MM-DD.`;

export interface PresupuestoImportDeps {
  llmProvider: LlmProvider;
  extraerTexto: (buffer: Buffer) => Promise<string>;
  modelo: string;
}

const defaultDeps: PresupuestoImportDeps = {
  get llmProvider() {
    return getLlmProvider();
  },
  extraerTexto: extraerTextoDocx,
  get modelo() {
    return resolverModelo();
  },
};

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // Mismo límite que la importación de clientes.
const MAX_TEXTO_PARA_LA_IA = 20_000; // Caracteres -- un presupuesto es un documento corto; esto es un piso de seguridad.

export async function extraerTextoDocx(buffer: Buffer): Promise<string> {
  let resultado: { value: string };
  try {
    resultado = await mammoth.extractRawText({ buffer });
  } catch {
    // mammoth tira el error crudo de JSZip ("Can't find end of central
    // directory...") para cualquier buffer que no sea un .docx válido --
    // se traduce a un error de usuario, nunca se lo deja pasar tal cual.
    throw new AppError("No se pudo leer el archivo -- ¿es un .docx válido?", 400);
  }

  const texto = resultado.value.trim();
  if (!texto) {
    throw new AppError(
      "No se pudo extraer texto del documento (¿está vacío o es una imagen?)",
      400,
    );
  }
  return texto;
}

function parseArgumentosExtraidos(argumentos: Record<string, unknown>): DatosExtraidosPresupuesto {
  const entrada = {
    clienteNombre: argumentos.cliente_nombre ?? null,
    telefono: argumentos.telefono ?? null,
    email: argumentos.email ?? null,
    items: argumentos.items ?? null,
    monto: argumentos.monto ?? null,
    moneda: argumentos.moneda ?? null,
    fechaEmision: argumentos.fecha_emision ?? null,
    validez: argumentos.validez ?? null,
    vendedor: argumentos.vendedor ?? null,
  };

  const resultado = datosExtraidosPresupuestoSchema.safeParse(entrada);
  if (!resultado.success) {
    throw new AppError(
      `La IA devolvió datos con un formato inesperado: ${resultado.error.issues.map((i) => i.message).join("; ")}`,
      502,
    );
  }
  return resultado.data;
}

export async function extraerDatosPresupuesto(
  texto: string,
  deps: PresupuestoImportDeps = defaultDeps,
): Promise<DatosExtraidosPresupuesto> {
  const textoAcotado = texto.slice(0, MAX_TEXTO_PARA_LA_IA);

  const completion = await deps.llmProvider.complete({
    model: deps.modelo,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: textoAcotado },
    ],
    tools: [EXTRACCION_TOOL],
    toolChoice: EXTRACCION_TOOL_NAME,
  });

  const llamado = completion.toolCalls.find((tc) => tc.name === EXTRACCION_TOOL_NAME);
  if (!llamado) {
    throw new AppError("La IA no devolvió los datos estructurados esperados", 502);
  }

  return parseArgumentosExtraidos(llamado.arguments);
}

export async function previewImportPresupuesto(
  buffer: Buffer,
  originalname: string,
  deps: PresupuestoImportDeps = defaultDeps,
): Promise<PreviewImportPresupuestoResult> {
  if (buffer.byteLength > MAX_FILE_SIZE_BYTES) {
    throw new AppError("El archivo supera el tamaño máximo permitido", 400);
  }
  if (!originalname.toLowerCase().endsWith(".docx")) {
    throw new AppError("Formato de archivo no soportado -- solo .docx", 400);
  }

  const textoExtraido = await deps.extraerTexto(buffer);
  const datos = await extraerDatosPresupuesto(textoExtraido, deps);

  return { archivoNombre: originalname, textoExtraido, datos };
}

// ---------------------------------------------------------------------------
// Etapa 4, paso 2: commit -- crea Cliente (si hace falta), Presupuesto y
// su(s) Consentimiento(s), a partir de lo que la persona confirmó en la
// pantalla de revisión. No vuelve a llamar a la IA.
// ---------------------------------------------------------------------------

// Los métodos de Prisma devuelven un client encadenable (PrismaPromise), no
// una Promise lisa -- para que un fake en memoria pueda implementar la
// interfaz en los tests, acá alcanza con "algo que resuelve a ese valor".
// Mismo patrón que resena.service.ts.
type Asincrono<T> = {
  [K in keyof T]: T[K] extends (...args: infer A) => infer R
    ? (...args: A) => Promise<Awaited<R>>
    : never;
};

export interface PresupuestoCommitDeps {
  clienteRepo: Asincrono<Pick<typeof clienteRepository, "findById" | "create">>;
  userRepo: Asincrono<Pick<typeof userRepository, "findById">>;
  presupuestoRepo: Asincrono<PresupuestoRepository>;
  ahora: () => Date;
}

const defaultCommitDeps: PresupuestoCommitDeps = {
  clienteRepo: clienteRepository,
  userRepo: userRepository,
  presupuestoRepo: presupuestoRepository,
  ahora: () => new Date(),
};

export async function commitImportPresupuesto(
  organizationId: string,
  creadoPorId: string,
  input: CommitImportPresupuestoInput,
  deps: PresupuestoCommitDeps = defaultCommitDeps,
): Promise<Presupuesto> {
  const clienteId = await resolverCliente(organizationId, input, deps);

  let vendedorId: string | null = null;
  if (input.vendedorId) {
    const vendedor = await deps.userRepo.findById(organizationId, input.vendedorId);
    if (!vendedor) {
      throw new AppError("El vendedor indicado no existe en esta organización", 400);
    }
    vendedorId = vendedor.id;
  }

  return deps.presupuestoRepo.crearConConsentimientos({
    organizationId,
    clienteId,
    vendedorId,
    creadoPorId,
    datosExtraidos: input.datosExtraidos as Prisma.InputJsonValue,
    descripcion: input.descripcion ?? null,
    monto: input.monto ?? null,
    moneda: input.moneda ?? null,
    fechaEmision: input.fechaEmision ?? null,
    validoHasta: input.validoHasta ?? null,
    archivoNombre: input.archivoNombre,
    seguimientoWhatsapp: input.seguimientoWhatsapp,
    consentimientoWhatsappOrigen: input.seguimientoWhatsapp
      ? (input.consentimientoWhatsappOrigen ?? null)
      : null,
    ahora: deps.ahora(),
  });
}

async function resolverCliente(
  organizationId: string,
  input: CommitImportPresupuestoInput,
  deps: PresupuestoCommitDeps,
): Promise<string> {
  if (input.cliente.modo === "existente") {
    const cliente = await deps.clienteRepo.findById(organizationId, input.cliente.clienteId);
    if (!cliente) {
      throw new AppError("El cliente indicado no existe en esta organización", 400);
    }
    return cliente.id;
  }

  const nuevo = await deps.clienteRepo.create(organizationId, {
    nombre: input.cliente.nombre,
    telefono: input.cliente.telefono ?? null,
    email: input.cliente.email ?? null,
  });
  return nuevo.id;
}
