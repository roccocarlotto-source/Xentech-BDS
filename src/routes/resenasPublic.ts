import cors from "cors";
import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { asyncHandler } from "../utils/asyncHandler";
import {
  listadoPublicoQuerySchema,
  publicarResenaSchema,
  validarTokenSchema,
} from "../schemas/resena.schema";
import * as resenaService from "../services/resena.service";

// Etapa 3 de docs/seguimiento-resenas-diseno.md -- rutas PÚBLICAS, sin
// `authenticate`: la identidad la da el token del link (§6.1), o no hace
// falta (listado de reseñas aprobadas).
//
// El token va en el body de un POST, nunca en la URL de la API, para que no
// quede en los logs de acceso.
export const resenasPublicRouter = Router();

// Además del límite genérico por IP de toda la API: publicar es la única
// escritura sin sesión del sistema.
const limitePublicar = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Demasiados intentos. Probá de nuevo en unos minutos." },
});

resenasPublicRouter.post(
  "/api/public/resenas/formulario",
  asyncHandler(async (req, res) => {
    const { token } = validarTokenSchema.parse(req.body);
    res.json(await resenaService.obtenerFormularioPublico(token));
  }),
);

resenasPublicRouter.post(
  "/api/public/resenas",
  limitePublicar,
  asyncHandler(async (req, res) => {
    const input = publicarResenaSchema.parse(req.body);
    await resenaService.publicarResena(input);
    res.status(201).json({ ok: true });
  }),
);

// Listado de reseñas aprobadas para la web pública de la empresa (otro
// dominio): CORS abierto SOLO en esta ruta -- es de solo lectura, sin
// credenciales, y devuelve únicamente datos ya publicados. El resto de la
// API sigue con la lista de orígenes de CORS_ORIGINS.
resenasPublicRouter.get(
  "/api/public/organizaciones/:slug/resenas",
  cors({ origin: "*" }),
  asyncHandler(async (req, res) => {
    const { pagina } = listadoPublicoQuerySchema.parse(req.query);
    res.json(await resenaService.listarResenasPublicas(req.params.slug, pagina));
  }),
);
