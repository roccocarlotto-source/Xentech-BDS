import { Router } from "express";
import { authenticate } from "../middlewares/authenticate";
import { requireInboxAccess } from "../middlewares/authorize";
import { asyncHandler } from "../utils/asyncHandler";
import {
  conversationReplySchema,
  conversationStatusFilterSchema,
  conversationStatusSchema,
} from "../schemas/conversation.schema";
import * as conversationService from "../services/conversation.service";

// Fase 5, paso 4: inbox de conversaciones derivadas a un humano
// (docs/ai-agent-architecture.md §8). requireInboxAccess -- el admin de la
// organización siempre entra, un MEMBER solo si tiene el permiso otorgado
// (ver src/routes/users.ts).
export const conversationsRouter = Router();

conversationsRouter.use(authenticate, requireInboxAccess);

conversationsRouter.get(
  "/api/conversations",
  asyncHandler(async (req, res) => {
    const status = req.query.status
      ? conversationStatusFilterSchema.parse(req.query.status)
      : undefined;
    res.json(await conversationService.listConversations(req.auth!.organizationId, status));
  }),
);

conversationsRouter.get(
  "/api/conversations/:id",
  asyncHandler(async (req, res) => {
    res.json(
      await conversationService.getConversationDetail(req.auth!.organizationId, req.params.id),
    );
  }),
);

conversationsRouter.post(
  "/api/conversations/:id/reply",
  asyncHandler(async (req, res) => {
    const input = conversationReplySchema.parse(req.body);
    const message = await conversationService.replyToConversation(
      req.auth!.organizationId,
      req.params.id,
      req.auth!.userId,
      input.mensaje,
    );
    res.status(201).json(message);
  }),
);

conversationsRouter.patch(
  "/api/conversations/:id/status",
  asyncHandler(async (req, res) => {
    const input = conversationStatusSchema.parse(req.body);
    const conversation = await conversationService.setConversationStatus(
      req.auth!.organizationId,
      req.params.id,
      input.status,
    );
    res.json(conversation);
  }),
);
