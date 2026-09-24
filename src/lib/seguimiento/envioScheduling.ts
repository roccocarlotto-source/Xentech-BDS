import { DateTime } from "luxon";

// Etapa 5, paso 1 de docs/seguimiento-resenas-diseno.md (§6.3): calcula los
// `Envio` de email a programar cuando se crea un `Presupuesto`.
//
// §4 describe `ConfigSeguimiento.intervalosDias` como "días entre el envío
// del presupuesto y cada paso de seguimiento" -- son offsets desde UNA
// MISMA fecha de referencia (no se suman entre sí: [2, 7, 15] son los días
// 2, 7 y 15, no 2, 9 y 24), consistente con que
// `configSeguimiento.schema.ts` exige que sean estrictamente crecientes.
//
// Puro a propósito -- no toca Prisma ni `new Date()` directamente (recibe
// fechaReferencia ya resuelta), para poder testear la cuenta de días sin
// DB. Quién LLAMA a esto (presupuesto.repository.ts) decide la fecha de
// referencia y de dónde sale la config.

export const INTERVALOS_DIAS_DEFAULT: readonly number[] = [2, 7, 15];
export const HORA_INICIO_ENVIO_DEFAULT = 9;
export const ZONA_HORARIA_DEFAULT = "America/Montevideo";

export interface EnvioEmailAProgramar {
  paso: number;
  canal: "EMAIL";
  programadoPara: Date;
  claveIdempotencia: string;
}

export interface CalcularEnviosEmailParams {
  presupuestoId: string;
  // §6.3: la referencia es "el envío del presupuesto" -- fechaEmision del
  // documento si se pudo extraer/cargar, o el momento en que se cargó el
  // presupuesto al sistema si no (decisión propia, a confirmar por Rocco;
  // ver el comentario en presupuesto.repository.ts).
  fechaReferencia: Date;
  intervalosDias?: readonly number[];
  horaInicioEnvio?: number;
  zonaHoraria?: string;
}

// claveIdempotencia = "<presupuestoId>:<paso>:<canal>" (comentario del
// modelo Envio en prisma/schema.prisma) -- único por fila, así que
// programar dos veces el mismo presupuesto (dos requests concurrentes, un
// reintento) choca en la base en vez de duplicar filas.
export function calcularEnviosEmail({
  presupuestoId,
  fechaReferencia,
  intervalosDias = INTERVALOS_DIAS_DEFAULT,
  horaInicioEnvio = HORA_INICIO_ENVIO_DEFAULT,
  zonaHoraria = ZONA_HORARIA_DEFAULT,
}: CalcularEnviosEmailParams): EnvioEmailAProgramar[] {
  const base = DateTime.fromJSDate(fechaReferencia, { zone: zonaHoraria });

  return intervalosDias.map((dias, indice) => {
    const paso = indice + 1;
    const programadoPara = base
      .plus({ days: dias })
      .set({ hour: horaInicioEnvio, minute: 0, second: 0, millisecond: 0 })
      .toJSDate();

    return {
      paso,
      canal: "EMAIL",
      programadoPara,
      claveIdempotencia: `${presupuestoId}:${paso}:EMAIL`,
    };
  });
}
