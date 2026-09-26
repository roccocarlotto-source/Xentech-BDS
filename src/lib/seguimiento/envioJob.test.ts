import assert from "node:assert/strict";
import { test } from "node:test";
import { procesarEnviosVencidos, type EnvioJobDeps } from "./envioJob";
import type { EnvioVencido } from "../../repositories/envio.repository";
import type { EmailProvider, EmailEnvioResultado } from "../email/emailProvider";

// Deps con no-ops por default -- cada test pisa solo lo que necesita.
// Mismo criterio que ResenaDeps en resena.service.test.ts.
function depsBase(overrides: Partial<EnvioJobDeps> = {}): EnvioJobDeps {
  return {
    buscarVencidos: async () => [],
    reclamar: async () => null,
    marcarEnviado: async () => undefined,
    marcarEstadoFinal: async () => undefined,
    revertirAProgramado: async () => undefined,
    contarPendientesDelPresupuesto: async () => 0,
    actualizarEstadoPresupuestoSiCoincide: async () => undefined,
    crearMensajeSaliente: async () => undefined,
    buscarConfig: async () => null,
    getEmailProvider: () => null,
    replyToBase: () => null,
    puedeEnviarPorWhatsapp: () => false,
    ultimoMensajeEntranteWhatsapp: async () => null,
    enviarPorWhatsapp: async () => ({ ok: false, error: "no configurado en el test" }),
    devolverSinGastarIntento: async () => undefined,
    ...overrides,
  };
}

function envioDePrueba(overrides: Partial<EnvioVencido> = {}): EnvioVencido {
  return {
    id: "envio-1",
    organizationId: "org-1",
    presupuestoId: "presu-1",
    paso: 1,
    canal: "EMAIL",
    intentos: 0,
    claveIdempotencia: "presu-1:1:EMAIL",
    presupuesto: {
      estado: "PENDIENTE",
      monto: null,
      moneda: null,
      cliente: {
        id: "cli-1",
        nombre: "Panadería La Espiga",
        personaContacto: "Rosana Fernández",
        email: "cliente@example.com",
        telefono: "+59899111222",
      },
      consentimientos: [{ canal: "EMAIL" as const, bajaEn: null }],
    },
    ...overrides,
  };
}

const AHORA = new Date("2026-08-14T12:00:00Z"); // 09:00 en America/Montevideo -- dentro de la ventana default.

function providerQueEnviaOk(): EmailProvider {
  return { enviar: async () => ({ ok: true, providerMessageId: "msg-1" }) };
}

function providerQueFalla(error = "timeout del proveedor"): EmailProvider {
  return { enviar: async () => ({ ok: false, error }) as EmailEnvioResultado };
}

test("procesarEnviosVencidos no toca nada si NINGÚN canal está configurado", async () => {
  let seLlamoBuscarVencidos = false;
  const deps = depsBase({
    buscarVencidos: async () => {
      seLlamoBuscarVencidos = true;
      return [envioDePrueba()];
    },
    getEmailProvider: () => null,
  });

  const resultado = await procesarEnviosVencidos(AHORA, 50, deps);

  assert.equal(seLlamoBuscarVencidos, false);
  assert.deepEqual(resultado, {
    procesados: 0,
    enviados: 0,
    cancelados: 0,
    fallidos: 0,
    reintentados: 0,
    saltadosPorHorario: 0,
    saltadosPorCarrera: 0,
    saltadosPorCanalSinConfigurar: 0,
  });
});

test("procesarEnviosVencidos salta (sin reclamar) los envíos fuera de la ventana horaria de la organización", async () => {
  let seLlamoReclamar = false;
  const deps = depsBase({
    buscarVencidos: async () => [envioDePrueba()],
    reclamar: async () => {
      seLlamoReclamar = true;
      return { intentos: 1 };
    },
    getEmailProvider: providerQueEnviaOk,
  });

  // 12:00 UTC == 09:00 en Montevideo -- fuera de una ventana 10-20 configurada.
  const config = {
    horaInicioEnvio: 10,
    horaFinEnvio: 20,
    zonaHoraria: "America/Montevideo",
    maxIntentos: 3,
    plantillas: {},
  };
  const resultado = await procesarEnviosVencidos(AHORA, 50, {
    ...deps,
    buscarConfig: async () => config,
  });

  assert.equal(seLlamoReclamar, false);
  assert.equal(resultado.saltadosPorHorario, 1);
  assert.equal(resultado.procesados, 0);
});

