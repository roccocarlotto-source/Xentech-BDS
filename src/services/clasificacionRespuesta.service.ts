import type { ClasificacionRespuesta, PresupuestoEstado } from "@prisma/client";
import { getLlmProvider } from "../lib/llm/provider";
import type { LlmProvider } from "../lib/llm/types";
import { getEmailProvider, type EmailProvider } from "../lib/email/emailProvider";
import {
  clasificarRespuesta,
  consecuenciasDe,
  resolverModeloClasificacion,
  type Clasificacion,
} from "../lib/seguimiento/clasificacionRespuesta";
import { quitarCitaDelOriginal } from "../lib/seguimiento/deteccionBaja";
import { mensajeSeguimientoRepository } from "../repositories/mensajeSeguimiento.repository";
import { presupuestoRepository } from "../repositories/presupuesto.repository";
import { userRepository } from "../repositories/user.repository";

// Etapa 7 (§6.5): pasa por la IA las respuestas entrantes que todavía nadie
// clasificó, y actúa según lo que dijo el cliente.
//
// Corre en un poller y no en el webhook, a diferencia de la baja: llamar al
// modelo es lento y puede fallar, y el webhook de Resend tiene que
// responder rápido. La baja sí va inline porque no puede esperar (§5).
//
// La cola es la propia tabla: los INBOUND con `clasificacionIa` en null.

export interface ClasificacionDeps {
  buscarSinClasificar: (limit: number) => Promise<MensajeSinClasificar[]>;
  guardarClasificacion: (
    id: string,
    organizationId: string,
    data: {
      clasificacionIa: ClasificacionRespuesta;
      resumenIa: string;
      requiereVendedor: boolean;
    },
  ) => Promise<{ count: number }>;
  actualizarEstadoPresupuestoSiCoincide: (
    organizationId: string,
    id: string,
    desde: PresupuestoEstado[],
    hasta: PresupuestoEstado,
  ) => Promise<unknown>;
  buscarUsuario: (organizationId: string, id: string) => Promise<{ email: string } | null>;
  getLlmProvider: () => LlmProvider;
  getEmailProvider: () => EmailProvider | null;
  modelo: () => string;
}

export interface MensajeSinClasificar {
  id: string;
  organizationId: string;
  presupuestoId: string | null;
  clienteId: string;
  contenido: string;
  presupuesto: {
    estado: PresupuestoEstado;
    vendedorId: string | null;
    creadoPorId: string;
    descripcion: string | null;
  } | null;
  cliente: { nombre: string; personaContacto: string | null };
}

const defaultDeps: ClasificacionDeps = {
  buscarSinClasificar: (limit) => mensajeSeguimientoRepository.buscarSinClasificar(limit),
  guardarClasificacion: (id, organizationId, data) =>
    mensajeSeguimientoRepository.guardarClasificacion(id, organizationId, data),
  actualizarEstadoPresupuestoSiCoincide: (organizationId, id, desde, hasta) =>
    presupuestoRepository.actualizarEstadoSiCoincide(organizationId, id, desde, hasta),
  buscarUsuario: (organizationId, id) => userRepository.findById(organizationId, id),
  get getLlmProvider() {
    return getLlmProvider;
  },
  getEmailProvider,
  modelo: resolverModeloClasificacion,
};

export interface ResultadoCorrida {
  clasificados: number;
  avisados: number;
  fallidos: number;
}

// Estados en los que el presupuesto todavía está "abierto" y por lo tanto
// una respuesta puede cambiarlo. Si ya está cerrado, la clasificación se
// guarda igual (sirve de historial) pero no pisa el estado.
const ESTADOS_ABIERTOS: PresupuestoEstado[] = ["PENDIENTE", "EN_SEGUIMIENTO"];

