import assert from "node:assert/strict";
import { test } from "node:test";
import { upsertConfigSeguimientoSchema } from "./configSeguimiento.schema";

test("sin datos, aplica los defaults del diseño", () => {
  const config = upsertConfigSeguimientoSchema.parse({});
  assert.deepEqual(config, {
    intervalosDias: [2, 7, 15],
    maxIntentos: 3,
    horaInicioEnvio: 9,
    horaFinEnvio: 20,
    zonaHoraria: "America/Montevideo",
    plantillas: { EMAIL: [], WHATSAPP: [] },
    diasValidezTokenResena: 30,
  });
});

test("rechaza intervalos que no son estrictamente crecientes", () => {
  assert.throws(() => upsertConfigSeguimientoSchema.parse({ intervalosDias: [2, 2, 7] }));
  assert.throws(() => upsertConfigSeguimientoSchema.parse({ intervalosDias: [7, 2] }));
});

test("rechaza una lista de intervalos vacía", () => {
  assert.throws(() => upsertConfigSeguimientoSchema.parse({ intervalosDias: [] }));
});

test("rechaza un horario de envío invertido o vacío", () => {
  assert.throws(() =>
    upsertConfigSeguimientoSchema.parse({ horaInicioEnvio: 20, horaFinEnvio: 9 }),
  );
  assert.throws(() => upsertConfigSeguimientoSchema.parse({ horaInicioEnvio: 9, horaFinEnvio: 9 }));
});

test("rechaza una zona horaria inexistente", () => {
  assert.throws(() => upsertConfigSeguimientoSchema.parse({ zonaHoraria: "America/Montevide" }));
});

test("rechaza más plantillas que pasos", () => {
  assert.throws(() =>
    upsertConfigSeguimientoSchema.parse({
      intervalosDias: [3],
      plantillas: {
        EMAIL: [
          { asunto: "a", cuerpo: "b" },
          { asunto: "c", cuerpo: "d" },
        ],
      },
    }),
  );
});

test("plantilla de WhatsApp: exige un nombre válido de Meta e idioma por defecto es", () => {
  const config = upsertConfigSeguimientoSchema.parse({
    plantillas: { WHATSAPP: [{ nombre: "seguimiento_presupuesto_1" }] },
  });
  assert.deepEqual(config.plantillas.WHATSAPP, [
    { nombre: "seguimiento_presupuesto_1", idioma: "es" },
  ]);
  assert.throws(() =>
    upsertConfigSeguimientoSchema.parse({
      plantillas: { WHATSAPP: [{ nombre: "Seguimiento Presupuesto" }] },
    }),
  );
});
