import { Router } from "express";
import { authenticate } from "../middlewares/authenticate";
import { asyncHandler } from "../utils/asyncHandler";

// GET /api/me — expone el AuthContext que `authenticate` ya resolvió contra
// Postgres para este request. El frontend lo usa para saber quién sos
// (organización, rol, si sos platform admin) sin tener que decodificar el
// JWT de Supabase del lado del cliente. Mismo contrato que
// PlataformaCRM/src/controllers/me.controller.ts.
export const meRouter = Router();

meRouter.use(authenticate);

meRouter.get(
  "/api/me",
  asyncHandler(async (req, res) => {
    res.json(req.auth);
  }),
);
