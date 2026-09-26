import assert from "node:assert/strict";
import { test } from "node:test";
import { abreviarNombreVisible } from "./nombreVisible";

// Nombres 100% inventados (§8 del diseño).

test("abrevia nombre y apellido a nombre + inicial", () => {
  assert.equal(abreviarNombreVisible("Laura Martínez"), "Laura M.");
});

test("con nombre compuesto o varios apellidos, usa la inicial de la última palabra", () => {
  assert.equal(abreviarNombreVisible("Laura de los Santos"), "Laura S.");
  assert.equal(abreviarNombreVisible("Ana María Pereira Gómez"), "Ana G.");
});

test("una sola palabra queda tal cual: no hay apellido que abreviar", () => {
  assert.equal(abreviarNombreVisible("Laura"), "Laura");
  assert.equal(abreviarNombreVisible("Cartelería"), "Cartelería");
});

test("un nombre ya abreviado no acumula otra inicial", () => {
  assert.equal(abreviarNombreVisible("Laura M."), "Laura M.");
  assert.equal(abreviarNombreVisible("Laura M"), "Laura M.");
});

test("normaliza espacios de sobra y pone la inicial en mayúscula", () => {
  assert.equal(abreviarNombreVisible("  laura   martínez  "), "laura M.");
});

test("respeta los acentos en la inicial", () => {
  assert.equal(abreviarNombreVisible("Laura Álvarez"), "Laura Á.");
});

test("no explota con entradas degeneradas", () => {
  assert.equal(abreviarNombreVisible(""), "");
  assert.equal(abreviarNombreVisible("   "), "");
  assert.equal(abreviarNombreVisible("Laura ."), "Laura");
});
