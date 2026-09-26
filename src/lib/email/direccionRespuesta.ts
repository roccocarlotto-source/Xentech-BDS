// Cómo se asocia una respuesta por email al presupuesto que la originó
// (§6.4: "Asociar respuestas al presupuesto por dirección con identificador
// o por encabezados de hilo").
//
// Se eligió la dirección con identificador ("plus addressing"): cada email
// de seguimiento sale con un Reply-To propio,
// `respuestas+<presupuestoId>@<dominio>`, y todo servidor de correo entrega
// eso al buzón `respuestas@<dominio>` conservando el tag. Es determinístico
// y, sobre todo, seguro en multi-tenant: dos organizaciones pueden tener un
// cliente con el mismo email y la respuesta igual cae en el presupuesto
// correcto.
//
// La alternativa (In-Reply-To / References) depende de que el cliente de
// correo del cliente conserve los headers al responder, que no siempre pasa.
// Queda como respaldo posible si aparece un caso real que lo necesite.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// `base` es EMAIL_REPLY_TO, la dirección del buzón que recibe. Si ya venía
// con un tag, se descarta: el único tag que vale es el del presupuesto.
export function direccionDeRespuesta(base: string, presupuestoId: string): string | null {
  const limpia = base.trim();
  const arroba = limpia.lastIndexOf("@");
  if (arroba <= 0 || arroba === limpia.length - 1) return null;

  const local = limpia.slice(0, arroba).split("+")[0];
  const dominio = limpia.slice(arroba + 1);
  if (local.length === 0) return null;

  return `${local}+${presupuestoId}@${dominio}`;
}

// De `respuestas+<uuid>@dominio` saca el uuid. Devuelve null si la
// dirección no trae tag o el tag no es un uuid -- pasa cuando alguien
// escribe directo al buzón, o cuando un cliente de correo raro recorta el
// tag. El llamador decide qué hacer con eso (ver respuestaEmail.service.ts:
// una baja nunca se descarta por esto).
export function presupuestoIdDeDireccion(direccion: string): string | null {
  const limpia = direccion.trim().toLowerCase();
  const arroba = limpia.lastIndexOf("@");
  if (arroba <= 0) return null;

  const local = limpia.slice(0, arroba);
  const mas = local.indexOf("+");
  if (mas === -1) return null;

  const tag = local.slice(mas + 1);
  return UUID.test(tag) ? tag : null;
}

// El `to` del webhook es una lista: puede venir el buzón con tag, el sin
// tag, y copias. Se queda con el primer tag válido que encuentre.
export function buscarPresupuestoIdEnDestinatarios(
  destinatarios: readonly string[],
): string | null {
  for (const direccion of destinatarios) {
    const id = presupuestoIdDeDireccion(direccion);
    if (id) return id;
  }
  return null;
}
