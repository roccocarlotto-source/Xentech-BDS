import type { CanalSeguimiento, EnvioEstado, PresupuestoEstado } from "@prisma/client";
import { envioRepository, type EnvioVencido } from "../../repositories/envio.repository";
import { presupuestoRepository } from "../../repositories/presupuesto.repository";
import { mensajeSeguimientoRepository } from "../../repositories/mensajeSeguimiento.repository";
import {
  configSeguimientoRepository,
  type ConfigSeguimientoParaEnvio,
} from "../../repositories/configSeguimiento.repository";
import {
  getEmailProvider,
  type EmailEnvioResultado,
  type EmailProvider,
} from "../email/emailProvider";
import { evaluarPrecondicionesEnvio } from "./envioChecks";
import { armarEmailSeguimiento, type PlantillaEmail } from "./envioContenido";
import { estaDentroDeVentanaDeEnvio } from "./envioVentana";
import { nombreDeLaPersona } from "../../utils/nombreCliente";
import { direccionDeRespuesta } from "../email/direccionRespuesta";
import {
  decidirEnvioWhatsapp,
  dentroDeVentana24h,
  extraerPlantillaWhatsapp,
  type QueMandarPorWhatsapp,
} from "./envioWhatsapp";
import { enviarPorWhatsapp } from "./enviarWhatsappSeguimiento";
import { HORA_FIN_ENVIO_DEFAULT, MAX_INTENTOS_DEFAULT } from "./configDefaults";
import { HORA_INICIO_ENVIO_DEFAULT, ZONA_HORARIA_DEFAULT } from "./envioScheduling";

// Etapa 5, paso 2 de docs/seguimiento-resenas-diseno.md (§6.3): procesa los
// `Envio` de email vencidos. Deps inyectables -- mismo patrón que
// inboundJobProcessor.ts / resena.service.ts, para poder testear las
// reglas (horario, precondiciones, idempotencia, cierre de secuencia) sin
// Prisma ni un proveedor de email real.

export interface EnvioJobDeps {
  buscarVencidos: (ahora: Date, limit: number) => Promise<EnvioVencido[]>;
  reclamar: (id: string, organizationId: string) => Promise<{ intentos: number } | null>;
  marcarEnviado: (id: string, organizationId: string, enviadoEn: Date) => Promise<unknown>;
  marcarEstadoFinal: (
    id: string,
    organizationId: string,
    estado: EnvioEstado,
    motivo: string,
  ) => Promise<unknown>;
  revertirAProgramado: (id: string, organizationId: string, motivo: string) => Promise<unknown>;
  contarPendientesDelPresupuesto: (
    organizationId: string,
    presupuestoId: string,
  ) => Promise<number>;
  actualizarEstadoPresupuestoSiCoincide: (
    organizationId: string,
    id: string,
    desde: PresupuestoEstado[],
    hasta: PresupuestoEstado,
  ) => Promise<unknown>;
  crearMensajeSaliente: (data: {
    organizationId: string;
    canal: CanalSeguimiento;
    presupuestoId: string;
    clienteId: string;
    envioId: string;
    contenido: string;
    fecha: Date;
    externalId: string;
  }) => Promise<unknown>;
  buscarConfig: (organizationId: string) => Promise<ConfigSeguimientoParaEnvio | null>;
  getEmailProvider: () => EmailProvider | null;
  replyToBase: () => string | null;
  // Etapa 6. `puedeEnviarPorWhatsapp` es el equivalente de tener provider
  // de email: sin la clave que desencripta los tokens no se puede mandar
  // nada, y conviene no tocar las filas.
  puedeEnviarPorWhatsapp: () => boolean;
  ultimoMensajeEntranteWhatsapp: (
    organizationId: string,
    clienteId: string,
  ) => Promise<Date | null>;
  enviarPorWhatsapp: (params: {
    organizationId: string;
    to: string;
    contenido: Exclude<QueMandarPorWhatsapp, { modo: "falta_plantilla" }>;
  }) => Promise<EmailEnvioResultado>;
  devolverSinGastarIntento: (
    id: string,
    organizationId: string,
    motivo: string,
  ) => Promise<unknown>;
}

