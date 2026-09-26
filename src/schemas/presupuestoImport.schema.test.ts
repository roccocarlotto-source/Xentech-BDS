import assert from "node:assert/strict";
import { test } from "node:test";
import { commitImportPresupuestoSchema } from "./presupuestoImport.schema";

// Datos inventados (§8 del diseño).
const base = {
  archivoNombre: "presupuesto-0458.docx",
  cliente: {
    modo: "nuevo" as const,
    nombre: "Ferretería El Tornillo",
    email: "compras@eltornillo.example",
    telefono: null,
  },
  descripcion: "Cartel luminoso frontal 3x1m",
  monto: 45000,
  moneda: "UYU",
  datosExtraidos: {},
  seguimientoWhatsapp: false,
  consentimientoWhatsappOrigen: null,
};

test("cliente nuevo con email pero sin teléfono: válido (el email ya no es el único canal, pero sigue sirviendo)", () => {
  assert.equal(commitImportPresupuestoSchema.safeParse(base).success, true);
});

test("cliente nuevo con teléfono pero sin email: válido (decisión 1 -- el email dejó de ser obligatorio)", () => {
  const input = {
    ...base,
    cliente: { ...base.cliente, email: null, telefono: "099 111 222" },
  };
  assert.equal(commitImportPresupuestoSchema.safeParse(input).success, true);
});

test("cliente nuevo sin email ni teléfono: inválido, no hay canal posible", () => {
  const input = { ...base, cliente: { ...base.cliente, email: null, telefono: null } };
  const resultado = commitImportPresupuestoSchema.safeParse(input);

  assert.equal(resultado.success, false);
  assert.ok(resultado.success === false);
  assert.match(resultado.error.issues[0].message, /email o teléfono/);
});

test("un teléfono con solo espacios no cuenta como dato de contacto", () => {
  const input = { ...base, cliente: { ...base.cliente, email: null, telefono: "   " } };
  assert.equal(commitImportPresupuestoSchema.safeParse(input).success, false);
});

test("cliente existente: el chequeo de contacto no corre acá (el schema solo ve el id)", () => {
  const input = {
    ...base,
    cliente: { modo: "existente" as const, clienteId: "0f8fad5b-d9cb-469f-a165-70867728950e" },
  };
  assert.equal(commitImportPresupuestoSchema.safeParse(input).success, true);
});

test("seguimiento por WhatsApp sin origen del consentimiento: sigue siendo inválido (§5)", () => {
  const input = { ...base, seguimientoWhatsapp: true, consentimientoWhatsappOrigen: null };
  assert.equal(commitImportPresupuestoSchema.safeParse(input).success, false);
});
