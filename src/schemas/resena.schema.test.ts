import assert from "node:assert/strict";
import { test } from "node:test";
import {
  COMENTARIO_MAX,
  generarLinkResenaSchema,
  moderarResenaSchema,
  publicarResenaSchema,
} from "./resena.schema";

const base = { token: "t", anonimo: false, estrellas: 5 };

test("estrellas obligatorias, enteras, entre 1 y 5", () => {
  for (const estrellas of [1, 3, 5]) {
    assert.equal(publicarResenaSchema.parse({ ...base, estrellas }).estrellas, estrellas);
  }
  for (const estrellas of [0, 6, 2.5, "5", undefined]) {
    assert.throws(() => publicarResenaSchema.parse({ ...base, estrellas }), String(estrellas));
  }
});

test("hay que elegir con nombre o anónimo, sin default", () => {
  assert.throws(() => publicarResenaSchema.parse({ token: "t", estrellas: 5 }));
});

test("comentario opcional: vacío o solo espacios queda en null", () => {
  assert.equal(publicarResenaSchema.parse(base).comentario, null);
  assert.equal(publicarResenaSchema.parse({ ...base, comentario: "   " }).comentario, null);
  assert.equal(publicarResenaSchema.parse({ ...base, comentario: " hola " }).comentario, "hola");
});

test("comentario con límite de caracteres", () => {
  const largo = "a".repeat(COMENTARIO_MAX);
  assert.equal(publicarResenaSchema.parse({ ...base, comentario: largo }).comentario, largo);
  assert.throws(() => publicarResenaSchema.parse({ ...base, comentario: `${largo}a` }));
});

test("rechazar una reseña exige motivo; aprobar no", () => {
  assert.throws(() => moderarResenaSchema.parse({ moderacion: "RECHAZADA" }));
  assert.throws(() => moderarResenaSchema.parse({ moderacion: "RECHAZADA", motivo: "  " }));
  assert.equal(
    moderarResenaSchema.parse({ moderacion: "RECHAZADA", motivo: "spam" }).motivo,
    "spam",
  );
  assert.equal(moderarResenaSchema.parse({ moderacion: "APROBADA" }).moderacion, "APROBADA");
  assert.throws(() => moderarResenaSchema.parse({ moderacion: "PENDIENTE" }));
});

test("generar link pide un clienteId uuid; presupuesto opcional", () => {
  const clienteId = "11111111-1111-4111-8111-111111111111";
  assert.deepEqual(generarLinkResenaSchema.parse({ clienteId }), { clienteId });
  assert.throws(() => generarLinkResenaSchema.parse({ clienteId: "x" }));
});
