import type { PresupuestoEstado } from "@prisma/client";

// Etapa 5, paso 2 (§6.3, punto 2): las verificaciones que corren ANTES de
// mandar cada `Envio` vencido. Puro (recibe todo resuelto, no toca Prisma)
// para poder testear las reglas sin DB -- mismo criterio que
// envioScheduling.ts.
//
// §6.3 dice, en este orden: "el presupuesto siga abierto (pendiente o
// en_seguimiento); no haya baja para ese canal; exista consentimiento
// válido para el canal; no se haya superado el máximo de intentos." Acá
// "no haya baja" y "consentimiento válido" son la MISMA fila de
// Consentimiento (canal EMAIL): baja = esa fila con bajaEn seteado: no hay
// una fila de baja separada (comentario de Consentimiento en
// prisma/schema.prisma -- "BAJA" no es un origen de consentimiento, es un
// evento sobre uno ya otorgado).

export const PRESUPUESTO_ABIERTO: readonly PresupuestoEstado[] = ["PENDIENTE", "EN_SEGUIMIENTO"];

export interface ConsentimientoEmailVigente {
  bajaEn: Date | null;
}

export interface EvaluarPrecondicionesEnvioInput {
  presupuestoEstado: PresupuestoEstado;
  clienteEmail: string | null;
  // null = nunca se otorgó consentimiento de email para este presupuesto.
  // No debería pasar en la práctica (presupuesto.repository.ts lo crea
  // siempre, §5), pero el job no confía en eso -- lo trata como "sin
  // consentimiento válido", no como un bug que tira la corrida entera.
  consentimiento: ConsentimientoEmailVigente | null;
  // Intentos de ESTA fila de Envio, ya contando el intento actual (el job
  // incrementa `intentos` al reclamar la fila, antes de llamar a esto --
  // ver envioJob.ts).
  intentos: number;
  maxIntentos: number;
}

export type PrecondicionEnvioResultado =
  | { puedeEnviar: true }
  // CANCELADO: nunca va a poder enviarse (el presupuesto se cerró, hubo
  // baja, o no hay consentimiento/email) -- no tiene sentido reintentar.
  | { puedeEnviar: false; estadoFinal: "CANCELADO"; motivo: string }
  // FALLIDO: se agotaron los reintentos de un problema que en principio
  // podía resolverse solo (falla transitoria del proveedor de email).
  | { puedeEnviar: false; estadoFinal: "FALLIDO"; motivo: string };

export function evaluarPrecondicionesEnvio(
  input: EvaluarPrecondicionesEnvioInput,
): PrecondicionEnvioResultado {
  if (!PRESUPUESTO_ABIERTO.includes(input.presupuestoEstado)) {
    return {
      puedeEnviar: false,
      estadoFinal: "CANCELADO",
      motivo: `el presupuesto ya no está abierto (estado ${input.presupuestoEstado})`,
    };
  }

  if (!input.clienteEmail) {
    return {
      puedeEnviar: false,
      estadoFinal: "CANCELADO",
      motivo: "el cliente no tiene email cargado",
    };
  }

  if (!input.consentimiento) {
    return {
      puedeEnviar: false,
      estadoFinal: "CANCELADO",
      motivo: "no hay consentimiento de email registrado para este presupuesto",
    };
  }

  if (input.consentimiento.bajaEn) {
    return {
      puedeEnviar: false,
      estadoFinal: "CANCELADO",
      motivo: "el cliente se dio de baja del seguimiento por email",
    };
  }

  if (input.intentos > input.maxIntentos) {
    return {
      puedeEnviar: false,
      estadoFinal: "FALLIDO",
      motivo: `se superó el máximo de intentos (${input.maxIntentos})`,
    };
  }

  return { puedeEnviar: true };
}
