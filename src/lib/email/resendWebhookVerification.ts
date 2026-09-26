import crypto from "node:crypto";

// Verificación de la firma de los webhooks de Resend (etapa 5 de
// docs/seguimiento-resenas-diseno.md, §6.4 "Email").
//
// Resend firma con el esquema de Svix: tres headers (`svix-id`,
// `svix-timestamp`, `svix-signature`) y un HMAC-SHA256 sobre
// "<id>.<timestamp>.<body crudo>". No se usa el SDK de Resend por la misma
// razón que no se usa el de OpenRouter ni el de Meta: el repo verifica
// firmas a mano (ver src/lib/whatsapp/webhookVerification.ts) y una
// dependencia menos es una superficie menos.
//
// El body TIENE que ser el crudo, byte por byte: si Express lo parsea a
// JSON y se vuelve a serializar, la firma no cierra (cambia el orden de las
// claves, los espacios, el escapado). Por eso app.ts guarda `req.rawBody`.

// Ventana de tolerancia del timestamp. Svix recomienda 5 minutos: acota el
// replay de un request capturado sin romperse por el desfasaje normal de
// reloj entre servidores.
const TOLERANCIA_SEGUNDOS = 5 * 60;

const PREFIJO_SECRET = "whsec_";

export interface HeadersDeFirma {
  id: string | undefined;
  timestamp: string | undefined;
  signature: string | undefined;
}

export function verificarFirmaResend(
  rawBody: Buffer,
  headers: HeadersDeFirma,
  secret: string,
  ahora: Date = new Date(),
): boolean {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature || !secret) return false;

  if (!timestampEsReciente(timestamp, ahora)) return false;

  // El secret viene como "whsec_<base64>"; lo que se usa como clave del
  // HMAC son los bytes del base64, no el string entero.
  const secretSinPrefijo = secret.startsWith(PREFIJO_SECRET)
    ? secret.slice(PREFIJO_SECRET.length)
    : secret;
  let clave: Buffer;
  try {
    clave = Buffer.from(secretSinPrefijo, "base64");
  } catch {
    return false;
  }
  if (clave.length === 0) return false;

  const firmado = `${id}.${timestamp}.${rawBody.toString("utf8")}`;
  const esperada = crypto.createHmac("sha256", clave).update(firmado).digest("base64");

  // El header trae una lista separada por espacios ("v1,<firma> v1,<otra>"):
  // durante una rotación de secret conviven dos. Alcanza con que UNA cierre.
  return signature
    .split(" ")
    .filter((parte) => parte.startsWith("v1,"))
    .map((parte) => parte.slice("v1,".length))
    .some((candidata) => sonIgualesEnTiempoConstante(candidata, esperada));
}

function timestampEsReciente(timestamp: string, ahora: Date): boolean {
  const segundos = Number(timestamp);
  if (!Number.isFinite(segundos)) return false;
  const diferencia = Math.abs(Math.floor(ahora.getTime() / 1000) - segundos);
  return diferencia <= TOLERANCIA_SEGUNDOS;
}

// Comparación en tiempo constante: comparar con === filtra información por
// el tiempo que tarda en encontrar la primera diferencia.
function sonIgualesEnTiempoConstante(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}
