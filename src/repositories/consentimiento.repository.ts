import { prisma } from "../lib/prisma";

// Consentimientos (§5 del diseño). Hasta ahora solo se CREABAN, dentro de
// la transacción que crea el presupuesto (presupuesto.repository.ts). La
// etapa 5 agrega el otro lado: darlos de baja cuando el cliente lo pide.

export const consentimientoRepository = {
  // §5/§6.4: la baja corta la secuencia "de inmediato" y "queda registrada
  // con fecha". Se dan de baja TODOS los consentimientos vigentes de ese
  // cliente para ese canal, no solo el del presupuesto que originó la
  // respuesta: quien pide que no le escriban más no está pidiendo que no le
  // escriban más por UN presupuesto.
  //
  // `bajaEn: null` en el where hace la operación idempotente y conserva la
  // fecha de la primera baja si el cliente la pide dos veces.
  marcarBajaDelCliente(
    organizationId: string,
    clienteId: string,
    canal: "EMAIL" | "WHATSAPP",
    enFecha: Date,
  ) {
    return prisma.consentimiento.updateMany({
      where: { organizationId, clienteId, canal, bajaEn: null },
      data: { bajaEn: enFecha },
    });
  },
};

export type ConsentimientoRepository = typeof consentimientoRepository;
