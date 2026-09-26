import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";

// Dos lectores distintos, a propósito:
//
// - `buscarPorOrganizacion` es lo que el job de envío necesita en cada tick
//   (§6.3): horario, zona horaria, maxIntentos y plantillas. Devuelve
//   `null` si no hay fila, y el caller cae a los defaults del schema de
//   Prisma (mismo criterio que presupuesto.repository.ts para
//   intervalosDias). Esa ruta no cambió con la etapa 8: una organización
//   que nunca abrió el panel sigue funcionando igual.
// - `buscarCompleta` + `upsert` son de la etapa 8 (el panel del admin de la
//   organización). Traen todos los campos configurables.

export interface ConfigSeguimientoParaEnvio {
  horaInicioEnvio: number;
  horaFinEnvio: number;
  zonaHoraria: string;
  maxIntentos: number;
  plantillas: unknown;
}

export const configSeguimientoRepository = {
  buscarPorOrganizacion(organizationId: string): Promise<ConfigSeguimientoParaEnvio | null> {
    return prisma.configSeguimiento.findUnique({
      where: { organizationId },
      select: {
        horaInicioEnvio: true,
        horaFinEnvio: true,
        zonaHoraria: true,
        maxIntentos: true,
        plantillas: true,
      },
    });
  },

  // Todos los campos configurables, para el panel (etapa 8).
  buscarCompleta(organizationId: string) {
    return prisma.configSeguimiento.findUnique({
      where: { organizationId },
      select: {
        intervalosDias: true,
        maxIntentos: true,
        horaInicioEnvio: true,
        horaFinEnvio: true,
        zonaHoraria: true,
        plantillas: true,
        diasValidezTokenResena: true,
        updatedAt: true,
      },
    });
  },

  // Upsert y no update: la mayoría de las organizaciones no tiene fila
  // todavía (venían corriendo con los defaults), así que la primera vez que
  // alguien abre el panel y guarda, la crea.
  upsert(organizationId: string, data: ConfigSeguimientoEditable) {
    return prisma.configSeguimiento.upsert({
      where: { organizationId },
      create: { organizationId, ...data },
      update: data,
      select: {
        intervalosDias: true,
        maxIntentos: true,
        horaInicioEnvio: true,
        horaFinEnvio: true,
        zonaHoraria: true,
        plantillas: true,
        diasValidezTokenResena: true,
        updatedAt: true,
      },
    });
  },
};

export interface ConfigSeguimientoEditable {
  intervalosDias: number[];
  maxIntentos: number;
  horaInicioEnvio: number;
  horaFinEnvio: number;
  zonaHoraria: string;
  plantillas: Prisma.InputJsonValue;
  diasValidezTokenResena: number;
}

export type ConfigSeguimientoRepository = typeof configSeguimientoRepository;
