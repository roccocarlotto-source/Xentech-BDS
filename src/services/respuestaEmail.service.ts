import { clienteRepository } from "../repositories/cliente.repository";
import { consentimientoRepository } from "../repositories/consentimiento.repository";
import { envioRepository } from "../repositories/envio.repository";
import { mensajeSeguimientoRepository } from "../repositories/mensajeSeguimiento.repository";
import { presupuestoRepository } from "../repositories/presupuesto.repository";
import { buscarPresupuestoIdEnDestinatarios } from "../lib/email/direccionRespuesta";
import { esPedidoDeBaja } from "../lib/seguimiento/deteccionBaja";

// Etapa 5 de docs/seguimiento-resenas-diseno.md (§6.4): qué se hace con una
// respuesta por email de un cliente.
//
// Dos cosas, en este orden de importancia:
//   1. Si pide la baja, cortarle la secuencia YA (§5). Esto no se puede
//      perder ni postergar: es lo que el email le prometió y lo que la Ley
//      18.331 mira.
//   2. Registrar el mensaje entrante, que es además la cola de trabajo de
//      la etapa 7 (las filas con clasificacionIa = null son las que la IA
//      todavía no miró).
//
// Deps inyectables, mismo patrón que resena.service.ts / envioJob.ts.

export interface RespuestaEmailEntrante {
  externalId: string;
  from: string;
  to: string[];
  texto: string;
  fecha: Date;
}

export interface RespuestaEmailDeps {
  buscarPresupuesto: (id: string) => Promise<{
    id: string;
    organizationId: string;
    clienteId: string;
  } | null>;
  buscarClientePorEmail: (email: string) => Promise<{ id: string; organizationId: string } | null>;
  crearMensajeEntrante: (data: {
    organizationId: string;
    presupuestoId: string | null;
    clienteId: string;
    contenido: string;
    fecha: Date;
    externalId: string;
  }) => Promise<unknown>;
  marcarBaja: (organizationId: string, clienteId: string, enFecha: Date) => Promise<unknown>;
  cancelarEnviosPendientes: (
    organizationId: string,
    presupuestoId: string,
    motivo: string,
  ) => Promise<{ count: number }>;
}

const defaultDeps: RespuestaEmailDeps = {
  buscarPresupuesto: (id) => presupuestoRepository.findParaRespuestaEntrante(id),
  buscarClientePorEmail: (email) =>
    clienteRepository.findUnicoPorEmailEnTodasLasOrganizaciones(email),
  crearMensajeEntrante: (data) => mensajeSeguimientoRepository.crearEntrante(data),
  marcarBaja: (organizationId, clienteId, enFecha) =>
    consentimientoRepository.marcarBajaDelCliente(organizationId, clienteId, "EMAIL", enFecha),
  cancelarEnviosPendientes: (organizationId, presupuestoId, motivo) =>
    envioRepository.cancelarPendientesDelPresupuesto(organizationId, presupuestoId, motivo),
};

export type ResultadoRespuesta =
  | { estado: "procesada"; baja: boolean; enviosCancelados: number }
  | { estado: "sin_destinatario" }
  | { estado: "duplicada" };

const MOTIVO_BAJA = "El cliente pidió la baja por email";

export async function procesarRespuestaEmail(
  entrante: RespuestaEmailEntrante,
  deps: RespuestaEmailDeps = defaultDeps,
): Promise<ResultadoRespuesta> {
  const destino = await resolverDestino(entrante, deps);
  // Ni el tag del Reply-To ni el email del remitente sirvieron: no hay a
  // quién atribuir la respuesta. Se devuelve el caso para que el llamador
  // lo loguee -- si esto aparece seguido, algo anda mal con el Reply-To.
  if (!destino) return { estado: "sin_destinatario" };

  const pideBaja = esPedidoDeBaja(entrante.texto);

  // La baja va PRIMERO y fuera del registro del mensaje: si el insert del
  // mensaje falla (por ejemplo por el unique de externalId en un reintento
  // del webhook), la baja igual quedó aplicada. Al revés se perdería.
  let enviosCancelados = 0;
  if (pideBaja) {
    await deps.marcarBaja(destino.organizationId, destino.clienteId, entrante.fecha);
    if (destino.presupuestoId) {
      const { count } = await deps.cancelarEnviosPendientes(
        destino.organizationId,
        destino.presupuestoId,
        MOTIVO_BAJA,
      );
      enviosCancelados = count;
    }
  }

  try {
    await deps.crearMensajeEntrante({
      organizationId: destino.organizationId,
      presupuestoId: destino.presupuestoId,
      clienteId: destino.clienteId,
      contenido: entrante.texto,
      fecha: entrante.fecha,
      externalId: entrante.externalId,
    });
  } catch (err) {
    // externalId es unique: Resend reintenta los webhooks, así que el mismo
    // mail puede llegar dos veces. La segunda choca acá y no es un error.
    if (!esErrorDeUnicidad(err)) throw err;
    return { estado: "duplicada" };
  }

  return { estado: "procesada", baja: pideBaja, enviosCancelados };
}

async function resolverDestino(
  entrante: RespuestaEmailEntrante,
  deps: RespuestaEmailDeps,
): Promise<{ organizationId: string; clienteId: string; presupuestoId: string | null } | null> {
  // Camino normal: el tag del Reply-To dice exactamente de qué presupuesto
  // es la respuesta (ver direccionRespuesta.ts).
  const presupuestoId = buscarPresupuestoIdEnDestinatarios(entrante.to);
  if (presupuestoId) {
    const presupuesto = await deps.buscarPresupuesto(presupuestoId);
    if (presupuesto) {
      return {
        organizationId: presupuesto.organizationId,
        clienteId: presupuesto.clienteId,
        presupuestoId: presupuesto.id,
      };
    }
  }

  // Respaldo: sin tag utilizable, se ubica al cliente por su email. Queda
  // sin presupuesto asociado (no hay forma de saber cuál), así que la baja
  // se registra igual pero no se cancelan envíos de un presupuesto puntual
  // -- el chequeo de baja que hace el job antes de cada envío (§6.3 punto
  // 2, envioChecks.ts) igual los va a frenar a todos.
  const cliente = await deps.buscarClientePorEmail(entrante.from);
  if (cliente) {
    return {
      organizationId: cliente.organizationId,
      clienteId: cliente.id,
      presupuestoId: null,
    };
  }

  return null;
}

function esErrorDeUnicidad(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: unknown }).code === "P2002"
  );
}
