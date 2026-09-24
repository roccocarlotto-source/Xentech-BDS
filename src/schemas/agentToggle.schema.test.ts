import assert from "node:assert/strict";
import { test } from "node:test";
import { agentTypeSchema, setAgentToggleSchema } from "./agentToggle.schema";

test("agentTypeSchema acepta todos los AgentType del schema de Prisma", () => {
  for (const tipo of ["WHATSAPP", "DATABASE_MANAGEMENT", "REMINDERS", "SEGUIMIENTO_RESENAS"]) {
    assert.equal(agentTypeSchema.parse(tipo), tipo);
  }
});

test("agentTypeSchema rechaza un valor inventado", () => {
  assert.throws(() => agentTypeSchema.parse("FACTURACION"));
});

test("setAgentToggleSchema exige enabled booleano", () => {
  assert.deepEqual(setAgentToggleSchema.parse({ enabled: true }), { enabled: true });
  assert.throws(() => setAgentToggleSchema.parse({ enabled: "true" }));
  assert.throws(() => setAgentToggleSchema.parse({}));
});
