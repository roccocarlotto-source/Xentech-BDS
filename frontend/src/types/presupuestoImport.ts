// Espejo de src/schemas/presupuestoImport.schema.ts del backend (etapa 4 de
// docs/seguimiento-resenas-diseno.md).

export interface DatosExtraidosPresupuesto {
  clienteNombre: string | null;
  telefono: string | null;
  email: string | null;
  items: string | null;
  monto: number | null;
  moneda: string | null;
  fechaEmision: string | null;
  validez: string | null;
  vendedor: string | null;
}

export interface PreviewImportPresupuestoResult {
  archivoNombre: string;
  textoExtraido: string;
  datos: DatosExtraidosPresupuesto;
}

export type ClienteSeleccion =
  | { modo: "existente"; clienteId: string }
  | { modo: "nuevo"; nombre: string; telefono?: string | null; email?: string | null };

export type ConsentimientoWhatsappOrigen = "WHATSAPP_ENTRANTE" | "VERBAL_VENDEDOR";

export interface CommitImportPresupuestoInput {
  archivoNombre: string;
  cliente: ClienteSeleccion;
  vendedorId?: string | null;
  descripcion?: string | null;
  monto?: number | null;
  moneda?: string | null;
  fechaEmision?: string | null;
  validoHasta?: string | null;
  datosExtraidos: Record<string, unknown>;
  seguimientoWhatsapp: boolean;
  consentimientoWhatsappOrigen?: ConsentimientoWhatsappOrigen | null;
}

// Solo los campos que la pantalla de resultado usa -- el backend devuelve
// el Presupuesto completo de Prisma.
export interface PresupuestoCreado {
  id: string;
  clienteId: string;
  estado: string;
  descripcion: string | null;
  monto: string | null;
  moneda: string | null;
}
