import { createHmac, timingSafeEqual } from "node:crypto";

// Verificación del webhook de WhatsApp (paso 5, ver
// docs/ai-agent-architecture.md §4). Dos piezas separadas, ambas exigidas
// por Meta:
//
// 1. El handshake de suscripción (GET /api/webhooks/whatsapp): Meta manda
//    hub.mode/hub.verify_token/hub.challenge una sola vez al configurar
//    el webhook -- si el verify_token coincide con el propio
//    (WHATSAPP_WEBHOOK_VERIFY_TOKEN), hay que devolver el challenge tal
//    cual.
// 2. La firma de cada request real (POST): header X-Hub-Signature-256,
//    HMAC-SHA256 del body CRUDO (bytes, antes de parsear JSON) con el
//    App Secret de la app de Meta -- se valida ANTES de procesar nada del
//    payload, mismo criterio que cualquier webhook firmado.

export function verifyWebhookHandshake(params: {
  mode: string | undefined;
  token: string | undefined;
  challenge: string | undefined;
  expectedToken: string;
}): string | null {
  const { mode, token, challenge } = params;
  if (mode === "subscribe" && !!challenge && token === params.expectedToken) {
    return challenge;
  }
  return null;
}

const SIGNATURE_PREFIX = "sha256=";

export function verifyWebhookSignature(
  rawBody: Buffer,
  signatureHeader: string | undefined,
  appSecret: string,
): boolean {
  if (!signatureHeader || !signatureHeader.startsWith(SIGNATURE_PREFIX)) {
    return false;
  }

  const expectedHex = createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const providedHex = signatureHeader.slice(SIGNATURE_PREFIX.length);

  const expected = Buffer.from(expectedHex, "hex");
  // Un header con caracteres no-hex (o vacío) produce un buffer más corto
  // -- se rechaza antes de comparar, timingSafeEqual exige mismo largo.
  const provided = Buffer.from(providedHex, "hex");
  if (expected.length !== provided.length) {
    return false;
  }

  return timingSafeEqual(expected, provided);
}
