import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { normalizarTelefono, normalizarTelefonoSiPresente } from "../utils/telefono";

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

  // Resolución de identidad del agente de WhatsApp (ver
  // docs/ai-agent-architecture.md §5): matchea por teléfono DENTRO de la
  // organización dueña del número de WhatsApp que recibió el mensaje. Si
  // hay más de un cliente con el mismo teléfono (dato sucio, no debería
  // pasar pero no está garantizado), toma el más reciente antes que fallar.
  //
  // Cliente.telefono es texto libre en la columna: create/update de acá
  // abajo normalizan lo que se escribe desde ahora en más, pero los datos
  // cargados ANTES de este cambio (o texto sucio que normalizarTelefono()
  // no pudo interpretar) pueden seguir sin normalizar. Por eso no alcanza
  // con un `where: { telefono }` directo -- se compara en memoria contra la
  // versión normalizada de cada candidato. Para el volumen de este MVP (una
  // base de clientes por tenant, no millones de filas -- mismo criterio que
  // statsClientes() en cliente.service.ts) esto alcanza; si el volumen real
  // lo justifica, se puede sumar una columna `telefonoNormalizado` con
  // backfill e índice.
  async findByTelefono(organizationId: string, telefono: string) {
    const buscado = normalizarTelefono(telefono);
    if (!buscado) return null;

    const candidatos = await prisma.cliente.findMany({
      where: { organizationId, deletedAt: null, telefono: { not: null } },
      orderBy: { createdAt: "desc" },
    });

    return candidatos.find((c) => normalizarTelefono(c.telefono as string) === buscado) ?? null;
  },

  create(organizationId: string, data: Omit<Prisma.ClienteUncheckedCreateInput, "organizationId">) {
    return prisma.cliente.create({
      data: { ...data, organizationId, telefono: normalizarTelefonoSiPresente(data.telefono) },
    });
  },

  // Requiere que el caller haya verificado con findById que el cliente
  // existe, pertenece a esta organización y no está borrado — la unique key
  // compuesta (organizationId, id) es lo que impide escribir cruzado entre
  // tenants, pero no filtra por deletedAt.
  update(organizationId: string, id: string, data: Prisma.ClienteUncheckedUpdateInput) {
    return prisma.cliente.update({
      where: { organizationId_id: { organizationId, id } },
      data: {
        ...data,
        telefono: normalizarTelefonoSiPresente(data.telefono as string | null | undefined),
      },
    });
  },

  softDelete(organizationId: string, id: string) {
    return prisma.cliente.update({
      where: { organizationId_id: { organizationId, id } },
      data: { deletedAt: new Date() },
    });
  },
};
