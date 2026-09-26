import assert from "node:assert/strict";
import { test } from "node:test";
import { nombreDeLaPersona } from "./nombreCliente";

test("con persona de contacto cargada, usa la persona y no la empresa", () => {
  assert.equal(
    nombreDeLaPersona({ nombre: "Panadería La Espiga", personaContacto: "Rosana Fernández" }),
    "Rosana Fernández",
  );
});

test("sin persona de contacto, cae al nombre del cliente", () => {
  assert.equal(
    nombreDeLaPersona({ nombre: "Laura Martínez", personaContacto: null }),
    "Laura Martínez",
  );
});

test("una persona de contacto en blanco se trata como ausente", () => {
  assert.equal(
    nombreDeLaPersona({ nombre: "Laura Martínez", personaContacto: "   " }),
    "Laura Martínez",
  );
});
