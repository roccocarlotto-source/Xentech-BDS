// Detección de la baja en una respuesta por email (§5 y §6.4 del diseño:
// "La baja se detecta automáticamente ('BAJA' o equivalentes como 'no me
// escriban más') y corta la secuencia de inmediato").
//
// Todo acá es puro y sin red: es la parte que decide si a una persona se le
// deja de escribir, así que tiene que poder testearse exhaustivamente.
//
// Criterio de diseño: ante la duda, dar de baja. Un falso positivo cuesta
// un seguimiento que no se manda; un falso negativo es seguir escribiéndole
// a alguien que pidió que no lo hagan -- eso es lo que §5 prohíbe y lo que
// la Ley 18.331 mira.

// Solo se analiza lo que la persona escribió ARRIBA de la cita del mail
// original. Sin esto, la propia línea "Respondé BAJA si no querés más
// mensajes" que va en cada email volvería citada en CUALQUIER respuesta y
// daría de baja a todo el mundo.
const MARCAS_DE_CITA = [
  // Clientes de correo en español, inglés y portugués.
  /^>/, // cita clásica con ">"
  /^-{2,}\s*mensaje original\s*-{2,}/i,
  /^-{2,}\s*original message\s*-{2,}/i,
  /^-{2,}\s*forwarded message\s*-{2,}/i,
  /^el .* escribió:\s*$/i,
  /^on .* wrote:\s*$/i,
  /^em .* escreveu:\s*$/i,
  /^de:\s/i,
  /^from:\s/i,
  /^enviado desde /i,
  /^sent from /i,
];

export function quitarCitaDelOriginal(texto: string): string {
  const lineas = texto.split(/\r?\n/);
  const corte = lineas.findIndex((linea) => {
    const l = linea.trim();
    return l.length > 0 && MARCAS_DE_CITA.some((marca) => marca.test(l));
  });
  return (corte === -1 ? lineas : lineas.slice(0, corte)).join("\n").trim();
}

// Frases que cuentan como pedido de baja. Se comparan sobre el texto
// normalizado (minúsculas, sin acentos, sin puntuación).
const FRASES_DE_BAJA = [
  "baja",
  "darme de baja",
  "dar de baja",
  "desuscribir",
  "desuscribirme",
  "unsubscribe",
  "no me escriban mas",
  "no me escribas mas",
  "no quiero mas mensajes",
  "no quiero mas correos",
  "no quiero mas emails",
  "no me manden mas",
  "no me mandes mas",
  "no me contacten mas",
  "dejen de escribirme",
  "dejame de escribir",
  "basta de mensajes",
  "remover de la lista",
  "sacarme de la lista",
  "saquenme de la lista",
];

// Cuántos caracteres del cuerpo se miran. Una baja se escribe corta ("BAJA",
// "no me escriban más"). Limitar el alcance evita que la palabra aparezca de
// paso en un texto largo ("de baja el lunes", "la baja del IVA") y corte un
// seguimiento que el cliente no pidió cortar.
const MAX_CARACTERES_ANALIZADOS = 200;

export function esPedidoDeBaja(cuerpo: string): boolean {
  const propio = quitarCitaDelOriginal(cuerpo);
  if (propio.length === 0) return false;

  const normalizado = normalizar(propio).slice(0, MAX_CARACTERES_ANALIZADOS);
  if (normalizado.length === 0) return false;

  // Respuesta de una sola palabra/frase: es el caso típico y el más claro.
  if (FRASES_DE_BAJA.includes(normalizado)) return true;

  // Frases de varias palabras ("no me escriban mas") se buscan adentro del
  // texto: casi nunca aparecen por casualidad.
  return FRASES_DE_BAJA.filter((frase) => frase.includes(" ")).some((frase) =>
    normalizado.includes(frase),
  );
}

function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // saca los acentos
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ") // saca puntuación y emojis
    .replace(/\s+/g, " ")
    .trim();
}
