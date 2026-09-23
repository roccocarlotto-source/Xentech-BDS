// Rate limiting genérico de toda la API (ver src/app.ts) -- antes de esto
// `express-rate-limit` estaba en package.json pero no se usaba en ningún
// lado, así que no había ningún límite, ni siquiera el más básico. Esto es
// un límite genérico por IP, no el rate limiting específico del loop del
// agente de IA que ya está anotado como pendiente en
// docs/ai-agent-architecture.md §12 (ese necesita ser por organización/
// Cliente, más estricto, y se diseña en el paso de implementación
// correspondiente -- no acá).
//
// Configurable por env vars para no tener que tocar código si el volumen
// real de un tenant lo justifica; los defaults son generosos a propósito
// (proteger contra abuso/loops descontrolados, no limitar uso normal).
const DEFAULT_WINDOW_MS = 15 * 60 * 1000; // 15 minutos
const DEFAULT_LIMIT = 600; // 600 requests cada 15 min por IP

export interface RateLimitOptions {
  windowMs: number;
  limit: number;
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

export function getRateLimitOptions(env: NodeJS.ProcessEnv = process.env): RateLimitOptions {
  return {
    windowMs: parsePositiveInt(env.RATE_LIMIT_WINDOW_MS, DEFAULT_WINDOW_MS),
    limit: parsePositiveInt(env.RATE_LIMIT_MAX, DEFAULT_LIMIT),
  };
}
