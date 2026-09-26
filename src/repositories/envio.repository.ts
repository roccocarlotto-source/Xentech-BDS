import type { CanalSeguimiento, EnvioEstado, PresupuestoEstado } from "@prisma/client";
import { prisma } from "../lib/prisma";

// Etapa 5, paso 2 de docs/seguimiento-resenas-diseno.md: acceso a datos para
// el job que procesa los `Envio` de email vencidos (envioJob.ts).

export interface EnvioVencido {
  id: string;
  organizationId: string;
  presupuestoId: string;
  paso: number;
  canal: CanalSeguimiento;
  intentos: number;
  claveIdempotencia: string;
  presupuesto: {
    estado: PresupuestoEstado;
    monto: number | null;
    moneda: string | null;
    cliente: {
      id: string;
      nombre: string;
      personaContacto: string | null;
      email: string | null;
      telefono: string | null;
    };
    // Los de los dos canales: el job elige el que corresponde al canal de
    // ESTE Envio (antes la query filtraba por EMAIL, que era todo lo que
    // había).
    consentimientos: Array<{ canal: CanalSeguimiento; bajaEn: Date | null }>;
  };
}

export const envioRepository = {
  // Ordenado por programadoPara (el más atrasado primero) -- si el job
  // estuvo caído un tiempo, procesa en el mismo orden en que se hubieran
  // mandado. Desde la etapa 6 trae los dos canales: el job resuelve cada
  // fila según su `canal`.
  async buscarVencidos(now: Date, limit: number): Promise<EnvioVencido[]> {
    const envios = await prisma.envio.findMany({
      where: { estado: "PROGRAMADO", programadoPara: { lte: now } },
      orderBy: { programadoPara: "asc" },
      take: limit,
      select: {
        id: true,
        organizationId: true,
        presupuestoId: true,
        paso: true,
        canal: true,
        intentos: true,
        claveIdempotencia: true,
        presupuesto: {
          select: {
            estado: true,
            monto: true,
            moneda: true,
            cliente: {
              select: {
                id: true,
                nombre: true,
                personaContacto: true,
                email: true,
                telefono: true,
              },
            },
            consentimientos: { select: { canal: true, bajaEn: true } },
          },
        },
      },
    });

    return envios.map((envio) => ({
      ...envio,
      presupuesto: {
        ...envio.presupuesto,
        monto: envio.presupuesto.monto ? Number(envio.presupuesto.monto) : null,
      },
    }));
  },

  // Claim atómico (§6.3 "idempotente"): solo reclama la fila si TODAVÍA
  // está en PROGRAMADO -- si dos corridas del job la agarran a la vez,
  // como mucho una gana la carrera (la otra recibe null). Incrementa
  // `intentos` en el mismo UPDATE, antes de intentar enviar nada, así
  // cuenta como intento aunque el proceso se caiga a mitad de camino.
  async reclamar(id: string, organizationId: string): Promise<{ intentos: number } | null> {
    const { count } = await prisma.envio.updateMany({
      where: { id, organizationId, estado: "PROGRAMADO" },
      data: { estado: "ENVIANDO", intentos: { increment: 1 } },
    });
    if (count === 0) return null;

    const envio = await prisma.envio.findUnique({ where: { id }, select: { intentos: true } });
    // No debería poder ser null (lo acabamos de reclamar) -- si lo es, algo
    // borró la fila entre el UPDATE y este SELECT; tratarlo como "no se
    // pudo reclamar" es más seguro que tirar la corrida entera.
    return envio;
  },

  marcarEnviado(id: string, organizationId: string, enviadoEn: Date) {
    return prisma.envio.updateMany({
      where: { id, organizationId },
      data: { estado: "ENVIADO", enviadoEn, ultimoError: null },
    });
  },

  marcarEstadoFinal(id: string, organizationId: string, estado: EnvioEstado, motivo: string) {
    return prisma.envio.updateMany({
      where: { id, organizationId },
      data: { estado, ultimoError: motivo },
    });
  },

  // Falla transitoria (ej. el proveedor de email devolvió un error de red)
  // con intentos todavía por debajo del máximo: vuelve a PROGRAMADO para
  // que el job la reintente en un tick siguiente -- mismo programadoPara,
  // no hay backoff todavía (decisión propia, a confirmar por Rocco si hace
  // falta espaciar los reintentos).
  revertirAProgramado(id: string, organizationId: string, motivo: string) {
    return prisma.envio.updateMany({
      where: { id, organizationId },
      data: { estado: "PROGRAMADO", ultimoError: motivo },
    });
  },

  // Etapa 6: devuelve la fila a PROGRAMADO SIN gastarle el intento. Es
  // para el caso "el envío no se intentó por falta de configuración"
  // (p. ej. no hay plantilla de WhatsApp para ese paso): no es un fallo
  // del proveedor, y castigarlo con un intento haría que un presupuesto
  // se quedara sin seguimiento por algo que el admin todavía puede
  // arreglar.
  devolverSinGastarIntento(id: string, organizationId: string, motivo: string) {
    return prisma.envio.updateMany({
      where: { id, organizationId, estado: "ENVIANDO" },
      data: { estado: "PROGRAMADO", ultimoError: motivo, intentos: { decrement: 1 } },
    });
  },

  // Para decidir si "terminó la secuencia" (§6.3, punto 4) después de
  // mandar o descartar un Envio: ¿queda algo más pendiente para este
  // presupuesto por este canal?
  // Baja del cliente (§5, §6.4): corta la secuencia "de inmediato". Se
  // cancelan los PROGRAMADO, no los ENVIANDO: una fila reclamada ya está en
  // vuelo y el job la resuelve solo -- pisarla acá abriría una carrera.
  cancelarPendientesDelPresupuesto(organizationId: string, presupuestoId: string, motivo: string) {
    return prisma.envio.updateMany({
      where: { organizationId, presupuestoId, estado: "PROGRAMADO" },
      data: { estado: "CANCELADO", ultimoError: motivo },
    });
  },

  contarPendientesDelPresupuesto(organizationId: string, presupuestoId: string): Promise<number> {
    return prisma.envio.count({
      where: {
        organizationId,
        presupuestoId,
        canal: "EMAIL",
        estado: { in: ["PROGRAMADO", "ENVIANDO"] },
      },
    });
  },
};

export type EnvioRepository = typeof envioRepository;
