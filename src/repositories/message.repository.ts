import type { MessageDirection, MessageSenderType, Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";

export const messageRepository = {
  create(data: {
    organizationId: string;
    conversationId: string;
    direction: MessageDirection;
    senderType: MessageSenderType;
    content: string;
    senderUserId?: string;
    toolCalls?: Prisma.InputJsonValue;
    externalMessageId?: string;
  }) {
    return prisma.message.create({ data });
  },

  // Últimos `limit` mensajes de la conversación, en orden cronológico (ver
  // docs/ai-agent-architecture.md §12: v1 usa un truncado simple de los
  // últimos N mensajes como ventana de contexto, sin resumen).
  async listByConversation(conversationId: string, limit = 20) {
    const mensajes = await prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return mensajes.reverse();
  },

  // Historial completo, sin truncar -- para el inbox (Fase 5, paso 4), a
  // diferencia de listByConversation que trunca para la ventana de
  // contexto del LLM.
  listAllByConversation(conversationId: string) {
    return prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: "asc" },
    });
  },
};
