// Cliente mínimo de la Graph API de Meta para mandar mensajes de WhatsApp
// (paso 5, docs/ai-agent-architecture.md §4 y §9). Solo lo que necesita el
// agente de este documento: texto libre, dentro de la ventana de 24hs (el
// agente es reactivo -- nunca manda plantillas, eso es de REMINDERS,
// fuera de alcance acá). El caller (el worker que procese la cola,
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
