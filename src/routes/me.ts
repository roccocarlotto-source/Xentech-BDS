import { Router } from "express";
import { authenticate } from "../middlewares/authenticate";
import { agentToggleRepository } from "../repositories/agentToggle.repository";
import { asyncHandler } from "../utils/asyncHandler";

// GET /api/me — expone el AuthContext que `authenticate` ya resolvió contra
// Postgres para este request. El frontend lo usa para saber quién sos
// (organización, rol, si sos platform admin) sin tener que decodificar el
// JWT de Supabase del lado del cliente. Mismo contrato que
// PlataformaCRM/src/controllers/me.controller.ts.
//
// `agentesHabilitados`: los AgentType con el toggle prendido para la
// organización -- el frontend lo usa para mostrar u ocultar módulos (ej.
// Reseñas). Se calcula acá y no en `authenticate` para no sumar una query a
// cada request de la API. Vacío para un platform admin.
export const meRouter = Router();

meRouter.use(authenticate);

meRouter.get(
  "/api/me",
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const agentesHabilitados =
      auth.isPlatformAdmin || !auth.organizationId
        ? []
        : await agentToggleRepository.listEnabled(auth.organizationId);
    res.json({ ...auth, agentesHabilitados });
  }),
);
