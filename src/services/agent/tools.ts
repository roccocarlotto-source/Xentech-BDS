import { AppError } from "../../utils/AppError";
import { updateClienteSchema } from "../../schemas/cliente.schema";
import * as clienteService from "../cliente.service";
import type { LlmToolDefinition } from "../../lib/llm/types";

// Catálogo v1 del agente de WhatsApp (docs/ai-agent-architecture.md §6) --
// lista chica y fija a propósito, nunca una tool "hacer cualquier cosa"
// (mismo criterio que PlataformaCRM). Ninguna tool acepta un clienteId como
// argumento: el cliente sobre el que operan viene SIEMPRE de
// ToolExecutionContext, resuelto server-side por el orquestador a partir
// del teléfono entrante -- nunca de algo que proponga el modelo.
export const AGENT_TOOL_DEFINITIONS: LlmToolDefinition[] = [
  {
    name: "consultar_mi_cuota",
    description:
      "Consulta el estado de cuota (al día / atrasado, días de atraso) del cliente que escribe.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "consultar_mis_datos",
    description:
      "Consulta los datos de contacto (nombre, teléfono, email) del cliente que escribe.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "actualizar_mi_telefono",
    description: "Actualiza el teléfono de contacto del cliente que escribe.",
    parameters: {
      type: "object",
      properties: { telefono: { type: "string", description: "Nuevo número de teléfono" } },
      required: ["telefono"],
      additionalProperties: false,
    },
  },
  {
    name: "actualizar_mi_email",
    description: "Actualiza el email de contacto del cliente que escribe.",
    parameters: {
      type: "object",
      properties: { email: { type: "string", description: "Nuevo email" } },
      required: ["email"],
      additionalProperties: false,
    },
  },
  {
    name: "solicitar_hablar_con_alguien",
    description:
      "Deriva la conversación a una persona del equipo. Usar cuando el cliente lo pide explícitamente, " +
      "o cuando el pedido está fuera de lo que el agente puede resolver.",
    parameters: {
      type: "object",
      properties: { motivo: { type: "string", description: "Motivo breve de la derivación" } },
      required: ["motivo"],
      additionalProperties: false,
    },
  },
];

export interface ToolExecutionContext {
  organizationId: string;
  // Resuelto por el orquestador ANTES de llegar acá -- ver
  // docs/ai-agent-architecture.md §5. null = no se pudo identificar al
  // cliente por el teléfono entrante.
  clienteId: string | null;
}

export type ToolResult = { ok: true; data: unknown } | { ok: false; error: string };

async function requireCliente(ctx: ToolExecutionContext) {
  if (!ctx.clienteId) {
    throw new AppError("No se pudo identificar al cliente en esta conversación", 409);
  }
  return clienteService.getCliente(ctx.organizationId, ctx.clienteId);
}

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolExecutionContext,
): Promise<ToolResult> {
  try {
    switch (name) {
      case "consultar_mi_cuota": {
        const cliente = await requireCliente(ctx);
        return { ok: true, data: { cuota: cliente.cuota } };
      }

      case "consultar_mis_datos": {
        const cliente = await requireCliente(ctx);
        return {
          ok: true,
          data: { nombre: cliente.nombre, telefono: cliente.telefono, email: cliente.email },
        };
      }

      case "actualizar_mi_telefono": {
        await requireCliente(ctx);
        const parsed = updateClienteSchema
          .pick({ telefono: true })
          .safeParse({ telefono: args.telefono });
        if (!parsed.success) return { ok: false, error: "Teléfono inválido" };
        // ctx.clienteId no puede ser null acá: requireCliente ya tiró si lo era.
        const cliente = await clienteService.updateCliente(
          ctx.organizationId,
          ctx.clienteId as string,
          parsed.data,
        );
        return { ok: true, data: { telefono: cliente.telefono } };
      }

      case "actualizar_mi_email": {
        await requireCliente(ctx);
        const parsed = updateClienteSchema.pick({ email: true }).safeParse({ email: args.email });
        if (!parsed.success) return { ok: false, error: "Email inválido" };
        const cliente = await clienteService.updateCliente(
          ctx.organizationId,
          ctx.clienteId as string,
          parsed.data,
        );
        return { ok: true, data: { email: cliente.email } };
      }

      case "solicitar_hablar_con_alguien": {
        const motivo = typeof args.motivo === "string" ? args.motivo : undefined;
        return { ok: true, data: { derivado: true, motivo } };
      }

      default:
        return { ok: false, error: `Tool desconocida: ${name}` };
    }
  } catch (err) {
    if (err instanceof AppError) return { ok: false, error: err.message };
    throw err;
  }
}
