import assert from "node:assert/strict";
import { test } from "node:test";
import { puedeEjecutarTool } from "./permissions";

test("solicitar_hablar_con_alguien siempre está permitida, incluso sin cliente identificado", () => {
  const resultado = puedeEjecutarTool(
    { enabledTools: [], guardrails: {} },
    "solicitar_hablar_con_alguien",
    null,
  );
  assert.deepEqual(resultado, { permitido: true });
});

test("rechaza cualquier otra tool si no hay cliente identificado", () => {
  const resultado = puedeEjecutarTool(
    { enabledTools: ["consultar_mi_cuota"], guardrails: {} },
    "consultar_mi_cuota",
    null,
  );
  assert.equal(resultado.permitido, false);
});

test("rechaza una tool que no está en enabledTools", () => {
  const resultado = puedeEjecutarTool(
    { enabledTools: [], guardrails: {} },
    "consultar_mi_cuota",
    "cliente-1",
  );
  assert.equal(resultado.permitido, false);
});

test("permite una tool habilitada sin guardrails que la prohíban", () => {
  const resultado = puedeEjecutarTool(
    { enabledTools: ["consultar_mi_cuota"], guardrails: {} },
    "consultar_mi_cuota",
    "cliente-1",
  );
  assert.deepEqual(resultado, { permitido: true });
});

test("rechaza una tool habilitada pero prohibida por guardrails.accionesProhibidas", () => {
  const resultado = puedeEjecutarTool(
    {
      enabledTools: ["actualizar_mi_email"],
      guardrails: { accionesProhibidas: ["actualizar_mi_email"] },
    },
    "actualizar_mi_email",
    "cliente-1",
  );
  assert.equal(resultado.permitido, false);
});

test("guardrails malformado (no objeto) no rompe el gate -- trata como sin restricciones extra", () => {
  const resultado = puedeEjecutarTool(
    { enabledTools: ["consultar_mi_cuota"], guardrails: "no-deberia-pasar-esto" },
    "consultar_mi_cuota",
    "cliente-1",
  );
  assert.deepEqual(resultado, { permitido: true });
});
