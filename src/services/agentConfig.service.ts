import type { AgentType } from "@prisma/client";
import { agentConfigRepository } from "../repositories/agentConfig.repository";
import type { UpsertAgentConfigInput } from "../schemas/agentConfig.schema";

// Fase 5: lo configura el propio tenant (admin de su organización, ver
// requireOrgAdmin) -- no el platform admin, que solo prende/apaga el
// toggle (agentToggle.service.ts, Fase 4). Devuelve null si todavía no se
// configuró nada -- fila ausente es un estado válido, no un error.
export async function getAgentConfig(organizationId: string, agentType: AgentType) {
  return agentConfigRepository.findByOrgAndType(organizationId, agentType);
}

export async function upsertAgentConfig(
  organizationId: string,
  agentType: AgentType,
  input: UpsertAgentConfigInput,
) {
  return agentConfigRepository.upsert(organizationId, agentType, {
    instructions: input.instructions,
    guardrails: input.guardrails,
    enabledTools: input.enabledTools,
    modelProvider: input.modelProvider,
    modelName: input.modelName,
  });
}