const defaultDeps: EnvioJobDeps = {
  buscarVencidos: (ahora, limit) => envioRepository.buscarVencidos(ahora, limit),
  reclamar: (id, organizationId) => envioRepository.reclamar(id, organizationId),
  marcarEnviado: (id, organizationId, enviadoEn) =>
    envioRepository.marcarEnviado(id, organizationId, enviadoEn),
  marcarEstadoFinal: (id, organizationId, estado, motivo) =>
    envioRepository.marcarEstadoFinal(id, organizationId, estado, motivo),
  revertirAProgramado: (id, organizationId, motivo) =>
    envioRepository.revertirAProgramado(id, organizationId, motivo),
  contarPendientesDelPresupuesto: (organizationId, presupuestoId) =>
    envioRepository.contarPendientesDelPresupuesto(organizationId, presupuestoId),
  actualizarEstadoPresupuestoSiCoincide: (organizationId, id, desde, hasta) =>
    presupuestoRepository.actualizarEstadoSiCoincide(organizationId, id, desde, hasta),
  crearMensajeSaliente: (data) => mensajeSeguimientoRepository.crearSaliente(data),
  buscarConfig: (organizationId) =>
    configSeguimientoRepository.buscarPorOrganizacion(organizationId),
  getEmailProvider,
  replyToBase: () => process.env.EMAIL_REPLY_TO ?? null,
  puedeEnviarPorWhatsapp: () => !!process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY,
  ultimoMensajeEntranteWhatsapp: (organizationId, clienteId) =>
    mensajeSeguimientoRepository.ultimoEntranteWhatsapp(organizationId, clienteId),
  enviarPorWhatsapp: (params) => enviarPorWhatsapp(params),
  devolverSinGastarIntento: (id, organizationId, motivo) =>
    envioRepository.devolverSinGastarIntento(id, organizationId, motivo),
};

export interface ProcesarEnviosVencidosResultado {
  procesados: number;
  enviados: number;
  cancelados: number;
  fallidos: number;
  reintentados: number;
  saltadosPorHorario: number;
  saltadosPorCarrera: number;
  // Etapa 6: el canal de esa fila todavía no se puede usar (sin proveedor
  // de email, sin clave de WhatsApp, o sin plantilla para ese paso). No se
  // gastó ningún intento.
  saltadosPorCanalSinConfigurar: number;
}

function resultadoVacio(): ProcesarEnviosVencidosResultado {
  return {
    procesados: 0,
    enviados: 0,
    cancelados: 0,
    fallidos: 0,
    reintentados: 0,
    saltadosPorHorario: 0,
    saltadosPorCarrera: 0,
    saltadosPorCanalSinConfigurar: 0,
  };
}

// §6.6 / etapa 8: plantillas.EMAIL es un array por paso (índice = paso - 1).
// `plantillas` llega como Json de Prisma (tipado `unknown` a propósito, ver
// configSeguimiento.repository.ts) -- todavía no hay panel para escribirlo,
// así que en la práctica hoy siempre es `{}` (el default del schema) y esto
// devuelve `undefined`. Defensivo ante cualquier forma inesperada: un dato
// corrupto en `plantillas` no debería tirar el job entero, solo hacer que
// ese paso use el texto genérico.
function extraerPlantillaEmail(plantillas: unknown, paso: number): PlantillaEmail | undefined {
  if (!plantillas || typeof plantillas !== "object") return undefined;
  const email = (plantillas as Record<string, unknown>).EMAIL;
  if (!Array.isArray(email)) return undefined;
  const candidata = email[paso - 1];
  if (
    candidata &&
    typeof candidata === "object" &&
    typeof (candidata as Record<string, unknown>).asunto === "string" &&
    typeof (candidata as Record<string, unknown>).cuerpo === "string"
  ) {
    return candidata as PlantillaEmail;
  }
  return undefined;
}

