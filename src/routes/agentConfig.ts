import { Router } from "express";
import { authenticate } from "../middlewares/authenticate";
import { requireOrgAdmin } from "../middlewares/authorize";
import { asyncHandler } from "../utils/asyncHandler";
import { agentTypeSchema } from "../schemas/agentToggle.schema";
import { upsertAgentConfigSchema } from "../schemas/agentConfig.schema";
import { testMessageSchema } from "../schemas/agentTest.schema";
import * as agentConfigService from "../services/agentConfig.service";
import { handleIncomingMessage } from "../services/agent/orchestrator";
import { getLlmProvider } from "../lib/llm/provider";

// Fase 5: lo usa el admin de la PROPIA organización (requireOrgAdmin, no
// requirePlatformAdmin) para configurar el comportamiento de sus agentes --
// decisión de Rocco en docs/ai-agent-architecture.md §1.
export const agentConfigRouter = Router();

agentConfigRouter.use(authenticate, requireOrgAdmin);

agentConfigRouter.get(
  "/api/agent-config/:agentType",
  asyncHandler(async (req, res) => {
    const agentType = agentTypeSchema.parse(req.params.agentType);
    const config = await agentConfigService.getAgentConfig(req.auth!.organizationId, agentType);
    res.json(config);
  }),
);

agentConfigRouter.put(
  "/api/agent-config/:agentType",
  asyncHandler(async (req, res) => {
    const agentType = agentTypeSchema.parse(req.params.agentType);
    const input = upsertAgentConfigSchema.parse(req.body);
    const config = await agentConfigService.upsertAgentConfig(
      req.auth!.organizationId,
      agentType,
      input,
    );
    res.json(config);
  }),
);

// Endpoint interno de prueba (docs/ai-agent-architecture.md §9): deja
// mandarle un mensaje al agente y ver cómo responde SIN esperar a que la
// conexión real de WhatsApp esté lista (mismo criterio "web-channel-first"
// que PlataformaCRM). Solo el admin de la organización puede usarlo.
agentConfigRouter.post(
  "/api/agent-config/:agentType/test-message",
  asyncHandler(async (req, res) => {
    const agentType = agentTypeSchema.parse(req.params.agentType);
    const input = testMessageSchema.parse(req.body);
    const resultado = await handleIncomingMessage({
      organizationId: req.auth!.organizationId,
      agentType,
      externalThreadId: input.externalThreadId,
      telefonoCliente: input.telefono,
      mensaje: input.mensaje,
      llmProvider: getLlmProvider(),
    });
    res.json(resultado);
  }),
);
