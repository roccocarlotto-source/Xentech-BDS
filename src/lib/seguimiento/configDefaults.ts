// Defaults de ConfigSeguimiento que todavía no tenían una constante
// exportada (los otros -- intervalosDias, horaInicioEnvio, zonaHoraria --
// ya viven en envioScheduling.ts, usados por presupuesto.repository.ts).
// Separado en su propio archivo para no tocar envioScheduling.ts, que ya
// tiene tests contra sus constantes actuales.
//
// Mismos valores que los @default(...) de ConfigSeguimiento en
// prisma/schema.prisma -- si se cambian ahí, cambiar acá también.

export const HORA_FIN_ENVIO_DEFAULT = 20;
export const MAX_INTENTOS_DEFAULT = 3;
