import type { ConversationStatus } from "@prisma/client";
import { conversationRepository } from "../repositories/conversation.repository";
import { messageRepository } from "../repositories/message.repository";
import { AppError } from "../utils/AppError";

export async function listConversations(organizationId: string, status?: ConversationStatus) {
  return conversationRepository.listByOrganization(organizationId, status);
}

async function requireConversation(organizationId: string, id: string) {
  const conversation = await conversationRepository.findById(organizationId, id);
  if (!conversation) {
    throw new AppError("Conversación no encontrada", 404);
  }
  return conversation;
}

export async function getConversationDetail(organizationId: string, id: string) {
  const conversation = await requireConversation(organizationId, id);
  const mensajes = await messageRepository.listAllByConversation(id);
  return { conversation, mensajes };
}

// Respuesta de una persona del equipo desde el inbox. El mensaje queda
// guardado igual aunque todavía no haya conexión real de WhatsApp (paso 5
// del plan) para entregarlo -- decisión explícita de Rocco: se prioriza
// tener el inbox utilizable ya mismo (vía el endpoint de prueba) antes que
// esperar la conexión real.
export async function replyToConversation(
  organizationId: string,
  id: string,
  userId: string,
  mensaje: string,
) {
  const conversation = await requireConversation(organizationId, id);

  const message = await messageRepository.create({
    organizationId,
    conversationId: conversation.id,
    direction: "OUTBOUND",
    senderType: "HUMAN",
    senderUserId: userId,
    content: mensaje,
  });

  await conversationRepository.touchLastMessageAt(conversation.id);

  return message;
}

export async function setConversationStatus(
  organizationId: string,
  id: string,
  status: "ACTIVE" | "CLOSED",
) {
  await requireConversation(organizationId, id);
  return conversationRepository.setStatusScoped(organizationId, id, status);
}
