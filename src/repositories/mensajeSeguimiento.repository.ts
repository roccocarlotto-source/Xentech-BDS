import type { CanalSeguimiento, ClasificacionRespuesta } from "@prisma/client";
import { prisma } from "../lib/prisma";

// Etapa 5 (§6.3 punto 3: "envía por el canal y registra el Mensaje", y
// §6.4: recepción de respuestas). Los dos lados: el saliente lo escribe el
// job de envío, el entrante el webhook de Resend.

export const mensajeSeguimientoRepository = {
  crearSaliente(data: {
    organizationId: string;
    // Etapa 6: el canal por el que salió de verdad. Antes era siempre
    // EMAIL porque era el único que mandaba.
    canal: CanalSeguimiento;
    presupuestoId: string;
    clienteId: string;
    envioId: string;
    contenido: string;
    fecha: Date;
    // Message-ID que devuelve el proveedor de email -- único en la base
    // (comentario de MensajeSeguimiento.externalId en el schema), para
    // poder deduplicar cuando exista el webhook de respuestas.
    externalId: string;
  }) {
    return prisma.mensajeSeguimiento.create({
      data: {
        organizationId: data.organizationId,
        presupuestoId: data.presupuestoId,
        clienteId: data.clienteId,
        envioId: data.envioId,
        canal: data.canal,
        direccion: "OUTBOUND",
        contenido: data.contenido,
        fecha: data.fecha,
        externalId: data.externalId,
      },
    });
  },

  // `externalId` es el Message-ID del mail entrante y es UNIQUE en la base:
  // si Resend reintenta el webhook (lo hace), el segundo insert choca con
  // P2002 en vez de duplicar la respuesta del cliente. El llamador trata
  // ese choque como "ya procesado", no como error.
  crearEntrante(data: {
    organizationId: string;
    presupuestoId: string | null;
    clienteId: string;
    contenido: string;
    fecha: Date;
    externalId: string;
  }) {
    return prisma.mensajeSeguimiento.create({
      data: {
        organizationId: data.organizationId,
        presupuestoId: data.presupuestoId,
        clienteId: data.clienteId,
        canal: "EMAIL",
        direccion: "INBOUND",
        contenido: data.contenido,
        fecha: data.fecha,
        externalId: data.externalId,
      },
    });
  },

  // Etapa 7: la cola de trabajo de la clasificación. No hace falta una
  // tabla de cola aparte -- los entrantes con `clasificacionIa` en null son
  // exactamente los que la IA todavía no miró.
  buscarSinClasificar(limit: number) {
    return prisma.mensajeSeguimiento.findMany({
      where: { direccion: "INBOUND", clasificacionIa: null, presupuestoId: { not: null } },
      orderBy: { fecha: "asc" },
      take: limit,
      select: {
        id: true,
        organizationId: true,
        presupuestoId: true,
        clienteId: true,
        contenido: true,
        presupuesto: {
          select: { estado: true, vendedorId: true, creadoPorId: true, descripcion: true },
        },
        cliente: { select: { nombre: true, personaContacto: true } },
      },
    });
  },

  // `clasificacionIa: null` en el where hace el claim: si dos corridas del
  // poller se solapan, la segunda actualiza 0 filas y no vuelve a llamar al
  // modelo por el mismo mensaje (ni a mandar dos avisos al vendedor).
  guardarClasificacion(
    id: string,
    organizationId: string,
    data: {
      clasificacionIa: ClasificacionRespuesta;
      resumenIa: string;
      requiereVendedor: boolean;
    },
  ) {
    return prisma.mensajeSeguimiento.updateMany({
      where: { id, organizationId, clasificacionIa: null },
      data,
    });
  },

  // Etapa 6: cuándo fue la última vez que el cliente nos escribió por
  // WhatsApp. Es lo que define si la ventana de 24 h de Meta está abierta
  // (§6.4) y por lo tanto si se puede mandar texto libre o hace falta una
  // plantilla aprobada.
  async ultimoEntranteWhatsapp(organizationId: string, clienteId: string): Promise<Date | null> {
    const fila = await prisma.mensajeSeguimiento.findFirst({
      where: { organizationId, clienteId, canal: "WHATSAPP", direccion: "INBOUND" },
      orderBy: { fecha: "desc" },
      select: { fecha: true },
    });
    return fila?.fecha ?? null;
  },
};

export type MensajeSeguimientoRepository = typeof mensajeSeguimientoRepository;
