import { Router } from "express";
import { authenticate } from "../middlewares/authenticate";
import { requireOrgAdmin } from "../middlewares/authorize";
import { asyncHandler } from "../utils/asyncHandler";
import { updateUserPermissionsSchema } from "../schemas/userPermissions.schema";
import * as userService from "../services/user.service";

// Fase 5, paso 4: lo usa el admin de la organización para ver a sus
// usuarios y otorgarles (o quitarles) el permiso de inbox. Mismo gate que
// AgentConfig/KnowledgeBaseEntry -- solo el admin de la PROPIA
// organización, nunca el platform admin.
export const usersRouter = Router();

usersRouter.use(authenticate, requireOrgAdmin);

usersRouter.get(
  "/api/users",
  asyncHandler(async (req, res) => {
    res.json(await userService.listOrgUsers(req.auth!.organizationId));
  }),
);

usersRouter.patch(
  "/api/users/:userId/permissions",
  asyncHandler(async (req, res) => {
    const input = updateUserPermissionsSchema.parse(req.body);
    const user = await userService.updateUserPermissions(
      req.auth!.organizationId,
      req.params.userId,
      input,
    );
    res.json(user);
  }),
);
