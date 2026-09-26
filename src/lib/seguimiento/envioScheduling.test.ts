import assert from "node:assert/strict";
import { test } from "node:test";
import { calcularEnvios, elegirCanalSeguimiento } from "./envioScheduling";

const PRESUPUESTO_ID = "presu-1";

test("calcularEnvios programa un Envio por cada intervalo, con el paso e idempotencia esperados", () => {
  const envios = calcularEnvios({
    presupuestoId: PRESUPUESTO_ID,
    canal: "EMAIL",
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

test("calcularEnvios cuenta los días desde la MISMA fecha de referencia, no acumulados", () => {
  const envios = calcularEnvios({
    presupuestoId: PRESUPUESTO_ID,
    canal: "EMAIL",
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

test("calcularEnvios agenda a la hora de inicio de envío configurada, en la zona horaria de la organización", () => {
  const envios = calcularEnvios({
    presupuestoId: PRESUPUESTO_ID,
    canal: "EMAIL",
    fechaReferencia: new Date("2026-08-12T12:00:00Z"),
    intervalosDias: [2],
    horaInicioEnvio: 9,
    zonaHoraria: "America/Montevideo",
  });

  // America/Montevideo es UTC-3 (sin horario de verano desde 2015): las
  // 09:00 locales son las 12:00 UTC.
  assert.equal(envios[0].programadoPara.toISOString(), "2026-08-14T12:00:00.000Z");
});

test("calcularEnvios respeta una hora de inicio de envío distinta", () => {
  const envios = calcularEnvios({
    presupuestoId: PRESUPUESTO_ID,
    canal: "EMAIL",
    fechaReferencia: new Date("2026-08-12T12:00:00Z"),
    intervalosDias: [2],
    horaInicioEnvio: 14,
    zonaHoraria: "America/Montevideo",
  });

  assert.equal(envios[0].programadoPara.toISOString(), "2026-08-14T17:00:00.000Z");
});

test("calcularEnvios usa los defaults del schema cuando no se pasa config", () => {
  const envios = calcularEnvios({
    presupuestoId: PRESUPUESTO_ID,
    canal: "EMAIL",
    fechaReferencia: new Date("2026-08-12T12:00:00Z"),
  });

  assert.deepEqual(
    envios.map((e) => e.paso),
    [1, 2, 3],
  );
});

// --- elegirCanalSeguimiento (decisión 1 del 2026-09-26) ---

test("elegirCanalSeguimiento: con email, gana email aunque haya teléfono y consentimiento", () => {
  assert.equal(
    elegirCanalSeguimiento({
      tieneEmail: true,
      tieneTelefono: true,
      consentimientoWhatsapp: true,
    }),
    "EMAIL",
  );
});

test("elegirCanalSeguimiento: sin email, WhatsApp es el respaldo", () => {
  assert.equal(
    elegirCanalSeguimiento({
      tieneEmail: false,
      tieneTelefono: true,
      consentimientoWhatsapp: true,
    }),
    "WHATSAPP",
  );
});

test("elegirCanalSeguimiento: sin consentimiento de WhatsApp no se usa WhatsApp (§5)", () => {
  assert.equal(
    elegirCanalSeguimiento({
      tieneEmail: false,
      tieneTelefono: true,
      consentimientoWhatsapp: false,
    }),
    null,
  );
});

test("elegirCanalSeguimiento: sin ningún dato de contacto no hay canal", () => {
  assert.equal(
    elegirCanalSeguimiento({
      tieneEmail: false,
      tieneTelefono: false,
      consentimientoWhatsapp: true,
    }),
    null,
  );
});

test("calcularEnvios arma la clave de idempotencia con el canal elegido", () => {
  const envios = calcularEnvios({
    presupuestoId: PRESUPUESTO_ID,
    canal: "WHATSAPP",
    fechaReferencia: new Date("2026-08-12T12:00:00Z"),
    intervalosDias: [2, 7],
  });

  assert.deepEqual(
    envios.map((e) => e.claveIdempotencia),
    ["presu-1:1:WHATSAPP", "presu-1:2:WHATSAPP"],
  );
  assert.ok(envios.every((e) => e.canal === "WHATSAPP"));
});
