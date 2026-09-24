import { z } from "zod";

// Forma de ConfigSeguimiento (prisma/schema.prisma, etapa 2 de
// docs/seguimiento-resenas-diseno.md). Lo que Prisma no puede expresar
// —intervalos crecientes, horario coherente, zona horaria real, forma de
// las plantillas— se valida acá, igual que guardrailsSchema en
// agentConfig.schema.ts.

function esZonaHorariaValida(zona: string): boolean {
  try {
    new Intl.DateTimeFormat("es-UY", { timeZone: zona });
    return true;
  } catch {
    return false;
  }
}

// Email: texto libre por paso. La línea de baja (§5 del diseño) NO va en la
// plantilla: la agrega el motor de envío a todo email, para que ninguna
// plantilla pueda omitirla.
const plantillaEmailSchema = z.object({
  asunto: z.string().trim().min(1).max(200),
  cuerpo: z.string().trim().min(1).max(5000),
});

// WhatsApp fuera de la ventana de 24 h solo admite plantillas aprobadas por
// Meta (§6.4): acá se guarda el nombre y el idioma con que están registradas
// en Meta, no el texto.
const plantillaWhatsappSchema = z.object({
  nombre: z
    .string()
    .trim()
    .regex(/^[a-z0-9_]{1,512}$/, "nombre de plantilla de Meta: minúsculas, números y _"),
  idioma: z.string().trim().min(2).max(10).default("es"),
});

// Una entrada por paso, en el mismo orden que intervalosDias.
export const plantillasSeguimientoSchema = z.object({
  EMAIL: z.array(plantillaEmailSchema).max(10).default([]),
  WHATSAPP: z.array(plantillaWhatsappSchema).max(10).default([]),
});

export const upsertConfigSeguimientoSchema = z
  .object({
    intervalosDias: z
      .array(z.number().int().min(1).max(365))
      .min(1)
      .max(10)
      .refine(
        (dias) => dias.every((d, i) => i === 0 || d > dias[i - 1]),
        "los intervalos tienen que ser estrictamente crecientes",
      )
      .default([2, 7, 15]),
    maxIntentos: z.number().int().min(1).max(10).default(3),
    horaInicioEnvio: z.number().int().min(0).max(23).default(9),
    horaFinEnvio: z.number().int().min(1).max(24).default(20),
    zonaHoraria: z
      .string()
      .trim()
      .refine(esZonaHorariaValida, "zona horaria IANA inválida")
      .default("America/Montevideo"),
    plantillas: plantillasSeguimientoSchema.optional().default({}),
    diasValidezTokenResena: z.number().int().min(1).max(365).default(30),
  })
  .refine((c) => c.horaInicioEnvio < c.horaFinEnvio, {
    message: "horaInicioEnvio tiene que ser menor que horaFinEnvio",
    path: ["horaFinEnvio"],
  })
  .refine(
    (c) =>
      c.plantillas.EMAIL.length <= c.intervalosDias.length &&
      c.plantillas.WHATSAPP.length <= c.intervalosDias.length,
    {
      message: "hay más plantillas que pasos en intervalosDias",
      path: ["plantillas"],
    },
  );

export type PlantillasSeguimiento = z.infer<typeof plantillasSeguimientoSchema>;
export type UpsertConfigSeguimientoInput = z.infer<typeof upsertConfigSeguimientoSchema>;
