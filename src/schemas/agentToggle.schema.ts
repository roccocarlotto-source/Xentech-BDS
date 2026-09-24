import { z } from "zod";

// Espejo del enum AgentType de prisma/schema.prisma — Prisma no expone un
// zod schema solo, así que se repite acá a propósito (lista chica, y así el
// 400 sale antes de tocar la base si alguien manda un agentType inventado).
export const agentTypeSchema = z.enum([
  "WHATSAPP",
  "DATABASE_MANAGEMENT",
  "REMINDERS",
  "SEGUIMIENTO_RESENAS",
]);

export const setAgentToggleSchema = z.object({
  enabled: z.boolean(),
});
