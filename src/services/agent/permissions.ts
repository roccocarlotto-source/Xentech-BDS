// Gate central de permisos (docs/ai-agent-architecture.md §7): "la IA puede
// proponer o ejecutar una acción, pero el sistema debe controlar si esa
// acción está permitida" -- mismo principio que PlataformaCRM
// (puedeEjecutarTool). El orquestador SIEMPRE pasa por acá antes de
// ejecutar cualquier tool call que devuelva el modelo -- nunca confía en
// que el modelo respetó las instrucciones del prompt.

// Siempre disponible, pase lo que pase en enabledTools/guardrails -- es el
// mecanismo de escape hacia un humano (ver §8).
const TOOLS_SIEMPRE_PERMITIDAS = new Set(["solicitar_hablar_con_alguien"]);

export interface GuardrailsShape {
  accionesProhibidas?: string[];
  [clave: string]: unknown;
}

export interface AgentConfigParaPermisos {
  enabledTools: string[];
  guardrails: unknown;
}

export type PermisoResultado = { permitido: true } | { permitido: false; razon: string };

export function puedeEjecutarTool(
  agentConfig: AgentConfigParaPermisos,
  toolName: string,
  clienteId: string | null,
): PermisoResultado {
  if (TOOLS_SIEMPRE_PERMITIDAS.has(toolName)) {
    return { permitido: true };
  }

  // Todo el resto de las tools v1 operan sobre datos del cliente que
  // escribe -- sin cliente identificado no hay nada sobre qué operar (ver
  // docs/ai-agent-architecture.md §5).
  if (!clienteId) {
    return { permitido: false, razon: "No hay un cliente identificado en esta conversación" };
  }

  if (!agentConfig.enabledTools.includes(toolName)) {
    return { permitido: false, razon: "Tool no habilitada para este agente" };
  }

  const guardrails = (agentConfig.guardrails ?? {}) as GuardrailsShape;
  const prohibidas = Array.isArray(guardrails.accionesProhibidas)
    ? guardrails.accionesProhibidas
    : [];
  if (prohibidas.includes(toolName)) {
    return { permitido: false, razon: "Tool prohibida por los guardrails de esta organización" };
  }

  return { permitido: true };
}
