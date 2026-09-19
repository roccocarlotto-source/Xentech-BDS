import ExcelJS from "exceljs";
import { parse as parseCsv } from "csv-parse/sync";
import { DateTime } from "luxon";
import { AppError } from "../utils/AppError";
import { createClienteSchema, type CreateClienteInput } from "../schemas/cliente.schema";
import { clienteRepository } from "../repositories/cliente.repository";

// Fase 3 — importación. Excel (.xlsx) y TXT/CSV (texto delimitado) listos;
// PDF queda para una siguiente iteración del roadmap (ver
// docs/estado-actual.md).
//
// Flujo en dos pasos, sin estado en el servidor entre uno y otro (el archivo
// no se guarda en ningún lado): el frontend pide un preview con el archivo,
// arma la pantalla de revisión/mapeo con esa respuesta, y al confirmar
// vuelve a mandar el MISMO archivo + el mapeo elegido. Evita depender de un
// storage temporal o de sesión para algo que dura un par de clicks.

export const CLIENTE_IMPORT_FIELDS = [
  "nombre",
  "telefono",
  "email",
  "notas",
  "cuotaMonto",
  "cuotaPeriodicidad",
  "cuotaUltimoPago",
] as const;

export type ClienteImportField = (typeof CLIENTE_IMPORT_FIELDS)[number];

// mapping: field del modelo -> nombre de columna del archivo elegido por el
// usuario en la pantalla de revisión. "nombre" es el único campo obligatorio
// (mismo requisito que createClienteSchema); el resto puede quedar sin
// mapear si el archivo no lo trae.
export type ClienteImportMapping = Partial<Record<ClienteImportField, string>>;

export interface ClienteImportPreview {
  headers: string[];
  totalRows: number;
  sampleRows: Array<Record<string, unknown>>;
  suggestedMapping: ClienteImportMapping;
}

export interface ClienteImportRowError {
  fila: number; // Número de fila tal como lo vería el usuario en Excel (header = fila 1).
  mensaje: string;
}

export interface ClienteImportResult {
  totalRows: number;
  creados: number;
  errores: ClienteImportRowError[];
}

const SAMPLE_ROWS_LIMIT = 10;
const MAX_ROWS = 5000; // Límite razonable para un MVP: evita cargas gigantes por error.

// Sinónimos (ya normalizados: minúsculas, sin acentos) usados para sugerir
// automáticamente a qué campo corresponde cada columna del archivo. El
// usuario siempre puede corregir la sugerencia en la pantalla de revisión —
// esto es solo para ahorrarle el mapeo manual en el caso común.
const FIELD_SYNONYMS: Record<ClienteImportField, string[]> = {
  nombre: ["nombre", "cliente", "nombre y apellido", "razon social", "nombre completo"],
  telefono: ["telefono", "tel", "celular", "whatsapp", "phone", "numero"],
  email: ["email", "correo", "correo electronico", "mail", "e-mail"],
  notas: ["notas", "nota", "observaciones", "comentarios", "detalle"],
  cuotaMonto: ["cuota", "monto", "importe", "cuota monto", "precio", "valor cuota"],
  cuotaPeriodicidad: ["periodicidad", "frecuencia"],
  cuotaUltimoPago: [
    "ultimo pago",
    "fecha de pago",
    "fecha ultimo pago",
    "fecha de ultimo pago",
    "pago",
    "fecha pago",
  ],
};

function normalizeHeader(header: string): string {
  return header
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // saca acentos
    .trim()
    .toLowerCase();
}

export function suggestMapping(headers: string[]): ClienteImportMapping {
  const mapping: ClienteImportMapping = {};
  const normalized = headers.map((h) => ({ original: h, norm: normalizeHeader(h) }));

  for (const field of CLIENTE_IMPORT_FIELDS) {
    const synonyms = FIELD_SYNONYMS[field];
    const match = normalized.find((h) => synonyms.includes(h.norm));
    if (match) {
      mapping[field] = match.original;
    }
  }

  return mapping;
}

// exceljs devuelve tipos distintos según el contenido de la celda (Date,
// number, string, fórmulas, hipervínculos, rich text). Esto lo reduce a
// algo simple con lo que el resto del import puede trabajar.
function normalizeCellValue(value: ExcelJS.CellValue): unknown {
  if (value === null || value === undefined) return undefined;
  if (value instanceof Date) return value;
  if (typeof value === "object") {
    if ("result" in value) return normalizeCellValue(value.result as ExcelJS.CellValue);
    if ("text" in value && typeof value.text === "string") return value.text;
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text).join("");
    }
    return undefined;
  }
  return value;
}

interface ParsedFile {
  headers: string[];
  rows: Array<Record<string, unknown>>;
}

