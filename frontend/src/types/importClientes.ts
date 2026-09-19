// Espejo de src/services/importClientes.service.ts del backend.

export const CLIENTE_IMPORT_FIELDS = [
  "nombre",
  "telefono",
  "email",
  "notas",
  "cuotaMonto",
  "cuotaPeriodicidad",
  "cuotaUltimoPago",
] as const;

export type ClienteImportField = (typeof CLIENTE_IMPORT_FIELDS)[number];

export const CLIENTE_IMPORT_FIELD_LABELS: Record<ClienteImportField, string> = {
  nombre: "Nombre",
  telefono: "Teléfono",
  email: "Correo electrónico",
  notas: "Notas",
  cuotaMonto: "Monto de la cuota",
  cuotaPeriodicidad: "Periodicidad de la cuota",
  cuotaUltimoPago: "Fecha del último pago",
};

// "nombre" es el único campo que el backend exige mapeado.
export const CLIENTE_IMPORT_REQUIRED_FIELD: ClienteImportField = "nombre";

export type ClienteImportMapping = Partial<Record<ClienteImportField, string>>;

export interface ClienteImportPreview {
  headers: string[];
  totalRows: number;
  sampleRows: Array<Record<string, unknown>>;
  suggestedMapping: ClienteImportMapping;
}

export interface ClienteImportRowError {
  fila: number;
  mensaje: string;
}

export interface ClienteImportResult {
  totalRows: number;
  creados: number;
  errores: ClienteImportRowError[];
}
