import { procesarEnviosVencidos } from "./envioJob";

// Poller del motor de seguimiento por email (etapa 5, paso 2). Mismo patrón
// que inboundJobPoller.ts: arrancado desde src/server.ts, no en tests/CI,
// nunca se solapan dos ticks. A diferencia de aquel (que procesa job por
// job), procesarEnviosVencidos ya procesa un lote entero por llamada, así
// que un tick es una sola invocación.
//
// Corre igual aunque no haya proveedor de email configurado todavía (ver
// emailProvider.ts) -- procesarEnviosVencidos() lo detecta y no hace nada,
// así que este poller queda "encendido pero inactivo" hasta que se elija
// un proveedor, sin necesidad de tocar server.ts otra vez en ese momento.
export interface EnvioJobPollerOptions {
  intervalMs?: number;
  limitPorTick?: number;
  onError?: (err: unknown) => void;
}

export function startEnvioJobPoller(options: EnvioJobPollerOptions = {}): () => void {
  const { intervalMs = 60_000, limitPorTick = 50, onError } = options;
  let corriendo = false;

  const timer = setInterval(() => {
    if (corriendo) return;
    corriendo = true;

    procesarEnviosVencidos(new Date(), limitPorTick)
      .catch((err) => onError?.(err))
      .finally(() => {
        corriendo = false;
      });
  }, intervalMs);

  return () => clearInterval(timer);
}