export async function parseExcelBuffer(buffer: Buffer): Promise<ParsedFile> {
  const workbook = new ExcelJS.Workbook();
  try {
    // exceljs tipa `load` con un `Buffer` propio (su .d.ts declara uno local
    // que solo extiende ArrayBuffer, no importa el Buffer real de Node) —
    // el cast es solo para el chequeo de tipos, en runtime funciona igual
    // con cualquier Buffer de Node.
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    throw new AppError("No se pudo leer el archivo. ¿Es un Excel (.xlsx) válido?", 400);
  }

  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new AppError("El archivo no tiene ninguna hoja", 400);
  }

  const headerRow = worksheet.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const value = normalizeCellValue(cell.value);
    headers[colNumber - 1] = value === undefined ? "" : String(value).trim();
  });

  if (headers.filter(Boolean).length === 0) {
    throw new AppError("No se encontraron columnas en la primera fila del archivo", 400);
  }

  const rows: Array<Record<string, unknown>> = [];
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // header
    if (rows.length >= MAX_ROWS) return;

    const record: Record<string, unknown> = {};
    let vacia = true;
    headers.forEach((header, idx) => {
      if (!header) return;
      const value = normalizeCellValue(row.getCell(idx + 1).value);
      record[header] = value;
      if (value !== undefined && value !== null && value !== "") vacia = false;
    });

    if (!vacia) rows.push(record);
  });

  return { headers: headers.filter(Boolean), rows };
}

// Delimitadores candidatos para un .txt — se elige el que más ocurrencias
// tiene en la primera línea (el header), asumiendo que un archivo bien
// formado separa TODAS las columnas con el mismo caracter.
const TXT_DELIMITADORES = [",", ";", "\t", "|"];

function detectarDelimitador(primeraLinea: string): string {
  let mejor = TXT_DELIMITADORES[0];
  let mejorConteo = 0;
  for (const delimitador of TXT_DELIMITADORES) {
    const conteo = primeraLinea.split(delimitador).length - 1;
    if (conteo > mejorConteo) {
      mejor = delimitador;
      mejorConteo = conteo;
    }
  }
  return mejor;
}

export function parseTxtBuffer(buffer: Buffer): ParsedFile {
  const texto = buffer.toString("utf-8");
  const primeraLinea = texto.split(/\r?\n/, 1)[0] ?? "";
  if (!primeraLinea.trim()) {
    throw new AppError("El archivo está vacío", 400);
  }
  const delimitador = detectarDelimitador(primeraLinea);

  let registros: string[][];
  try {
    registros = parseCsv(texto, {
      delimiter: delimitador,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
    }) as string[][];
  } catch {
    throw new AppError("No se pudo leer el archivo de texto. ¿Está bien formado?", 400);
  }

  const [headerRow, ...dataRows] = registros;
  const headers = (headerRow ?? []).map((h) => h.trim());
  if (headers.filter(Boolean).length === 0) {
    throw new AppError("No se encontraron columnas en la primera línea del archivo", 400);
  }

  const rows: Array<Record<string, unknown>> = [];
  for (const cols of dataRows) {
    if (rows.length >= MAX_ROWS) break;

    const record: Record<string, unknown> = {};
    let vacia = true;
    headers.forEach((header, idx) => {
      if (!header) return;
      const value = cols[idx]?.trim();
      record[header] = value || undefined;
      if (value) vacia = false;
    });

    if (!vacia) rows.push(record);
  }

  return { headers: headers.filter(Boolean), rows };
}

function extension(filename: string): string {
  const match = /\.([a-z0-9]+)$/i.exec(filename);
  return match ? match[1].toLowerCase() : "";
}

// Punto de entrada único: decide el parser por la extensión del archivo.
// PDF todavía no está soportado (queda para una siguiente iteración).
export async function parseFileBuffer(buffer: Buffer, filename: string): Promise<ParsedFile> {
  const ext = extension(filename);
  if (ext === "xlsx") return parseExcelBuffer(buffer);
  if (ext === "txt" || ext === "csv") return parseTxtBuffer(buffer);
  throw new AppError(
    `Formato de archivo no soportado (.${ext || "?"}). Por ahora: Excel (.xlsx), TXT o CSV.`,
    400,
  );
}

export async function previewImport(
  buffer: Buffer,
  filename: string,
): Promise<ClienteImportPreview> {
  const { headers, rows } = await parseFileBuffer(buffer, filename);
  return {
    headers,
    totalRows: rows.length,
    sampleRows: rows.slice(0, SAMPLE_ROWS_LIMIT),
    suggestedMapping: suggestMapping(headers),
  };
}

