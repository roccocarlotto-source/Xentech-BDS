// Espejo de src/services/agentToggle.service.ts del backend.

export const AGENT_TYPES = ["WHATSAPP", "DATABASE_MANAGEMENT", "REMINDERS"] as const;

export type AgentType = (typeof AGENT_TYPES)[number];

export const AGENT_TYPE_LABELS: Record<AgentType, string> = {
  WHATSAPP: "WhatsApp",
  DATABASE_MANAGEMENT: "Gestión de base de datos",
  REMINDERS: "Recordatorios",
};

export interface OrganizationAgentToggles {
  organizationId: string;
  organizationName: string;
  toggles: Record<AgentType, boolean>;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
}
