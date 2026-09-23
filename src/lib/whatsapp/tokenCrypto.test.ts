import assert from "node:assert/strict";
import { test } from "node:test";
import { encryptToken, decryptToken } from "./tokenCrypto";

// Key de test fija (32 bytes en base64) -- nunca usar esta key fuera de
// tests.
process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");

test("encrypt + decrypt hace round-trip exacto", () => {
  const original = "EAAG_un_access_token_de_prueba_bien_largo_12345";
  const encrypted = encryptToken(original);
  assert.equal(decryptToken(encrypted), original);
});

test("dos encriptaciones del mismo texto dan resultados distintos (IV aleatorio)", () => {
  const a = encryptToken("mismo-texto");
  const b = encryptToken("mismo-texto");
  assert.notEqual(a, b);
});

test("el texto encriptado tiene 3 partes en base64 separadas por :", () => {
  const encrypted = encryptToken("hola");
  const partes = encrypted.split(":");
  assert.equal(partes.length, 3);
});

test("texto manipulado falla al desencriptar (detecta tampering)", () => {
  const encrypted = encryptToken("texto original");
  const partes = encrypted.split(":");
  // Corrompe un byte del ciphertext (última parte).
  const ciphertext = Buffer.from(partes[2], "base64");
  ciphertext[0] = ciphertext[0] ^ 0xff;
  const manipulado = [partes[0], partes[1], ciphertext.toString("base64")].join(":");

  assert.throws(() => decryptToken(manipulado));
});

test("formato inválido (no 3 partes) tira error claro", () => {
  assert.throws(() => decryptToken("no-es-un-token-valido"), /formato/i);
});

test("sin WHATSAPP_TOKEN_ENCRYPTION_KEY configurada, tira al usar (no antes)", () => {
  const original = process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY;
  delete process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY;
  try {
    assert.throws(() => encryptToken("x"), /WHATSAPP_TOKEN_ENCRYPTION_KEY/);
  } finally {
    process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY = original;
  }
});

test("key de largo incorrecto tira error claro", () => {
  const original = process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY;
  process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY = Buffer.alloc(16, 1).toString("base64");
  try {
    assert.throws(() => encryptToken("x"), /32 bytes/);
  } finally {
    process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY = original;
  }
});