function parseMonto(raw: unknown): number | undefined {
  if (raw === undefined || raw === null || raw === "") return undefined;
  if (typeof raw === "number") return raw;

  const texto = String(raw)
    .trim()
    .replace(/[^0-9,.-]/g, "");
  if (!texto) return undefined;

  // "1.234,56" (formato es-AR) vs "1234.56": si tiene coma, se asume que la
  // coma es el separador decimal y el punto (si aparece antes) es de miles.
  const normalizado = texto.includes(",") ? texto.replace(/\./g, "").replace(",", ".") : texto;

  const numero = Number(normalizado);
  return Number.isFinite(numero) ? numero : undefined;
}

const FECHA_FORMATOS = ["dd/MM/yyyy", "d/M/yyyy", "yyyy-MM-dd", "dd-MM-yyyy", "d-M-yyyy"];

function parseFecha(raw: unknown): Date | undefined {
  if (raw === undefined || raw === null || raw === "") return undefined;
  if (raw instanceof Date) return raw;

  const texto = String(raw).trim();
  for (const formato of FECHA_FORMATOS) {
    const dt = DateTime.fromFormat(texto, formato);
    if (dt.isValid) return dt.toJSDate();
  }
  return undefined;
}

function parsePeriodicidad(raw: unknown): "MENSUAL" | undefined {
  if (raw === undefined || raw === null || raw === "") return undefined;
  const texto = normalizeHeader(String(raw));
  return texto.includes("mensual") ? "MENSUAL" : undefined;
}

// Arma el input de un cliente a partir de una fila del archivo + el mapeo
// elegido por el usuario. No valida acá — eso lo hace createClienteSchema
// en el caller, así los mensajes de error son consistentes con el resto de
// la app (mismo schema que usa el alta manual). Exportada aparte de
// commitImport para poder testearla sin tocar la base de datos.
export function mapRow(
  row: Record<string, unknown>,
  mapping: ClienteImportMapping,
): Record<string, unknown> {
  const input: Record<string, unknown> = {};

  if (mapping.nombre) input.nombre = row[mapping.nombre];
  if (mapping.telefono) input.telefono = row[mapping.telefono];
  if (mapping.email) input.email = row[mapping.email];
  if (mapping.notas) input.notas = row[mapping.notas];
  if (mapping.cuotaMonto) input.cuotaMonto = parseMonto(row[mapping.cuotaMonto]);
  if (mapping.cuotaUltimoPago) input.cuotaUltimoPago = parseFecha(row[mapping.cuotaUltimoPago]);

  const periodicidadMapeada = mapping.cuotaPeriodicidad
    ? parsePeriodicidad(row[mapping.cuotaPeriodicidad])
    : undefined;
  // "MENSUAL" es la única periodicidad soportada hoy (ver
  // CuotaPeriodicidad en prisma/schema.prisma): si el archivo trae cuota
  // pero no una periodicidad reconocible, se asume mensual en vez de
  // obligar a mapear una columna que en la práctica solo puede valer una
  // cosa.
  if (periodicidadMapeada) {
    input.cuotaPeriodicidad = periodicidadMapeada;
  } else if (input.cuotaMonto !== undefined || input.cuotaUltimoPago !== undefined) {
    input.cuotaPeriodicidad = "MENSUAL";
  }

  // Strings vacíos -> undefined, para que los campos opcionales no fallen
  // la validación de zod por ser "" en vez de ausentes.
  for (const key of ["telefono", "email", "notas"] as const) {
    if (input[key] === "" || input[key] === null) input[key] = undefined;
    else if (input[key] !== undefined) input[key] = String(input[key]);
  }
  if (input.nombre !== undefined && input.nombre !== null) input.nombre = String(input.nombre);

  return input;
}

export async function commitImport(
  organizationId: string,
  buffer: Buffer,
  filename: string,
  mapping: ClienteImportMapping,
): Promise<ClienteImportResult> {
  if (!mapping.nombre) {
    throw new AppError('El mapeo debe incluir al menos la columna de "nombre"', 400);
  }

  const { rows } = await parseFileBuffer(buffer, filename);
  const errores: ClienteImportRowError[] = [];
  let creados = 0;

  for (let i = 0; i < rows.length; i++) {
    const fila = i + 2; // +1 por índice 0-based, +1 por la fila de header.
    const candidato = mapRow(rows[i], mapping);
    const parsed = createClienteSchema.safeParse(candidato);

    if (!parsed.success) {
      const mensaje = parsed.error.issues.map((issue) => issue.message).join("; ");
      errores.push({ fila, mensaje: mensaje || "Datos inválidos" });
      continue;
    }

    await clienteRepository.create(organizationId, parsed.data as CreateClienteInput);
    creados++;
  }

  return { totalRows: rows.length, creados, errores };
}
