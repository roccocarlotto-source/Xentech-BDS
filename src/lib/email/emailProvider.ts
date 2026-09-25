// Etapa 5, paso 2 de docs/seguimiento-resenas-diseno.md (§6.3): el motor de
// seguimiento manda el email a través de esta interfaz, nunca pegándole
// directo a un SDK de proveedor -- mismo motivo que LlmProvider en
// src/lib/llm/types.ts (poder testear el job sin red real, y poder cambiar
// de proveedor sin tocar el resto).
//
// A propósito, todavía NO hay ninguna clase que implemente esto contra un
// proveedor real: elegir Resend vs SendGrid (§3 del diseño) es una decisión
// de Rocco, todavía sin tomar (ver el doc de Cowork, sección "Estado
// actual"). getEmailProvider() de más abajo devuelve `null` mientras tanto
// -- envioJob.ts trata eso como "la función de envío no está configurada
// todavía" y no toca ninguna fila de `Envio` en ese caso (ver el comentario
// ahí), en vez de fallar en loop contra algo que no existe.
//
// Cuando se elija un proveedor: agregar `<Proveedor>EmailProvider` en este
// mismo directorio implementando esta interfaz, y hacer que
// getEmailProvider() la devuelva cuando la env var correspondiente
// (`RESEND_API_KEY` o `SENDGRID_API_KEY`, todavía no elegido) esté seteada
// -- mismo patrón que getLlmProvider() en src/lib/llm/provider.ts.

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

// Factory + singleton perezoso (mismo criterio que getLlmProvider) -- hoy
// siempre devuelve `null` porque no hay proveedor elegido todavía. No lanza
// error: a diferencia de OPENROUTER_API_KEY (que sí es una env var real que
// falta configurar), acá ni siquiera existe todavía el nombre de la env var
// a chequear.
export function getEmailProvider(): EmailProvider | null {
  return null;
}
