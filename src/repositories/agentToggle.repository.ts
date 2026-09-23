import type { AgentType } from "@prisma/client";
import { prisma } from "../lib/prisma";

export const agentToggleRepository = {
  // Fila ausente = deshabilitado (ver comentario de setEnabled más abajo) --
  // por eso esto devuelve un boolean derivado, no la fila cruda. Usado por
  // el webhook (src/routes/webhooks/whatsapp.ts) para no procesar mensajes
  // de una organización que tiene el agente de WhatsApp apagado.
  async isEnabled(organizationId: string, agentType: AgentType): Promise<boolean> {
    const toggle = await prisma.organizationAgentToggle.findUnique({
      where: { organizationId_agentType: { organizationId, agentType } },
    });
    return toggle?.enabled ?? false;
  },

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
