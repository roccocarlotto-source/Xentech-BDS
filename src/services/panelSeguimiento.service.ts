import type { PresupuestoEstado, ClasificacionRespuesta } from "@prisma/client";
import { getEmailProvider, type EmailProvider } from "../lib/email/emailProvider";
import { presupuestoRepository } from "../repositories/presupuesto.repository";
import { generarLinkResena } from "./resena.service";
import { nombreDeLaPersona } from "../utils/nombreCliente";
import { AppError } from "../utils/AppError";

// Etapa 7, parte 2 (§6.6 "Panel interno"): la pantalla donde una persona ve
// qué pasó con cada presupuesto y decide si hace algo.
//
// Decisión de Rocco (2026-09-26) sobre el link de reseña: **sale automático,
// pero recién cuando una persona habilita "Solicitar reseña"**. O sea que el
// envío no lo dispara la IA: la IA marca el presupuesto como ACEPTADO y
// alguien aprieta el botón. Así una clasificación equivocada nunca termina
// en un pedido de reseña a alguien que no aceptó nada.

export interface PresupuestoEnPanel {
  id: string;
  estado: PresupuestoEstado;
  descripcion: string | null;
  monto: string | null;
  moneda: string | null;
  fechaEmision: Date | null;
  createdAt: Date;
  cliente: {
    id: string;
    nombre: string;
    personaContacto: string | null;
    email: string | null;
    telefono: string | null;
  };
  ultimaRespuesta: {
    fecha: Date;
    contenido: string;
    clasificacionIa: ClasificacionRespuesta | null;
    resumenIa: string | null;
    requiereVendedor: boolean | null;
  } | null;
  // Ya se generó al menos un link para este presupuesto: el botón no se
  // vuelve a ofrecer, para no pedir dos reseñas por el mismo trabajo.
  resenaSolicitada: boolean;
}

const LIMITE_PANEL = 200;

export async function listarPanel(organizationId: string): Promise<PresupuestoEnPanel[]> {
  const filas = await presupuestoRepository.listarParaPanel(organizationId, LIMITE_PANEL);

  return filas.map((p) => ({
    id: p.id,
    estado: p.estado,
    descripcion: p.descripcion,
    // Decimal de Prisma -> string: el frontend no hace cuentas con esto y
    // un number perdería precisión en montos grandes.
    monto: p.monto === null ? null : p.monto.toString(),
    moneda: p.moneda,
    fechaEmision: p.fechaEmision,
    createdAt: p.createdAt,
    cliente: p.cliente,
    ultimaRespuesta: p.mensajes[0] ?? null,
    resenaSolicitada: p._count.tokensResena > 0,
  }));
}

export interface ResultadoSolicitudResena {
  token: string;
  venceEn: Date;
  // false cuando no se pudo mandar el mail (sin proveedor, sin URL pública
  // configurada, o el cliente no tiene email). El token igual se generó:
  // la pantalla muestra el link para copiarlo y mandarlo a mano.
  emailEnviado: boolean;
  motivo: string | null;
}

// Promesas comunes y no los tipos de Prisma (PrismaPromise es
// encadenable y un fake en memoria no puede implementarlo) -- mismo motivo
// que el helper Asincrono de resena.service.ts.
export interface SolicitarResenaDeps {
  buscarPresupuesto: (
    organizationId: string,
    id: string,
  ) => Promise<{
    id: string;
    estado: PresupuestoEstado;
    clienteId: string;
    cliente: { nombre: string; personaContacto: string | null; email: string | null };
  } | null>;
  generarLink: (
    organizationId: string,
    input: { clienteId: string; presupuestoId?: string | null },
  ) => Promise<{ token: string; venceEn: Date }>;
  getEmailProvider: () => EmailProvider | null;
  urlPublica: () => string | null;
}

const defaultSolicitarDeps: SolicitarResenaDeps = {
  buscarPresupuesto: (organizationId, id) =>
    presupuestoRepository.findParaSolicitarResena(organizationId, id),
  generarLink: generarLinkResena,
  getEmailProvider,
  urlPublica: () => process.env.APP_PUBLIC_URL ?? null,
};

export async function solicitarResena(
  organizationId: string,
  presupuestoId: string,
  deps: SolicitarResenaDeps = defaultSolicitarDeps,
): Promise<ResultadoSolicitudResena> {
  const presupuesto = await deps.buscarPresupuesto(organizationId, presupuestoId);
  if (!presupuesto) throw new AppError("Presupuesto no encontrado", 404);

  // No se pide reseña de un trabajo que no se hizo. El estado lo puede
  // haber puesto la IA (etapa 7 parte 1) o una persona a mano.
  if (presupuesto.estado !== "ACEPTADO") {
    throw new AppError(
      "Solo se puede pedir una reseña de un presupuesto aceptado. Marcalo como aceptado primero.",
      409,
    );
  }

  const { token, venceEn } = await deps.generarLink(organizationId, {
    clienteId: presupuesto.clienteId,
    presupuestoId: presupuesto.id,
  });

  const noEnviado = (motivo: string): ResultadoSolicitudResena => ({
    token,
    venceEn,
    emailEnviado: false,
    motivo,
  });

  const email = presupuesto.cliente.email;
  if (!email) return noEnviado("El cliente no tiene email cargado.");

  const base = deps.urlPublica();
  if (!base) {
    return noEnviado("Falta configurar APP_PUBLIC_URL: el link no se puede armar completo.");
  }

  const provider = deps.getEmailProvider();
  if (!provider) return noEnviado("No hay proveedor de email configurado.");

  const quien = nombreDeLaPersona(presupuesto.cliente);
  const enviado = await provider.enviar({
    to: email,
    subject: "¿Cómo fue tu experiencia?",
    body: [
      `Hola ${quien},`,
      "",
      "Gracias por confiar en nosotros. Si tenés un minuto, nos ayuda mucho que cuentes cómo te fue:",
      "",
      `${base.replace(/\/+$/, "")}/r/${token}`,
      "",
      "Son dos clics y podés dejarlo anónimo si preferís.",
    ].join("\n"),
  });

  return enviado.ok
    ? { token, venceEn, emailEnviado: true, motivo: null }
    : noEnviado(enviado.error);
}
