import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// Encriptación de WhatsAppConnection.accessTokenEncrypted (paso 5, ver
// docs/ai-agent-architecture.md §11) -- resuelve la "decisión abierta" de
// §12 sobre qué mecanismo usar. AES-256-GCM: estándar de facto para esto,
// autenticado (detecta manipulación del texto cifrado, no solo lo
// descifra mal), y viene en node:crypto -- sin dependencias nuevas.
//
// Requiere WHATSAPP_TOKEN_ENCRYPTION_KEY en el entorno: 32 bytes en
// base64 (generarla con `openssl rand -base64 32`). Como
// SUPABASE_JWKS_URL en src/lib/jwt.ts, la key es lazy -- falta recién
// tira en el primer uso real, no rompe el arranque del server.
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // largo recomendado para GCM

function getKey(): Buffer {
  const raw = process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("Falta WHATSAPP_TOKEN_ENCRYPTION_KEY en el entorno");
  }

  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("WHATSAPP_TOKEN_ENCRYPTION_KEY debe decodificar a 32 bytes (AES-256)");
  }

  return key;
}

// Formato guardado: "<iv>:<authTag>:<ciphertext>", los tres en base64 --
// un solo string de texto plano, directo para la columna
// access_token_encrypted (String @db.Text en el schema).
export function encryptToken(plainText: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [iv, authTag, ciphertext].map((b) => b.toString("base64")).join(":");
}

export function decryptToken(encrypted: string): string {
  const partes = encrypted.split(":");
  if (partes.length !== 3) {
    throw new Error("Formato de token encriptado inválido");
  }
  const [ivB64, authTagB64, ciphertextB64] = partes;

  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(authTagB64, "base64");
  const ciphertext = Buffer.from(ciphertextB64, "base64");

  const decipher = createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

  return plaintext.toString("utf8");
}
