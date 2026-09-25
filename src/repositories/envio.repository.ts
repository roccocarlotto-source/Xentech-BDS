import type { EnvioEstado, PresupuestoEstado } from "@prisma/client";
import { prisma } from "../lib/prisma";

// Etapa 5, paso 2 de docs/seguimiento-resenas-diseno.md: acceso a datos para
// el job que procesa los `Envio` de email vencidos (envioJob.ts).

export interface EnvioVencido {
  id: string;
  organizationId: string;
  presupuestoId: string;
  paso: number;
  intentos: number;
  presupuesto: {
    estado: PresupuestoEstado;
    monto: number | null;
    moneda: string | null;
    cliente: { id: string; nombre: string; email: string | null };
    // Filtrado por canal EMAIL en la query de más abajo -- a lo sumo una
    // fila (presupuesto.repository.ts crea una sola por presupuesto).
    consentimientos: Array<{ bajaEn: Date | null }>;
  };
}

export const envioRepository = {
  // Ordenado por programadoPara (el más atrasado primero) -- si el job
  // estuvo caído un tiempo, procesa en el mismo orden en que se hubieran
  // mandado. Filtra por canal EMAIL a propósito (WhatsApp es la etapa 6).
  async buscarVencidos(now: Date, limit: number): Promise<EnvioVencido[]> {
    const envios = await prisma.envio.findMany({
      where: { estado: "PROGRAMADO", canal: "EMAIL", programadoPara: { lte: now } },
      orderBy: { programadoPara: "asc" },
      take: limit,
      select: {
        id: true,
        organizationId: true,
        presupuestoId: true,
        paso: true,
        intentos: true,
        presupuesto: {
          select: {
            estado: true,
            monto: true,
            moneda: true,
            cliente: { select: { id: true, nombre: true, email: true } },
            consentimientos: { where: { canal: "EMAIL" }, select: { bajaEn: true } },
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

  // Para decidir si "terminó la secuencia" (§6.3, punto 4) después de
  // mandar o descartar un Envio: ¿queda algo más pendiente para este
  // presupuesto por este canal?
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
