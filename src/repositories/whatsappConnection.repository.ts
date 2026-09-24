import { prisma } from "../lib/prisma";

function esRegistroInexistente(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: unknown }).code === "P2025"
  );
}

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

  // organizationId es @unique en el modelo -- una organización tiene a lo
  // sumo una conexión, así que "guardar la conexión" siempre es un upsert
  // por ese campo, nunca un create/update separados que el caller tenga que
  // elegir entre sí.
  upsertForOrganization(
    organizationId: string,
    data: {
      phoneNumberId: string;
      wabaId: string;
      displayPhoneNumber?: string;
      accessTokenEncrypted: string;
    },
  ) {
    return prisma.whatsAppConnection.upsert({
      where: { organizationId },
      create: { organizationId, status: "CONNECTED", ...data },
      update: { status: "CONNECTED", ...data },
    });
  },

  // Idempotente a propósito (el caller no necesita chequear si existe antes
  // de desconectar): si no hay conexión, no hay nada que hacer.
  async deleteForOrganization(organizationId: string): Promise<void> {
    try {
      await prisma.whatsAppConnection.delete({ where: { organizationId } });
    } catch (err) {
      if (esRegistroInexistente(err)) return;
      throw err;
    }
  },
};
