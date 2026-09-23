import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import { verifyWebhookHandshake, verifyWebhookSignature } from "./webhookVerification";

const APP_SECRET = "el-app-secret-de-meta";

function firmar(body: string): string {
  return "sha256=" + createHmac("sha256", APP_SECRET).update(Buffer.from(body)).digest("hex");
}

test("handshake: mode subscribe + token correcto + challenge -> devuelve el challenge", () => {
  const resultado = verifyWebhookHandshake({
    mode: "subscribe",
    token: "mi-verify-token",
    challenge: "12345",
    expectedToken: "mi-verify-token",
  });
  assert.equal(resultado, "12345");
});

test("handshake: token incorrecto -> null", () => {
  const resultado = verifyWebhookHandshake({
    mode: "subscribe",
    token: "token-equivocado",
    challenge: "12345",
    expectedToken: "mi-verify-token",
  });
  assert.equal(resultado, null);
});

test("handshake: mode distinto de subscribe -> null", () => {
  const resultado = verifyWebhookHandshake({
    mode: "unsubscribe",
    token: "mi-verify-token",
    challenge: "12345",
    expectedToken: "mi-verify-token",
  });
  assert.equal(resultado, null);
});

test("handshake: sin challenge -> null", () => {
  const resultado = verifyWebhookHandshake({
    mode: "subscribe",
    token: "mi-verify-token",
    challenge: undefined,
    expectedToken: "mi-verify-token",
  });
  assert.equal(resultado, null);
});

test("firma: firma valida -> true", () => {
  const body = JSON.stringify({ entry: [] });
  const firma = firmar(body);
  assert.equal(verifyWebhookSignature(Buffer.from(body), firma, APP_SECRET), true);
});

test("firma: body distinto al firmado -> false", () => {
  const firmaDeOtroBody = firmar(JSON.stringify({ entry: ["original"] }));
  const bodyManipulado = Buffer.from(JSON.stringify({ entry: ["manipulado"] }));
  assert.equal(verifyWebhookSignature(bodyManipulado, firmaDeOtroBody, APP_SECRET), false);
});

test("firma: secret distinto -> false", () => {
  const body = JSON.stringify({ entry: [] });
  const firmaConOtroSecret =
    "sha256=" + createHmac("sha256", "otro-secret").update(Buffer.from(body)).digest("hex");
  assert.equal(verifyWebhookSignature(Buffer.from(body), firmaConOtroSecret, APP_SECRET), false);
});

test("firma: header ausente -> false", () => {
  assert.equal(verifyWebhookSignature(Buffer.from("{}"), undefined, APP_SECRET), false);
});

test("firma: header sin el prefijo sha256= -> false", () => {
  const body = "{}";
  const hex = createHmac("sha256", APP_SECRET).update(Buffer.from(body)).digest("hex");
  assert.equal(verifyWebhookSignature(Buffer.from(body), hex, APP_SECRET), false);
});

test("firma: header con caracteres invalidos -> false, no explota", () => {
  assert.equal(
    verifyWebhookSignature(Buffer.from("{}"), "sha256=no-es-hex-esto", APP_SECRET),
    false,
  );
});
