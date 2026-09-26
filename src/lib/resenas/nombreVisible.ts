// Etapa 3 / §6.1 de docs/seguimiento-resenas-diseno.md, con la decisión de
// Rocco del 2026-09-26 (§2, decisión 3): la reseña no anónima se publica con
// el nombre ABREVIADO -- nombre de pila + inicial del apellido -- y no con
// `Cliente.nombre` entero. La reseña se ve en la web pública de la empresa,
// así que "Laura M." alcanza para que se lea como una persona real sin
// publicar el nombre completo de un cliente.
//
// Función pura y sin estado: se llama en dos lugares y los dos tienen que dar
// el MISMO resultado -- el botón de /r/<token> ("Publicar como Laura M.") y
// lo que se guarda en `Resena.nombreVisible` al publicar. Si difirieran, la
// persona elegiría una cosa y se publicaría otra.

export function abreviarNombreVisible(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);

  if (partes.length === 0) return "";
  // Un solo término: no hay apellido que abreviar. Se devuelve tal cual, sea
  // un nombre de pila suelto o el nombre de una empresa de una palabra.
  if (partes.length === 1) return partes[0];

  const pila = partes[0];
  // De la última palabra sale la inicial. Sirve igual si ya venía abreviada
  // ("Laura M." / "Laura M" -> "Laura M."): se toma su primera letra, así que
  // nunca se apila una inicial sobre otra. Con nombres compuestos ("Laura de
  // los Santos") queda la inicial del apellido, que es lo que se busca.
  // Se recorre con [...] y no con [0] para no cortar un par subrogado.
  const inicial = [...partes[partes.length - 1].replace(/\.$/, "")][0] ?? "";
  // La última palabra era solo puntuación: no hay inicial que mostrar.
  if (inicial === "") return pila;

  return `${pila} ${inicial.toLocaleUpperCase("es")}.`;
}
