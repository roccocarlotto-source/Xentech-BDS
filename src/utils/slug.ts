// Genera un slug URL-safe a partir de un nombre (ej. "Café del Centro" ->
// "cafe-del-centro"). Organization.slug es @unique y varchar(100) (ver
// prisma/schema.prisma) -- esta función solo normaliza el texto; resolver
// colisiones de unicidad es responsabilidad de quien la llama (ver
// createOrganization() en organization.service.ts).
//
// Se deja margen para que el caller pueda agregar un sufijo tipo "-12" sin
// pasarse del límite de 100 caracteres de la columna.
const MAX_LARGO_BASE = 90;

export function slugify(texto: string): string {
  const base = texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // saca acentos (á -> a, ñ queda como n)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_LARGO_BASE)
    .replace(/-+$/g, ""); // por si el slice cortó justo antes de un guión

  return base || "organizacion";
}
