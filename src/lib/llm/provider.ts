import { AppError } from "../../utils/AppError";
import { OpenRouterProvider } from "./openRouterProvider";
import type { LlmProvider } from "./types";

let instancia: LlmProvider | undefined;

// Factory + singleton perezoso: solo exige OPENROUTER_API_KEY cuando
// realmente se necesita el proveedor (al mandar un mensaje al agente), no
// al arrancar el server -- mismo criterio que el resto de las env vars
// opcionales de este repo (ver .env.example).
export function getLlmProvider(): LlmProvider {
  if (!instancia) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new AppError(
        "Falta configurar OPENROUTER_API_KEY para poder usar los agentes de IA",
        500,
      );
    }
    instancia = new OpenRouterProvider(apiKey);
  }
  return instancia;
}
