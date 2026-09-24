import type { WhatsAppConnection } from "@prisma/client";
import { whatsappConnectionRepository } from "../repositories/whatsappConnection.repository";
import { encryptToken } from "../lib/whatsapp/tokenCrypto";
import type { UpsertWhatsAppConnectionInput } from "../schemas/whatsappConnection.schema";

// Gap real encontrado navegando la app (2026-09-24, no era una tarea del
// roadmap): el modelo WhatsAppConnection y el webhook que lo LEE existían
// desde el PR #32, pero no había ninguna forma -- ni de API ni de UI -- de
// escribir uno. docs/ai-agent-architecture.md §4 describe el flujo "real"
// como el Embedded Signup de Meta (OAuth completo, que le devuelve a
// Xentech phone_number_id/waba_id/token). Automatizar ESE flujo requiere
// una Meta App ya configurada con esos callbacks, que a su vez requiere el
// trámite de Meta Business que Rocco todavía no hizo -- bloqueado por lo
// mismo que ya estaba documentado como pendiente.
//
// Decisión propia (documentada como tal, reemplazable sin tocar el resto,
// mismo criterio que otras decisiones de este módulo): en vez de esperar a
// automatizar el OAuth, el tenant admin carga a mano los 3 valores que ESE
// mismo flujo de Meta le devuelve (los ve en el panel de Meta for
// Developers al terminar el Embedded Signup, o los genera manualmente
// desde ahí). Por eso el status pasa a CONNECTED apenas se guardan: para
// cuando el admin los tiene en la mano, Meta ya confirmó el número de su
// lado -- no hay un paso de confirmación adicional que Xentech pueda
// verificar acá.
export interface WhatsAppConnectionView {
  phoneNumberId: string;
  wabaId: string;
  displayPhoneNumber: string | null;
  status: "PENDING" | "CONNECTED" | "DISCONNECTED";
  updatedAt: string;
}

function aVista(connection: WhatsAppConnection): WhatsAppConnectionView {
  return {
    phoneNumberId: connection.phoneNumberId,
    wabaId: connection.wabaId,
    displayPhoneNumber: connection.displayPhoneNumber,
    status: connection.status,
    updatedAt: connection.updatedAt.toISOString(),
  };
}

// El token (ni siquiera encriptado) sale de acá para ningún lado -- lo que
// el frontend necesita saber es si HAY uno cargado, no cuál es.
export async function getConnection(
  organizationId: string,
): Promise<WhatsAppConnectionView | null> {
  const connection = await whatsappConnectionRepository.findByOrganizationId(organizationId);
  return connection ? aVista(connection) : null;
}

export async function upsertConnection(
  organizationId: string,
  input: UpsertWhatsAppConnectionInput,
): Promise<WhatsAppConnectionView> {
  const connection = await whatsappConnectionRepository.upsertForOrganization(organizationId, {
    phoneNumberId: input.phoneNumberId,
    wabaId: input.wabaId,
    displayPhoneNumber: input.displayPhoneNumber,
    accessTokenEncrypted: encryptToken(input.accessToken),
  });
  return aVista(connection);
}

export async function deleteConnection(organizationId: string): Promise<void> {
  await whatsappConnectionRepository.deleteForOrganization(organizationId);
}
