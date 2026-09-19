import assert from "node:assert/strict";
import { test } from "node:test";
import {
  agentToolNameSchema,
  guardrailsSchema,
  upsertAgentConfigSchema,
} from "./agentConfig.schema";

test("agentToolNameSchema acepta las 5 tools del catálogo v1", () => {
  for (const nombre of [
    "consultar_mi_cuota",
    "consultar_mis_datos",
    "actualizar_mi_telefono",
    "actualizar_mi_email",
    "solicitar_hablar_con_alguien",
  ]) {
    assert.equal(agentToolNameSchema.parse(nombre), nombre);
  }
});

test("agentToolNameSchema rechaza una tool inventada -- nunca una tool genérica", () => {
  assert.throws(() => agentToolNameSchema.parse("borrar_cliente"));
});

test("guardrailsSchema rellena arrays vacíos por defecto", () => {
  const resultado = guardrailsSchema.parse({});
  assert.deepEqual(resultado, {
    temasProhibidos: [],
    accionesProhibidas: [],
    condicionesDeDerivacion: [],
    promesasProhibidas: [],
    datosRequeridosAntesDeAccion: [],
  });
});

test("guardrailsSchema.accionesProhibidas solo acepta nombres de tools válidos", () => {
  assert.throws(() => guardrailsSchema.parse({ accionesProhibidas: ["borrar_todo"] }));
  assert.doesNotThrow(() =>
    guardrailsSchema.parse({ accionesProhibidas: ["actualizar_mi_email"] }),
  );
});

test("upsertAgentConfigSchema exige instructions y modelName, defaultea el resto", () => {
  const resultado = upsertAgentConfigSchema.parse({
    instructions: "Sos el asistente de Xentech.",
    modelName: "anthropic/claude-sonnet",
  });
  assert.equal(resultado.modelProvider, "openrouter");
  assert.deepEqual(resultado.enabledTools, []);
  assert.deepEqual(resultado.guardrails, {
    temasProhibidos: [],
    accionesProhibidas: [],
    condicionesDeDerivacion: [],
    promesasProhibidas: [],
    datosRequeridosAntesDeAccion: [],
  });
});

test("upsertAgentConfigSchema rechaza instructions vacías", () => {
  assert.throws(() => upsertAgentConfigSchema.parse({ instructions: "", modelName: "x" }));
});