test("procesarEnviosVencidos cuenta como carrera perdida si otra corrida ya reclamó la fila", async () => {
  const deps = depsBase({
    buscarVencidos: async () => [envioDePrueba()],
    reclamar: async () => null, // ya no está en PROGRAMADO
    getEmailProvider: providerQueEnviaOk,
  });

  const resultado = await procesarEnviosVencidos(AHORA, 50, deps);

  assert.equal(resultado.saltadosPorCarrera, 1);
  assert.equal(resultado.procesados, 0);
});

test("procesarEnviosVencidos manda el email, registra el mensaje y pasa el presupuesto a EN_SEGUIMIENTO", async () => {
  const llamadas: Record<string, unknown[]> = {
    marcarEnviado: [],
    actualizarEstado: [],
    crearMensaje: [],
    enviar: [],
  };

  const provider: EmailProvider = {
    enviar: async (email) => {
      (llamadas.enviar as unknown[]).push(email);
      return { ok: true, providerMessageId: "msg-123" };
    },
  };

  const deps = depsBase({
    buscarVencidos: async () => [envioDePrueba()],
    reclamar: async () => ({ intentos: 1 }),
    getEmailProvider: () => provider,
    marcarEnviado: async (id) => {
      (llamadas.marcarEnviado as unknown[]).push(id);
    },
    actualizarEstadoPresupuestoSiCoincide: async (organizationId, id, desde, hasta) => {
      (llamadas.actualizarEstado as unknown[]).push({ organizationId, id, desde, hasta });
    },
    crearMensajeSaliente: async (data) => {
      (llamadas.crearMensaje as unknown[]).push(data);
    },
    contarPendientesDelPresupuesto: async () => 1, // todavía quedan otros pasos.
  });

  const resultado = await procesarEnviosVencidos(AHORA, 50, deps);

  assert.equal(resultado.enviados, 1);
  assert.deepEqual(llamadas.marcarEnviado, ["envio-1"]);
  assert.deepEqual(llamadas.actualizarEstado, [
    { organizationId: "org-1", id: "presu-1", desde: ["PENDIENTE"], hasta: "EN_SEGUIMIENTO" },
  ]);
  assert.equal((llamadas.crearMensaje[0] as { externalId: string }).externalId, "msg-123");
  assert.equal((llamadas.enviar[0] as { to: string }).to, "cliente@example.com");
});

test("procesarEnviosVencidos marca SIN_RESPUESTA cuando el envío que se manda era el último pendiente", async () => {
  const llamadas: Array<{ desde: string[]; hasta: string }> = [];

  const deps = depsBase({
    buscarVencidos: async () => [envioDePrueba()],
    reclamar: async () => ({ intentos: 1 }),
    getEmailProvider: providerQueEnviaOk,
    contarPendientesDelPresupuesto: async () => 0, // no queda nada más -- era el último paso.
    actualizarEstadoPresupuestoSiCoincide: async (_org, _id, desde, hasta) => {
      llamadas.push({ desde, hasta });
    },
  });

  await procesarEnviosVencidos(AHORA, 50, deps);

  // Primero el intento de EN_SEGUIMIENTO (tras el envío), después el cierre
  // de secuencia a SIN_RESPUESTA -- ambos son UPDATE condicionales, así que
  // no importa si el primero no matcheó en la base real.
  assert.deepEqual(llamadas, [
    { desde: ["PENDIENTE"], hasta: "EN_SEGUIMIENTO" },
    { desde: ["PENDIENTE", "EN_SEGUIMIENTO"], hasta: "SIN_RESPUESTA" },
  ]);
});

test("procesarEnviosVencidos cancela (sin reintentar) si el cliente no tiene email", async () => {
  const marcados: Array<{ estado: string; motivo: string }> = [];

  const deps = depsBase({
    buscarVencidos: async () => [
      envioDePrueba({
        presupuesto: {
          ...envioDePrueba().presupuesto,
          cliente: {
            id: "cli-1",
            nombre: "Sin email",
            personaContacto: null,
            email: null,
            telefono: null,
          },
        },
      }),
    ],
    reclamar: async () => ({ intentos: 1 }),
    getEmailProvider: providerQueEnviaOk,
    marcarEstadoFinal: async (_id, _org, estado, motivo) => {
      marcados.push({ estado, motivo });
    },
  });

  const resultado = await procesarEnviosVencidos(AHORA, 50, deps);

  assert.equal(resultado.cancelados, 1);
  assert.equal(marcados[0].estado, "CANCELADO");
  assert.match(marcados[0].motivo, /email/);
});

