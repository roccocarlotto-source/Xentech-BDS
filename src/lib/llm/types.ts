// Interfaz abstracta del proveedor de LLM (docs/ai-agent-architecture.md
// §2/§12: la elección final de proveedor queda abierta, esto es lo que la
// deja intercambiable sin tocar el loop de orquestación -- mismo criterio
// que PlataformaCRM, que usa OpenRouter como primer adapter).

export type LlmRole = "system" | "user" | "assistant" | "tool";

export interface LlmToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface LlmMessage {
  role: LlmRole;
  content: string;
  // Solo para role "assistant" cuando pide ejecutar tools.
  toolCalls?: LlmToolCall[];
  // Solo para role "tool": a qué toolCall.id responde.
  toolCallId?: string;
}

export interface LlmToolDefinition {
  name: string;
  description: string;
  // JSON Schema de los argumentos (formato "function calling" estándar).
  parameters: Record<string, unknown>;
}

export interface LlmCompletionResult {
  content: string | null;
  toolCalls: LlmToolCall[];
}

export interface LlmCompletionParams {
  model: string;
  messages: LlmMessage[];
  tools: LlmToolDefinition[];
}

export interface LlmProvider {
  complete(params: LlmCompletionParams): Promise<LlmCompletionResult>;
}
