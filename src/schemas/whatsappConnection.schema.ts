import { z } from "zod";

// Carga manual de la conexión de WhatsApp (ver comentario de diseño en
// services/whatsappConnection.service.ts): estos son los mismos 3 valores
// que devuelve el "Embedded Signup" de Meta -- acá se pegan a mano en vez
// de automatizar el flujo OAuth completo.
export const upsertWhatsAppConnectionSchema = z.object({
  phoneNumberId: z.string().trim().min(1).max(50),
  wabaId: z.string().trim().min(1).max(50),
  displayPhoneNumber: z.string().trim().max(30).optional(),
  accessToken: z.string().trim().min(1),
});

export type UpsertWhatsAppConnectionInput = z.infer<typeof upsertWhatsAppConnectionSchema>;
