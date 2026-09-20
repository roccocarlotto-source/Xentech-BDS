// Espejo de src/schemas/conversation.schema.ts y de los modelos
// Conversation/Message en prisma/schema.prisma del backend (Fase 5, paso 4
// -- docs/ai-agent-architecture.md §8).

export const CONVERSATION_STATUSES = ["ACTIVE", "TRANSFERRED_TO_HUMAN", "CLOSED"] as const;
export type ConversationStatus = (typeof CONVERSATION_STATUSES)[number];

export const CONVERSATION_STATUS_LABELS: Record<ConversationStatus, string> = {
  ACTIVE: "Activa (con el agente)",
  TRANSFERRED_TO_HUMAN: "Derivada a una persona",
  CLOSED: "Cerrada",
};

export type MessageDirection = "INBOUND" | "OUTBOUND";
export type MessageSenderType = "CLIENTE" | "AGENT" | "HUMAN";

export interface ConversationCliente {
  id: string;
  nombre: string;
  telefono: string | null;
}

export interface Message {
  id: string;
  organizationId: string;
  conversationId: string;
  direction: MessageDirection;
  senderType: MessageSenderType;
  senderUserId: string | null;
  content: string;
  createdAt: string;
}

// Forma que devuelve GET /api/conversations: incluye el último mensaje
// (para la vista de lista) en vez del historial completo.
export interface ConversationListItem {
  id: string;
  organizationId: string;
  agentConfigId: string;
  clienteId: string | null;
  externalThreadId: string;
  status: ConversationStatus;
  lastMessageAt: string | null;
  createdAt: string;
  cliente: ConversationCliente | null;
  messages: Message[];
}

// Forma que devuelve GET /api/conversations/:id.
export interface ConversationDetail {
  id: string;
  organizationId: string;
  agentConfigId: string;
  clienteId: string | null;
  externalThreadId: string;
  status: ConversationStatus;
  lastMessageAt: string | null;
  createdAt: string;
  cliente: ConversationCliente | null;
}

export interface ConversationDetailResponse {
  conversation: ConversationDetail;
  mensajes: Message[];
}
