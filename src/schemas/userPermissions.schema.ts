import { z } from "zod";

// Fase 5, paso 4: único permiso puntual que existe hoy es canHandleInbox
// (ver User en prisma/schema.prisma). Objeto en vez de un booleano suelto
// en el body para poder sumar más permisos más adelante sin romper el
// contrato.
export const updateUserPermissionsSchema = z.object({
  canHandleInbox: z.boolean(),
});

export type UpdateUserPermissionsInput = z.infer<typeof updateUserPermissionsSchema>;
