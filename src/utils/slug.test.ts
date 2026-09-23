import assert from "node:assert/strict";
import { test } from "node:test";
import { slugify } from "./slug";

test("nombre simple", () => {
  assert.equal(slugify("Acme SA"), "acme-sa");
});

test("acentos y ñ", () => {
  assert.equal(slugify("Café del Centro"), "cafe-del-centro");
  assert.equal(slugify("Peña y Asociados"), "pena-y-asociados");
});

test("simbolos raros se convierten en guiones, sin duplicar", () => {
  assert.equal(slugify("Farmacia  24/7 (Centro)"), "farmacia-24-7-centro");
});

test("guiones al principio o al final se recortan", () => {
  assert.equal(slugify("  -- Xentech -- "), "xentech");
});

test("string vacio o solo simbolos -> fallback", () => {
  assert.equal(slugify(""), "organizacion");
  assert.equal(slugify("!!!"), "organizacion");
});

test("nombre muy largo se trunca dejando margen para un sufijo", () => {
  const largo = "a".repeat(200);
  const resultado = slugify(largo);
  assert.ok(resultado.length <= 90, `esperaba <= 90 caracteres, dio ${resultado.length}`);
});
