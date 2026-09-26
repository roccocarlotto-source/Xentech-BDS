import assert from "node:assert/strict";
import { test } from "node:test";
import { esPedidoDeBaja, quitarCitaDelOriginal } from "./deteccionBaja";

// La línea que va en TODOS los emails de seguimiento (§5). Es la que hace
// indispensable quitar la cita: vuelve citada en cualquier respuesta.
const LINEA_BAJA = "Respondé BAJA si no querés más mensajes.";

test("una respuesta de una sola palabra es baja", () => {
  assert.equal(esPedidoDeBaja("BAJA"), true);
  assert.equal(esPedidoDeBaja("baja"), true);
  assert.equal(esPedidoDeBaja("  Baja  "), true);
  assert.equal(esPedidoDeBaja("baja."), true);
});

test("equivalentes en castellano rioplatense", () => {
  assert.equal(esPedidoDeBaja("no me escriban más por favor"), true);
  assert.equal(esPedidoDeBaja("Dejen de escribirme"), true);
  assert.equal(esPedidoDeBaja("sacarme de la lista"), true);
  assert.equal(esPedidoDeBaja("no quiero más correos"), true);
});

test("unsubscribe también cuenta", () => {
  assert.equal(esPedidoDeBaja("unsubscribe"), true);
});

test("una respuesta normal NO es baja", () => {
  assert.equal(esPedidoDeBaja("Hola, me interesa. ¿Cuándo pueden empezar?"), false);
  assert.equal(esPedidoDeBaja("Gracias por el presupuesto, lo estoy viendo."), false);
  assert.equal(esPedidoDeBaja("¿Me hacen un descuento?"), false);
});

test("la palabra baja usada en otro sentido NO corta la secuencia", () => {
  assert.equal(esPedidoDeBaja("El cartel va en la parte baja de la fachada"), false);
  assert.equal(esPedidoDeBaja("Pregunto por la baja del IVA que mencionaron"), false);
});

test("la línea de baja CITADA del email original no da de baja a nadie", () => {
  const respuesta = [
    "Buenísimo, gracias. Avisen cuando lo tengan listo.",
    "",
    "El mar, 23 sep 2026 a las 9:00, Imagen Visual escribió:",
    `> ${LINEA_BAJA}`,
    "> Seguimiento de tu presupuesto",
  ].join("\n");

  assert.equal(esPedidoDeBaja(respuesta), false);
});

test("una baja escrita ARRIBA de la cita sí cuenta", () => {
  const respuesta = [
    "BAJA",
    "",
    "El mar, 23 sep 2026 a las 9:00, Imagen Visual escribió:",
    `> ${LINEA_BAJA}`,
  ].join("\n");

  assert.equal(esPedidoDeBaja(respuesta), true);
});

test("quitarCitaDelOriginal corta en la primera marca de cita", () => {
  assert.equal(quitarCitaDelOriginal("Mi respuesta\n\n> lo citado\n> mas citado"), "Mi respuesta");
  assert.equal(
    quitarCitaDelOriginal("Mi respuesta\n--- Mensaje original ---\notra cosa"),
    "Mi respuesta",
  );
  assert.equal(quitarCitaDelOriginal("On Tue, someone wrote:\n> hola"), "");
});

test("sin cita, devuelve el texto tal cual (recortado)", () => {
  assert.equal(quitarCitaDelOriginal("  Hola\nqué tal  "), "Hola\nqué tal");
});

test("un cuerpo vacío no es baja", () => {
  assert.equal(esPedidoDeBaja(""), false);
  assert.equal(esPedidoDeBaja("   \n  "), false);
});

test("una baja adentro de un texto largo igual se detecta si es una frase clara", () => {
  const texto = "Hola, gracias por todo pero no me escriban más, ya compramos en otro lado.";
  assert.equal(esPedidoDeBaja(texto), true);
});
