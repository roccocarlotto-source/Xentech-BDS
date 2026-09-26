// Etapa 5, paso 2 de docs/seguimiento-resenas-diseno.md (§6.3): el motor de
// seguimiento manda el email a través de esta interfaz, nunca pegándole
// directo a un SDK de proveedor -- mismo motivo que LlmProvider en
// src/lib/llm/types.ts (poder testear el job sin red real, y poder cambiar
// de proveedor sin tocar el resto).
//
// Proveedor elegido por Rocco el 2026-09-26: Resend (§2 del diseño,
// decisión 2). La implementación concreta es `ResendEmailProvider`, en este
// mismo directorio; getEmailProvider() de más abajo la devuelve cuando están
// las dos env vars que necesita, y `null` si no -- envioJob.ts trata ese
// `null` como "la función de envío no está configurada todavía" y no toca
// ninguna fila de `Envio` en ese caso (ver el comentario ahí), en vez de
// fallar en loop contra algo que no existe.

import { ResendEmailProvider } from "./resendEmailProvider";

export interface EmailAEnviar {
  to: string;
  subject: string;
  body: string;
}

export type EmailEnvioResultado =
  { ok: true; providerMessageId: string } | { ok: false; error: string };

export interface EmailProvider {
  enviar(email: EmailAEnviar): Promise<EmailEnvioResultado>;
}

// Factory + singleton perezoso (mismo criterio que getLlmProvider). A
// diferencia de aquel, NO lanza cuando falta configuración: el llamador es un
// poller que corre cada 60 s, y ahí "todavía no está configurado" es un
// estado normal y esperado (ver envioJobPoller.ts), no un error de request.
//
// Hacen falta las dos env vars, no solo la API key: sin remitente verificado
// Resend rechaza todos los envíos, así que arrancar "medio configurado"
// solo gastaría intentos de cada `Envio` contra un 403 seguro.
let instancia: EmailProvider | null | undefined;
let avisoRemitenteEmitido = false;

export function getEmailProvider(): EmailProvider | null {
  if (instancia === undefined) {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.EMAIL_FROM;

    if (apiKey && !from && !avisoRemitenteEmitido) {
      // El caso peligroso es el silencioso: con RESEND_API_KEY seteada, quien
      // la configuró cree que el motor está andando. Se avisa una sola vez
      // (el poller llama a esta función en cada tick).
      avisoRemitenteEmitido = true;
      console.warn(
        "RESEND_API_KEY está configurada pero falta EMAIL_FROM: el motor de envío de seguimiento sigue inactivo.",
      );
    }

    instancia =
      apiKey && from
        ? new ResendEmailProvider(apiKey, from, process.env.EMAIL_REPLY_TO ?? null)
        : null;
  }
  return instancia;
}

// Solo para tests: las env vars se leen una única vez por proceso.
export function resetEmailProviderParaTests(): void {
  instancia = undefined;
  avisoRemitenteEmitido = false;
}
