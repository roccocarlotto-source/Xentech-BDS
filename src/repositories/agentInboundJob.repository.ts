import type { AgentType } from "@prisma/client";
import { prisma } from "../lib/prisma";

export const agentInboundJobRepository = {
  create(data: {
    organizationId: string;
    agentType: AgentType;
    externalThreadId: string;
    telefonoCliente?: string;
    mensaje: string;
    externalMessageId: string;
  }) {
    return prisma.agentInboundJob.create({ data });
  },

  // Un solo proceso poller a la vez (ver comentario en schema.prisma) --
  // no hace falta SELECT ... FOR UPDATE SKIP LOCKED ni nada por el estilo
  // mientras solo haya una instancia corriendo. Si en algún momento hay
  // más de un worker, esto es lo primero que hay que revisar.
  async claimNextPending() {
    const job = await prisma.agentInboundJob.findFirst({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
    });
    if (!job) return null;

    return prisma.agentInboundJob.update({
      where: { id: job.id },
      data: { status: "PROCESSING", attempts: { increment: 1 } },
    });
  },

  markDone(id: string) {
    return prisma.agentInboundJob.update({
      where: { id },
      data: { status: "DONE", processedAt: new Date() },
    });
  },

  markFailed(id: string, error: string) {
    return prisma.agentInboundJob.update({
      where: { id },
      data: { status: "FAILED", lastError: error, processedAt: new Date() },
    });
  },
};
