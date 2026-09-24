export type WhatsAppConnectionStatus = "PENDING" | "CONNECTED" | "DISCONNECTED";

export interface WhatsAppConnection {
  phoneNumberId: string;
  wabaId: string;
  displayPhoneNumber: string | null;
  status: WhatsAppConnectionStatus;
  updatedAt: string;
}

export interface UpsertWhatsAppConnectionInput {
  phoneNumberId: string;
  wabaId: string;
  displayPhoneNumber?: string;
  accessToken: string;
}

export const WHATSAPP_CONNECTION_STATUS_LABELS: Record<WhatsAppConnectionStatus, string> = {
  PENDING: "Pendiente",
  CONNECTED: "Conectado",
  DISCONNECTED: "Desconectado",
};
