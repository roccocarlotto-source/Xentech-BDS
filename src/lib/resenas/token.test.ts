import assert from "node:assert/strict";
import { test } from "node:test";
import { generarTokenPlano, hashToken, tieneFormatoDeToken } from "./token";

test("genera tokens de 43 caracteres base64url, distintos cada vez", () => {
  const tokens = new Set(Array.from({ length: 200 }, () => generarTokenPlano()));
  assert.equal(tokens.size, 200);
  for (const token of tokens) {
    assert.ok(tieneFormatoDeToken(token), token);
  }
});

test("el hash es sha256 hex, determinístico y distinto del token", () => {
  const token = generarTokenPlano();
  const hash = hashToken(token);
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.equal(hashToken(token), hash);
  assert.notEqual(hash, token);
  assert.notEqual(hashToken(generarTokenPlano()), hash);
});

test("rechaza formatos que no pueden venir de generarTokenPlano", () => {
  for (const malo of ["", "abc", "a".repeat(42), "a".repeat(44), `${"a".repeat(42)}=`, "../../x"]) {
    assert.equal(tieneFormatoDeToken(malo), false, malo);
  }
});
