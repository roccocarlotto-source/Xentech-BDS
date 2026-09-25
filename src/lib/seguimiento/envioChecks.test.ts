import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluarPrecondicionesEnvio } from "./envioChecks";

const BASE = {
  presupuestoEstado: "PENDIENTE" as const,
  clienteEmail: "cliente@example.com",
  consentimiento: { bajaEn: null },
  intentos: 1,
  maxIntentos: 3,
};

test("evaluarPrecondicionesEnvio permite enviar cuando todo está en orden", () => {
  const resultado = evaluarPrecondicionesEnvio(BASE);
  assert.deepEqual(resultado, { puedeEnviar: true });
});

test("evaluarPrecondicionesEnvio permite enviar con el presupuesto en EN_SEGUIMIENTO", () => {
  const resultado = evaluarPrecondicionesEnvio({ ...BASE, presupuestoEstado: "EN_SEGUIMIENTO" });
  assert.deepEqual(resultado, { puedeEnviar: true });
});

for (const estado of ["ACEPTADO", "RECHAZADO", "VENCIDO", "SIN_RESPUESTA"] as const) {
  test(`evaluarPrecondicionesEnvio cancela si el presupuesto ya está ${estado}`, () => {
    const resultado = evaluarPrecondicionesEnvio({ ...BASE, presupuestoEstado: estado });
    assert.equal(resultado.puedeEnviar, false);
    assert.equal((resultado as { estadoFinal: string }).estadoFinal, "CANCELADO");
  });
}

test("evaluarPrecondicionesEnvio cancela si el cliente no tiene email", () => {
  const resultado = evaluarPrecondicionesEnvio({ ...BASE, clienteEmail: null });
  assert.equal(resultado.puedeEnviar, false);
  assert.equal((resultado as { estadoFinal: string }).estadoFinal, "CANCELADO");
});

test("evaluarPrecondicionesEnvio cancela si no hay consentimiento registrado", () => {
  const resultado = evaluarPrecondicionesEnvio({ ...BASE, consentimiento: null });
  assert.equal(resultado.puedeEnviar, false);
  assert.equal((resultado as { estadoFinal: string }).estadoFinal, "CANCELADO");
});

test("evaluarPrecondicionesEnvio cancela si hubo baja", () => {
  const resultado = evaluarPrecondicionesEnvio({
    ...BASE,
    consentimiento: { bajaEn: new Date("2026-01-01T00:00:00Z") },
  });
  assert.equal(resultado.puedeEnviar, false);
  assert.equal((resultado as { estadoFinal: string }).estadoFinal, "CANCELADO");
});

test("evaluarPrecondicionesEnvio permite el intento exactamente igual a maxIntentos", () => {
  const resultado = evaluarPrecondicionesEnvio({ ...BASE, intentos: 3, maxIntentos: 3 });
  assert.deepEqual(resultado, { puedeEnviar: true });
});

test("evaluarPrecondicionesEnvio marca FALLIDO si se superó el máximo de intentos", () => {
  const resultado = evaluarPrecondicionesEnvio({ ...BASE, intentos: 4, maxIntentos: 3 });
  assert.equal(resultado.puedeEnviar, false);
  assert.equal((resultado as { estadoFinal: string }).estadoFinal, "FALLIDO");
});

test("evaluarPrecondicionesEnvio prioriza el presupuesto cerrado sobre el máximo de intentos", () => {
  // Si las dos condiciones fallan, el motivo tiene que ser el del
  // presupuesto (CANCELADO), no el de intentos (FALLIDO) -- orden de §6.3.
  const resultado = evaluarPrecondicionesEnvio({
    ...BASE,
    presupuestoEstado: "RECHAZADO",
    intentos: 10,
    maxIntentos: 3,
  });
  assert.equal(resultado.puedeEnviar, false);
  assert.equal((resultado as { estadoFinal: string }).estadoFinal, "CANCELADO");
});
