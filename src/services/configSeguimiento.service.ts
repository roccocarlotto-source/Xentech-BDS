import {
  configSeguimientoRepository,
  type ConfigSeguimientoRepository,
} from "../repositories/configSeguimiento.repository";
import { agentToggleRepository } from "../repositories/agentToggle.repository";
import type { UpsertConfigSeguimientoInput } from "../schemas/configSeguimiento.schema";
import { AppError } from "../utils/AppError";

// Etapa 8 de docs/seguimiento-resenas-diseno.md: el panel con el que el
// admin de la organización configura su propio seguimiento. Hasta ahora
// `ConfigSeguimiento` existía en la base pero no había forma de escribirla:
// el motor corría siempre con los defaults del schema de Prisma y las
// plantillas de los emails no se podían editar.

// Los defaults son los MISMOS que los del schema de Prisma, a propósito:
// una organización sin fila ya viene funcionando con esos valores, así que
// el panel tiene que mostrarle lo que realmente está pasando, no un
// formulario vacío. Si divergen, el panel mentiría.
export const CONFIG_SEGUIMIENTO_DEFAULTS = {
  intervalosDias: [2, 7, 15],
  maxIntentos: 3,
  horaInicioEnvio: 9,
  horaFinEnvio: 20,
  zonaHoraria: "America/Montevideo",
  plantillas: { EMAIL: [], WHATSAPP: [] },
  diasValidezTokenResena: 30,
} as const;

// Los métodos de Prisma devuelven PrismaPromise (encadenable), que un fake
// en memoria no puede implementar; acá alcanza con "algo que resuelve a ese
// valor". Mismo helper y mismo motivo que en resena.service.ts.
type Asincrono<T> = {
  [K in keyof T]: T[K] extends (...args: infer A) => infer R
    ? (...args: A) => Promise<Awaited<R>>
    : never;
};

export interface ConfigSeguimientoDeps {
  repo: Asincrono<Pick<ConfigSeguimientoRepository, "buscarCompleta" | "upsert">>;
  moduloHabilitado: (organizationId: string) => Promise<boolean>;
}

const defaultDeps: ConfigSeguimientoDeps = {
  repo: configSeguimientoRepository,
  moduloHabilitado: (organizationId) =>
    agentToggleRepository.isEnabled(organizationId, "SEGUIMIENTO_RESENAS"),
};

export interface ConfigSeguimientoVista {
  intervalosDias: number[];
  maxIntentos: number;
  horaInicioEnvio: number;
  horaFinEnvio: number;
  zonaHoraria: string;
  plantillas: { EMAIL: unknown[]; WHATSAPP: unknown[] };
  diasValidezTokenResena: number;
  // false = nunca se guardó: lo que se muestra son los defaults con los que
  // el motor ya viene corriendo. La pantalla lo aclara para que no parezca
  // que el seguimiento está sin configurar (está, con los defaults).
  personalizada: boolean;
  actualizadaEn: Date | null;
}

export async function obtenerConfig(
  organizationId: string,
  deps: ConfigSeguimientoDeps = defaultDeps,
): Promise<ConfigSeguimientoVista> {
  await exigirModuloHabilitado(organizationId, deps);

  const fila = await deps.repo.buscarCompleta(organizationId);
  if (!fila) {
    return {
      ...CONFIG_SEGUIMIENTO_DEFAULTS,
      intervalosDias: [...CONFIG_SEGUIMIENTO_DEFAULTS.intervalosDias],
      plantillas: { EMAIL: [], WHATSAPP: [] },
      personalizada: false,
      actualizadaEn: null,
    };
  }

  return {
    intervalosDias: fila.intervalosDias,
    maxIntentos: fila.maxIntentos,
    horaInicioEnvio: fila.horaInicioEnvio,
    horaFinEnvio: fila.horaFinEnvio,
    zonaHoraria: fila.zonaHoraria,
    plantillas: normalizarPlantillas(fila.plantillas),
    diasValidezTokenResena: fila.diasValidezTokenResena,
    personalizada: true,
    actualizadaEn: fila.updatedAt,
  };
}

export async function guardarConfig(
  organizationId: string,
  input: UpsertConfigSeguimientoInput,
  deps: ConfigSeguimientoDeps = defaultDeps,
): Promise<ConfigSeguimientoVista> {
  await exigirModuloHabilitado(organizationId, deps);

  const fila = await deps.repo.upsert(organizationId, {
    intervalosDias: input.intervalosDias,
    maxIntentos: input.maxIntentos,
    horaInicioEnvio: input.horaInicioEnvio,
    horaFinEnvio: input.horaFinEnvio,
    zonaHoraria: input.zonaHoraria,
    plantillas: input.plantillas,
    diasValidezTokenResena: input.diasValidezTokenResena,
  });

  return {
    intervalosDias: fila.intervalosDias,
    maxIntentos: fila.maxIntentos,
    horaInicioEnvio: fila.horaInicioEnvio,
    horaFinEnvio: fila.horaFinEnvio,
    zonaHoraria: fila.zonaHoraria,
    plantillas: normalizarPlantillas(fila.plantillas),
    diasValidezTokenResena: fila.diasValidezTokenResena,
    personalizada: true,
    actualizadaEn: fila.updatedAt,
  };
}

// El módulo se habilita por organización desde el panel de plataforma
// (mismo criterio que resena.service.ts): si está apagado, esta pantalla
// no existe para esa organización.
async function exigirModuloHabilitado(
  organizationId: string,
  deps: ConfigSeguimientoDeps,
): Promise<void> {
  if (!(await deps.moduloHabilitado(organizationId))) {
    throw new AppError("El módulo de seguimiento y reseñas no está habilitado", 404);
  }
}

// `plantillas` es Json en la base: puede venir `{}` (el default), o con
// forma vieja si alguna vez cambia el formato. Se normaliza para que la
// pantalla siempre reciba las dos listas.
function normalizarPlantillas(valor: unknown): { EMAIL: unknown[]; WHATSAPP: unknown[] } {
  const obj = typeof valor === "object" && valor !== null ? (valor as Record<string, unknown>) : {};
  return {
    EMAIL: Array.isArray(obj.EMAIL) ? obj.EMAIL : [],
    WHATSAPP: Array.isArray(obj.WHATSAPP) ? obj.WHATSAPP : [],
  };
}
