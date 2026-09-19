function required(key: keyof ImportMetaEnv): string {
  const value = import.meta.env[key];
  if (!value) {
    throw new Error(`Falta la variable de entorno ${key}`);
  }
  return value;
}

function requiredAbsoluteUrl(key: keyof ImportMetaEnv): string {
  const raw = required(key);
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`${key} debe ser una URL absoluta válida (recibido: "${raw}")`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`${key} debe usar http o https (recibido: "${raw}")`);
  }
  return raw;
}

function stripTrailingSlash(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

// Mismo patrón que plataforma-crm-frontend/src/config/env.ts: falla rápido y
// explícito si falta una env var, en vez de que el error aparezca más tarde
// como un fetch roto sin contexto.
export const env = {
  supabaseUrl: requiredAbsoluteUrl("VITE_SUPABASE_URL"),
  supabaseAnonKey: required("VITE_SUPABASE_ANON_KEY"),
  apiUrl: stripTrailingSlash(requiredAbsoluteUrl("VITE_API_URL")),
};
