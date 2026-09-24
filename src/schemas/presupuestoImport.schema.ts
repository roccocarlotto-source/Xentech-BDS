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

// ---------------------------------------------------------------------------
// Etapa 4, paso 2: revisión humana + guardado (§6.2, §7 etapa 4).
// ---------------------------------------------------------------------------

// La persona en la pantalla de revisión elige un Cliente existente
// (matcheado por teléfono/nombre a partir de lo que extrajo la IA, o
// buscado a mano) o carga uno nuevo -- mismos campos que createClienteSchema
// (cliente.schema.ts), sin duplicar el import para no acoplar los dos
// schemas más de lo necesario.
export const clienteSeleccionSchema = z.discriminatedUnion("modo", [
  z.object({ modo: z.literal("existente"), clienteId: z.string().uuid() }),
  z.object({
    modo: z.literal("nuevo"),
    nombre: z.string().trim().min(1).max(200),
    telefono: z.string().trim().max(30).nullish(),
    email: z.string().trim().email().max(255).nullish(),
  }),
]);

export type ClienteSeleccion = z.infer<typeof clienteSeleccionSchema>;

// §5: los únicos dos orígenes de consentimiento de WhatsApp que tiene
// sentido registrar DESDE esta pantalla (carga del presupuesto). El tercero
// (RESPUESTA_WHATSAPP) lo registra el sistema a partir de un mensaje
// entrante real, no una persona cargando un presupuesto.
export const consentimientoWhatsappOrigenSchema = z.enum(["WHATSAPP_ENTRANTE", "VERBAL_VENDEDOR"]);

// Presupuesto.descripcion/monto/moneda/fechaEmision/validoHasta tal como
// quedan después de que la persona revisó y corrigió el draft de
// datosExtraidosPresupuestoSchema -- ya tipados para columnas reales (fechas
// como Date, no string), nunca los valores crudos de la IA sin pasar por acá.
export const commitImportPresupuestoSchema = z
  .object({
    archivoNombre: z.string().trim().min(1).max(255),
    cliente: clienteSeleccionSchema,
    // Quién emitió el presupuesto según el texto (nombre libre, puede no
    // matchear ningún User) vs. a qué User del sistema se lo asigna, si
    // corresponde -- ver el comentario de Presupuesto.vendedorId en
    // prisma/schema.prisma.
    vendedorId: z.string().uuid().nullish(),
    descripcion: z.string().trim().max(2000).nullish(),
    monto: z.number().nonnegative().nullish(),
    moneda: z.string().trim().min(1).max(3).nullish(),
    fechaEmision: z.coerce.date().nullish(),
    validoHasta: z.coerce.date().nullish(),
    // El draft completo devuelto por /preview (o lo que quedó de él tras la
    // corrección humana) -- va tal cual a Presupuesto.datosExtraidos, como
    // registro de qué dijo la IA originalmente (§6.2: "los campos
    // confirmados van en columnas").
    datosExtraidos: z.record(z.unknown()),
    seguimientoWhatsapp: z.boolean(),
    consentimientoWhatsappOrigen: consentimientoWhatsappOrigenSchema.nullish(),
  })
  .refine((v) => !v.seguimientoWhatsapp || !!v.consentimientoWhatsappOrigen, {
    message:
      "Falta indicar el origen del consentimiento de WhatsApp (obligatorio si el seguimiento por WhatsApp está activado)",
    path: ["consentimientoWhatsappOrigen"],
  });

export type CommitImportPresupuestoInput = z.infer<typeof commitImportPresupuestoSchema>;
