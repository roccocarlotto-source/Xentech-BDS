import { z } from "zod";

// Etapa 4, paso 1 de docs/seguimiento-resenas-diseno.md (§6.2): extracción
// de datos de un .docx de presupuesto, sin persistir nada todavía -- la
// pantalla de revisión y el guardado (Presupuesto + Cliente +
// Consentimiento) quedan para un paso siguiente.
//
// Campo por campo, mismo criterio que §6.2 salvo uno: el doc original dice
// "vehiculo_o_items" (heredado de la plantilla de la que nació este
// documento, para concesionarias) -- Rocco decidió el 2026-09-24 que
// Xentech es para una empresa de CARTELERÍA, no concesionarias, así que acá
// se usa "items" en su lugar. Decisión propia, a confirmar por Rocco (no es
// solo un rename cosmético: cambia qué le pedimos al modelo que busque en
// el texto).
export const datosExtraidosPresupuestoSchema = z.object({
  clienteNombre: z.string().trim().min(1).nullable(),
  telefono: z.string().trim().min(1).nullable(),
  email: z.string().trim().min(1).nullable(),
  items: z.string().trim().min(1).nullable(),
  // El modelo puede devolver el monto como número o como string numérico
  // (p. ej. "15.000,50") según cómo venga en el texto -- se normaliza a
  // number | null acá, nunca se le pide al backend que interprete texto.
  monto: z.coerce.number().finite().nullable(),
  moneda: z.string().trim().min(1).max(3).nullable(),
  // Fecha como string ISO (YYYY-MM-DD) tal como la devuelve el modelo, sin
  // parsear a Date todavía -- la pantalla de revisión es quien decide si el
  // valor sirve o hay que corregirlo a mano.
  fechaEmision: z.string().trim().min(1).nullable(),
  validez: z.string().trim().min(1).nullable(),
  vendedor: z.string().trim().min(1).nullable(),
});

export type DatosExtraidosPresupuesto = z.infer<typeof datosExtraidosPresupuestoSchema>;

export interface PreviewImportPresupuestoResult {
  archivoNombre: string;
  // Texto crudo extraído del .docx (mammoth), para que la pantalla de
  // revisión pueda mostrarlo como referencia si la extracción de la IA se
  // equivocó en algo.
  textoExtraido: string;
  datos: DatosExtraidosPresupuesto;
}
