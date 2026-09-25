import { prisma } from "../lib/prisma";

// Etapa 5, paso 2 (§6.3, punto 3: "envía por el canal y registra el
// Mensaje"). Solo el lado saliente por ahora -- la recepción de respuestas
// (§6.4, §6.5) es un paso siguiente de esta misma etapa.

export const mensajeSeguimientoRepository = {
  crearSaliente(data: {
    organizationId: string;
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
        canal: "EMAIL",
        direccion: "OUTBOUND",
        contenido: data.contenido,
        fecha: data.fecha,
        externalId: data.externalId,
      },
    });
  },
};

export type MensajeSeguimientoRepository = typeof mensajeSeguimientoRepository;
