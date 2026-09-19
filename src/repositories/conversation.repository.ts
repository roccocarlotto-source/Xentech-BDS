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

  setStatus(id: string, status: ConversationStatus) {
    return prisma.conversation.update({ where: { id }, data: { status } });
  },

  touchLastMessageAt(id: string) {
    return prisma.conversation.update({ where: { id }, data: { lastMessageAt: new Date() } });
  },

  // Para la futura bandeja de conversaciones (docs/ai-agent-architecture.md
  // §8) — no tiene ruta todavía, pero queda listo para cuando se construya.
  listByOrganization(organizationId: string, status?: ConversationStatus) {
    return prisma.conversation.findMany({
      where: { organizationId, ...(status ? { status } : {}) },
      orderBy: { lastMessageAt: "desc" },
    });
  },
};
