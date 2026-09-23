import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizarTelefono, normalizarTelefonoSiPresente } from "./telefono";

test("numero local (UY) sin prefijo -> E.164", () => {
  assert.equal(normalizarTelefono("099123456"), "+59899123456");
});

test("mismo numero con espacios, guiones y parentesis -> mismo resultado", () => {
  const esperado = normalizarTelefono("099123456");
  assert.equal(normalizarTelefono("099 123 456"), esperado);
  assert.equal(normalizarTelefono("099-123-456"), esperado);
  assert.equal(normalizarTelefono("(099) 123-456"), esperado);
});

test("numero ya con prefijo de pais (con o sin +) -> mismo resultado que sin prefijo", () => {
  const esperado = normalizarTelefono("099123456");
  assert.equal(normalizarTelefono("+59899123456"), esperado);
  assert.equal(normalizarTelefono("59899123456"), esperado);
  assert.equal(normalizarTelefono("00 598 99123456"), esperado);
});

test("pais por defecto distinto (AR) resuelve un numero local argentino", () => {
  const normalizado = normalizarTelefono("11 2345-6789", "AR");
  assert.ok(normalizado.startsWith("+54"), `esperaba prefijo +54, dio ${normalizado}`);
});

test("string vacio o solo espacios -> string vacio", () => {
  assert.equal(normalizarTelefono(""), "");
  assert.equal(normalizarTelefono("   "), "");
});

test("texto que no es un telefono valido -> fallback de solo digitos, nunca explota", () => {
  // "123" no es un numero de telefono valido en ningun pais -- el fallback
  // devuelve los digitos tal cual, para que dos entradas igual de "sucias"
  // sigan matcheando entre si en vez de perder el dato.
  assert.equal(normalizarTelefono("123"), "123");
  assert.equal(normalizarTelefono("abc"), "");
});

test("normalizarTelefonoSiPresente deja pasar null y undefined sin tocar", () => {
  assert.equal(normalizarTelefonoSiPresente(null), null);
  assert.equal(normalizarTelefonoSiPresente(undefined), undefined);
  assert.equal(normalizarTelefonoSiPresente("099 123 456"), normalizarTelefono("099123456"));
});
