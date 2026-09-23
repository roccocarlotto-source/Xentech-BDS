import { prisma } from "../lib/prisma";

// Solo lo que necesita el panel de admin de plataforma (Fase 4): listar
// organizaciones con sus toggles de agentes ya cargados, para no hacer una
// query por fila en el frontend.
export const organizationRepository = {
  listWithAgentToggles() {
    return prisma.organization.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: "desc" },
      include: { agentToggles: true },
    });
  },

  findById(organizationId: string) {
    return prisma.organization.findFirst({
      where: { id: organizationId, deletedAt: null },
    });
  },

  findBySlug(slug: string) {
    return prisma.organization.findFirst({ where: { slug, deletedAt: null } });
  },

  create(data: { name: string; slug: string }) {
    return prisma.organization.create({ data });
  },
};
