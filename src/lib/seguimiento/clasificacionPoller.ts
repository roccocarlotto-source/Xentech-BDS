import { clasificarRespuestasPendientes } from "../../services/clasificacionRespuesta.service";

// Poller de la clasificación con IA (etapa 7, §6.5). Mismo patrón que
// envioJobPoller.ts e inboundJobPoller.ts: arrancado desde src/server.ts,
// no en tests ni en CI, y dos ticks nunca se solapan.
//
// Tick más largo que el de WhatsApp (5 s) porque no hay nadie esperando del
// otro lado: una respuesta por email no necesita clasificarse en segundos.
export interface ClasificacionPollerOptions {
  intervalMs?: number;
  limitPorTick?: number;
  onError?: (err: unknown) => void;
}

export function startClasificacionPoller(options: ClasificacionPollerOptions = {}): () => void {
  const { intervalMs = 60_000, limitPorTick = 20, onError } = options;
  let corriendo = false;

  const timer = setInterval(() => {
    if (corriendo) return;
    corriendo = true;

    clasificarRespuestasPendientes(limitPorTick)
      .catch((err) => onError?.(err))
      .finally(() => {
        corriendo = false;
      });
  }, intervalMs);

  return () => clearInterval(timer);
}
