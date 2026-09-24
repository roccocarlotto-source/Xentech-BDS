import { createHash, randomBytes } from "node:crypto";

// Tokens de los links de reseña (§6.1 de docs/seguimiento-resenas-diseno.md).
//
// 32 bytes aleatorios de crypto (256 bits) en base64url: 43 caracteres, sin
// padding, seguros para ir en una URL tal cual. En la base se guarda SOLO el
// sha256 del token (TokenResena.tokenHash) -- quien lea la base no puede
// armar un link válido. Sha256 plano, sin sal ni KDF lento, a propósito: con
// 256 bits de entropía no hay diccionario ni fuerza bruta posible, y el hash
// determinístico es lo que permite buscar el token por índice único.

const TOKEN_BYTES = 32;
const TOKEN_REGEX = /^[A-Za-z0-9_-]{43}$/;

export function generarTokenPlano(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

// Chequeo de forma, antes de tocar la base: un token con otra forma no puede
// haber salido de generarTokenPlano(), así que es inválido sin consultar.
export function tieneFormatoDeToken(token: string): boolean {
  return TOKEN_REGEX.test(token);
}
