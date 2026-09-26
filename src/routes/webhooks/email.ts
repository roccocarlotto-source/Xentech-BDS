import { Router } from "express";
import { verificarFirmaResend } from "../../lib/email/resendWebhookVerification";
import { getReceivingClient } from "../../lib/email/resendReceivingClient";
import { procesarRespuestaEmail } from "../../services/respuestaEmail.service";
import { asyncHandler } from "../../utils/asyncHandler";

// Webhook de respuestas por email (etapa 5, §6.4). SIN `authenticate`, por
// el mismo motivo que el de WhatsApp: lo llama Resend, no un usuario
// logueado. La identidad la da la firma, no un JWT.
export const emailWebhookRouter = Router();

emailWebhookRouter.post(
  "/api/webhooks/email",
  asyncHandler(async (req, res) => {
    const secret = process.env.RESEND_WEBHOOK_SECRET;
    if (!secret) {
      // Todavía sin configurar. 200 igual: no es un error de Resend, y un
      // 4xx/5xx le haría reintentar para siempre algo que no vamos a
      // procesar.
      res.status(200).json({ ok: true, ignorado: "webhook no configurado" });
      return;
    }

    const firmaValida = verificarFirmaResend(
      req.rawBody ?? Buffer.from(""),
      {
        id: req.header("svix-id"),
        timestamp: req.header("svix-timestamp"),
        signature: req.header("svix-signature"),
      },
      secret,
    );
    if (!firmaValida) {
      res.status(403).json({ error: "Firma inválida" });
      return;
    }

    const evento = req.body as { type?: unknown; data?: { email_id?: unknown } };
    // Resend manda muchos tipos de evento al mismo endpoint (delivered,
    // bounced, opened...). Solo interesa el de entrada.
    if (evento.type !== "email.received" || typeof evento.data?.email_id !== "string") {
      res.status(200).json({ ok: true, ignorado: "evento que no es email.received" });
      return;
    }

    const cliente = getReceivingClient();
    if (!cliente) {
      res.status(200).json({ ok: true, ignorado: "falta RESEND_API_KEY" });
      return;
    }

    // El webhook no trae el cuerpo, solo metadata: hay que pedirlo. Si esto
    // falla lanza y el error handler responde 5xx -- Resend reintenta, que
    // es lo que queremos: perder este mail puede ser perder una baja.
    const email = await cliente.obtener(evento.data.email_id);

    const resultado = await procesarRespuestaEmail({
      externalId: email.id,
      from: email.from,
      to: email.to,
      // Solo el texto plano: el HTML de una respuesta trae la cadena
      // entera citada y el ruido del cliente de correo. Sin texto plano no
      // hay nada que analizar.
      texto: email.text ?? "",
      fecha: new Date(),
    });

    res.status(200).json({ ok: true, resultado: resultado.estado });
  }),
);
