import { Router } from "express";
import { authenticate } from "../middlewares/authenticate";
import { requireOrgAdmin } from "../middlewares/authorize";
import { asyncHandler } from "../utils/asyncHandler";
import { upsertConfigSeguimientoSchema } from "../schemas/configSeguimiento.schema";
import * as configSeguimientoService from "../services/configSeguimiento.service";

// Etapa 8: lo configura el admin de la PROPIA organización
// (`requireOrgAdmin`), no el admin de plataforma -- mismo criterio que
// agentConfig.ts y whatsappConnection.ts. Los intervalos, el horario y las
// plantillas de los emails son decisiones del negocio de cada cliente.
export const configSeguimientoRouter = Router();

configSeguimientoRouter.use(authenticate, requireOrgAdmin);

configSeguimientoRouter.get(
  "/api/config-seguimiento",
  asyncHandler(async (req, res) => {
    const config = await configSeguimientoService.obtenerConfig(req.auth!.organizationId);
    res.json(config);
  }),
);

configSeguimientoRouter.put(
  "/api/config-seguimiento",
  asyncHandler(async (req, res) => {
    const input = upsertConfigSeguimientoSchema.parse(req.body);
    const config = await configSeguimientoService.guardarConfig(req.auth!.organizationId, input);
    res.json(config);
  }),
);
