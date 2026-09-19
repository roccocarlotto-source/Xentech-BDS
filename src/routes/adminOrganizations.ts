import { Router } from "express";
import { authenticate } from "../middlewares/authenticate";
import { requirePlatformAdmin } from "../middlewares/authorize";
import { asyncHandler } from "../utils/asyncHandler";
import { agentTypeSchema, setAgentToggleSchema } from "../schemas/agentToggle.schema";
import * as agentToggleService from "../services/agentToggle.service";

// Panel de admin de plataforma (Fase 4): listar organizaciones y
// habilitar/deshabilitar agentes de IA por una. Sin lógica funcional de
// ningún agente todavía — eso es Fase 5. Solo un PlatformAdmin puede entrar
// acá (requirePlatformAdmin, después de authenticate).
export const adminOrganizationsRouter = Router();

adminOrganizationsRouter.use(authenticate, requirePlatformAdmin);

adminOrganizationsRouter.get(
  "/api/admin/organizations",
  asyncHandler(async (_req, res) => {
    res.json(await agentToggleService.listOrganizationsWithToggles());
  }),
);

adminOrganizationsRouter.put(
  "/api/admin/organizations/:organizationId/agent-toggles/:agentType",
  asyncHandler(async (req, res) => {
    const agentType = agentTypeSchema.parse(req.params.agentType);
    const { enabled } = setAgentToggleSchema.parse(req.body);
    await agentToggleService.setAgentToggle(req.params.organizationId, agentType, enabled);
    res.status(204).send();
  }),
);
