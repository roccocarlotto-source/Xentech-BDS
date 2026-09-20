import { prisma } from "../lib/prisma";

// Fase 5, paso 4: el admin de la organización necesita ver la lista de sus
// propios usuarios para poder otorgarles el permiso de inbox
// (User.canHandleInbox) -- no existía ningún repository de User todavía
// (los usuarios se crean hoy directo en Supabase + un insert manual, ver
// docs/estado-actual.md). Mismo criterio de scoping por organizationId que
// el resto de los repositories.
export const userRepository = {
  listByOrganization(organizationId: string) {
    return prisma.user.findMany({
      where: { organizationId, deletedAt: null },
      orderBy: { email: "asc" },
    });
  },

  findById(organizationId: string, id: string) {
    return prisma.user.findFirst({
      where: { organizationId, id, deletedAt: null },
    });
  },

  updatePermissions(organizationId: string, id: string, data: { canHandleInbox: boolean }) {
    return prisma.user.update({
      where: { organizationId_id: { organizationId, id } },
      data,
    });
  },
};
