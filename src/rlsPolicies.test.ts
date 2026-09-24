import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

// Guarda contra el olvido que pasó con las 7 tablas de la etapa 2 del
// módulo de seguimiento/reseñas: se agregaron al schema de Prisma y
// prisma/sql/rls_policies.sql quedó sin cubrirlas. Una tabla sin
// `enable row level security` queda abierta para anon/authenticated (los
// grants por default de Supabase), así que cada tabla nueva tiene que
// entrar al archivo -- con sus policies, o como deny-all.
//
// Solo chequea que el archivo MENCIONE cada tabla con enable + force; que
// las policies hagan lo correcto se prueba contra un Postgres real (ver el
// bullet de RLS en CLAUDE.md).

const root = join(__dirname, "..");
const schema = readFileSync(join(root, "prisma/schema.prisma"), "utf8");
const policies = readFileSync(join(root, "prisma/sql/rls_policies.sql"), "utf8");

function tablasDelSchema(): string[] {
  const tablas: string[] = [];
  for (const bloque of schema.split(/\nmodel\s+/).slice(1)) {
    const map = /@@map\("([^"]+)"\)/.exec(bloque.split(/\n}\s*\n/)[0] ?? "");
    const nombre = map ? map[1] : bloque.split(/\s/)[0];
    tablas.push(nombre);
  }
  return tablas;
}

test("el schema tiene tablas (sanidad del parser)", () => {
  const tablas = tablasDelSchema();
  assert.ok(tablas.includes("clientes"));
  assert.ok(tablas.includes("resenas"));
});

for (const tabla of tablasDelSchema()) {
  test(`rls_policies.sql habilita y fuerza RLS en ${tabla}`, () => {
    assert.match(policies, new RegExp(`alter table ${tabla} enable row level security;`));
    assert.match(policies, new RegExp(`alter table ${tabla} force row level security;`));
  });
}
