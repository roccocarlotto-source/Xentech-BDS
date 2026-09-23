// CORS del backend (ver src/app.ts): antes esto era `cors()` sin ninguna
// restricción -- aceptaba requests de cualquier origen. Como la auth acá es
// Bearer token (no cookies), no hay riesgo de CSRF clásico, pero igual no
// hay motivo para no restringir el origen al frontend conocido -- es la
// práctica estándar y evita que cualquier sitio pueda leer las respuestas
// de la API desde el navegador de un usuario logueado.
//
// CORS_ORIGINS: lista separada por comas de orígenes permitidos (ej.
// "https://app.xentech.com,https://staging.xentech.com"). Sin configurar,
// el default es el puerto de Vite en desarrollo -- ver frontend/.env.example
// (VITE_API_URL apunta a este mismo backend en :3000, y Vite corre en
// :5173 por default).
const DEFAULT_ORIGINS = ["http://localhost:5173"];

export function parseAllowedOrigins(raw: string | undefined): string[] {
  if (!raw || !raw.trim()) return DEFAULT_ORIGINS;

  const origenes = raw
    .split(",")
    .map((o) => o.trim())
    .filter((o) => o.length > 0);

  return origenes.length > 0 ? origenes : DEFAULT_ORIGINS;
}
