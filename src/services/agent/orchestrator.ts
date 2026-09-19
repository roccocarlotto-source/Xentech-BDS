import type {
  AgentConfig,
  AgentType,
  Cliente,
  Conversation,
  ConversationStatus,
  KnowledgeBaseEntry,
  Message,
  MessageDirection,
  MessageSenderType,
} from "@prisma/client";
import { agentConfigRepository } from "../../repositories/agentConfig.repository";
import { conversationRepository } from "../../repositories/conversation.repository";
import { messageRepository } from "../../repositories/message.repository";
import { knowledgeBaseEntryRepository } from "../../repositories/knowledgeBaseEntry.repository";
import { clienteRepository } from "../../repositories/cliente.repository";
import { AppError } from "../../utils/AppError";
import type { LlmMessage, LlmProvider } from "../../lib/llm/types";
import { AGENT_TOOL_DEFINITIONS, executeTool as executeToolReal } from "./tools";
import { puedeEjecutarTool } from "./permissions";

// Red de seguridad determinística (docs/ai-agent-architecture.md §8, mismo
// valor que PlataformaCRM): si el modelo no llega a una respuesta final
// dentro de esta cantidad de rondas de tool-calling, se corta y se deriva a
// un humano -- nunca un loop infinito.
const MAX_TOOL_ROUNDS_PER_TURN = 5;

// Ventana de contexto v1: últimos N mensajes, sin resumen (ver §12).
const MENSAJES_DE_CONTEXTO = 20;

// Todas las dependencias externas quedan inyectables (con los repos reales
// como default) para poder testear el loop completo con fakes en memoria,
// sin tocar Prisma -- ver orchestrator.test.ts. Firmas explícitas con
// Promise "plana" a propósito -- el tipo real que devuelve Prisma
// (Prisma__XClient, con métodos extra para encadenar relaciones) no lo
// puede implementar un fake sin depender del runtime de Prisma.
export interface OrchestratorDeps {
  agentConfigRepository: {
    findByOrgAndType: (organizationId: string, agentType: AgentType) => Promise<AgentConfig | null>;
  };
  conversationRepository: {
    findByThread: (
      organizationId: string,
      agentConfigId: string,
      externalThreadId: string,
    ) => Promise<Conversation | null>;
    create: (data: {
      organizationId: string;
      agentConfigId: string;
      externalThreadId: string;
      clienteId: string | null;
    }) => Promise<Conversation>;
    setStatus: (id: string, status: ConversationStatus) => Promise<Conversation>;
    touchLastMessageAt: (id: string) => Promise<Conversation>;
  };
  messageRepository: {
    create: (data: {
      organizationId: string;
      conversationId: string;
      direction: MessageDirection;
      senderType: MessageSenderType;
      content: string;
    }) => Promise<Message>;
    listByConversation: (conversationId: string, limit?: number) => Promise<Message[]>;
  };
  knowledgeBaseEntryRepository: {
    listActive: (organizationId: string) => Promise<KnowledgeBaseEntry[]>;
  };
  clienteRepository: {
    findByTelefono: (organizationId: string, telefono: string) => Promise<Cliente | null>;
  };
  executeTool: typeof executeToolReal;
}

const defaultDeps: OrchestratorDeps = {
  agentConfigRepository: {
    findByOrgAndType: (organizationId, agentType) =>
      agentConfigRepository.findByOrgAndType(organizationId, agentType),
  },
  conversationRepository: {
    findByThread: (organizationId, agentConfigId, externalThreadId) =>
      conversationRepository.findByThread(organizationId, agentConfigId, externalThreadId),
    create: (data) => conversationRepository.create(data),
    setStatus: (id, status) => conversationRepository.setStatus(id, status),
    touchLastMessageAt: (id) => conversationRepository.touchLastMessageAt(id),
  },
  messageRepository: {
    create: (data) => messageRepository.create(data),
    listByConversation: (conversationId, limit) =>
      messageRepository.listByConversation(conversationId, limit),
  },
  knowledgeBaseEntryRepository: {
    listActive: (organizationId) => knowledgeBaseEntryRepository.listActive(organizationId),
  },
  clienteRepository: {
    findByTelefono: (organizationId, telefono) =>
      clienteRepository.findByTelefono(organizationId, telefono),
  },
  executeTool: executeToolReal,
};

export interface HandleIncomingMessageParams {
  organizationId: string;
  agentType: AgentType;
  // El hilo de la conversación -- en WhatsApp real, el número entrante.
  externalThreadId: string;
  // Teléfono para resolver identidad (§5). Normalmente == externalThreadId;
  // separado para permitir simularlo distinto desde el endpoint de prueba.
  telefonoCliente?: string;
  mensaje: string;
  llmProvider: LlmProvider;
}

export interface HandleIncomingMessageResult {
  respuesta: string;
  conversationId: string;
  clienteId: string | null;
  derivadoAHumano: boolean;
}

