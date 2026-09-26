// Espejo de src/schemas/configSeguimiento.schema.ts y del service del
// backend (etapa 8 de docs/seguimiento-resenas-diseno.md).

export interface PlantillaEmail {
  asunto: string;
  cuerpo: string;
}

export interface PlantillaWhatsapp {
  nombre: string;
  idioma: string;
}

export interface ConfigSeguimiento {
  intervalosDias: number[];
  maxIntentos: number;
  horaInicioEnvio: number;
  horaFinEnvio: number;
  zonaHoraria: string;
  plantillas: { EMAIL: PlantillaEmail[]; WHATSAPP: PlantillaWhatsapp[] };
  diasValidezTokenResena: number;
  // false = nunca se guardó; lo que se muestra son los defaults con los que
  // el motor ya viene corriendo.
  personalizada: boolean;
  actualizadaEn: string | null;
}

export type ConfigSeguimientoInput = Omit<ConfigSeguimiento, "personalizada" | "actualizadaEn">;
