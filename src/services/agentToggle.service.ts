import type { AgentType } from "@prisma/client";
import { organizationRepository } from "../repositories/organization.repository";
import { agentToggleRepository } from "../repositories/agentToggle.repository";
import { AppError } from "../utils/AppError";

// Fase 4 — estructura de agentes IA: solo el toggle por organización, sin
// lógica funcional de ningún agente todavía (eso es Fase 5). Solo lo usa el
// panel de admin de plataforma (requirePlatformAdmin en el router).

export interface OrganizationAgentTogglesDto {
  organizationId: string;
  organizationName: string;
  toggles: Record<AgentType, boolean>;
}

// Todos los AgentType existentes, en falso por defecto — así el frontend
// siempre ve las mismas claves aunque la organización no tenga ninguna fila
// en organization_agent_toggles todavía (fila ausente = deshabilitado).
function togglesEnDefault(): Record<AgentType, boolean> {
  return {
    WHATSAPP: false,
    DATABASE_MANAGEMENT: false,
    REMINDERS: false,
    SEGUIMIENTO_RESENAS: false,
  };
}

export async function listOrganizationsWithToggles(): Promise<OrganizationAgentTogglesDto[]> {
  const organizations = await organizationRepository.listWithAgentToggles();

  return organizations.map((org) => {
    const toggles = togglesEnDefault();
    for (const toggle of org.agentToggles) {
      toggles[toggle.agentType] = toggle.enabled;
    }
    return { organizationId: org.id, organizationName: org.name, toggles };
  });
}

export async function setAgentToggle(
  organizationId: string,
  agentType: AgentType,
  enabled: boolean,
): Promise<void> {
  const organization = await organizationRepository.findById(organizationId);
  if (!organization) {
    throw new AppError("Organización no encontrada", 404);
  }

  await agentToggleRepository.setEnabled(organizationId, agentType, enabled);
}
