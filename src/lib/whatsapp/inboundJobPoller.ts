import { processNextAgentInboundJob } from "./inboundJobProcessor";

// El "poller" de la cola simple (ver comentario de AgentInboundJob en
// schema.prisma). Arrancado desde src/server.ts, no en tests/CI.
//
// Cada tick procesa TODOS los jobs pendientes que encuentre (no solo uno),
// para no acumular atraso si entraron varios mientras el poller estaba
// esperando -- se corta apenas processNextAgentInboundJob() devuelve false
// (cola vacía) o al llegar a maxPorTick, lo que pase primero, así un tick
// nunca corre para siempre si entran jobs más rápido de lo que se procesan.
export interface InboundJobPollerOptions {
  intervalMs?: number;
  maxPorTick?: number;
  onError?: (err: unknown) => void;
}

export function startAgentInboundJobPoller(options: InboundJobPollerOptions = {}): () => void {
  const { intervalMs = 5000, maxPorTick = 20, onError } = options;
  let corriendo = false;

  const timer = setInterval(() => {
    if (corriendo) return; // el tick anterior todavía no terminó, no solapar.
    corriendo = true;

    (async () => {
      for (let i = 0; i < maxPorTick; i++) {
        const procesoAlgo = await processNextAgentInboundJob();
        if (!procesoAlgo) break;
      }
    })()
      .catch((err) => onError?.(err))
      .finally(() => {
        corriendo = false;
      });
  }, intervalMs);

  return () => clearInterval(timer);
}
