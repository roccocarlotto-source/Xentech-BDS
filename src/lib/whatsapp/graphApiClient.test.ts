import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { GraphApiError, sendWhatsAppTextMessage } from "./graphApiClient";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

test("manda el POST correcto y devuelve el message id", async () => {
  let capturedUrl: string | undefined;
  let capturedInit: RequestInit | undefined;

  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    capturedUrl = url;
    capturedInit = init;
    return jsonResponse({ messages: [{ id: "wamid.ABC123" }] });
  }) as typeof fetch;

  const resultado = await sendWhatsAppTextMessage({
    phoneNumberId: "1234567890",
    accessToken: "el-token-desencriptado",
    to: "+59899123456",
    text: "Hola, tu cuota está al día.",
  });

  assert.equal(resultado.messageId, "wamid.ABC123");
  assert.equal(capturedUrl, "https://graph.facebook.com/v21.0/1234567890/messages");
  assert.equal(capturedInit?.method, "POST");
  assert.equal(
    (capturedInit?.headers as Record<string, string>).Authorization,
    "Bearer el-token-desencriptado",
  );
  assert.deepEqual(JSON.parse(capturedInit?.body as string), {
    messaging_product: "whatsapp",
    to: "+59899123456",
    type: "text",
    text: { body: "Hola, tu cuota está al día." },
  });
});

test("error de la API (token vencido, etc.) tira GraphApiError con el mensaje de Meta", async () => {
  globalThis.fetch = (async () =>
    jsonResponse(
      { error: { message: "Error validating access token", code: 190 } },
      401,
    )) as typeof fetch;

  await assert.rejects(
    sendWhatsAppTextMessage({
      phoneNumberId: "1234567890",
      accessToken: "un-token-vencido",
      to: "+59899123456",
      text: "hola",
    }),
    (err: unknown) => {
      assert.ok(err instanceof GraphApiError);
      assert.equal(err.status, 401);
      assert.equal(err.message, "Error validating access token");
      return true;
    },
  );
});

test("respuesta 200 sin message id (forma inesperada) tira igual, no revienta silenciosamente", async () => {
  globalThis.fetch = (async () => jsonResponse({ messages: [] })) as typeof fetch;

  await assert.rejects(
    sendWhatsAppTextMessage({
      phoneNumberId: "1234567890",
      accessToken: "token",
      to: "+59899123456",
      text: "hola",
    }),
    (err: unknown) => {
      assert.ok(err instanceof GraphApiError);
      assert.equal(err.status, 200);
      return true;
    },
  );
});
