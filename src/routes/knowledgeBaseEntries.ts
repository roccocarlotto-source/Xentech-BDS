import { Router } from "express";
import { authenticate } from "../middlewares/authenticate";
import { requireOrgAdmin } from "../middlewares/authorize";
import { asyncHandler } from "../utils/asyncHandler";
import {
  createKnowledgeBaseEntrySchema,
  updateKnowledgeBaseEntrySchema,
} from "../schemas/knowledgeBaseEntry.schema";
import * as knowledgeBaseEntryService from "../services/knowledgeBaseEntry.service";

// Base de conocimiento v1 (docs/ai-agent-architecture.md §10): la
// administra el admin de la organización, org-wide (no por tipo de agente
// todavía -- ver comentario en prisma/schema.prisma).
export const knowledgeBaseEntriesRouter = Router();

knowledgeBaseEntriesRouter.use(authenticate, requireOrgAdmin);

knowledgeBaseEntriesRouter.get(
  "/api/knowledge-base-entries",
  asyncHandler(async (req, res) => {
    res.json(await knowledgeBaseEntryService.listKnowledgeBaseEntries(req.auth!.organizationId));
  }),
);

knowledgeBaseEntriesRouter.get(
  "/api/knowledge-base-entries/:id",
  asyncHandler(async (req, res) => {
    res.json(
      await knowledgeBaseEntryService.getKnowledgeBaseEntry(
        req.auth!.organizationId,
        req.params.id,
      ),
    );
  }),
);

knowledgeBaseEntriesRouter.post(
  "/api/knowledge-base-entries",
  asyncHandler(async (req, res) => {
    const input = createKnowledgeBaseEntrySchema.parse(req.body);
    const entry = await knowledgeBaseEntryService.createKnowledgeBaseEntry(
      req.auth!.organizationId,
      input,
    );
    res.status(201).json(entry);
  }),
);

knowledgeBaseEntriesRouter.patch(
  "/api/knowledge-base-entries/:id",
  asyncHandler(async (req, res) => {
    const input = updateKnowledgeBaseEntrySchema.parse(req.body);
    const entry = await knowledgeBaseEntryService.updateKnowledgeBaseEntry(
      req.auth!.organizationId,
      req.params.id,
      input,
    );
    res.json(entry);
  }),
);

knowledgeBaseEntriesRouter.delete(
  "/api/knowledge-base-entries/:id",
  asyncHandler(async (req, res) => {
    await knowledgeBaseEntryService.deleteKnowledgeBaseEntry(
      req.auth!.organizationId,
      req.params.id,
    );
    res.status(204).send();
  }),
);
