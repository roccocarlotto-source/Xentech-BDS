import assert from "node:assert/strict";
import { test } from "node:test";
import { processNextAgentInboundJob, type InboundJobProcessorDeps } from "./inboundJobProcessor";

function jobBase() {
  return {
    id: "job-1",
    organizationId: "org-1",
    agentType: "WHATSAPP" as const,
    externalThreadId: "+59899123456",
    telefonoCliente: "+59899123456",
    mensaje: "hola",
    externalMessageId: "wamid.123",
    status: "PROCESSING" as const,
    attempts: 1,
    lastError: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    processedAt: null,
  };
}

function depsBase(overrides: Partial<InboundJobProcessorDeps> = {}): InboundJobProcessorDeps {
  const done: string[] = [];
  const failed: Array<{ id: string; error: string }> = [];

  return {
    claimNextPending: async () => jobBase(),
    markDone: async (id: string) => {
      done.push(id);
      return jobBase();
    },
    markFailed: async (id: string, error: string) => {
      failed.push({ id, error });
      return jobBase();
    },
    findWhatsAppConnectionByOrg: async () => null,
    handleIncomingMessage: async () => ({
      respuesta: "tu cuota está al día",
      conversationId: "conv-1",
      clienteId: "cliente-1",
      derivadoAHumano: false,
    }),
    decryptToken: () => "token-desencriptado",
    sendWhatsAppTextMessage: async () => ({ messageId: "wamid.out.1" }),
    getLlmProvider: () => ({}) as never,
    ...overrides,
  };
}

test("sin jobs pendientes -> devuelve false, no llama a nada más", async () => {
  let llamadoHandle = false;
  const deps = depsBase({
    claimNextPending: async () => null,
    handleIncomingMessage: async () => {
      llamadoHandle = true;
      throw new Error("no debería llamarse");
    },
  });

  const resultado = await processNextAgentInboundJob(deps);

  assert.equal(resultado, false);
  assert.equal(llamadoHandle, false);
});

test("job WHATSAPP con conexión CONNECTED -> manda el mensaje real y marca DONE", async () => {
  const enviados: unknown[] = [];
  const marcadosDone: string[] = [];

  const deps = depsBase({
    findWhatsAppConnectionByOrg: async () => ({
      id: "conn-1",
      organizationId: "org-1",
      phoneNumberId: "1234567890",
      wabaId: "waba-1",
      displayPhoneNumber: null,
      accessTokenEncrypted: "encriptado",
      status: "CONNECTED",
      createdAt: new Date(),
      updatedAt: new Date(),
    }),
    sendWhatsAppTextMessage: async (params) => {
      enviados.push(params);
      return { messageId: "wamid.out.1" };
    },
    markDone: async (id) => {
      marcadosDone.push(id);
      return jobBase();
    },
  });

  const resultado = await processNextAgentInboundJob(deps);

  assert.equal(resultado, true);
  assert.equal(enviados.length, 1);
  assert.deepEqual(enviados[0], {
    phoneNumberId: "1234567890",
    accessToken: "token-desencriptado",
    to: "+59899123456",
    text: "tu cuota está al día",
  });
  assert.deepEqual(marcadosDone, ["job-1"]);
});

test("job WHATSAPP sin conexión CONNECTED -> no intenta mandar nada, igual marca DONE", async () => {
  let llamadoEnvio = false;
  const deps = depsBase({
    findWhatsAppConnectionByOrg: async () => null,
    sendWhatsAppTextMessage: async () => {
      llamadoEnvio = true;
      return { messageId: "no-deberia-pasar" };
    },
  });

  const resultado = await processNextAgentInboundJob(deps);

  assert.equal(resultado, true);
  assert.equal(llamadoEnvio, false);
});

test("si el orquestador tira, el job se marca FAILED con el error (no queda colgado)", async () => {
  const fallados: Array<{ id: string; error: string }> = [];
  const deps = depsBase({
    handleIncomingMessage: async () => {
      throw new Error("el proveedor de LLM está caído");
    },
    markFailed: async (id, error) => {
      fallados.push({ id, error });
      return jobBase();
    },
  });

  const resultado = await processNextAgentInboundJob(deps);

  assert.equal(resultado, true);
  assert.deepEqual(fallados, [{ id: "job-1", error: "el proveedor de LLM está caído" }]);
});

test("si el envío por Graph API falla, el job se marca FAILED (no DONE a medias)", async () => {
  const fallados: Array<{ id: string; error: string }> = [];
  let llamadoDone = false;
  const deps = depsBase({
    findWhatsAppConnectionByOrg: async () => ({
      id: "conn-1",
      organizationId: "org-1",
      phoneNumberId: "1234567890",
      wabaId: "waba-1",
      displayPhoneNumber: null,
      accessTokenEncrypted: "encriptado",
      status: "CONNECTED",
      createdAt: new Date(),
      updatedAt: new Date(),
    }),
    sendWhatsAppTextMessage: async () => {
      throw new Error("Graph API respondió 401");
    },
    markDone: async () => {
      llamadoDone = true;
      return jobBase();
    },
    markFailed: async (id, error) => {
      fallados.push({ id, error });
      return jobBase();
    },
  });

  const resultado = await processNextAgentInboundJob(deps);

  assert.equal(resultado, true);
  assert.equal(llamadoDone, false);
  assert.deepEqual(fallados, [{ id: "job-1", error: "Graph API respondió 401" }]);
});
