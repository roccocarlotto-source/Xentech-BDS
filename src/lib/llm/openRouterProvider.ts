import { AppError } from "../../utils/AppError";
import type {
  LlmCompletionParams,
  LlmCompletionResult,
  LlmMessage,
  LlmProvider,
  LlmToolCall,
  LlmToolDefinition,
} from "./types";

const OPENROUTER_CHAT_COMPLETIONS_URL = "https://openrouter.ai/api/v1/chat/completions";

interface OpenAiToolCall {
  id: string;
  function: { name: string; arguments: string };
}

interface OpenAiChatMessage {
  role: string;
  content?: string | null;
  tool_call_id?: string;
  tool_calls?: OpenAiToolCall[];
}

// Primer adapter de LlmProvider, elegido por flexibilidad multi-modelo (ver
// docs/ai-agent-architecture.md §2 y §12 -- mismo criterio que
// PlataformaCRM). API compatible con el formato "chat completions" de
// OpenAI, sin SDK -- un solo fetch.
export class OpenRouterProvider implements LlmProvider {
  constructor(private readonly apiKey: string) {}

  async complete({ model, messages, tools }: LlmCompletionParams): Promise<LlmCompletionResult> {
    const response = await fetch(OPENROUTER_CHAT_COMPLETIONS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: messages.map(toOpenAiMessage),
        ...(tools.length > 0 ? { tools: tools.map(toOpenAiTool) } : {}),
      }),
    });

    if (!response.ok) {
      const detalle = await response.text().catch(() => "");
      throw new AppError(
        `El proveedor de IA (OpenRouter) respondió ${response.status}: ${detalle.slice(0, 500)}`,
        502,
      );
    }

    const json = (await response.json()) as {
      choices?: Array<{ message?: OpenAiChatMessage }>;
    };
    const mensaje = json.choices?.[0]?.message;
    if (!mensaje) {
      throw new AppError("Respuesta inválida del proveedor de IA (OpenRouter)", 502);
    }

    return {
      content: mensaje.content ?? null,
      toolCalls: (mensaje.tool_calls ?? []).map(fromOpenAiToolCall),
    };
  }
}

function toOpenAiMessage(mensaje: LlmMessage): OpenAiChatMessage {
  if (mensaje.role === "tool") {
    return { role: "tool", tool_call_id: mensaje.toolCallId, content: mensaje.content };
  }

  if (mensaje.role === "assistant" && mensaje.toolCalls && mensaje.toolCalls.length > 0) {
    return {
      role: "assistant",
      content: mensaje.content || null,
      tool_calls: mensaje.toolCalls.map((tc) => ({
        id: tc.id,
        function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
      })),
    };
  }

  return { role: mensaje.role, content: mensaje.content };
}

function toOpenAiTool(tool: LlmToolDefinition) {
  return {
    type: "function",
    function: { name: tool.name, description: tool.description, parameters: tool.parameters },
  };
}

function fromOpenAiToolCall(tc: OpenAiToolCall): LlmToolCall {
  return {
    id: tc.id,
    name: tc.function.name,
    arguments: parseToolArguments(tc.function.arguments),
  };
}

function parseToolArguments(raw: string): Record<string, unknown> {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}
