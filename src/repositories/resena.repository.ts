import type { ResenaModeracion } from "@prisma/client";
import { prisma } from "../lib/prisma";

// Etapa 3 de docs/seguimiento-resenas-diseno.md. Mismo criterio que el resto
// de los repositories: todo lo que parte de una sesión filtra por
// organizationId. Las dos excepciones son las búsquedas PÚBLICAS (por hash
// del token y por slug de la organización), que por definición todavía no
// saben de qué organización se trata -- la organización sale de la fila que
// encuentran.

export const resenaRepository = {
  findTokenPorHash(tokenHash: string) {
    return prisma.tokenResena.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        organizationId: true,
        clienteId: true,
        venceEn: true,
        usadoEn: true,
        cliente: { select: { nombre: true, deletedAt: true } },
      },
    });
  },

  findOrganizacion(organizationId: string) {
    return prisma.organization.findFirst({
      where: { id: organizationId, deletedAt: null },
      select: { id: true, name: true },
    });
  },

  findOrganizacionPorSlug(slug: string) {
    return prisma.organization.findFirst({
      where: { slug, deletedAt: null },
      select: { id: true, name: true },
    });
  },

  findCliente(organizationId: string, clienteId: string) {
    return prisma.cliente.findFirst({
      where: { organizationId, id: clienteId, deletedAt: null },
      select: { id: true },
    });
  },

  findPresupuesto(organizationId: string, presupuestoId: string) {
    return prisma.presupuesto.findFirst({
      where: { organizationId, id: presupuestoId, deletedAt: null },
      select: { id: true, clienteId: true },
    });
  },

  async diasValidezToken(organizationId: string): Promise<number | null> {
    const config = await prisma.configSeguimiento.findUnique({
      where: { organizationId },
      select: { diasValidezTokenResena: true },
    });
    return config?.diasValidezTokenResena ?? null;
  },

  async crearToken(data: {
    organizationId: string;
    tokenHash: string;
    clienteId: string;
    presupuestoId: string | null;
    venceEn: Date;
  }): Promise<void> {
    await prisma.tokenResena.create({ data });
  },

  // §6.1: marcar el token como usado y guardar la reseña en la MISMA
  // transacción. El UPDATE es condicional (sigue sin usar y sin vencer): si
  // dos requests llegan en paralelo con el mismo token, Postgres serializa
  // los dos UPDATE sobre la misma fila y el segundo, al re-evaluar el WHERE,
  // ya no la matchea -- count 0, no se crea una segunda reseña. El unique de
  // Resena.tokenResenaId es la segunda red por si algo de esto cambia.
  consumirTokenYCrearResena(data: {
    tokenId: string;
    organizationId: string;
    clienteId: string;
    ahora: Date;
    anonimo: boolean;
    nombreVisible: string | null;
    estrellas: number;
    comentario: string | null;
  }) {
    return prisma.$transaction(async (tx) => {
      const { count } = await tx.tokenResena.updateMany({
        where: { id: data.tokenId, usadoEn: null, venceEn: { gt: data.ahora } },
        data: { usadoEn: data.ahora },
      });
      if (count !== 1) return null;

      return tx.resena.create({
        data: {
          organizationId: data.organizationId,
          tokenResenaId: data.tokenId,
          clienteId: data.clienteId,
          anonimo: data.anonimo,
          nombreVisible: data.nombreVisible,
          estrellas: data.estrellas,
          comentario: data.comentario,
        },
        select: { id: true },
      });
    });
  },

  listar(organizationId: string, moderacion?: ResenaModeracion) {
    return prisma.resena.findMany({
      where: { organizationId, ...(moderacion ? { moderacion } : {}) },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        anonimo: true,
        nombreVisible: true,
        estrellas: true,
        comentario: true,
        moderacion: true,
        moderadoEn: true,
        motivoModeracion: true,
        createdAt: true,
        cliente: { select: { id: true, nombre: true } },
        moderadoPor: { select: { email: true } },
      },
    });
  },

  findResena(organizationId: string, id: string) {
    return prisma.resena.findFirst({ where: { organizationId, id }, select: { id: true } });
  },

  // El caller verificó con findResena que la reseña es de esta organización;
  // el where compuesto (organizationId + id) igual lo vuelve a exigir.
  async moderar(
    organizationId: string,
    id: string,
    data: {
      moderacion: ResenaModeracion;
      moderadoPorId: string;
      moderadoEn: Date;
      motivoModeracion: string | null;
    },
  ): Promise<void> {
    await prisma.resena.updateMany({ where: { organizationId, id }, data });
  },

  listarPublicas(organizationId: string, skip: number, take: number) {
    return prisma.resena.findMany({
      where: { organizationId, moderacion: "APROBADA" },
      orderBy: { createdAt: "desc" },
      skip,
      take,
      // Solo columnas publicables: nada de clienteId, moderador ni motivo.
      select: {
        id: true,
        anonimo: true,
        nombreVisible: true,
        estrellas: true,
        comentario: true,
        createdAt: true,
      },
    });
  },

  async resumenPublico(
    organizationId: string,
  ): Promise<{ total: number; promedio: number | null }> {
    const agg = await prisma.resena.aggregate({
      where: { organizationId, moderacion: "APROBADA" },
      _count: { _all: true },
      _avg: { estrellas: true },
    });
    return { total: agg._count._all, promedio: agg._avg.estrellas };
  },
};

export type ResenaRepository = typeof resenaRepository;
