import type { ConsentimientoOrigen, Prisma, PresupuestoEstado } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { calcularEnvios, elegirCanalSeguimiento } from "../lib/seguimiento/envioScheduling";

// Etapa 4, paso 2 de docs/seguimiento-resenas-diseno.md: alta de un
// Presupuesto desde la pantalla de revisión, con sus Consentimiento(s) en
// la MISMA transacción -- un Presupuesto sin su consentimiento de email
// (§5: "parte de la relación precontractual", registrado siempre) no
// debería poder existir.
//
// Etapa 5, paso 1: la misma transacción también programa los `Envio` de la
// secuencia de seguimiento (§6.3) -- un Presupuesto sin sus Envio
// programados se quedaría sin seguimiento para siempre, mismo argumento que
// el consentimiento de email. El canal se elige acá, por presupuesto
// (decisión 1 del 2026-09-26): email si el cliente tiene email, WhatsApp si
// no; ver elegirCanalSeguimiento().

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

      // Etapa 5, paso 1 (§6.3): programa la secuencia de seguimiento. Sin
      // fila de ConfigSeguimiento todavía (no hay panel para cargarla --
      // etapa 8), se usan los mismos defaults que el schema de Prisma.
      // Referencia de "el envío del presupuesto": fechaEmision si se pudo
      // determinar, si no el momento en que se cargó -- decisión propia, a
      // confirmar por Rocco (ver el comentario en envioScheduling.ts).
      const config = await tx.configSeguimiento.findUnique({
        where: { organizationId: input.organizationId },
        select: { intervalosDias: true, horaInicioEnvio: true, zonaHoraria: true },
      });

      // El canal depende de los datos de contacto del cliente, así que se
      // leen DENTRO de la transacción: si alguien le carga un email entre la
      // revisión y el guardado, vale el estado con el que se está creando el
      // presupuesto, no uno anterior.
      const cliente = await tx.cliente.findUniqueOrThrow({
        where: { organizationId_id: { organizationId: input.organizationId, id: input.clienteId } },
        select: { email: true, telefono: true },
      });

      const canal = elegirCanalSeguimiento({
        tieneEmail: !!cliente.email,
        tieneTelefono: !!cliente.telefono,
        consentimientoWhatsapp: input.seguimientoWhatsapp,
      });

      // `null` = no hay por dónde seguirlo (ver elegirCanalSeguimiento). No
      // se programa nada, en vez de dejar filas que nunca van a poder salir.
      if (canal) {
        const envios = calcularEnvios({
          presupuestoId: presupuesto.id,
          canal,
          fechaReferencia: input.fechaEmision ?? input.ahora,
          intervalosDias: config?.intervalosDias,
          horaInicioEnvio: config?.horaInicioEnvio,
          zonaHoraria: config?.zonaHoraria,
        });

        await tx.envio.createMany({
          data: envios.map((envio) => ({
            organizationId: input.organizationId,
            presupuestoId: presupuesto.id,
            paso: envio.paso,
            canal: envio.canal,
            programadoPara: envio.programadoPara,
            claveIdempotencia: envio.claveIdempotencia,
          })),
        });
      }

      return presupuesto;
    });
  },

  // Etapa 7, parte 2: el panel de seguimiento. Trae, por presupuesto, la
  // ÚLTIMA respuesta entrante con su clasificación -- que es lo que una
  // persona necesita para decidir si tiene que hacer algo -- y si ya se
  // generó un link de reseña, para no ofrecer pedirla dos veces.
  listarParaPanel(organizationId: string, limit: number) {
    return prisma.presupuesto.findMany({
      where: { organizationId, deletedAt: null },
      orderBy: { updatedAt: "desc" },
      take: limit,
      select: {
        id: true,
        estado: true,
        descripcion: true,
        monto: true,
        moneda: true,
        fechaEmision: true,
        createdAt: true,
        cliente: {
          select: { id: true, nombre: true, personaContacto: true, email: true, telefono: true },
        },
        mensajes: {
          where: { direccion: "INBOUND" },
          orderBy: { fecha: "desc" },
          take: 1,
          select: {
            fecha: true,
            contenido: true,
            clasificacionIa: true,
            resumenIa: true,
            requiereVendedor: true,
          },
        },
        _count: { select: { tokensResena: true } },
      },
    });
  },

  // Para el botón "Solicitar reseña": lo mínimo para validar y armar el
  // email, scoped por organización.
  findParaSolicitarResena(organizationId: string, id: string) {
    return prisma.presupuesto.findFirst({
      where: { organizationId, id, deletedAt: null },
      select: {
        id: true,
        estado: true,
        clienteId: true,
        cliente: { select: { nombre: true, personaContacto: true, email: true } },
      },
    });
  },

  // Etapa 5 (§6.4): resolver el presupuesto de una respuesta entrante. Sin
  // organizationId a propósito -- el único dato que trae el Reply-To es el
  // id del presupuesto (ver src/lib/email/direccionRespuesta.ts). Es seguro
  // porque el id es un uuid y la organización sale de la propia fila: de
  // acá en adelante todo se filtra por el organizationId que devuelve esta
  // query, nunca por uno que venga de afuera.
  findParaRespuestaEntrante(presupuestoId: string) {
    return prisma.presupuesto.findFirst({
      where: { id: presupuestoId, deletedAt: null },
      select: {
        id: true,
        organizationId: true,
        clienteId: true,
        estado: true,
        cliente: { select: { email: true } },
      },
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
