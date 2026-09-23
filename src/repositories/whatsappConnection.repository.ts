import { prisma } from "../lib/prisma";

// Fase 5, paso 5 (docs/ai-agent-architecture.md §4). findByPhoneNumberId es
// lo que usa el webhook para saber a qué organización pertenece un mensaje
// entrante -- Meta manda todos los mensajes de todos los números
// conectados a un solo endpoint, el payload trae el phone_number_id
// (@unique acá justamente por esto).
export const whatsappConnectionRepository = {
  findByPhoneNumberId(phoneNumberId: string) {
    return prisma.whatsAppConnection.findUnique({ where: { phoneNumberId } });
  },

  findByOrganizationId(organizationId: string) {
    return prisma.whatsAppConnection.findUnique({ where: { organizationId } });
  },
};
