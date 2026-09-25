import assert from "node:assert/strict";
import { test } from "node:test";
import { estaDentroDeVentanaDeEnvio } from "./envioVentana";

// America/Montevideo es UTC-3 (sin horario de verano desde 2015).

test("estaDentroDeVentanaDeEnvio es true a la hora exacta de inicio", () => {
  assert.equal(
    estaDentroDeVentanaDeEnvio(new Date("2026-08-14T12:00:00Z"), "America/Montevideo", 9, 20),
    true,
  ); // 12:00 UTC == 09:00 local
});

test("estaDentroDeVentanaDeEnvio es false justo en la hora de fin (exclusive)", () => {
  assert.equal(
    estaDentroDeVentanaDeEnvio(new Date("2026-08-14T23:00:00Z"), "America/Montevideo", 9, 20),
    false,
  ); // 23:00 UTC == 20:00 local
});

test("estaDentroDeVentanaDeEnvio es false antes del inicio", () => {
  assert.equal(
    estaDentroDeVentanaDeEnvio(new Date("2026-08-14T11:59:00Z"), "America/Montevideo", 9, 20),
    false,
  ); // 08:59 local
});

test("estaDentroDeVentanaDeEnvio es true justo antes del fin", () => {
  assert.equal(
    estaDentroDeVentanaDeEnvio(new Date("2026-08-14T22:00:00Z"), "America/Montevideo", 9, 20),
    true,
  ); // 19:00 local
});

test("estaDentroDeVentanaDeEnvio respeta otra zona horaria", () => {
  // 09:00 en America/Montevideo (UTC-3) son las 08:00 en UTC-4 (ej. Bolivia).
  assert.equal(
    estaDentroDeVentanaDeEnvio(new Date("2026-08-14T12:00:00Z"), "America/La_Paz", 9, 20),
    false,
  );
  assert.equal(
    estaDentroDeVentanaDeEnvio(new Date("2026-08-14T13:00:00Z"), "America/La_Paz", 9, 20),
    true,
  );
});
