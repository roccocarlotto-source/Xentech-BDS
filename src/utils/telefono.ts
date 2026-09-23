import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";

// País por defecto para resolver números sin prefijo internacional (ver
// docs/ai-agent-architecture.md §5). Xentech es multi-tenant, pero hoy no
// existe un campo de país por organización -- se asume Uruguay (el único
// tenant real hasta ahora) y se deja el parámetro para poder pasar otro
// país sin tocar el resto del código el día que haga falta (ver "Decisiones
// abiertas" al final de ese documento).
const PAIS_POR_DEFECTO: CountryCode = "UY";

// Normaliza un número de teléfono a formato E.164 (ej. "+59899123456") para
// que dos formas distintas de escribir el mismo número (con/sin prefijo de
// país, con espacios/guiones/paréntesis) terminen comparando igual. Se usa
// tanto al buscar (resolución de identidad del agente de WhatsApp) como al
// escribir (alta manual, importación, y la tool actualizar_mi_telefono) --
// ver clienteRepository.create/update.
//
// Nunca devuelve null/undefined: si el valor no se puede interpretar como
// un teléfono válido (dato sucio, texto libre cargado a mano), el fallback
// es dejar solo los dígitos -- así dos entradas igual de "sucias" siguen
// matcheando entre sí en vez de que la función explote o pierda datos.
export function normalizarTelefono(
  telefono: string,
  paisPorDefecto: CountryCode = PAIS_POR_DEFECTO,
): string {
  const texto = telefono.trim();
  if (!texto) return "";

  const soloDigitosYMas = texto.replace(/[^\d+]/g, "");
  if (!soloDigitosYMas) return "";

  const parsed = parsePhoneNumberFromString(soloDigitosYMas, paisPorDefecto);
  if (parsed?.isValid()) {
    return parsed.number; // E.164, ej. "+59899123456"
  }

  return soloDigitosYMas.replace(/^\+/, "");
}

// Helper para los tres campos de escritura de Cliente.telefono
// (create/update en clienteRepository): normaliza si hay un valor, deja
// pasar null/undefined tal cual (null = "borrar el dato", undefined = "no
// tocar este campo" en un update parcial -- Prisma ignora las propiedades
// undefined).
export function normalizarTelefonoSiPresente<T extends string | null | undefined>(
  telefono: T,
): T extends string ? string : T {
  if (telefono === null || telefono === undefined) {
    return telefono as T extends string ? string : T;
  }
  return normalizarTelefono(telefono) as T extends string ? string : T;
}
