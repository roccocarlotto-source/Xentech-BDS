import assert from "node:assert/strict";
import { test } from "node:test";
import {
  decidirEnvioWhatsapp,
  dentroDeVentana24h,
  extraerPlantillaWhatsapp,
} from "./envioWhatsapp";

const AHORA = new Date("2026-09-26T12:00:00Z");

test("la ventana está abierta si el cliente escribió hace menos de 24 h", () => {
  assert.equal(dentroDeVentana24h(new Date("2026-09-26T11:00:00Z"), AHORA), true);
  assert.equal(dentroDeVentana24h(new Date("2026-09-25T12:00:01Z"), AHORA), true);
});

test("la ventana está cerrada a las 24 h exactas y después", () => {
  assert.equal(dentroDeVentana24h(new Date("2026-09-25T12:00:00Z"), AHORA), false);
  assert.equal(dentroDeVentana24h(new Date("2026-09-20T12:00:00Z"), AHORA), false);
});

test("sin ningún mensaje del cliente, la ventana está cerrada", () => {
  assert.equal(dentroDeVentana24h(null, AHORA), false);
});

test("un timestamp futuro (reloj desfasado) NO abre la ventana", () => {
  // Ante la duda, plantilla: es lo que Meta siempre acepta.
  assert.equal(dentroDeVentana24h(new Date("2026-09-27T12:00:00Z"), AHORA), false);
});

test("extrae la plantilla del paso, con el idioma por default", () => {
  const plantillas = {
    WHATSAPP: [{ nombre: "seguimiento_1" }, { nombre: "seguimiento_2", idioma: "es_UY" }],
  };
  assert.deepEqual(extraerPlantillaWhatsapp(plantillas, 1), {
    nombre: "seguimiento_1",
    idioma: "es",
  });
  assert.deepEqual(extraerPlantillaWhatsapp(plantillas, 2), {
    nombre: "seguimiento_2",
    idioma: "es_UY",
  });
});

test("sin plantilla para ese paso, o con forma inesperada, devuelve null", () => {
  assert.equal(extraerPlantillaWhatsapp({ WHATSAPP: [{ nombre: "a" }] }, 2), null);
  assert.equal(extraerPlantillaWhatsapp({}, 1), null);
  assert.equal(extraerPlantillaWhatsapp(null, 1), null);
  assert.equal(extraerPlantillaWhatsapp({ WHATSAPP: "no es una lista" }, 1), null);
  assert.equal(extraerPlantillaWhatsapp({ WHATSAPP: [{ nombre: "   " }] }, 1), null);
});

test("con la ventana abierta se manda texto libre", () => {
  const r = decidirEnvioWhatsapp({
    ventanaAbierta: true,
    plantilla: { nombre: "seguimiento_1", idioma: "es" },
    texto: "Hola, ¿viste el presupuesto?",
    parametros: ["Rosana"],
  });
  assert.deepEqual(r, { modo: "texto", texto: "Hola, ¿viste el presupuesto?" });
});

test("con la ventana cerrada se usa la plantilla aprobada", () => {
  const r = decidirEnvioWhatsapp({
    ventanaAbierta: false,
    plantilla: { nombre: "seguimiento_1", idioma: "es" },
    texto: "Hola",
    parametros: ["Rosana"],
  });
  assert.deepEqual(r, {
    modo: "plantilla",
    plantilla: { nombre: "seguimiento_1", idioma: "es" },
    parametros: ["Rosana"],
  });
});

test("ventana cerrada y sin plantilla: no se manda nada, y se dice por qué", () => {
  const r = decidirEnvioWhatsapp({
    ventanaAbierta: false,
    plantilla: null,
    texto: "Hola",
    parametros: [],
  });
  assert.deepEqual(r, { modo: "falta_plantilla" });
});
