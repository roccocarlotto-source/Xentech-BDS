import assert from "node:assert/strict";
import crypto from "node:crypto";
import { test } from "node:test";
import { verificarFirmaResend } from "./resendWebhookVerification";

// Secret con el formato real de Resend/Svix: "whsec_" + base64.
const SECRET_BYTES = Buffer.from("un secret de prueba de 32 bytes!");
const SECRET = `whsec_${SECRET_BYTES.toString("base64")}`;

const AHORA = new Date("2026-09-26T22:00:00Z");
const TS = String(Math.floor(AHORA.getTime() / 1000));
const ID = "msg_2abcDEF";
const BODY = Buffer.from(JSON.stringify({ type: "email.received", data: { email_id: "abc" } }));

function firmar(id: string, ts: string, body: Buffer, clave = SECRET_BYTES): string {
  const firma = crypto
    .createHmac("sha256", clave)
    .update(`${id}.${ts}.${body.toString("utf8")}`)
    .digest("base64");
  return `v1,${firma}`;
}

test("acepta una firma válida", () => {
  const ok = verificarFirmaResend(
    BODY,
    { id: ID, timestamp: TS, signature: firmar(ID, TS, BODY) },
    SECRET,
    AHORA,
  );
  assert.equal(ok, true);
});

test("acepta si UNA de varias firmas cierra (rotación de secret)", () => {
  const otra = firmar(ID, TS, BODY, Buffer.from("otro secret cualquiera de 32b!!"));
  const signature = `${otra} ${firmar(ID, TS, BODY)}`;
  assert.equal(
    verificarFirmaResend(BODY, { id: ID, timestamp: TS, signature }, SECRET, AHORA),
    true,
  );
});

test("rechaza si el body cambió aunque sea un byte", () => {
  const firma = firmar(ID, TS, BODY);
  const manipulado = Buffer.from(BODY.toString("utf8").replace("abc", "abd"));
  assert.equal(
    verificarFirmaResend(manipulado, { id: ID, timestamp: TS, signature: firma }, SECRET, AHORA),
    false,
  );
});

test("rechaza una firma hecha con otro secret", () => {
  const firma = firmar(ID, TS, BODY, Buffer.from("secret equivocado de 32 bytes!!!"));
  assert.equal(
    verificarFirmaResend(BODY, { id: ID, timestamp: TS, signature: firma }, SECRET, AHORA),
    false,
  );
});

test("rechaza un timestamp viejo: corta el replay de un request capturado", () => {
  const viejo = String(Math.floor(AHORA.getTime() / 1000) - 10 * 60);
  assert.equal(
    verificarFirmaResend(
      BODY,
      { id: ID, timestamp: viejo, signature: firmar(ID, viejo, BODY) },
      SECRET,
      AHORA,
    ),
    false,
  );
});

test("acepta un desfasaje de reloj chico", () => {
  const casi = String(Math.floor(AHORA.getTime() / 1000) - 60);
  assert.equal(
    verificarFirmaResend(
      BODY,
      { id: ID, timestamp: casi, signature: firmar(ID, casi, BODY) },
      SECRET,
      AHORA,
    ),
    true,
  );
});

test("rechaza si falta cualquiera de los headers, o el secret", () => {
  const firma = firmar(ID, TS, BODY);
  const base = { id: ID, timestamp: TS, signature: firma };
  assert.equal(verificarFirmaResend(BODY, { ...base, id: undefined }, SECRET, AHORA), false);
  assert.equal(verificarFirmaResend(BODY, { ...base, timestamp: undefined }, SECRET, AHORA), false);
  assert.equal(verificarFirmaResend(BODY, { ...base, signature: undefined }, SECRET, AHORA), false);
  assert.equal(verificarFirmaResend(BODY, base, "", AHORA), false);
});

test("rechaza un header de firma sin el prefijo v1,", () => {
  const sinPrefijo = firmar(ID, TS, BODY).slice("v1,".length);
  assert.equal(
    verificarFirmaResend(BODY, { id: ID, timestamp: TS, signature: sinPrefijo }, SECRET, AHORA),
    false,
  );
});

test("no explota con un timestamp que no es un número", () => {
  assert.equal(
    verificarFirmaResend(
      BODY,
      { id: ID, timestamp: "ayer", signature: firmar(ID, "ayer", BODY) },
      SECRET,
      AHORA,
    ),
    false,
  );
});