// §6.3, punto 4: "programa el siguiente paso, o marca sin_respuesta si
// terminó la secuencia" -- como paso 1 de esta etapa ya programa TODOS los
// pasos de una vez (envioScheduling.ts), acá no hay nada que programar:
// solo queda revisar si este era el último `Envio` pendiente del
// presupuesto y, si nadie lo aceptó/rechazó en el medio, marcarlo
// `SIN_RESPUESTA`. Decisión propia, a confirmar por Rocco: esto corre
// apenas se resuelve el ÚLTIMO paso (se mande, se cancele o falle
// definitivamente), no después de esperar una respuesta -- todavía no hay
// mecanismo de recepción de respuestas (§6.4/§6.5, sigue en esta etapa) que
// pueda "ganarle" a esta marca en el medio.
async function cerrarSecuenciaSiTermino(
  envio: Pick<EnvioVencido, "organizationId" | "presupuestoId">,
  deps: EnvioJobDeps,
): Promise<void> {
  const pendientes = await deps.contarPendientesDelPresupuesto(
    envio.organizationId,
    envio.presupuestoId,
  );
  if (pendientes === 0) {
    await deps.actualizarEstadoPresupuestoSiCoincide(
      envio.organizationId,
      envio.presupuestoId,
      ["PENDIENTE", "EN_SEGUIMIENTO"],
      "SIN_RESPUESTA",
    );
  }
}

