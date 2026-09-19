import type { AgentType } from "@prisma/client";
import { prisma } from "../lib/prisma";

export const agentToggleRepository = {
  // Upsert por el unique compuesto (organizationId, agentType): no hay fila
  // "deshabilitado" que crear de antemano por cada combinación posible —
  // fila ausente y fila con enabled=false significan lo mismo (ver
  // comentario en prisma/schema.prisma), esto solo escribe cuando alguien
  // realmente lo toca.
  setEnabled(organizationId: string, agentType: AgentType, enabled: boolean) {
    return prisma.organizationAgentToggle.upsert({
      where: { organizationId_agentType: { organizationId, agentType } },
      create: { organizationId, agentType, enabled },
      update: { enabled },
    });
  },
};
