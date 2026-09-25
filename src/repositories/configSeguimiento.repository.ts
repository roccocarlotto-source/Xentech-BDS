import { prisma } from "../lib/prisma";

// Etapa 5, paso 2: el job de envío necesita, por organización, el horario
// de envío/zona horaria (§6.3: "no enviar fuera de horario razonable"),
// `maxIntentos` y las plantillas de email -- ver envioJob.ts. Todavía no
// hay panel para cargar esto (etapa 8): sin fila, el caller usa los
// defaults del schema de Prisma (mismo criterio que
// presupuesto.repository.ts / envioScheduling.ts para intervalosDias).

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
};

export type ConfigSeguimientoRepository = typeof configSeguimientoRepository;
