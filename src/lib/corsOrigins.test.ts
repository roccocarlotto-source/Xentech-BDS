import assert from "node:assert/strict";
import { test } from "node:test";
import { parseAllowedOrigins } from "./corsOrigins";

test("sin CORS_ORIGINS configurado -> default de desarrollo (Vite :5173)", () => {
  assert.deepEqual(parseAllowedOrigins(undefined), ["http://localhost:5173"]);
  assert.deepEqual(parseAllowedOrigins(""), ["http://localhost:5173"]);
  assert.deepEqual(parseAllowedOrigins("   "), ["http://localhost:5173"]);
});

test("un solo origen", () => {
  assert.deepEqual(parseAllowedOrigins("https://app.xentech.com"), ["https://app.xentech.com"]);
});

test("varios origenes separados por coma, con espacios", () => {
  assert.deepEqual(
    parseAllowedOrigins("https://app.xentech.com, https://staging.xentech.com ,https://otro.com"),
    ["https://app.xentech.com", "https://staging.xentech.com", "https://otro.com"],
  );
});

test("comas de mas o entradas vacias se descartan", () => {
  assert.deepEqual(parseAllowedOrigins("https://app.xentech.com,,  ,"), [
    "https://app.xentech.com",
  ]);
});
