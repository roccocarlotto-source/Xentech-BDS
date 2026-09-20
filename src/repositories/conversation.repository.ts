import type { ConversationStatus } from "@prisma/client";
import { prisma } from "../lib/prisma";

export const conversationRepository = {
  findByThread(organizationId: string, agentConfigId: string, externalThreadId: string) {
    return prisma.conversation.findUnique({
      where: {
        organizationId_agentConfigId_externalThreadId: {
          organizationId,
          agentConfigId,
          externalThreadId,
        },
      },
    });
  },

  create(data: {
    organizationId: string;
    agentConfigId: string;
    externalThreadId: string;
    clienteId: string | null;
  }) {
    return prisma.conversation.create({ data });
  },

  // Usado por el orquestador (src/services/agent/orchestrator.ts): la
  // Conversation ya se leyó scoped a la organización más arriba en el
  // mismo flujo, así que acá alcanza con el id.
  setStatus(id: string, status: ConversationStatus) {
    return prisma.conversation.update({ where: { id }, data: { status } });
  },

  // Usado desde las rutas del inbox (src/routes/conversations.ts): a
  // diferencia de setStatus, acá el id viene directo de la URL, sin pasar
  // antes por una lectura scoped -- por eso el where lleva organizationId.
  setStatusScoped(organizationId: string, id: string, status: ConversationStatus) {
    return prisma.conversation.update({
      where: { organizationId_id: { organizationId, id } },
      data: { status },
    });
  },

  touchLastMessageAt(id: string) {
    return prisma.conversation.update({ where: { id }, data: { lastMessageAt: new Date() } });
  },

  // Bandeja de conversaciones (docs/ai-agent-architecture.md §8, Fase 5
  // paso 4) — incluye el cliente (si se pudo identificar) y el último
  // mensaje para poder armar la vista de lista sin una query aparte por
  // fila.
  listByOrganization(organizationId: string, status?: ConversationStatus) {
    return prisma.conversation.findMany({
      where: { organizationId, ...(status ? { status } : {}) },
      orderBy: { lastMessageAt: "desc" },
      include: {
        cliente: { select: { id: true, nombre: true, telefono: true } },
        messages: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    });
  },

  findById(organizationId: string, id: string) {
    return prisma.conversation.findFirst({
      where: { organizationId, id },
      include: { cliente: { select: { id: true, nombre: true, telefono: true } } },
    });
  },
};
