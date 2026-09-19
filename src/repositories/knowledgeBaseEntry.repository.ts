import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";

export const knowledgeBaseEntryRepository = {
  // Solo las entradas activas — lo que se inyecta al system prompt del
  // agente (ver src/services/agent/orchestrator.ts).
  listActive(organizationId: string) {
    return prisma.knowledgeBaseEntry.findMany({
      where: { organizationId, isActive: true, deletedAt: null },
      orderBy: { createdAt: "asc" },
    });
  },

  // Todas (activas e inactivas) — para la pantalla de configuración del
  // tenant.
  list(organizationId: string) {
    return prisma.knowledgeBaseEntry.findMany({
      where: { organizationId, deletedAt: null },
      orderBy: { createdAt: "desc" },
    });
  },

  findById(organizationId: string, id: string) {
    return prisma.knowledgeBaseEntry.findFirst({
      where: { organizationId, id, deletedAt: null },
    });
  },

  create(
    organizationId: string,
    data: Omit<Prisma.KnowledgeBaseEntryUncheckedCreateInput, "organizationId">,
  ) {
    return prisma.knowledgeBaseEntry.create({ data: { ...data, organizationId } });
  },

  update(organizationId: string, id: string, data: Prisma.KnowledgeBaseEntryUncheckedUpdateInput) {
    return prisma.knowledgeBaseEntry.update({
      where: { organizationId_id: { organizationId, id } },
      data,
    });
  },

  softDelete(organizationId: string, id: string) {
    return prisma.knowledgeBaseEntry.update({
      where: { organizationId_id: { organizationId, id } },
      data: { deletedAt: new Date() },
    });
  },
};