test("procesarEnviosVencidos reintenta (vuelve a PROGRAMADO) si falla el envío y quedan intentos", async () => {
  const revertidos: Array<{ id: string; motivo: string }> = [];

  const deps = depsBase({
    buscarVencidos: async () => [envioDePrueba({ intentos: 0 })],
    reclamar: async () => ({ intentos: 1 }), // 1 <= maxIntentos default (3)
    getEmailProvider: () => providerQueFalla("error de red"),
    revertirAProgramado: async (id, _org, motivo) => {
      revertidos.push({ id, motivo });
    },
  });

  const resultado = await procesarEnviosVencidos(AHORA, 50, deps);

  assert.equal(resultado.reintentados, 1);
  assert.equal(resultado.fallidos, 0);
  assert.deepEqual(revertidos, [{ id: "envio-1", motivo: "error de red" }]);
});

test("procesarEnviosVencidos marca FALLIDO (definitivo) si falla el envío y ya no quedan intentos", async () => {
  const marcados: Array<{ estado: string }> = [];

  const deps = depsBase({
    buscarVencidos: async () => [envioDePrueba()],
    reclamar: async () => ({ intentos: 3 }), // == maxIntentos default (3)
    getEmailProvider: () => providerQueFalla(),
    marcarEstadoFinal: async (_id, _org, estado) => {
      marcados.push({ estado });
    },
  });

  const resultado = await procesarEnviosVencidos(AHORA, 50, deps);

  assert.equal(resultado.fallidos, 1);
  assert.equal(marcados[0].estado, "FALLIDO");
});

test("procesarEnviosVencidos usa la plantilla de ConfigSeguimiento correspondiente al paso", async () => {
  let asuntoEnviado: string | undefined;
  const provider: EmailProvider = {
    enviar: async (email) => {
      asuntoEnviado = email.subject;
      return { ok: true, providerMessageId: "msg-1" };
    },
  };

  const deps = depsBase({
    buscarVencidos: async () => [envioDePrueba({ paso: 2 })],
    reclamar: async () => ({ intentos: 1 }),
    getEmailProvider: () => provider,
    buscarConfig: async () => ({
      horaInicioEnvio: 9,
      horaFinEnvio: 20,
      zonaHoraria: "America/Montevideo",
      maxIntentos: 3,
      plantillas: {
        EMAIL: [
          { asunto: "Paso 1", cuerpo: "Cuerpo 1" },
          { asunto: "Paso 2 -- ¿alguna novedad?", cuerpo: "Cuerpo 2" },
        ],
        WHATSAPP: [],
      },
    }),
  });

  await procesarEnviosVencidos(AHORA, 50, deps);

  assert.equal(asuntoEnviado, "Paso 2 -- ¿alguna novedad?");
});

// --- etapa 6: envíos por WhatsApp ---

function envioWhatsapp(overrides: Partial<EnvioVencido> = {}): EnvioVencido {
  const base = envioDePrueba();
  return {
    ...base,
    canal: "WHATSAPP",
    claveIdempotencia: "presu-1:1:WHATSAPP",
    presupuesto: {
      ...base.presupuesto,
      consentimientos: [{ canal: "WHATSAPP" as const, bajaEn: null }],
    },
    ...overrides,
  };
}

test("un Envio de WhatsApp fuera de la ventana de 24 h sale como plantilla", async () => {
  const mandados: unknown[] = [];
  const deps = depsBase({
    buscarVencidos: async () => [envioWhatsapp()],
    reclamar: async () => ({ intentos: 1 }),
    buscarConfig: async () => ({
      horaInicioEnvio: 0,
      horaFinEnvio: 24,
      zonaHoraria: "America/Montevideo",
      maxIntentos: 3,
      plantillas: { WHATSAPP: [{ nombre: "seguimiento_1", idioma: "es" }] },
    }),
    puedeEnviarPorWhatsapp: () => true,
    ultimoMensajeEntranteWhatsapp: async () => null,
    enviarPorWhatsapp: async (params) => {
      mandados.push(params.contenido);
      return { ok: true, providerMessageId: "wamid.1" };
    },
  });

  const resultado = await procesarEnviosVencidos(AHORA, 50, deps);

  assert.equal(resultado.enviados, 1);
  assert.deepEqual(mandados, [
    {
      modo: "plantilla",
      plantilla: { nombre: "seguimiento_1", idioma: "es" },
      parametros: ["Rosana Fernández"],
    },
  ]);
});

