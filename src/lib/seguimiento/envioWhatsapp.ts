// Etapa 6 (§6.4, "WhatsApp"): las reglas propias de ese canal, puras y
// aparte del job, para poder testearlas sin red ni base.
//
// La regla que manda todo: Meta solo deja mandar texto libre DENTRO de la
// ventana de 24 h contada desde el último mensaje que el CLIENTE mandó al
// número de la empresa. Fuera de esa ventana, únicamente plantillas
// aprobadas de antemano.
//
// El seguimiento es proactivo por definición (se le escribe a alguien que
// no escribió hoy), así que el caso normal es la plantilla. La ventana
// abierta es la excepción: pasa cuando el cliente venía conversando.

export const VENTANA_HORAS = 24;

export function dentroDeVentana24h(ultimoMensajeDelCliente: Date | null, ahora: Date): boolean {
  if (!ultimoMensajeDelCliente) return false;
  const transcurridoMs = ahora.getTime() - ultimoMensajeDelCliente.getTime();
  // Un timestamp futuro (reloj desfasado) NO abre la ventana: ante la duda,
  // plantilla, que es lo que Meta siempre acepta.
  if (transcurridoMs < 0) return false;
  return transcurridoMs < VENTANA_HORAS * 60 * 60 * 1000;
}

export interface PlantillaWhatsappConfigurada {
  nombre: string;
  idioma: string;
}

// Las plantillas viven en ConfigSeguimiento.plantillas.WHATSAPP, una por
// paso y en el mismo orden que intervalosDias (etapa 8). Es Json en la
// base, así que se valida la forma acá en vez de confiar en el tipo.
export function extraerPlantillaWhatsapp(
  plantillas: unknown,
  paso: number,
): PlantillaWhatsappConfigurada | null {
  if (typeof plantillas !== "object" || plantillas === null) return null;
  const lista = (plantillas as Record<string, unknown>).WHATSAPP;
  if (!Array.isArray(lista)) return null;

  const cruda = lista[paso - 1];
  if (typeof cruda !== "object" || cruda === null) return null;

  const { nombre, idioma } = cruda as { nombre?: unknown; idioma?: unknown };
  if (typeof nombre !== "string" || nombre.trim().length === 0) return null;

  return {
    nombre: nombre.trim(),
    idioma: typeof idioma === "string" && idioma.trim() ? idioma.trim() : "es",
  };
}

export type QueMandarPorWhatsapp =
  | { modo: "texto"; texto: string }
  | { modo: "plantilla"; plantilla: PlantillaWhatsappConfigurada; parametros: string[] }
  // No es un error ni un fallo del envío: falta configurar la plantilla de
  // ese paso. El job lo SALTEA sin reclamar la fila, igual que cuando está
  // fuera del horario, así configurar la plantilla más tarde hace que el
  // envío salga solo en el siguiente tick.
  | { modo: "falta_plantilla" };

export interface DecidirEnvioWhatsappInput {
  ventanaAbierta: boolean;
  plantilla: PlantillaWhatsappConfigurada | null;
  // Texto ya armado (el mismo cuerpo que se usaría por email, sin la línea
  // de baja de email). Solo se usa con la ventana abierta.
  texto: string;
  // Variables de la plantilla, en orden. Hoy: el nombre de la persona.
  parametros: string[];
}

export function decidirEnvioWhatsapp({
  ventanaAbierta,
  plantilla,
  texto,
  parametros,
}: DecidirEnvioWhatsappInput): QueMandarPorWhatsapp {
  if (ventanaAbierta) return { modo: "texto", texto };
  if (plantilla) return { modo: "plantilla", plantilla, parametros };
  return { modo: "falta_plantilla" };
}