export async function handleIncomingMessage(
  params: HandleIncomingMessageParams,
  deps: OrchestratorDeps = defaultDeps,
): Promise<HandleIncomingMessageResult> {
  const { organizationId, agentType, externalThreadId, telefonoCliente, mensaje, llmProvider } =
    params;

  // 1. Config del agente -- sin esto no hay nada que hacer.
  const agentConfig = await deps.agentConfigRepository.findByOrgAndType(organizationId, agentType);
  if (!agentConfig) {
    throw new AppError("Este agente no tiene una configuración todavía", 409);
  }

  // 2. Resolver/crear la Conversation por (organización, agente, hilo).
  let conversation = await deps.conversationRepository.findByThread(
    organizationId,
    agentConfig.id,
    externalThreadId,
  );
  if (!conversation) {
    const clienteId = telefonoCliente
      ? await resolverClienteIdPorTelefono(organizationId, telefonoCliente, deps)
      : null;
    conversation = await deps.conversationRepository.create({
      organizationId,
      agentConfigId: agentConfig.id,
      externalThreadId,
      clienteId,
    });
  } else if (conversation.status === "CLOSED") {
    // Un mensaje nuevo en un hilo cerrado lo reabre.
    conversation = await deps.conversationRepository.setStatus(conversation.id, "ACTIVE");
  }

  await deps.messageRepository.create({
    organizationId,
    conversationId: conversation.id,
    direction: "INBOUND" satisfies MessageDirection,
    senderType: "CLIENTE" satisfies MessageSenderType,
    content: mensaje,
  });

  // 3. System prompt = instructions + base de conocimiento activa + guardrails.
  const knowledgeBaseEntries = await deps.knowledgeBaseEntryRepository.listActive(organizationId);
  const systemPrompt = buildSystemPrompt(agentConfig, knowledgeBaseEntries);

  const historial = await deps.messageRepository.listByConversation(
    conversation.id,
    MENSAJES_DE_CONTEXTO,
  );
  const llmMessages: LlmMessage[] = [
    { role: "system", content: systemPrompt },
    ...historial.map(toLlmMessage),
  ];

  const toolDefs = AGENT_TOOL_DEFINITIONS.filter(
    (t) => agentConfig.enabledTools.includes(t.name) || t.name === "solicitar_hablar_con_alguien",
  );

  // 4-6. Loop de tool-calling: llamar al LLM, ejecutar tools permitidas,
  // repetir hasta una respuesta final o hasta agotar MAX_TOOL_ROUNDS_PER_TURN.
  let derivadoAHumano = false;
  let respuestaFinal = "";

  for (let ronda = 0; ronda < MAX_TOOL_ROUNDS_PER_TURN; ronda++) {
    const completion = await llmProvider.complete({
      model: agentConfig.modelName,
      messages: llmMessages,
      tools: toolDefs,
    });

    if (completion.toolCalls.length === 0) {
      respuestaFinal = completion.content ?? "";
      break;
    }

    llmMessages.push({
      role: "assistant",
      content: completion.content ?? "",
      toolCalls: completion.toolCalls,
    });

    for (const toolCall of completion.toolCalls) {
      const permiso = puedeEjecutarTool(agentConfig, toolCall.name, conversation.clienteId);
      const resultado = permiso.permitido
        ? await deps.executeTool(toolCall.name, toolCall.arguments, {
            organizationId,
            clienteId: conversation.clienteId,
          })
        : ({ ok: false, error: permiso.razon } as const);

      if (toolCall.name === "solicitar_hablar_con_alguien" && permiso.permitido) {
        derivadoAHumano = true;
      }

      llmMessages.push({
        role: "tool",
        toolCallId: toolCall.id,
        content: JSON.stringify(resultado),
      });
    }

    if (derivadoAHumano) {
      respuestaFinal = completion.content || "Ya te derivo con una persona del equipo.";
      break;
    }
  }

  if (!respuestaFinal) {
    // Se agotaron las rondas sin una respuesta final -- red de seguridad,
    // nunca dejar al cliente sin respuesta ni loopear para siempre.
    respuestaFinal =
      "Dame un momento, te derivo con una persona del equipo para seguir ayudándote.";
    derivadoAHumano = true;
  }

  // 7. Persistir y responder.
  if (derivadoAHumano) {
    conversation = await deps.conversationRepository.setStatus(
      conversation.id,
      "TRANSFERRED_TO_HUMAN",
    );
  }

  await deps.messageRepository.create({
    organizationId,
    conversationId: conversation.id,
    direction: "OUTBOUND" satisfies MessageDirection,
    senderType: "AGENT" satisfies MessageSenderType,
    content: respuestaFinal,
  });

  await deps.conversationRepository.touchLastMessageAt(conversation.id);

  return {
    respuesta: respuestaFinal,
    conversationId: conversation.id,
    clienteId: conversation.clienteId,
    derivadoAHumano,
  };
}

async function resolverClienteIdPorTelefono(
  organizationId: string,
  telefono: string,
  deps: OrchestratorDeps,
): Promise<string | null> {
  const cliente = await deps.clienteRepository.findByTelefono(organizationId, telefono);
  return cliente?.id ?? null;
}

function buildSystemPrompt(
  agentConfig: { instructions: string; guardrails: unknown },
  knowledgeBaseEntries: Array<{ titulo: string; contenido: string }>,
): string {
  const partes = [agentConfig.instructions.trim()];

  if (knowledgeBaseEntries.length > 0) {
    const kb = knowledgeBaseEntries.map((e) => `## ${e.titulo}\n${e.contenido}`).join("\n\n");
    partes.push(`Base de conocimiento:\n\n${kb}`);
  }

  const guardrails = agentConfig.guardrails as Record<string, unknown> | null;
  if (guardrails && Object.keys(guardrails).length > 0) {
    partes.push(`Reglas que tenés que respetar siempre:\n${JSON.stringify(guardrails, null, 2)}`);
  }

  return partes.join("\n\n---\n\n");
}

function toLlmMessage(mensaje: { direction: MessageDirection; content: string }): LlmMessage {
  return { role: mensaje.direction === "INBOUND" ? "user" : "assistant", content: mensaje.content };
}
