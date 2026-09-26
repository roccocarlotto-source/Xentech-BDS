// Cliente mínimo de la Graph API de Meta para mandar mensajes de WhatsApp
// (paso 5, docs/ai-agent-architecture.md §4 y §9).
//
// Dos formas de mandar, porque Meta distingue: texto libre solo DENTRO de
// la ventana de 24 h desde el último mensaje del cliente, y plantillas
// aprobadas de antemano fuera de ella. El agente de WhatsApp es reactivo y
// usa solo la primera; el motor de seguimiento (etapa 6 de
// docs/seguimiento-resenas-diseno.md, §6.4) es proactivo y casi siempre
// necesita la segunda. El caller (el worker que procese la cola,
// pendiente de diseño -- §10/§12) es quien desencripta el
// accessTokenEncrypted con tokenCrypto.ts antes de llamar acá.
//
// Versión de la API pineada a propósito -- Meta deprecia versiones viejas
// con tiempo de aviso; subirla es cambiar esta única constante.
const GRAPH_API_VERSION = "v21.0";

export class GraphApiError extends Error {
  readonly status: number;
  readonly details: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = "GraphApiError";
    this.status = status;
    this.details = details;
  }
}

export interface SendTextMessageParams {
  phoneNumberId: string;
  // Ya desencriptado -- este cliente no conoce WHATSAPP_TOKEN_ENCRYPTION_KEY.
  accessToken: string;
  // Número del destinatario, normalizado (ver src/utils/telefono.ts).
  to: string;
  text: string;
}

export interface GraphApiSendResult {
  messageId: string;
}

function extraerMensajeDeError(payload: unknown): string | undefined {
  if (
    payload &&
    typeof payload === "object" &&
    "error" in payload &&
    payload.error &&
    typeof payload.error === "object" &&
    "message" in payload.error &&
    typeof payload.error.message === "string"
  ) {
    return payload.error.message;
  }
  return undefined;
}

export async function sendWhatsAppTextMessage(
  params: SendTextMessageParams,
): Promise<GraphApiSendResult> {
  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${params.phoneNumberId}/messages`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: params.to,
      type: "text",
      text: { body: params.text },
    }),
  });

  const payload: unknown = await res.json().catch(() => null);

  if (!res.ok) {
    throw new GraphApiError(
      res.status,
      extraerMensajeDeError(payload) ?? `Graph API respondió ${res.status}`,
      payload,
    );
  }

  const messageId =
    payload &&
    typeof payload === "object" &&
    "messages" in payload &&
    Array.isArray(payload.messages) &&
    payload.messages[0] &&
    typeof payload.messages[0] === "object" &&
    "id" in payload.messages[0]
      ? String(payload.messages[0].id)
      : undefined;

  if (!messageId) {
    throw new GraphApiError(res.status, "Respuesta de Graph API sin message id", payload);
  }

  return { messageId };
}

export interface SendTemplateMessageParams {
  phoneNumberId: string;
  accessToken: string;
  to: string;
  // Nombre EXACTO con el que la plantilla está aprobada en Meta. No es el
  // texto: el texto lo tiene Meta, acá solo se la referencia.
  templateName: string;
  // Código de idioma de la plantilla tal como está registrada ("es",
  // "es_UY"...). Si no coincide con el registrado, Meta rechaza el envío.
  languageCode: string;
  // Variables {{1}}, {{2}}... del cuerpo, en orden. Vacío si la plantilla
  // no tiene.
  bodyParameters?: string[];
}

export async function sendWhatsAppTemplateMessage(
  params: SendTemplateMessageParams,
): Promise<GraphApiSendResult> {
  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${params.phoneNumberId}/messages`;
  const parametros = params.bodyParameters ?? [];

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: params.to,
      type: "template",
      template: {
        name: params.templateName,
        language: { code: params.languageCode },
        ...(parametros.length > 0
          ? {
              components: [
                {
                  type: "body",
                  parameters: parametros.map((text) => ({ type: "text", text })),
                },
              ],
            }
          : {}),
      },
    }),
  });

  const payload: unknown = await res.json().catch(() => null);

  if (!res.ok) {
    throw new GraphApiError(
      res.status,
      extraerMensajeDeError(payload) ?? `Graph API respondió ${res.status}`,
      payload,
    );
  }

  const messageId =
    payload &&
    typeof payload === "object" &&
    "messages" in payload &&
    Array.isArray(payload.messages) &&
    payload.messages[0] &&
    typeof payload.messages[0] === "object" &&
    "id" in payload.messages[0]
      ? String(payload.messages[0].id)
      : undefined;

  if (!messageId) {
    throw new GraphApiError(res.status, "Respuesta de Graph API sin message id", payload);
  }

  return { messageId };
}
