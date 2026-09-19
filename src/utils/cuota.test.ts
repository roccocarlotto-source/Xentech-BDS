import assert from "node:assert/strict";
import { test } from "node:test";
import { calcularCuota } from "./cuota";

test("sin periodicidad o sin ultimo pago -> SIN_DATOS", () => {
  assert.deepEqual(calcularCuota({ cuotaPeriodicidad: null, cuotaUltimoPago: new Date() }), {
    estado: "SIN_DATOS",
    diasAtraso: 0,
  });
  assert.deepEqual(calcularCuota({ cuotaPeriodicidad: "MENSUAL", cuotaUltimoPago: null }), {
    estado: "SIN_DATOS",
    diasAtraso: 0,
  });
});

test("pago hace 10 dias, mensual -> AL_DIA", () => {
  const ahora = new Date("2026-09-19");
  const ultimoPago = new Date("2026-09-09");
  assert.deepEqual(
    calcularCuota({ cuotaPeriodicidad: "MENSUAL", cuotaUltimoPago: ultimoPago }, ahora),
    {
      estado: "AL_DIA",
      diasAtraso: 0,
    },
  );
});

test("pago justo hace un mes -> AL_DIA (limite inclusivo)", () => {
  const ahora = new Date("2026-09-19");
  const ultimoPago = new Date("2026-08-19");
  assert.deepEqual(
    calcularCuota({ cuotaPeriodicidad: "MENSUAL", cuotaUltimoPago: ultimoPago }, ahora),
    {
      estado: "AL_DIA",
      diasAtraso: 0,
    },
  );
});

test("pago hace mas de un mes -> ATRASADO con dias correctos", () => {
  const ahora = new Date("2026-09-19");
  const ultimoPago = new Date("2026-08-01"); // vence 2026-09-01, hoy 2026-09-19 -> 18 dias
  assert.deepEqual(
    calcularCuota({ cuotaPeriodicidad: "MENSUAL", cuotaUltimoPago: ultimoPago }, ahora),
    {
      estado: "ATRASADO",
      diasAtraso: 18,
    },
  );
});
