import { AppError } from "../../utils/AppError";

// Cliente de la API de Resend para LEER un email recibido (etapa 5, §6.4).
//
// Hace falta un paso aparte porque el webhook `email.received` manda solo
// metadata: "Webhooks do not include the email body, headers, or
// attachments, only their metadata" (docs de Resend). Sin esta llamada no
// hay texto que analizar, y sin texto no se puede detectar la baja.
//
// Sin SDK, un solo fetch -- mismo criterio que resendEmailProvider.ts.

const RESEND_RECEIVING_URL = "https://api.resend.com/emails/receiving";

export interface EmailRecibido {
  id: string;
  from: string;
  to: string[];
  subject: string | null;
  // Se usa `text`; `html` queda disponible por si en el futuro hace falta.
  text: string | null;
  html: string | null;
}

export interface ReceivingClient {
  obtener(emailId: string): Promise<EmailRecibido>;
}

export class ResendReceivingClient implements ReceivingClient {
  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  // A diferencia del provider de envío, este SÍ lanza: lo llama el webhook,
  // y si no se puede leer el mail conviene devolver un 5xx para que Resend
  // reintente (tiene reintentos propios) en vez de perder la respuesta del
  // cliente en silencio -- que podría ser una baja.
  async obtener(emailId: string): Promise<EmailRecibido> {
    const response = await this.fetchImpl(
      `${RESEND_RECEIVING_URL}/${encodeURIComponent(emailId)}`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${this.apiKey}` },
      },
    );

    if (!response.ok) {
      const detalle = await response.text().catch(() => "");
      throw new AppError(
        `No se pudo leer el email recibido de Resend (${response.status}): ${detalle.slice(0, 300)}`,
        502,
      );
    }

    const json = (await response.json()) as {
      id?: unknown;
      from?: unknown;
      to?: unknown;
      subject?: unknown;
      text?: unknown;
      html?: unknown;
    };

    return {
      id: typeof json.id === "string" ? json.id : emailId,
      from: typeof json.from === "string" ? json.from : "",
      to: Array.isArray(json.to) ? json.to.filter((t): t is string => typeof t === "string") : [],
      subject: typeof json.subject === "string" ? json.subject : null,
      text: typeof json.text === "string" ? json.text : null,
      html: typeof json.html === "string" ? json.html : null,
    };
  }
}

let instancia: ReceivingClient | null | undefined;

// Mismo patrón que getEmailProvider(): `null` = no configurado, y el
// llamador decide. No lanza al arrancar el server.
export function getReceivingClient(): ReceivingClient | null {
  if (instancia === undefined) {
    const apiKey = process.env.RESEND_API_KEY;
    instancia = apiKey ? new ResendReceivingClient(apiKey) : null;
  }
  return instancia;
}

export function resetReceivingClientParaTests(): void {
  instancia = undefined;
}
