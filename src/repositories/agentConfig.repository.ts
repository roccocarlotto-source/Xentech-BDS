import type { AgentType, Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";

export const agentConfigRepository = {
  findByOrgAndType(organizationId: string, agentType: AgentType) {
    return prisma.agentConfig.findUnique({
      where: { organizationId_agentType: { organizationId, agentType } },
    });
  },

  upsert(
    organizationId: string,
    agentType: AgentType,
    data: Omit<Prisma.AgentConfigUncheckedCreateInput, "organizationId" | "agentType">,
  ) {
    return prisma.agentConfig.upsert({
      where: { organizationId_agentType: { organizationId, agentType } },
      create: { organizationId, agentType, ...data },
      update: data,
    });
  },
};
