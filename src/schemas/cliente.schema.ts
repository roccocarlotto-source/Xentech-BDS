import { z } from "zod";

export const cuotaPeriodicidadSchema = z.enum(["MENSUAL"]);

export const createClienteSchema = z.object({
  nombre: z.string().trim().min(1).max(200),
  // Persona de contacto, separada del nombre del cliente (§2, decisión 4 del
  // 2026-09-26 en docs/seguimiento-resenas-diseno.md): "nombre" es la
  // empresa cuando la hay, esto es a quién se le escribe.
  personaContacto: z.string().trim().max(200).optional(),
  telefono: z.string().trim().max(30).optional(),
  email: z.string().trim().email().max(255).optional(),
  notas: z.string().optional(),
  cuotaMonto: z.number().nonnegative().optional(),
  cuotaPeriodicidad: cuotaPeriodicidadSchema.optional(),
  cuotaUltimoPago: z.coerce.date().optional(),
});

export const updateClienteSchema = createClienteSchema.partial();

export type CreateClienteInput = z.infer<typeof createClienteSchema>;
export type UpdateClienteInput = z.infer<typeof updateClienteSchema>;
