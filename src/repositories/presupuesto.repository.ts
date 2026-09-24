import type { ConsentimientoOrigen, Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";

// Etapa 4, paso 2 de docs/seguimiento-resenas-diseno.md: alta de un
// Presupuesto desde la pantalla de revisión, con sus Consentimiento(s) en
// la MISMA transacción -- un Presupuesto sin su consentimiento de email
// (§5: "parte de la relación precontractual", registrado siempre) no
// debería poder existir.

export interface CrearPresupuestoInput {
  organizationId: string;
  clienteId: string;
  vendedorId: string | null;
  creadoPorId: string;
  datosExtraidos: Prisma.InputJsonValue;
  descripcion: string | null;
  monto: number | null;
  moneda: string | null;
  fechaEmision: Date | null;
  validoHasta: Date | null;
  archivoNombre: string;
  seguimientoWhatsapp: boolean;
  // Requerido junto con seguimientoWhatsapp=true -- validado antes de llegar
  // acá (commitImportPresupuestoSchema.refine), no se vuelve a chequear.
  consentimientoWhatsappOrigen: ConsentimientoOrigen | null;
  ahora: Date;
}

export const presupuestoRepository = {
  crearConConsentimientos(input: CrearPresupuestoInput) {
    return prisma.$transaction(async (tx) => {
      const presupuesto = await tx.presupuesto.create({
        data: {
          organizationId: input.organizationId,
          clienteId: input.clienteId,
          vendedorId: input.vendedorId,
          creadoPorId: input.creadoPorId,
          datosExtraidos: input.datosExtraidos,
          descripcion: input.descripcion,
          monto: input.monto,
          moneda: input.moneda,
          fechaEmision: input.fechaEmision,
          validoHasta: input.validoHasta,
          // archivoPath queda sin usar (null) -- todavía no hay bucket de
          // Supabase Storage configurado (prisma/schema.prisma, comentario
          // de Presupuesto.archivoPath). El .docx original no se persiste
          // en este paso, solo su nombre.
          archivoNombre: input.archivoNombre,
          seguimientoWhatsapp: input.seguimientoWhatsapp,
        },
      });

      // §5 (email): "El seguimiento de un presupuesto que el cliente pidió
      // se trata como parte de la relación precontractual" -- se registra
      // SIEMPRE, valga o no la pena (si el cliente no tiene email cargado,
      // el motor de seguimiento de la etapa 5 simplemente no tendrá adónde
      // mandar nada). presupuestoId lo liga a este presupuesto en particular
      // (Consentimiento, comentario en el schema).
      await tx.consentimiento.create({
        data: {
          organizationId: input.organizationId,
          clienteId: input.clienteId,
          presupuestoId: presupuesto.id,
          canal: "EMAIL",
          origen: "RELACION_PRESUPUESTO_EMAIL",
          otorgadoEn: input.ahora,
          registradoPorId: input.creadoPorId,
        },
      });

      if (input.seguimientoWhatsapp && input.consentimientoWhatsappOrigen) {
        await tx.consentimiento.create({
          data: {
            organizationId: input.organizationId,
            clienteId: input.clienteId,
            presupuestoId: presupuesto.id,
            canal: "WHATSAPP",
            origen: input.consentimientoWhatsappOrigen,
            otorgadoEn: input.ahora,
            registradoPorId: input.creadoPorId,
          },
        });
      }

      return presupuesto;
    });
  },
};

export type PresupuestoRepository = typeof presupuestoRepository;
