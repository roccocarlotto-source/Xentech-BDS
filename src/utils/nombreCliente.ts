// Decisión 4 de Rocco del 2026-09-26 (§2 de
// docs/seguimiento-resenas-diseno.md): `Cliente.nombre` identifica al cliente
// (la empresa cuando la hay) y `Cliente.personaContacto` es a quién se le
// escribe. Casi todo el producto quiere uno de los dos bien concretos, así
// que conviene una sola función en vez de repetir el `??` en cada lugar y
// que alguno se olvide.

export interface NombresDelCliente {
  nombre: string;
  personaContacto: string | null;
}

// Para hablarle a alguien: el saludo de un email de seguimiento, el nombre de
// una reseña. Con un cliente que es una persona suelta (sin empresa),
// `nombre` YA es la persona, así que sirve de respaldo.
export function nombreDeLaPersona(cliente: NombresDelCliente): string {
  return cliente.personaContacto?.trim() || cliente.nombre;
}
