// Espejo de src/schemas/agentConfig.schema.ts y del modelo AgentConfig en
// prisma/schema.prisma del backend (Fase 5, docs/ai-agent-architecture.md
// §6-7).

export const AGENT_TOOL_NAMES = [
  "consultar_mi_cuota",
  "consultar_mis_datos",
  "actualizar_mi_telefono",
  "actualizar_mi_email",
  "solicitar_hablar_con_alguien",
] as const;

export type AgentToolName = (typeof AGENT_TOOL_NAMES)[number];

export const AGENT_TOOL_LABELS: Record<AgentToolName, string> = {
  consultar_mi_cuota: "Consultar el estado de la cuota",
  consultar_mis_datos: "Consultar los datos de contacto",
  actualizar_mi_telefono: "Actualizar el teléfono",
  actualizar_mi_email: "Actualizar el email",
  solicitar_hablar_con_alguien: "Derivar a una persona del equipo",
};

// solicitar_hablar_con_alguien está siempre disponible (ver
// src/services/agent/permissions.ts del backend) -- no se ofrece como
// "acción prohibida" porque el gate la ignora si aparece ahí.
export const GUARDRAIL_PROHIBIBLE_TOOLS = AGENT_TOOL_NAMES.filter(
  (tool) => tool !== "solicitar_hablar_con_alguien",
);

export interface Guardrails {
  temasProhibidos: string[];
  accionesProhibidas: AgentToolName[];
  condicionesDeDerivacion: string[];
  promesasProhibidas: string[];
  datosRequeridosAntesDeAccion: string[];
}

export const EMPTY_GUARDRAILS: Guardrails = {
  temasProhibidos: [],
  accionesProhibidas: [],
  condicionesDeDerivacion: [],
  promesasProhibidas: [],
  datosRequeridosAntesDeAccion: [],
};

// null: todavía no se guardó ninguna configuración para este agente en esta
// organización -- fila ausente, no un error (ver agentConfig.service.ts).
export interface AgentConfig {
  id: string;
  organizationId: string;
  agentType: string;
  instructions: string;
  guardrails: Guardrails;
  enabledTools: AgentToolName[];
  modelProvider: string;
  modelName: string;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertAgentConfigInput {
  instructions: string;
  guardrails: Guardrails;
  enabledTools: AgentToolName[];
  modelProvider: string;
  modelName: string;
}

export interface TestMessageInput {
  externalThreadId: string;
  telefono?: string;
  mensaje: string;
}

export interface TestMessageResult {
  respuesta: string;
  conversationId: string;
  clienteId: string | null;
  derivadoAHumano: boolean;
}
