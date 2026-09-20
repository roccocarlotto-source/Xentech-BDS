import { z } from "zod";

// Fase 5, paso 4: mensaje que manda una persona del equipo desde el inbox.
// El mensaje queda guardado (Message, senderType HUMAN) aunque todavía no
// haya conexión real de WhatsApp (paso 5) para entregarlo -- decisión
// explícita de Rocco, ver docs/estado-actual.md.
export const conversationReplySchema = z.object({
  mensaje: z.string().trim().min(1).max(4000),
});

// Transiciones que puede disparar una persona desde el inbox: cerrar la
// conversación (se resolvió) o devolvérsela al agente (ACTIVE). Nunca
// TRANSFERRED_TO_HUMAN -- esa la pone el propio orquestador, nunca una
// persona a mano.
export const conversationStatusSchema = z.object({
  status: z.enum(["ACTIVE", "CLOSED"]),
});

// Filtro de ?status= en GET /api/conversations -- acepta los 3 valores del
// enum (a diferencia de conversationStatusSchema, que es lo que una
// persona puede *setear* desde el inbox).
export const conversationStatusFilterSchema = z.enum(["ACTIVE", "TRANSFERRED_TO_HUMAN", "CLOSED"]);

export type ConversationReplyInput = z.infer<typeof conversationReplySchema>;
export type ConversationStatusInput = z.infer<typeof conversationStatusSchema>;
