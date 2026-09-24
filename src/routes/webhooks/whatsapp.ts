import { Router } from "express";
import { agentInboundJobRepository } from "../../repositories/agentInboundJob.repository";
import { agentToggleRepository } from "../../repositories/agentToggle.repository";
import { whatsappConnectionRepository } from "../../repositories/whatsappConnection.repository";
import {
  verifyWebhookHandshake,
  verifyWebhookSignature,
} from "../../lib/whatsapp/webhookVerification";
import { extraerMensajesDeTexto } from "../../lib/whatsapp/webhookPayload";
import { asyncHandler } from "../../utils/asyncHandler";

// Webhook de WhatsApp (docs/ai-agent-architecture.md §4) -- SIN
// `authenticate`, a propósito: lo llama Meta, no un usuario logueado. La
// identidad se verifica con la firma (POST) y el verify_token (GET), no
// con un JWT de Supabase.
export const whatsappWebhookRouter = Router();

// Handshake de suscripción -- Meta lo llama una sola vez al configurar el
// webhook en el panel de developers.
whatsappWebhookRouter.get("/api/webhooks/whatsapp", (req, res) => {
  const challenge = verifyWebhookHandshake({
    mode: typeof req.query["hub.mode"] === "string" ? req.query["hub.mode"] : undefined,
    token:
      typeof req.query["hub.verify_token"] === "string" ? req.query["hub.verify_token"] : undefined,
    challenge:
      typeof req.query["hub.challenge"] === "string" ? req.query["hub.challenge"] : undefined,
    expectedToken: process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN ?? "",
  });

  if (challenge === null) {
    res.status(403).send("Forbidden");
    return;
  }
  res.status(200).send(challenge);
});

// Responder rápido, procesar aparte (§4): esto SOLO valida la firma,
// extrae los mensajes y los encola -- nunca llama al LLM ni a la Graph
// API acá adentro. Eso lo hace el poller (inboundJobPoller.ts).
whatsappWebhookRouter.post(
  "/api/webhooks/whatsapp",
  asyncHandler(async (req, res) => {
    const appSecret = process.env.WHATSAPP_APP_SECRET;
    if (!appSecret) {
      // Sin configurar todavía -- no hay conexión real armada (falta el
      // trámite de Meta Business), nada que procesar. 200 igual: no es un
      // error del lado de Meta.
      res.status(200).send("EVENT_RECEIVED");
      return;
    }

    const firmaValida = verifyWebhookSignature(
      req.rawBody ?? Buffer.from(""),
      req.header("X-Hub-Signature-256"),
      appSecret,
    );
    if (!firmaValida) {
      res.status(403).send("Firma inválida");
      return;
    }

    await encolarMensajesEntrantes(req.body);

    res.status(200).send("EVENT_RECEIVED");
  }),
);

function esErrorDeUnicidad(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: unknown }).code === "P2002"
  );
}

async function encolarMensajesEntrantes(payload: unknown): Promise<void> {
  const mensajes = extraerMensajesDeTexto(payload);

  for (const mensaje of mensajes) {
    const connection = await whatsappConnectionRepository.findByPhoneNumberId(
      mensaje.phoneNumberId,
    );
    // Número no conocido (o de una organización que todavía no terminó de
    // conectar el suyo) -- nada que hacer, no es un error.
    if (!connection) continue;

    // Desconectado (o todavía sin confirmar) -- no tiene sentido correr el
    // agente para un canal que no va a poder mandar la respuesta (ver el
    // chequeo de status CONNECTED en inboundJobProcessor.ts antes de
    // enviar). Cortar acá evita gastar una llamada al LLM en vano.
    if (connection.status !== "CONNECTED") continue;

    const habilitado = await agentToggleRepository.isEnabled(connection.organizationId, "WHATSAPP");
    if (!habilitado) continue;

    try {
      await agentInboundJobRepository.create({
        organizationId: connection.organizationId,
        agentType: "WHATSAPP",
        externalThreadId: mensaje.from,
        telefonoCliente: mensaje.from,
        mensaje: mensaje.texto,
        externalMessageId: mensaje.messageId,
      });
    } catch (err) {
      // P2002 en external_message_id = reintento de Meta de un mensaje ya
      // encolado -- se ignora (idempotencia), no es un error real.
      if (!esErrorDeUnicidad(err)) throw err;
    }
  }
}