test("con la ventana abierta sale texto libre, sin plantilla", async () => {
  const mandados: Array<{ modo: string }> = [];
  const deps = depsBase({
    buscarVencidos: async () => [envioWhatsapp()],
    reclamar: async () => ({ intentos: 1 }),
    buscarConfig: async () => ({
      horaInicioEnvio: 0,
      horaFinEnvio: 24,
      zonaHoraria: "America/Montevideo",
      maxIntentos: 3,
      plantillas: {},
    }),
    puedeEnviarPorWhatsapp: () => true,
    // El cliente escribió hace una hora.
    ultimoMensajeEntranteWhatsapp: async () => new Date(AHORA.getTime() - 60 * 60 * 1000),
    enviarPorWhatsapp: async (params) => {
      mandados.push(params.contenido);
      return { ok: true, providerMessageId: "wamid.1" };
    },
  });

  const resultado = await procesarEnviosVencidos(AHORA, 50, deps);

  assert.equal(resultado.enviados, 1);
  assert.equal(mandados[0].modo, "texto");
});

test("fuera de la ventana y sin plantilla configurada: se devuelve sin gastar el intento", async () => {
  const devueltos: string[] = [];
  let seIntentoMandar = false;
  const deps = depsBase({
    buscarVencidos: async () => [envioWhatsapp()],
    reclamar: async () => ({ intentos: 1 }),
    buscarConfig: async () => ({
      horaInicioEnvio: 0,
      horaFinEnvio: 24,
      zonaHoraria: "America/Montevideo",
      maxIntentos: 3,
      plantillas: {},
    }),
    puedeEnviarPorWhatsapp: () => true,
    ultimoMensajeEntranteWhatsapp: async () => null,
    devolverSinGastarIntento: async (_id, _org, motivo) => {
      devueltos.push(motivo);
    },
    enviarPorWhatsapp: async () => {
      seIntentoMandar = true;
      return { ok: true, providerMessageId: "x" };
    },
  });

  const resultado = await procesarEnviosVencidos(AHORA, 50, deps);

  assert.equal(seIntentoMandar, false);
  assert.equal(resultado.saltadosPorCanalSinConfigurar, 1);
  assert.equal(resultado.enviados, 0);
  assert.match(devueltos[0], /plantilla de WhatsApp/);
});

test("sin WhatsApp configurado, sus Envio se saltean sin reclamar (el de email igual sale)", async () => {
  let reclamados = 0;
  const deps = depsBase({
    buscarVencidos: async () => [
      envioWhatsapp({ id: "env-wa" }),
      envioDePrueba({ id: "env-mail" }),
    ],
    reclamar: async () => {
      reclamados += 1;
      return { intentos: 1 };
    },
    getEmailProvider: providerQueEnviaOk,
    puedeEnviarPorWhatsapp: () => false,
  });

  const resultado = await procesarEnviosVencidos(AHORA, 50, deps);

  assert.equal(resultado.saltadosPorCanalSinConfigurar, 1);
  assert.equal(resultado.enviados, 1);
  // Solo se reclamó el de email: el de WhatsApp no gastó intento.
  assert.equal(reclamados, 1);
});

test("un cliente sin teléfono cancela el Envio de WhatsApp, no el de email", async () => {
  const finales: Array<{ estado: string; motivo: string }> = [];
  const deps = depsBase({
    buscarVencidos: async () => [
      envioWhatsapp({
        presupuesto: {
          ...envioWhatsapp().presupuesto,
          cliente: {
            id: "cli-1",
            nombre: "Sin teléfono",
            personaContacto: null,
            email: "igual@tiene.email",
            telefono: null,
          },
        },
      }),
    ],
    reclamar: async () => ({ intentos: 1 }),
    puedeEnviarPorWhatsapp: () => true,
    marcarEstadoFinal: async (_id, _org, estado, motivo) => {
      finales.push({ estado, motivo });
    },
  });

  const resultado = await procesarEnviosVencidos(AHORA, 50, deps);

  assert.equal(resultado.cancelados, 1);
  assert.match(finales[0].motivo, /no tiene teléfono/);
});