export async function procesarEnviosVencidos(
  ahora: Date = new Date(),
  limit = 50,
  deps: EnvioJobDeps = defaultDeps,
): Promise<ProcesarEnviosVencidosResultado> {
  const resultado = resultadoVacio();

  const emailProvider = deps.getEmailProvider();
  const puedeWhatsapp = deps.puedeEnviarPorWhatsapp();
  if (!emailProvider && !puedeWhatsapp) {
    // Ningún canal configurado (sin proveedor de email y sin la clave de
    // encriptación de los tokens de WhatsApp) -- ni se lee la lista de
    // vencidos. Importante: NO tocar ninguna fila de Envio en este caso,
    // para no gastarles `intentos` contra algo que todavía no existe.
    return resultado;
  }

  const vencidos = await deps.buscarVencidos(ahora, limit);
  const configPorOrganizacion = new Map<string, ConfigSeguimientoParaEnvio | null>();

  for (const envio of vencidos) {
    let config = configPorOrganizacion.get(envio.organizationId);
    if (config === undefined) {
      config = await deps.buscarConfig(envio.organizationId);
      configPorOrganizacion.set(envio.organizationId, config);
    }

    const horaInicioEnvio = config?.horaInicioEnvio ?? HORA_INICIO_ENVIO_DEFAULT;
    const horaFinEnvio = config?.horaFinEnvio ?? HORA_FIN_ENVIO_DEFAULT;
    const zonaHoraria = config?.zonaHoraria ?? ZONA_HORARIA_DEFAULT;
    const maxIntentos = config?.maxIntentos ?? MAX_INTENTOS_DEFAULT;

    if (!estaDentroDeVentanaDeEnvio(ahora, zonaHoraria, horaInicioEnvio, horaFinEnvio)) {
      resultado.saltadosPorHorario += 1;
      continue; // No se reclama -- sigue PROGRAMADO, se reintenta en un tick dentro de la ventana.
    }

    // El canal de ESTA fila no está configurado (p. ej. hay WhatsApp pero
    // no proveedor de email). Se saltea SIN reclamar, igual que fuera de
    // horario: en cuanto se configure, sale sola en el siguiente tick.
    const canalConfigurado = envio.canal === "EMAIL" ? emailProvider !== null : puedeWhatsapp;
    if (!canalConfigurado) {
      resultado.saltadosPorCanalSinConfigurar += 1;
      continue;
    }

    const claim = await deps.reclamar(envio.id, envio.organizationId);
    if (!claim) {
      resultado.saltadosPorCarrera += 1; // Otra corrida del job ya se la llevó.
      continue;
    }

    resultado.procesados += 1;

    const precondicion = evaluarPrecondicionesEnvio({
      presupuestoEstado: envio.presupuesto.estado,
      canal: envio.canal,
      contacto: contactoDelCanal(envio),
      consentimiento: envio.presupuesto.consentimientos[0] ?? null,
      intentos: claim.intentos,
      maxIntentos,
    });

    if (!precondicion.puedeEnviar) {
      await deps.marcarEstadoFinal(
        envio.id,
        envio.organizationId,
        precondicion.estadoFinal,
        precondicion.motivo,
      );
      if (precondicion.estadoFinal === "CANCELADO") resultado.cancelados += 1;
      else resultado.fallidos += 1;
      await cerrarSecuenciaSiTermino(envio, deps);
      continue;
    }

    // El check anterior garantiza que hay dato de contacto para el canal.
    const destinatario = contactoDelCanal(envio) as string;
    const email = armarEmailSeguimiento(
      {
        // A quién se le escribe, no cómo se identifica al cliente (§2,
        // decisión 4 del 2026-09-26): con empresa y persona separadas, el
        // saludo tiene que llevar la persona.
        clienteNombre: nombreDeLaPersona(envio.presupuesto.cliente),
        monto: envio.presupuesto.monto,
        moneda: envio.presupuesto.moneda,
      },
      extraerPlantillaEmail(config?.plantillas, envio.paso),
    );

    let envioResultado: EmailEnvioResultado;

    if (envio.canal === "EMAIL") {
      // Reply-To con el id del presupuesto (§6.4, ver direccionRespuesta.ts):
      // es lo que despues permite saber de que presupuesto es una respuesta.
      // Si EMAIL_REPLY_TO no esta configurada, se manda sin Reply-To y las
      // respuestas van al remitente -- el webhook igual las ubica por el
      // email del cliente, con el respaldo de respuestaEmail.service.ts.
      const replyToBase = deps.replyToBase();
      envioResultado = await emailProvider!.enviar({
        to: destinatario,
        subject: email.asunto,
        body: email.cuerpo,
        replyTo: replyToBase ? direccionDeRespuesta(replyToBase, envio.presupuestoId) : null,
      });
    } else {
      const queMandar = decidirEnvioWhatsapp({
        ventanaAbierta: dentroDeVentana24h(
          await deps.ultimoMensajeEntranteWhatsapp(
            envio.organizationId,
            envio.presupuesto.cliente.id,
          ),
          ahora,
        ),
        plantilla: extraerPlantillaWhatsapp(config?.plantillas, envio.paso),
        texto: email.cuerpo,
        parametros: [nombreDeLaPersona(envio.presupuesto.cliente)],
      });

      if (queMandar.modo === "falta_plantilla") {
        // Fuera de la ventana de 24 h y sin plantilla configurada para este
        // paso. No es un fallo del envío: falta configuración (etapa 8). Se
        // devuelve la fila a PROGRAMADO sin gastarle un intento, así cuando
        // el admin cargue la plantilla sale sola.
        await deps.devolverSinGastarIntento(
          envio.id,
          envio.organizationId,
          "falta configurar la plantilla de WhatsApp de este paso",
        );
        resultado.saltadosPorCanalSinConfigurar += 1;
        continue;
      }

      envioResultado = await deps.enviarPorWhatsapp({
        organizationId: envio.organizationId,
        to: destinatario,
        contenido: queMandar,
      });
    }

    if (envioResultado.ok) {
      await deps.marcarEnviado(envio.id, envio.organizationId, ahora);
      await deps.actualizarEstadoPresupuestoSiCoincide(
        envio.organizationId,
        envio.presupuestoId,
        ["PENDIENTE"],
        "EN_SEGUIMIENTO",
      );
      await deps.crearMensajeSaliente({
        organizationId: envio.organizationId,
        canal: envio.canal,
        presupuestoId: envio.presupuestoId,
        clienteId: envio.presupuesto.cliente.id,
        envioId: envio.id,
        contenido: email.cuerpo,
        fecha: ahora,
        externalId: envioResultado.providerMessageId,
      });
      resultado.enviados += 1;
      await cerrarSecuenciaSiTermino(envio, deps);
      continue;
    }

    if (claim.intentos >= maxIntentos) {
      await deps.marcarEstadoFinal(envio.id, envio.organizationId, "FALLIDO", envioResultado.error);
      resultado.fallidos += 1;
      await cerrarSecuenciaSiTermino(envio, deps);
    } else {
      await deps.revertirAProgramado(envio.id, envio.organizationId, envioResultado.error);
      resultado.reintentados += 1;
    }
  }

  return resultado;
}

// El dato de contacto que corresponde al canal de ese Envio.
function contactoDelCanal(envio: EnvioVencido): string | null {
  return envio.canal === "EMAIL"
    ? envio.presupuesto.cliente.email
    : envio.presupuesto.cliente.telefono;
}
