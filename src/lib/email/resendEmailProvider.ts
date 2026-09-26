import type { EmailAEnviar, EmailEnvioResultado, EmailProvider } from "./emailProvider";

const RESEND_EMAILS_URL = "https://api.resend.com/emails";

// Cuánto del cuerpo del error del proveedor se propaga. `Envio.ultimoError`
// es Text (sin límite), pero el mensaje termina en logs y en la UI: un HTML
// de error de 20 kB no aporta nada sobre sus primeros 300 caracteres. Mismo
// criterio que OpenRouterProvider (que corta en 500).
const MAX_DETALLE_ERROR = 300;

// Primer adapter de EmailProvider. Proveedor elegido por Rocco el 2026-09-26
// (ver §2 de docs/seguimiento-resenas-diseno.md, decisión 2). Sin SDK, un
// solo fetch -- mismo criterio que OpenRouterProvider en src/lib/llm/.
//
// Diferencia importante con OpenRouterProvider: este NUNCA lanza. El job de
// envío (src/lib/seguimiento/envioJob.ts) trata todo `{ ok: false }` como
// fallo reintentable y decide entre volver a PROGRAMADO o marcar FALLIDO
// según los intentos, así que una excepción acá le sacaría esa decisión y
// abortaría el lote entero (el resto de los `Envio` vencidos quedaría sin
// procesar hasta el próximo tick).
export class ResendEmailProvider implements EmailProvider {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly replyTo: string | null = null,
    // Inyectable solo para los tests: nunca se pasa en producción.
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async enviar(email: EmailAEnviar): Promise<EmailEnvioResultado> {
    let response: Response;
    try {
      response = await this.fetchImpl(RESEND_EMAILS_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: this.from,
          to: email.to,
          subject: email.subject,
          // `text` y no `html`: armarEmailSeguimiento() (envioContenido.ts)
          // devuelve texto plano, incluida la línea de baja de §5.
          text: email.body,
          ...(this.replyTo ? { reply_to: this.replyTo } : {}),
        }),
      });
    } catch (err) {
      // Red caída, DNS, timeout del runtime: transitorio por definición.
      return { ok: false, error: `No se pudo contactar a Resend: ${describirError(err)}` };
    }

    if (!response.ok) {
      const detalle = await response.text().catch(() => "");
      return {
        ok: false,
        error: `Resend respondió ${response.status}: ${detalle.slice(0, MAX_DETALLE_ERROR)}`,
      };
    }

    let json: unknown;
    try {
      json = await response.json();
    } catch (err) {
      return { ok: false, error: `Respuesta ilegible de Resend: ${describirError(err)}` };
    }

    // La API devuelve `{ "id": "<uuid>" }`. Ese id es el que se guarda como
    // `MensajeSeguimiento.externalId` y el que va a permitir cruzar el
    // webhook de respuestas (§6.4) con el envío que lo originó, así que un
    // 200 sin id no cuenta como enviado.
    const id = (json as { id?: unknown } | null)?.id;
    if (typeof id !== "string" || id.length === 0) {
      return { ok: false, error: "Resend respondió 200 pero sin el id del mensaje" };
    }

    return { ok: true, providerMessageId: id };
  }
}

function describirError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
