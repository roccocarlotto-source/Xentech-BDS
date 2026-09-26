import { Router } from "express";
import { authenticate } from "../middlewares/authenticate";
import { requireAgentEnabled } from "../middlewares/requireAgentEnabled";
import { asyncHandler } from "../utils/asyncHandler";
import * as panelSeguimientoService from "../services/panelSeguimiento.service";

// Etapa 7, parte 2 (§6.6): el panel de seguimiento. Mismo gate que las
// reseñas (`requireAgentEnabled("SEGUIMIENTO_RESENAS")`) y no
// `requireOrgAdmin`: mirar el estado de los presupuestos y pedir una reseña
// es trabajo del vendedor, no solo del admin.
export const panelSeguimientoRouter = Router();

panelSeguimientoRouter.use(
  "/api/seguimiento",
  authenticate,
  requireAgentEnabled("SEGUIMIENTO_RESENAS"),
);

panelSeguimientoRouter.get(
  "/api/seguimiento/presupuestos",
  asyncHandler(async (req, res) => {
    res.json(await panelSeguimientoService.listarPanel(req.auth!.organizationId));
  }),
);

panelSeguimientoRouter.post(
  "/api/seguimiento/presupuestos/:id/solicitar-resena",
  asyncHandler(async (req, res) => {
    const resultado = await panelSeguimientoService.solicitarResena(
      req.auth!.organizationId,
      req.params.id,
    );
    res.status(201).json(resultado);
  }),
);
