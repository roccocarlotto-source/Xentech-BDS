import type { ConsentimientoOrigen, Prisma, PresupuestoEstado } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { calcularEnviosEmail } from "../lib/seguimiento/envioScheduling";

// Etapa 4, paso 2 de docs/seguimiento-resenas-diseno.md: alta de un
// Presupuesto desde la pantalla de revisión, con sus Consentimiento(s) en
// la MISMA transacción -- un Presupuesto sin su consentimiento de email
// (§5: "parte de la relación precontractual", registrado siempre) no
// debería poder existir.
//
// Etapa 5, paso 1: la misma transacción también programa los `Envio` de
// email de la secuencia de seguimiento (§6.3) -- un Presupuesto sin sus
// Envio programados se quedaría sin seguimiento para siempre, mismo
// argumento que el consentimiento de email.

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

      // Etapa 5, paso 1 (§6.3): programa la secuencia de email -- SOLO
      // email, WhatsApp es la etapa 6. Sin fila de ConfigSeguimiento
      // todavía (no hay panel para cargarla -- etapa 8), se usan los
      // mismos defaults que el schema de Prisma. Referencia de "el envío
      // del presupuesto": fechaEmision si se pudo determinar, si no el
      // momento en que se cargó -- decisión propia, a confirmar por Rocco
      // (ver el comentario en envioScheduling.ts).
      const config = await tx.configSeguimiento.findUnique({
        where: { organizationId: input.organizationId },
        select: { intervalosDias: true, horaInicioEnvio: true, zonaHoraria: true },
      });

      const enviosEmail = calcularEnviosEmail({
        presupuestoId: presupuesto.id,
        fechaReferencia: input.fechaEmision ?? input.ahora,
        intervalosDias: config?.intervalosDias,
        horaInicioEnvio: config?.horaInicioEnvio,
        zonaHoraria: config?.zonaHoraria,
      });

      await tx.envio.createMany({
        data: enviosEmail.map((envio) => ({
          organizationId: input.organizationId,
          presupuestoId: presupuesto.id,
          paso: envio.paso,
          canal: envio.canal,
          programadoPara: envio.programadoPara,
          claveIdempotencia: envio.claveIdempotencia,
        })),
      });

      return presupuesto;
    });
  },

  // Etapa 5, paso 2 (§6.3, punto 4): transición de estado que hace el job
  // de envío, nunca la pantalla de revisión. `where.estado: { in: desde }`
  // hace el UPDATE condicional -- si alguien aceptó/rechazó el presupuesto
  // desde el panel justo en el medio, esto no lo pisa (la fila
  // simplemente no matchea y count queda en 0).
  actualizarEstadoSiCoincide(
    organizationId: string,
    id: string,
    desde: PresupuestoEstado[],
    hasta: PresupuestoEstado,
  ) {
    return prisma.presupuesto.updateMany({
      where: { organizationId, id, estado: { in: desde } },
      data: { estado: hasta },
    });
  },
};

export type PresupuestoRepository = typeof presupuestoRepository;
