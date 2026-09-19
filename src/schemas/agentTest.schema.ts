import { z } from "zod";

// Endpoint interno de prueba (docs/ai-agent-architecture.md §9) para poder
// probar el agente ANTES de que la conexión real de WhatsApp esté lista —
// mismo criterio que la lección "Web-channel-first" de PlataformaCRM.
// externalThreadId simula el hilo de WhatsApp (normalmente el número de
// teléfono); telefono es opcional y simula el número entrante para poder
// probar la resolución de identidad (ver src/services/agent/orchestrator.ts)
// incluso con un externalThreadId de prueba que no es un teléfono real.
export const testMessageSchema = z.object({
  externalThreadId: z.string().trim().min(1).max(50),
  telefono: z.string().trim().max(30).optional(),
  mensaje: z.string().trim().min(1).max(4000),
});

export type TestMessageInput = z.infer<typeof testMessageSchema>;