export async function clasificarRespuestasPendientes(
  limit = 20,
  deps: ClasificacionDeps = defaultDeps,
): Promise<ResultadoCorrida> {
  const resultado: ResultadoCorrida = { clasificados: 0, avisados: 0, fallidos: 0 };

  const pendientes = await deps.buscarSinClasificar(limit);
  if (pendientes.length === 0) return resultado;

  for (const mensaje of pendientes) {
    try {
      // Se clasifica lo que la persona escribió, no la cadena citada
      // entera: mismo criterio (y misma función) que la detección de baja.
      const texto = quitarCitaDelOriginal(mensaje.contenido) || mensaje.contenido;

      const { clasificacion, resumen } = await clasificarRespuesta({
        llmProvider: deps.getLlmProvider(),
        modelo: deps.modelo(),
        texto,
      });

      const consecuencias = consecuenciasDe(clasificacion as Clasificacion);

      // El claim y el guardado son lo mismo: si otra corrida se adelantó,
      // count es 0 y no se hace nada más (ni se avisa dos veces).
      const { count } = await deps.guardarClasificacion(mensaje.id, mensaje.organizationId, {
        clasificacionIa: clasificacion as ClasificacionRespuesta,
        resumenIa: resumen,
        requiereVendedor: consecuencias.requiereVendedor,
      });
      if (count === 0) continue;

      resultado.clasificados += 1;

      if (consecuencias.nuevoEstado && mensaje.presupuestoId) {
        await deps.actualizarEstadoPresupuestoSiCoincide(
          mensaje.organizationId,
          mensaje.presupuestoId,
          ESTADOS_ABIERTOS,
          consecuencias.nuevoEstado,
        );
      }

      if (consecuencias.requiereVendedor) {
        const avisado = await avisarAlVendedor(mensaje, clasificacion, resumen, deps);
        if (avisado) resultado.avisados += 1;
      }
    } catch {
      // Un mensaje que falla no frena el lote: queda sin clasificar y el
      // próximo tick lo reintenta. Si el problema es permanente (un texto
      // que el modelo nunca puede procesar) se va a reintentar para
      // siempre -- aceptable por ahora, anotado en el doc.
      resultado.fallidos += 1;
    }
  }

  return resultado;
}

// Decisión de Rocco (2026-09-26): al vendedor se le avisa por las DOS vías.
// La marca en el panel ya quedó con `requiereVendedor`; esto es el email.
// Si no hay proveedor configurado, la marca igual está: el aviso no se
// pierde, solo llega más tarde, cuando alguien mire el panel.
async function avisarAlVendedor(
  mensaje: MensajeSinClasificar,
  clasificacion: string,
  resumen: string,
  deps: ClasificacionDeps,
): Promise<boolean> {
  const provider = deps.getEmailProvider();
  if (!provider || !mensaje.presupuesto) return false;

  // El vendedor del presupuesto; si no tiene uno asignado (pasa: el nombre
  // extraído del documento puede no matchear ningún usuario), le llega a
  // quien lo cargó.
  const destinatarioId = mensaje.presupuesto.vendedorId ?? mensaje.presupuesto.creadoPorId;
  const usuario = await deps.buscarUsuario(mensaje.organizationId, destinatarioId);
  if (!usuario?.email) return false;

  const quien = mensaje.cliente.personaContacto?.trim() || mensaje.cliente.nombre;
  const resultado = await provider.enviar({
    to: usuario.email,
    subject: `${quien} respondió: ${etiqueta(clasificacion)}`,
    body: [
      `${quien} respondió al seguimiento de un presupuesto y hace falta que lo mires.`,
      "",
      `Qué dijo: ${resumen}`,
      mensaje.presupuesto.descripcion ? `Presupuesto: ${mensaje.presupuesto.descripcion}` : null,
      "",
      "El texto completo está en el panel de seguimiento.",
    ]
      .filter((l): l is string => l !== null)
      .join("\n"),
  });

  return resultado.ok;
}

function etiqueta(clasificacion: string): string {
  switch (clasificacion) {
    case "ACEPTA":
      return "acepta el presupuesto";
    case "PIDE_DESCUENTO":
      return "pide un descuento";
    case "QUIERE_LLAMADA":
      return "quiere que lo llamen";
    default:
      return "necesita respuesta";
  }
}
