import { z } from "zod";

// Etapa 3 de docs/seguimiento-resenas-diseno.md (reseñas).

// El token viaja en el BODY (no en la URL de la API) a propósito: así no
// queda en los logs de acceso (pino-http loguea req.url). La forma exacta se
// valida en el service con tieneFormatoDeToken(); acá solo se acota el largo
// para no procesar basura grande.
export const tokenResenaSchema = z.string().min(1).max(100);

export const validarTokenSchema = z.object({
  token: tokenResenaSchema,
});

export const COMENTARIO_MAX = 1000;

export const publicarResenaSchema = z.object({
  token: tokenResenaSchema,
  // §6.1: "Publicar como {Nombre}" / "Publicar como anónimo" -- obligatorio
  // elegir, sin default.
  anonimo: z.boolean(),
  estrellas: z.number().int().min(1).max(5),
  // Opcional; vacío o solo espacios = sin comentario.
  comentario: z
    .string()
    .trim()
    .max(COMENTARIO_MAX)
    .nullish()
    .transform((c) => (c ? c : null)),
});

export type PublicarResenaInput = z.infer<typeof publicarResenaSchema>;

export const generarLinkResenaSchema = z.object({
  clienteId: z.string().uuid(),
  presupuestoId: z.string().uuid().nullish(),
});

export const moderacionSchema = z.enum(["APROBADA", "RECHAZADA"]);

// §5: la moderación es SOLO para spam o contenido inapropiado -- rechazar
// exige dejar el motivo por escrito, así queda registro de por qué se ocultó.
export const moderarResenaSchema = z
  .object({
    moderacion: moderacionSchema,
    motivo: z.string().trim().max(500).nullish(),
  })
  .refine((v) => v.moderacion !== "RECHAZADA" || !!v.motivo, {
    message: "Para rechazar una reseña hay que indicar el motivo",
    path: ["motivo"],
  });

export const listarResenasQuerySchema = z.object({
  moderacion: moderacionSchema.optional(),
});

export const listadoPublicoQuerySchema = z.object({
  pagina: z.coerce.number().int().min(1).max(10_000).default(1),
});
