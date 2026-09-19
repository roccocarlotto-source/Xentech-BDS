import { DateTime } from "luxon";

export type CuotaEstado = "AL_DIA" | "ATRASADO" | "SIN_DATOS";

export interface CuotaResumen {
  estado: CuotaEstado;
  diasAtraso: number;
}

type CuotaPeriodicidad = "MENSUAL";

interface CuotaInput {
  cuotaPeriodicidad: CuotaPeriodicidad | null;
  cuotaUltimoPago: Date | null;
}

// Calcula estado (al día / atrasado) y días de atraso de la cuota de un
// cliente, de forma PEREZOSA — sin job, se recalcula en cada consulta a
// partir de cuotaUltimoPago + cuotaPeriodicidad. Ver el comentario sobre
// esta decisión en prisma/schema.prisma (mismo patrón que los estados
// derivados de PlataformaCRM).
//
// `ahora` es un parámetro (no Date.now() directo) para que el cálculo sea
// testeable de forma determinística.
export function calcularCuota(input: CuotaInput, ahora: Date = new Date()): CuotaResumen {
  if (!input.cuotaPeriodicidad || !input.cuotaUltimoPago) {
    // Cliente sin cuota configurada todavía — ni al día ni atrasado, un
    // tercer estado explícito en vez de forzar uno de los otros dos.
    return { estado: "SIN_DATOS", diasAtraso: 0 };
  }

  const ultimoPago = DateTime.fromJSDate(input.cuotaUltimoPago).startOf("day");
  const now = DateTime.fromJSDate(ahora).startOf("day");
  const proximoVencimiento = siguienteVencimiento(ultimoPago, input.cuotaPeriodicidad);

  if (now <= proximoVencimiento) {
    return { estado: "AL_DIA", diasAtraso: 0 };
  }

  const diasAtraso = Math.floor(now.diff(proximoVencimiento, "days").days);
  return { estado: "ATRASADO", diasAtraso };
}

function siguienteVencimiento(ultimoPago: DateTime, periodicidad: CuotaPeriodicidad): DateTime {
  switch (periodicidad) {
    case "MENSUAL":
      return ultimoPago.plus({ months: 1 });
  }
}
