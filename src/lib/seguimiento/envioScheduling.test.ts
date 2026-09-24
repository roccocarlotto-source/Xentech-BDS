import assert from "node:assert/strict";
import { test } from "node:test";
import { calcularEnviosEmail } from "./envioScheduling";

const PRESUPUESTO_ID = "presu-1";

test("calcularEnviosEmail programa un Envio por cada intervalo, con el paso e idempotencia esperados", () => {
  const envios = calcularEnviosEmail({
    presupuestoId: PRESUPUESTO_ID,
    fechaReferencia: new Date("2026-08-12T12:00:00Z"),
    intervalosDias: [2, 7, 15],
  });

  assert.equal(envios.length, 3);
  assert.deepEqual(
    envios.map((e) => e.paso),
    [1, 2, 3],
  );
  assert.deepEqual(
    envios.map((e) => e.claveIdempotencia),
    ["presu-1:1:EMAIL", "presu-1:2:EMAIL", "presu-1:3:EMAIL"],
  );
  assert.ok(envios.every((e) => e.canal === "EMAIL"));
});

test("calcularEnviosEmail cuenta los días desde la MISMA fecha de referencia, no acumulados", () => {
  const envios = calcularEnviosEmail({
    presupuestoId: PRESUPUESTO_ID,
    fechaReferencia: new Date("2026-08-12T12:00:00Z"),
    intervalosDias: [2, 7, 15],
    horaInicioEnvio: 9,
    zonaHoraria: "America/Montevideo",
  });

  // Los tres cuentan desde el 12/08, no uno desde el anterior -- si fueran
  // acumulados el paso 3 caería el 03/09, no el 27/08.
  assert.equal(envios[0].programadoPara.toISOString().slice(0, 10), "2026-08-14");
  assert.equal(envios[1].programadoPara.toISOString().slice(0, 10), "2026-08-19");
  assert.equal(envios[2].programadoPara.toISOString().slice(0, 10), "2026-08-27");
});

test("calcularEnviosEmail agenda a la hora de inicio de envío configurada, en la zona horaria de la organización", () => {
  const envios = calcularEnviosEmail({
    presupuestoId: PRESUPUESTO_ID,
    fechaReferencia: new Date("2026-08-12T12:00:00Z"),
    intervalosDias: [2],
    horaInicioEnvio: 9,
    zonaHoraria: "America/Montevideo",
  });

  // America/Montevideo es UTC-3 (sin horario de verano desde 2015): las
  // 09:00 locales son las 12:00 UTC.
  assert.equal(envios[0].programadoPara.toISOString(), "2026-08-14T12:00:00.000Z");
});

test("calcularEnviosEmail respeta una hora de inicio de envío distinta", () => {
  const envios = calcularEnviosEmail({
    presupuestoId: PRESUPUESTO_ID,
    fechaReferencia: new Date("2026-08-12T12:00:00Z"),
    intervalosDias: [2],
    horaInicioEnvio: 14,
    zonaHoraria: "America/Montevideo",
  });

  assert.equal(envios[0].programadoPara.toISOString(), "2026-08-14T17:00:00.000Z");
});

test("calcularEnviosEmail usa los defaults del schema cuando no se pasa config", () => {
  const envios = calcularEnviosEmail({
    presupuestoId: PRESUPUESTO_ID,
    fechaReferencia: new Date("2026-08-12T12:00:00Z"),
  });

  assert.deepEqual(
    envios.map((e) => e.paso),
    [1, 2, 3],
  );
});
