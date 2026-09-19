import { z } from "zod";

// Catálogo de tools v1 del agente de WhatsApp (docs/ai-agent-architecture.md
// §6) — lista chica y fija a propósito (nunca una tool "hacer cualquier
// cosa"), mismo criterio que PlataformaCRM. solicitar_hablar_con_alguien
// está siempre disponible (ver src/services/agent/permissions.ts) pero
// también puede listarse acá sin problema.
export const AGENT_TOOL_NAMES = [
  "consultar_mi_cuota",
  "consultar_mis_datos",
  "actualizar_mi_telefono",
  "actualizar_mi_email",
  "solicitar_hablar_con_alguien",
] as const;

export const agentToolNameSchema = z.enum(AGENT_TOOL_NAMES);

// Forma de docs/ai-agent-architecture.md §7. Json a propósito en la base
// (puede evolucionar sin migración) — acá se valida su forma esperada.
// Solo accionesProhibidas se aplica en código (ver
// src/services/agent/permissions.ts); el resto son instrucciones a nivel de
// prompt, no gates de ejecución.
export const guardrailsSchema = z.object({
  temasProhibidos: z.array(z.string().trim().min(1)).default([]),
  accionesProhibidas: z.array(agentToolNameSchema).default([]),
  condicionesDeDerivacion: z.array(z.string().trim().min(1)).default([]),
  promesasProhibidas: z.array(z.string().trim().min(1)).default([]),
  datosRequeridosAntesDeAccion: z.array(z.string().trim().min(1)).default([]),
});

export const upsertAgentConfigSchema = z.object({
  instructions: z.string().trim().min(1).max(10000),
  guardrails: guardrailsSchema.optional().default({}),
  enabledTools: z.array(agentToolNameSchema).default([]),
  modelProvider: z.string().trim().min(1).max(50).default("openrouter"),
  modelName: z.string().trim().min(1).max(100),
});

export type GuardrailsInput = z.infer<typeof guardrailsSchema>;
export type UpsertAgentConfigInput = z.infer<typeof upsertAgentConfigSchema>;
