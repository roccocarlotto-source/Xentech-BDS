import { Router } from "express";
import { authenticate } from "../middlewares/authenticate";
import { requireOrgAdmin } from "../middlewares/authorize";
import { requireAgentEnabled } from "../middlewares/requireAgentEnabled";
import { asyncHandler } from "../utils/asyncHandler";
import {
  generarLinkResenaSchema,
  listarResenasQuerySchema,
  moderarResenaSchema,
} from "../schemas/resena.schema";
import * as resenaService from "../services/resena.service";

// Etapa 3 de docs/seguimiento-resenas-diseno.md -- lado del panel. Solo
// para organizaciones con el módulo SEGUIMIENTO_RESENAS habilitado.
//
// Generar links y ver las reseñas: cualquier usuario de la organización (el
// vendedor es quien le manda el link al cliente). Moderar: solo el admin de
// la organización.
export const resenasRouter = Router();

resenasRouter.use("/api/resenas", authenticate, requireAgentEnabled("SEGUIMIENTO_RESENAS"));

resenasRouter.post(
  "/api/resenas/links",
  asyncHandler(async (req, res) => {
    const input = generarLinkResenaSchema.parse(req.body);
    res.status(201).json(await resenaService.generarLinkResena(req.auth!.organizationId, input));
  }),
);

resenasRouter.get(
  "/api/resenas",
  asyncHandler(async (req, res) => {
    const { moderacion } = listarResenasQuerySchema.parse(req.query);
    res.json(await resenaService.listarResenas(req.auth!.organizationId, moderacion));
  }),
);

resenasRouter.patch(
  "/api/resenas/:id/moderacion",
  requireOrgAdmin,
  asyncHandler(async (req, res) => {
    const input = moderarResenaSchema.parse(req.body);
    await resenaService.moderarResena(
      req.auth!.organizationId,
      req.params.id,
      req.auth!.userId,
      input,
    );
    res.status(204).end();
  }),
);
