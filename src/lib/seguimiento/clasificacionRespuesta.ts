import { z } from "zod";
import { AppError } from "../../utils/AppError";
import type { LlmProvider, LlmToolDefinition } from "../llm/types";

// Etapa 7 de docs/seguimiento-resenas-diseno.md (§6.5, "Interpretación de
// respuestas"): clasificar lo que contestó el cliente.
//
// Mismo patrón que la extracción de presupuestos (§6.2): una sola tool,
// forzada, con el esquema fijo. No se le pide al modelo que "responda un
// JSON" en texto libre.
//
// Los valores salen del enum `ClasificacionRespuesta` de Prisma, que ya
// existía desde la etapa 2. No se inventan categorías nuevas acá: si hace
// falta una, primero va al schema.

export const CLASIFICACION_TOOL_NAME = "clasificar_respuesta_cliente";

const DEFAULT_MODEL = "anthropic/claude-3.5-haiku";

export function resolverModeloClasificacion(): string {
  return process.env.CLASIFICACION_MODEL || DEFAULT_MODEL;
}

export const CLASIFICACIONES = [
  "INTERESADO",
  "PIDE_DESCUENTO",
  "QUIERE_LLAMADA",
  "LO_ESTA_PENSANDO",
  "ACEPTA",
  "RECHAZA",
  "COMPRO_EN_OTRO_LADO",
  "BAJA",
] as const;

export type Clasificacion = (typeof CLASIFICACIONES)[number];

const resultadoSchema = z.object({
  clasificacion: z.enum(CLASIFICACIONES),
  // Para que una persona entienda de un vistazo qué dijo el cliente, sin
  // abrir el mensaje entero.
  resumen: z.string().trim().min(1).max(500),
});

export type ResultadoClasificacion = z.infer<typeof resultadoSchema>;

const CLASIFICACION_TOOL: LlmToolDefinition = {
  name: CLASIFICACION_TOOL_NAME,
  description:
    "Registra la clasificación de la respuesta de un cliente a un presupuesto. Llamar exactamente una vez.",
  parameters: {
    type: "object",
    properties: {
      clasificacion: {
        type: "string",
        enum: [...CLASIFICACIONES],
        description: [
          "INTERESADO: responde con interés pero sin cerrar ni pedir nada concreto.",
          "PIDE_DESCUENTO: pide rebaja, mejor precio o condiciones.",
          "QUIERE_LLAMADA: pide hablar por teléfono, reunirse o que lo contacten.",
          "LO_ESTA_PENSANDO: dice que lo va a ver, que avisa después, que lo está evaluando.",
          "ACEPTA: acepta el presupuesto y quiere avanzar.",
          "RECHAZA: rechaza el presupuesto.",
          "COMPRO_EN_OTRO_LADO: dice que ya lo resolvió con otro proveedor.",
          "BAJA: pide no recibir más mensajes.",
        ].join(" "),
      },
      resumen: {
        type: "string",
        description:
          "Una frase corta, en español, con lo que dijo el cliente. Sin interpretar de más ni agregar información que no esté en el mensaje.",
      },
    },
    required: ["clasificacion", "resumen"],
    additionalProperties: false,
  },
};

const SYSTEM_PROMPT = `Clasificás respuestas de clientes a presupuestos de una empresa de cartelería y señalética, en español rioplatense.

Reglas:
- Usá SOLO lo que dice el mensaje. No supongas intenciones que no están escritas.
- Ante la duda entre dos categorías, elegí la más conservadora: LO_ESTA_PENSANDO antes que ACEPTA, INTERESADO antes que QUIERE_LLAMADA.
- ACEPTA es solo cuando el cliente confirma que avanza ("dale", "aprobado", "arranquen"). Un "me interesa" o "me gustó" NO es ACEPTA.
- Llamá a la tool ${CLASIFICACION_TOOL_NAME} exactamente una vez.`;

export interface ClasificarParams {
  llmProvider: LlmProvider;
  modelo: string;
  // El texto que escribió el cliente, ya sin la cita del mail original.
  texto: string;
}

export async function clasificarRespuesta({
  llmProvider,
  modelo,
  texto,
}: ClasificarParams): Promise<ResultadoClasificacion> {
  const respuesta = await llmProvider.complete({
    model: modelo,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: texto },
    ],
    tools: [CLASIFICACION_TOOL],
    toolChoice: CLASIFICACION_TOOL_NAME,
  });

  const llamada = respuesta.toolCalls.find((t) => t.name === CLASIFICACION_TOOL_NAME);
  if (!llamada) {
    throw new AppError("La IA no clasificó la respuesta (no llamó la tool)", 502);
  }

  const parseado = resultadoSchema.safeParse(llamada.arguments);
  if (!parseado.success) {
    throw new AppError(
      `La IA devolvió una clasificación con formato inesperado: ${parseado.error.issues
        .map((i) => i.message)
        .join("; ")}`,
      502,
    );
  }
  return parseado.data;
}

// Qué hacer con cada clasificación. Separado de la llamada al modelo y
// puro, para poder discutir y testear la política sin red de por medio.

export interface ConsecuenciasDeClasificacion {
  // A qué estado pasa el presupuesto, si es que pasa a alguno. Solo se
  // aplica si el presupuesto sigue abierto (el UPDATE es condicional).
  nuevoEstado: "ACEPTADO" | "RECHAZADO" | null;
  // Decisión de Rocco (2026-09-26): al vendedor se le avisa por las dos
  // vías, marca en el panel Y email.
  requiereVendedor: boolean;
}

export function consecuenciasDe(clasificacion: Clasificacion): ConsecuenciasDeClasificacion {
  switch (clasificacion) {
    case "ACEPTA":
      // Requiere vendedor aunque sea una buena noticia: alguien tiene que
      // poner en marcha el trabajo y habilitar el pedido de reseña.
      return { nuevoEstado: "ACEPTADO", requiereVendedor: true };
    case "RECHAZA":
    case "COMPRO_EN_OTRO_LADO":
      // Informativo: cierra el presupuesto, no hay nada que hacer.
      return { nuevoEstado: "RECHAZADO", requiereVendedor: false };
    case "PIDE_DESCUENTO":
    case "QUIERE_LLAMADA":
      // Lo único que de verdad NO puede resolver el sistema solo.
      return { nuevoEstado: null, requiereVendedor: true };
    case "INTERESADO":
    case "LO_ESTA_PENSANDO":
    case "BAJA":
      // La baja ya la resolvió la etapa 5 (consentimiento + cancelación de
      // envíos) antes de que la IA mirara nada; acá no hay nada que sumar.
      return { nuevoEstado: null, requiereVendedor: false };
  }
}
