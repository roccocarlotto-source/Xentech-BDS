import { Router } from "express";
import { authenticate } from "../middlewares/authenticate";
import { requireOrgAdmin } from "../middlewares/authorize";
import { asyncHandler } from "../utils/asyncHandler";
import { AppError } from "../utils/AppError";
import { upsertWhatsAppConnectionSchema } from "../schemas/whatsappConnection.schema";
import * as whatsappConnectionService from "../services/whatsappConnection.service";

// Fase 5: lo maneja el admin de la PROPIA organización (requireOrgAdmin),
// mismo criterio que agentConfig.ts -- conectar el número de WhatsApp es
// parte de configurar el agente de esa organización, no algo que haga
// Rocco desde el panel de plataforma.
export const whatsappConnectionRouter = Router();

whatsappConnectionRouter.use(authenticate, requireOrgAdmin);

whatsappConnectionRouter.get(
  "/api/whatsapp-connection",
  asyncHandler(async (req, res) => {
    const connection = await whatsappConnectionService.getConnection(req.auth!.organizationId);
    res.json(connection);
  }),
);

whatsappConnectionRouter.put(
  "/api/whatsapp-connection",
  asyncHandler(async (req, res) => {
    const input = upsertWhatsAppConnectionSchema.parse(req.body);
    try {
      const connection = await whatsappConnectionService.upsertConnection(
        req.auth!.organizationId,
        input,
      );
      res.json(connection);
    } catch (err) {
      // P2002 en phone_number_id = alguien ya cargó ese mismo número en OTRA
      // organización (es @unique) -- mensaje claro en vez del 500 genérico.
      if (esErrorDeUnicidad(err)) {
        throw new AppError("Ese número de WhatsApp ya está conectado a otra organización.", 409);
      }
      throw err;
    }
  }),
);

whatsappConnectionRouter.delete(
  "/api/whatsapp-connection",
  asyncHandler(async (req, res) => {
    await whatsappConnectionService.deleteConnection(req.auth!.organizationId);
    res.status(204).send();
  }),
);

function esErrorDeUnicidad(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: unknown }).code === "P2002"
  );
}
