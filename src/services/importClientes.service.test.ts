import assert from "node:assert/strict";
import { test } from "node:test";
import ExcelJS from "exceljs";
import { createClienteSchema } from "../schemas/cliente.schema";
import {
  mapRow,
  parseExcelBuffer,
  parseFileBuffer,
  parseTxtBuffer,
  previewImport,
  suggestMapping,
} from "./importClientes.service";

async function buildWorkbookBuffer(headers: string[], rows: unknown[][]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Clientes");
  sheet.addRow(headers);
  for (const row of rows) sheet.addRow(row);
  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

test("suggestMapping reconoce sinonimos comunes, ignorando acentos y mayusculas", () => {
  const mapping = suggestMapping([
    "Nombre",
    "Teléfono",
    "Correo Electrónico",
    "Notas",
    "Columna rara",
  ]);
  assert.deepEqual(mapping, {
    nombre: "Nombre",
    telefono: "Teléfono",
    email: "Correo Electrónico",
    notas: "Notas",
  });
});

test("parseExcelBuffer lee headers y filas, saltando filas totalmente vacias", async () => {
  const buffer = await buildWorkbookBuffer(
    ["Nombre", "Telefono"],
    [
      ["Ana Pérez", "099111222"],
      ["", ""],
      ["Beto Gómez", "099333444"],
    ],
  );

  const { headers, rows } = await parseExcelBuffer(buffer);
  assert.deepEqual(headers, ["Nombre", "Telefono"]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].Nombre, "Ana Pérez");
  assert.equal(rows[1].Nombre, "Beto Gómez");
});

test("parseExcelBuffer rechaza un archivo que no es un Excel valido", async () => {
  await assert.rejects(() => parseExcelBuffer(Buffer.from("esto no es un xlsx")));
});

test("parseTxtBuffer detecta el delimitador (punto y coma) y saltea filas vacias", () => {
  const texto =
    "Nombre;Telefono;Email\nAna Pérez;099111222;ana@example.com\n\nBeto Gómez;;beto@example.com\n";
  const { headers, rows } = parseTxtBuffer(Buffer.from(texto, "utf-8"));
  assert.deepEqual(headers, ["Nombre", "Telefono", "Email"]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].Nombre, "Ana Pérez");
  assert.equal(rows[1].Telefono, undefined);
  assert.equal(rows[1].Email, "beto@example.com");
});

test("parseTxtBuffer detecta coma como delimitador cuando corresponde", () => {
  const texto = "Nombre,Email\nAna Pérez,ana@example.com\n";
  const { headers, rows } = parseTxtBuffer(Buffer.from(texto, "utf-8"));
  assert.deepEqual(headers, ["Nombre", "Email"]);
  assert.equal(rows.length, 1);
});

test("parseTxtBuffer rechaza un archivo vacio", () => {
  assert.throws(() => parseTxtBuffer(Buffer.from("", "utf-8")));
});

test("parseFileBuffer despacha por extension y rechaza formatos no soportados", async () => {
  const excelBuffer = await buildWorkbookBuffer(["Nombre"], [["Ana"]]);
  const excelResult = await parseFileBuffer(excelBuffer, "clientes.xlsx");
  assert.deepEqual(excelResult.headers, ["Nombre"]);

  const txtResult = await parseFileBuffer(Buffer.from("Nombre\nAna\n", "utf-8"), "clientes.txt");
  assert.deepEqual(txtResult.headers, ["Nombre"]);

  await assert.rejects(() => parseFileBuffer(Buffer.from("%PDF-1.4"), "clientes.pdf"));
});

test("previewImport arma columnas + muestra + mapeo sugerido", async () => {
  const buffer = await buildWorkbookBuffer(["Nombre", "Email"], [["Ana Pérez", "ana@example.com"]]);

  const preview = await previewImport(buffer, "clientes.xlsx");
  assert.equal(preview.totalRows, 1);
  assert.equal(preview.sampleRows.length, 1);
  assert.deepEqual(preview.suggestedMapping, { nombre: "Nombre", email: "Email" });
});

test("mapRow + createClienteSchema: fila completa con monto en formato es-AR y fecha dd/mm/yyyy", () => {
  const row = {
    Nombre: "Ana Pérez",
    Telefono: "099111222",
    Cuota: "1.500,50",
    "Ultimo pago": "15/08/2026",
  };
  const mapping = {
    nombre: "Nombre",
    telefono: "Telefono",
    cuotaMonto: "Cuota",
    cuotaUltimoPago: "Ultimo pago",
  };

  const input = mapRow(row, mapping);
  const parsed = createClienteSchema.safeParse(input);

  assert.ok(parsed.success, parsed.success ? undefined : JSON.stringify(parsed.error.issues));
  if (!parsed.success) return;
  assert.equal(parsed.data.nombre, "Ana Pérez");
  assert.equal(parsed.data.cuotaMonto, 1500.5);
  assert.equal(parsed.data.cuotaPeriodicidad, "MENSUAL");
  assert.equal(parsed.data.cuotaUltimoPago?.toISOString().slice(0, 10), "2026-08-15");
});

test("mapRow: sin columna de cuota mapeada, no fuerza periodicidad", () => {
  const input = mapRow({ Nombre: "Ana" }, { nombre: "Nombre" });
  const parsed = createClienteSchema.safeParse(input);
  assert.ok(parsed.success);
  if (!parsed.success) return;
  assert.equal(parsed.data.cuotaPeriodicidad, undefined);
});

test("mapRow + createClienteSchema: fila sin nombre falla la validacion", () => {
  const input = mapRow({ Nombre: "" }, { nombre: "Nombre" });
  const parsed = createClienteSchema.safeParse(input);
  assert.equal(parsed.success, false);
});
