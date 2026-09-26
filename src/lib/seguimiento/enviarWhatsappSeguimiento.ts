import type { EmailEnvioResultado } from "../email/emailProvider";
import { whatsappConnectionRepository } from "../../repositories/whatsappConnection.repository";
import { decryptToken } from "../whatsapp/tokenCrypto";
import { sendWhatsAppTemplateMessage, sendWhatsAppTextMessage } from "../whatsapp/graphApiClient";
import type { QueMandarPorWhatsapp } from "./envioWhatsapp";

// Etapa 6: el envío real por WhatsApp del motor de seguimiento.
//
// Devuelve el MISMO tipo que el provider de email (`EmailEnvioResultado`)
// a propósito: el job trata a los dos canales igual -- ok con un id, o
// fallo con un motivo -- y decide reintentar o marcar FALLIDO con la misma
// lógica. Por eso tampoco lanza: un throw le sacaría esa decisión al job y
// abortaría el lote.

export interface EnviarPorWhatsappParams {
  organizationId: string;
  to: string;
  contenido: Exclude<QueMandarPorWhatsapp, { modo: "falta_plantilla" }>;
}

export interface EnviarWhatsappDeps {
  buscarConexion: (organizationId: string) => Promise<{
    phoneNumberId: string;
    accessTokenEncrypted: string;
    status: string;
  } | null>;
  desencriptar: (encrypted: string) => string;
  mandarTexto: typeof sendWhatsAppTextMessage;
  mandarPlantilla: typeof sendWhatsAppTemplateMessage;
}

const defaultDeps: EnviarWhatsappDeps = {
  buscarConexion: (organizationId) =>
    whatsappConnectionRepository.findByOrganizationId(organizationId),
  desencriptar: decryptToken,
  mandarTexto: sendWhatsAppTextMessage,
  mandarPlantilla: sendWhatsAppTemplateMessage,
};

export async function enviarPorWhatsapp(
  params: EnviarPorWhatsappParams,
  deps: EnviarWhatsappDeps = defaultDeps,
): Promise<EmailEnvioResultado> {
  const conexion = await deps.buscarConexion(params.organizationId);

  // Sin conexión o a medio conectar: transitorio desde el punto de vista
  // del job (se arregla cuando el admin la termine de cargar), así que
  // vuelve como fallo reintentable y no como cancelación.
  if (!conexion) {
    return { ok: false, error: "la organización no tiene conexión de WhatsApp cargada" };
  }
  if (conexion.status !== "CONNECTED") {
    return { ok: false, error: `la conexión de WhatsApp está en estado ${conexion.status}` };
  }

  let accessToken: string;
  try {
    accessToken = deps.desencriptar(conexion.accessTokenEncrypted);
  } catch (err) {
    return { ok: false, error: `no se pudo desencriptar el token: ${describir(err)}` };
  }

  try {
    const resultado =
      params.contenido.modo === "texto"
        ? await deps.mandarTexto({
            phoneNumberId: conexion.phoneNumberId,
            accessToken,
            to: params.to,
            text: params.contenido.texto,
          })
        : await deps.mandarPlantilla({
            phoneNumberId: conexion.phoneNumberId,
            accessToken,
            to: params.to,
            templateName: params.contenido.plantilla.nombre,
            languageCode: params.contenido.plantilla.idioma,
            bodyParameters: params.contenido.parametros,
          });

    return { ok: true, providerMessageId: resultado.messageId };
  } catch (err) {
    return { ok: false, error: `Graph API: ${describir(err)}` };
  }
}

function describir(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
