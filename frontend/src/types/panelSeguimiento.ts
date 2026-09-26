// Espejo de src/services/panelSeguimiento.service.ts (etapa 7, parte 2).

export type PresupuestoEstado =
  "PENDIENTE" | "EN_SEGUIMIENTO" | "ACEPTADO" | "RECHAZADO" | "VENCIDO" | "SIN_RESPUESTA";

export type ClasificacionRespuesta =
  | "INTERESADO"
  | "PIDE_DESCUENTO"
  | "QUIERE_LLAMADA"
  | "LO_ESTA_PENSANDO"
  | "ACEPTA"
  | "RECHAZA"
  | "COMPRO_EN_OTRO_LADO"
  | "BAJA";

export interface PresupuestoEnPanel {
  id: string;
  estado: PresupuestoEstado;
  descripcion: string | null;
  monto: string | null;
  moneda: string | null;
  fechaEmision: string | null;
  createdAt: string;
  cliente: {
    id: string;
    nombre: string;
    personaContacto: string | null;
    email: string | null;
    telefono: string | null;
  };
  ultimaRespuesta: {
    fecha: string;
    contenido: string;
    clasificacionIa: ClasificacionRespuesta | null;
    resumenIa: string | null;
    requiereVendedor: boolean | null;
  } | null;
  resenaSolicitada: boolean;
}

export interface ResultadoSolicitudResena {
  token: string;
  venceEn: string;
  emailEnviado: boolean;
  motivo: string | null;
}

export const ESTADO_LABELS: Record<PresupuestoEstado, string> = {
  PENDIENTE: "Pendiente",
  EN_SEGUIMIENTO: "En seguimiento",
  ACEPTADO: "Aceptado",
  RECHAZADO: "Rechazado",
  VENCIDO: "Vencido",
  SIN_RESPUESTA: "Sin respuesta",
};

export const CLASIFICACION_LABELS: Record<ClasificacionRespuesta, string> = {
  INTERESADO: "Interesado",
  PIDE_DESCUENTO: "Pide descuento",
  QUIERE_LLAMADA: "Quiere que lo llamen",
  LO_ESTA_PENSANDO: "Lo está pensando",
  ACEPTA: "Acepta",
  RECHAZA: "Rechaza",
  COMPRO_EN_OTRO_LADO: "Compró en otro lado",
  BAJA: "Pidió la baja",
};
