import { DateTime } from "luxon";

// §6.3: "Zona horaria America/Montevideo. No enviar fuera de horario
// razonable (ej. 9-20h), configurable." -- horaFinEnvio es EXCLUSIVE
// (comentario de ConfigSeguimiento en prisma/schema.prisma: "con 9 y 20,
// nada sale antes de las 9:00 ni desde las 20:00"), así que el chequeo es
// `hora >= inicio && hora < fin`. Puro (recibe la hora "ahora" ya
// resuelta), mismo criterio que el resto de src/lib/seguimiento/.
export function estaDentroDeVentanaDeEnvio(
  ahora: Date,
  zonaHoraria: string,
  horaInicioEnvio: number,
  horaFinEnvio: number,
): boolean {
  const hora = DateTime.fromJSDate(ahora, { zone: zonaHoraria }).hour;
  return hora >= horaInicioEnvio && hora < horaFinEnvio;
}
