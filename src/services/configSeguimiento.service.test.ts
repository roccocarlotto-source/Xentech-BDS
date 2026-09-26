import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CONFIG_SEGUIMIENTO_DEFAULTS,
  guardarConfig,
  obtenerConfig,
  type ConfigSeguimientoDeps,
} from "./configSeguimiento.service";
import { upsertConfigSeguimientoSchema } from "../schemas/configSeguimiento.schema";
import { AppError } from "../utils/AppError";

const ORG = "org-1";

type Fila = Awaited<ReturnType<ConfigSeguimientoDeps["repo"]["buscarCompleta"]>>;

function crearDeps(opts: { fila?: Fila; moduloOn?: boolean } = {}) {
  let fila: Fila = opts.fila ?? null;
  const deps: ConfigSeguimientoDeps = {
    repo: {
      buscarCompleta: async () => fila,
      upsert: async (_org, data) => {
        fila = {
          ...data,
          // El repo recibe InputJsonValue y devuelve JsonValue: son el mismo
          // dato, distinto tipo según el lado de Prisma. El fake cruza los dos.
          plantillas: data.plantillas as NonNullable<Fila>["plantillas"],
          updatedAt: new Date("2026-09-26T20:00:00Z"),
        };
        return fila!;
      },
    },
    moduloHabilitado: async () => opts.moduloOn !== false,
  };
  return { deps, leerFila: () => fila };
}

test("sin fila guardada devuelve los defaults del schema, marcados como no personalizados", async () => {
  const { deps } = crearDeps();
  const config = await obtenerConfig(ORG, deps);

  // Lo importante: son los MISMOS valores con los que el motor ya viene
  // corriendo, no un formulario vacío.
  assert.deepEqual(config.intervalosDias, [2, 7, 15]);
  assert.equal(config.horaInicioEnvio, 9);
  assert.equal(config.horaFinEnvio, 20);
  assert.equal(config.zonaHoraria, "America/Montevideo");
  assert.equal(config.maxIntentos, 3);
  assert.equal(config.diasValidezTokenResena, 30);
  assert.deepEqual(config.plantillas, { EMAIL: [], WHATSAPP: [] });
  assert.equal(config.personalizada, false);
  assert.equal(config.actualizadaEn, null);
});

test("los defaults del service no se desincronizan de los del schema de Prisma", () => {
  // Si alguien cambia el default en prisma/schema.prisma y no acá, el panel
  // muestra algo distinto de lo que el motor hace. Este test no puede leer
  // el schema, pero deja los valores a la vista en un solo lugar.
  assert.deepEqual(CONFIG_SEGUIMIENTO_DEFAULTS.intervalosDias, [2, 7, 15]);
  assert.equal(CONFIG_SEGUIMIENTO_DEFAULTS.maxIntentos, 3);
  assert.equal(CONFIG_SEGUIMIENTO_DEFAULTS.horaInicioEnvio, 9);
  assert.equal(CONFIG_SEGUIMIENTO_DEFAULTS.horaFinEnvio, 20);
  assert.equal(CONFIG_SEGUIMIENTO_DEFAULTS.zonaHoraria, "America/Montevideo");
  assert.equal(CONFIG_SEGUIMIENTO_DEFAULTS.diasValidezTokenResena, 30);
});

test("con fila guardada devuelve lo guardado y lo marca como personalizado", async () => {
  const { deps } = crearDeps({
    fila: {
      intervalosDias: [3, 10],
      maxIntentos: 5,
      horaInicioEnvio: 10,
      horaFinEnvio: 18,
      zonaHoraria: "America/Argentina/Buenos_Aires",
      plantillas: { EMAIL: [{ asunto: "Hola", cuerpo: "Texto" }], WHATSAPP: [] },
      diasValidezTokenResena: 15,
      updatedAt: new Date("2026-09-20T10:00:00Z"),
    },
  });

  const config = await obtenerConfig(ORG, deps);
  assert.deepEqual(config.intervalosDias, [3, 10]);
  assert.equal(config.personalizada, true);
  assert.equal(config.plantillas.EMAIL.length, 1);
});

test("plantillas guardadas como {} (el default de la base) se normalizan a las dos listas", async () => {
  const { deps } = crearDeps({
    fila: {
      intervalosDias: [2],
      maxIntentos: 3,
      horaInicioEnvio: 9,
      horaFinEnvio: 20,
      zonaHoraria: "America/Montevideo",
      plantillas: {},
      diasValidezTokenResena: 30,
      updatedAt: new Date(),
    },
  });

  const config = await obtenerConfig(ORG, deps);
  assert.deepEqual(config.plantillas, { EMAIL: [], WHATSAPP: [] });
});

test("guardar persiste y devuelve lo guardado", async () => {
  const { deps, leerFila } = crearDeps();
  const input = upsertConfigSeguimientoSchema.parse({
    intervalosDias: [1, 5, 12],
    maxIntentos: 2,
    horaInicioEnvio: 8,
    horaFinEnvio: 19,
    zonaHoraria: "America/Montevideo",
    plantillas: { EMAIL: [{ asunto: "¿Lo viste?", cuerpo: "Quedamos a las órdenes." }] },
    diasValidezTokenResena: 45,
  });

  const config = await guardarConfig(ORG, input, deps);

  assert.deepEqual(config.intervalosDias, [1, 5, 12]);
  assert.equal(config.personalizada, true);
  assert.equal(leerFila()?.maxIntentos, 2);
});

test("con el módulo apagado, la pantalla no existe para esa organización", async () => {
  const { deps } = crearDeps({ moduloOn: false });
  await assert.rejects(
    () => obtenerConfig(ORG, deps),
    (err: unknown) => err instanceof AppError && err.status === 404,
  );

  const input = upsertConfigSeguimientoSchema.parse({});
  await assert.rejects(
    () => guardarConfig(ORG, input, deps),
    (err: unknown) => err instanceof AppError && err.status === 404,
  );
});
