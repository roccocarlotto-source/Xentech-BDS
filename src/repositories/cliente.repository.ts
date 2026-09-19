import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";

// Todo lo de acá filtra por organizationId — es la defensa principal contra
// fuga de datos entre tenants (ver prisma/sql/rls_policies.sql del CRM para
// la defensa secundaria a nivel de Postgres, que este repo va a replicar
// cuando exista el proyecto real de Supabase).
export const clienteRepository = {
  list(organizationId: string) {
    return prisma.cliente.findMany({
      where: { organizationId, deletedAt: null },
      orderBy: { createdAt: "desc" },
    });
  },

  findById(organizationId: string, id: string) {
    return prisma.cliente.findFirst({
      where: { organizationId, id, deletedAt: null },
    });
  },

  create(organizationId: string, data: Omit<Prisma.ClienteUncheckedCreateInput, "organizationId">) {
    return prisma.cliente.create({ data: { ...data, organizationId } });
  },

  // Requiere que el caller haya verificado con findById que el cliente
  // existe, pertenece a esta organización y no está borrado — la unique key
  // compuesta (organizationId, id) es lo que impide escribir cruzado entre
  // tenants, pero no filtra por deletedAt.
  update(organizationId: string, id: string, data: Prisma.ClienteUncheckedUpdateInput) {
    return prisma.cliente.update({
      where: { organizationId_id: { organizationId, id } },
      data,
    });
  },

  softDelete(organizationId: string, id: string) {
    return prisma.cliente.update({
      where: { organizationId_id: { organizationId, id } },
      data: { deletedAt: new Date() },
    });
  },
};
