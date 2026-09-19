import assert from "node:assert/strict";
import { test } from "node:test";
import type { AgentConfig, Conversation, ConversationStatus, Message } from "@prisma/client";
import { handleIncomingMessage, type OrchestratorDeps } from "./orchestrator";
import type { LlmCompletionResult, LlmProvider } from "../../lib/llm/types";
import type { ToolResult } from "./tools";

const ORG_ID = "org-1";
const AGENT_CONFIG_ID = "agent-config-1";

function agentConfig(overrides: Partial<AgentConfig> = {}): AgentConfig {
  return {
    id: AGENT_CONFIG_ID,
    organizationId: ORG_ID,
    agentType: "WHATSAPP",
    instructions: "Sos el asistente de Xentech.",
    guardrails: {},
    enabledTools: [],
    modelProvider: "openrouter",
    modelName: "test-model",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as AgentConfig;
}

// Fakes en memoria de los repos -- nunca tocan Prisma, así este test corre
// sin necesitar el cliente de Prisma generado (a diferencia de otros tests
// de este repo que sí lo necesitan vía el monkeypatch del stub).
function crearDeps(overrides: {
  agentConfig?: AgentConfig | null;
  clienteIdPorTelefono?: Record<string, string>;
  llmProvider: LlmProvider;
  executeTool?: OrchestratorDeps["executeTool"];
}): OrchestratorDeps {
  const conversations = new Map<string, Conversation>();
  const messages: Message[] = [];
  let contadorId = 0;

  return {
    agentConfigRepository: {
      findByOrgAndType: async () => overrides.agentConfig ?? null,
    },
    conversationRepository: {
      findByThread: async (organizationId, agentConfigId, externalThreadId) => {
        const key = `${organizationId}:${agentConfigId}:${externalThreadId}`;
        return conversations.get(key) ?? null;
      },
      create: async (data) => {
        contadorId += 1;
        const conversation: Conversation = {
          id: `conv-${contadorId}`,
          organizationId: data.organizationId,
          agentConfigId: data.agentConfigId,
          clienteId: data.clienteId,
          externalThreadId: data.externalThreadId,
          status: "ACTIVE",
          lastMessageAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        conversations.set(
          `${data.organizationId}:${data.agentConfigId}:${data.externalThreadId}`,
          conversation,
        );
        return conversation;
      },
      setStatus: async (id: string, status: ConversationStatus) => {
        const conversation = [...conversations.values()].find((c) => c.id === id);
        if (!conversation) throw new Error("conversación no encontrada en el fake");
        conversation.status = status;
        return conversation;
      },
      touchLastMessageAt: async (id: string) => {
        const conversation = [...conversations.values()].find((c) => c.id === id);
        if (!conversation) throw new Error("conversación no encontrada en el fake");
        conversation.lastMessageAt = new Date();
        return conversation;
      },
    },
    messageRepository: {
      create: async (data) => {
        contadorId += 1;
        const mensaje = { id: `msg-${contadorId}`, createdAt: new Date(), ...data } as Message;
        messages.push(mensaje);
        return mensaje;
      },
      listByConversation: async (conversationId: string) =>
        messages.filter((m) => m.conversationId === conversationId),
    },
    knowledgeBaseEntryRepository: {
      listActive: async () => [],
    },
    clienteRepository: {
      findByTelefono: async (_organizationId: string, telefono: string) => {
        const clienteId = overrides.clienteIdPorTelefono?.[telefono];
        return clienteId ? ({ id: clienteId } as never) : null;
      },
    },
    executeTool:
      overrides.executeTool ?? (async (): Promise<ToolResult> => ({ ok: true, data: {} })),
  };
}

function llmQueDevuelve(resultados: LlmCompletionResult[]): LlmProvider {
  let i = 0;
  return {
    complete: async () => {
      const r = resultados[Math.min(i, resultados.length - 1)];
      i += 1;
      return r;
    },
  };
}

test("responde directo cuando el LLM no pide ninguna tool", async () => {
  const deps = crearDeps({
    agentConfig: agentConfig(),
    llmProvider: llmQueDevuelve([{ content: "Hola! ¿En qué te ayudo?", toolCalls: [] }]),
  });

  const resultado = await handleIncomingMessage(
    {
      organizationId: ORG_ID,
      agentType: "WHATSAPP",
      externalThreadId: "5491111111111",
      mensaje: "Hola",
      llmProvider: llmQueDevuelve([{ content: "Hola! ¿En qué te ayudo?", toolCalls: [] }]),
    },
    deps,
  );

  assert.equal(resultado.respuesta, "Hola! ¿En qué te ayudo?");
  assert.equal(resultado.derivadoAHumano, false);
  assert.equal(resultado.clienteId, null);
});

test("resuelve el clienteId por teléfono al crear la conversación, nunca desde el modelo", async () => {
  let clienteIdRecibidoPorLaTool: string | null = null;

  const deps = crearDeps({
    agentConfig: agentConfig({ enabledTools: ["consultar_mi_cuota"] }),
    clienteIdPorTelefono: { "5491111111111": "cliente-real" },
    llmProvider: llmQueDevuelve([]),
    executeTool: async (_name, _args, ctx) => {
      clienteIdRecibidoPorLaTool = ctx.clienteId;
      return { ok: true, data: {} };
    },
  });

  const llm = llmQueDevuelve([
    {
      content: null,
      toolCalls: [
        // Un modelo malicioso/con un bug intentando pisar el cliente --
        // el argumento clienteId ni siquiera existe en el schema de la
        // tool, así que esto no debería tener ningún efecto.
        {
          id: "call-1",
          name: "consultar_mi_cuota",
          arguments: { clienteId: "cliente-inventado-por-el-modelo" },
        },
      ],
    },
    { content: "Listo, ya te cuento.", toolCalls: [] },
  ]);

  const resultado = await handleIncomingMessage(
    {
      organizationId: ORG_ID,
      agentType: "WHATSAPP",
      externalThreadId: "5491111111111",
      telefonoCliente: "5491111111111",
      mensaje: "¿Cómo está mi cuota?",
      llmProvider: llm,
    },
    deps,
  );

  assert.equal(resultado.clienteId, "cliente-real");
  assert.equal(clienteIdRecibidoPorLaTool, "cliente-real");
});

test("una tool no habilitada se rechaza vía el gate, no llega a ejecutarse", async () => {
  let seEjecuto = false;

  const deps = crearDeps({
    agentConfig: agentConfig({ enabledTools: [] }), // consultar_mi_cuota NO habilitada
    clienteIdPorTelefono: { "5491111111111": "cliente-real" },
    llmProvider: llmQueDevuelve([]),
    executeTool: async () => {
      seEjecuto = true;
      return { ok: true, data: {} };
    },
  });

  const llm = llmQueDevuelve([
    { content: null, toolCalls: [{ id: "call-1", name: "consultar_mi_cuota", arguments: {} }] },
    { content: "No puedo ayudarte con eso.", toolCalls: [] },
  ]);

  await handleIncomingMessage(
    {
      organizationId: ORG_ID,
      agentType: "WHATSAPP",
      externalThreadId: "5491111111111",
      telefonoCliente: "5491111111111",
      mensaje: "¿Cómo está mi cuota?",
      llmProvider: llm,
    },
    deps,
  );

  assert.equal(seEjecuto, false);
});

test("solicitar_hablar_con_alguien deriva la conversación a un humano", async () => {
  const deps = crearDeps({
    agentConfig: agentConfig(),
    llmProvider: llmQueDevuelve([]),
  });

  const llm = llmQueDevuelve([
    {
      content: "Ya te derivo.",
      toolCalls: [
        { id: "call-1", name: "solicitar_hablar_con_alguien", arguments: { motivo: "reclamo" } },
      ],
    },
  ]);

  const resultado = await handleIncomingMessage(
    {
      organizationId: ORG_ID,
      agentType: "WHATSAPP",
      externalThreadId: "5491111111111",
      mensaje: "Quiero hablar con una persona",
      llmProvider: llm,
    },
    deps,
  );

  assert.equal(resultado.derivadoAHumano, true);
  assert.equal(resultado.respuesta, "Ya te derivo.");
});

test("si el modelo nunca deja de pedir tools, corta en MAX_TOOL_ROUNDS_PER_TURN y deriva a un humano", async () => {
  const deps = crearDeps({
    agentConfig: agentConfig({ enabledTools: ["consultar_mi_cuota"] }),
    clienteIdPorTelefono: { "5491111111111": "cliente-real" },
    llmProvider: llmQueDevuelve([]),
  });

  // El LLM SIEMPRE pide la misma tool, nunca da una respuesta final.
  const llm: LlmProvider = {
    complete: async () => ({
      content: null,
      toolCalls: [{ id: "call-loop", name: "consultar_mi_cuota", arguments: {} }],
    }),
  };

  const resultado = await handleIncomingMessage(
    {
      organizationId: ORG_ID,
      agentType: "WHATSAPP",
      externalThreadId: "5491111111111",
      telefonoCliente: "5491111111111",
      mensaje: "¿Cómo está mi cuota?",
      llmProvider: llm,
    },
    deps,
  );

  assert.equal(resultado.derivadoAHumano, true);
  assert.ok(resultado.respuesta.length > 0);
});

test("reutiliza la misma Conversation para el mismo externalThreadId", async () => {
  const deps = crearDeps({
    agentConfig: agentConfig(),
    llmProvider: llmQueDevuelve([]),
  });

  const llm = llmQueDevuelve([{ content: "ok", toolCalls: [] }]);

  const r1 = await handleIncomingMessage(
    {
      organizationId: ORG_ID,
      agentType: "WHATSAPP",
      externalThreadId: "5491111111111",
      mensaje: "primero",
      llmProvider: llm,
    },
    deps,
  );
  const r2 = await handleIncomingMessage(
    {
      organizationId: ORG_ID,
      agentType: "WHATSAPP",
      externalThreadId: "5491111111111",
      mensaje: "segundo",
      llmProvider: llm,
    },
    deps,
  );

  assert.equal(r1.conversationId, r2.conversationId);
});

test("tira AppError 409 si el agente no tiene AgentConfig todavía", async () => {
  const deps = crearDeps({ agentConfig: null, llmProvider: llmQueDevuelve([]) });

  await assert.rejects(
    handleIncomingMessage(
      {
        organizationId: ORG_ID,
        agentType: "WHATSAPP",
        externalThreadId: "5491111111111",
        mensaje: "hola",
        llmProvider: llmQueDevuelve([{ content: "hola", toolCalls: [] }]),
      },
      deps,
    ),
    (err: unknown) =>
      err instanceof Error && "status" in err && (err as { status: number }).status === 409,
  );
});
