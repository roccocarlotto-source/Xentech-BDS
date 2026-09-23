import type { AgentType } from "@prisma/client";
import { agentInboundJobRepository } from "../../repositories/agentInboundJob.repository";
import { whatsappConnectionRepository } from "../../repositories/whatsappConnection.repository";
import {
  handleIncomingMessage,
  type HandleIncomingMessageResult,
} from "../../services/agent/orchestrator";
import { getLlmProvider } from "../llm/provider";
import type { LlmProvider } from "../llm/types";
import { decryptToken } from "./tokenCrypto";
import { sendWhatsAppTextMessage } from "./graphApiClient";

// Tipos "planos" (no `typeof prisma...`) a propósito -- el tipo real que
// devuelve Prisma Client (Prisma__XClient, encadenable) no lo puede
// implementar un fake de test sin depender del runtime de Prisma. Mismo
// motivo que OrchestratorDeps en orchestrator.ts.
export interface AgentInboundJobRecord {
  id: string;
  organizationId: string;
  agentType: AgentType;
  externalThreadId: string;
  telefonoCliente: string | null;
  mensaje: string;
  externalMessageId: string;
}

export interface WhatsAppConnectionRecord {
  phoneNumberId: string;
  accessTokenEncrypted: string;
  status: string;
}

// Procesa UN job pendiente de la cola (docs/ai-agent-architecture.md §4,
// ver el comentario de AgentInboundJob en schema.prisma sobre el diseño
// de "tabla + poller"). Separado del poller (inboundJobPoller.ts) para
// poder testear el procesamiento de un job sin un setInterval de por
// medio.
//
// Deps inyectables -- mismo patrón que OrchestratorDeps en
// orchestrator.ts, para poder testear sin Prisma/red real.
export interface InboundJobProcessorDeps {
  claimNextPending: () => Promise<AgentInboundJobRecord | null>;
  markDone: (id: string) => Promise<unknown>;
  markFailed: (id: string, error: string) => Promise<unknown>;
  findWhatsAppConnectionByOrg: (organizationId: string) => Promise<WhatsAppConnectionRecord | null>;
  handleIncomingMessage: (params: {
    organizationId: string;
    agentType: AgentType;
    externalThreadId: string;
    telefonoCliente?: string;
    mensaje: string;
    llmProvider: LlmProvider;
    externalMessageId?: string;
  }) => Promise<HandleIncomingMessageResult>;
  decryptToken: (encrypted: string) => string;
  sendWhatsAppTextMessage: (params: {
    phoneNumberId: string;
    accessToken: string;
    to: string;
    text: string;
  }) => Promise<{ messageId: string }>;
  getLlmProvider: () => LlmProvider;
}

const defaultDeps: InboundJobProcessorDeps = {
  claimNextPending: () => agentInboundJobRepository.claimNextPending(),
  markDone: (id) => agentInboundJobRepository.markDone(id),
  markFailed: (id, error) => agentInboundJobRepository.markFailed(id, error),
  findWhatsAppConnectionByOrg: (organizationId) =>
    whatsappConnectionRepository.findByOrganizationId(organizationId),
  handleIncomingMessage: (params) => handleIncomingMessage(params),
  decryptToken: (text) => decryptToken(text),
  sendWhatsAppTextMessage: (params) => sendWhatsAppTextMessage(params),
  getLlmProvider: () => getLlmProvider(),
};

// true = procesó un job (haya salido bien o mal), false = no había nada
// pendiente. El caller (el poller) usa el valor de retorno para decidir si
// seguir procesando en el mismo tick o esperar al siguiente.
export async function processNextAgentInboundJob(
  deps: InboundJobProcessorDeps = defaultDeps,
): Promise<boolean> {
  const job = await deps.claimNextPending();
  if (!job) return false;

  try {
    const resultado = await deps.handleIncomingMessage({
      organizationId: job.organizationId,
      agentType: job.agentType,
      externalThreadId: job.externalThreadId,
      telefonoCliente: job.telefonoCliente ?? undefined,
      mensaje: job.mensaje,
      llmProvider: deps.getLlmProvider(),
      externalMessageId: job.externalMessageId,
    });

    // El envío real por WhatsApp pasa ACÁ, no en el handler del webhook
    // (§4) -- solo para el canal WHATSAPP, y solo si la organización
    // efectivamente tiene una conexión CONNECTED (podría no tenerla más
    // si se desconectó entre que se encoló el job y que se procesa).
    if (job.agentType === "WHATSAPP") {
      const connection = await deps.findWhatsAppConnectionByOrg(job.organizationId);
      if (connection?.status === "CONNECTED") {
        const accessToken = deps.decryptToken(connection.accessTokenEncrypted);
        await deps.sendWhatsAppTextMessage({
          phoneNumberId: connection.phoneNumberId,
          accessToken,
          to: job.externalThreadId,
          text: resultado.respuesta,
        });
      }
    }

    await deps.markDone(job.id);
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : String(err);
    await deps.markFailed(job.id, mensaje);
  }

  return true;
}
