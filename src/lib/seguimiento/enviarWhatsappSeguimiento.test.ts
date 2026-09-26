import assert from "node:assert/strict";
import { test } from "node:test";
import { enviarPorWhatsapp, type EnviarWhatsappDeps } from "./enviarWhatsappSeguimiento";
import { GraphApiError } from "../whatsapp/graphApiClient";

const ORG = "org-1";
const TO = "+59899111222";

interface Registro {
  textos: Array<{ to: string; text: string; accessToken: string }>;
  plantillas: Array<{ to: string; templateName: string; languageCode: string; params?: string[] }>;
}

function crearDeps(
  opts: {
    conexion?: { phoneNumberId: string; accessTokenEncrypted: string; status: string } | null;
    desencriptarFalla?: boolean;
    graphFalla?: Error;
  } = {},
): { deps: EnviarWhatsappDeps; registro: Registro } {
  const registro: Registro = { textos: [], plantillas: [] };

  const deps: EnviarWhatsappDeps = {
    buscarConexion: async () =>
      opts.conexion === undefined
        ? { phoneNumberId: "pn-1", accessTokenEncrypted: "cifrado", status: "CONNECTED" }
        : opts.conexion,
    desencriptar: () => {
      if (opts.desencriptarFalla) throw new Error("clave inválida");
      return "token-plano";
    },
    mandarTexto: async (p) => {
      if (opts.graphFalla) throw opts.graphFalla;
      registro.textos.push({ to: p.to, text: p.text, accessToken: p.accessToken });
      return { messageId: "wamid.texto" };
    },
    mandarPlantilla: async (p) => {
      if (opts.graphFalla) throw opts.graphFalla;
      registro.plantillas.push({
        to: p.to,
        templateName: p.templateName,
        languageCode: p.languageCode,
        params: p.bodyParameters,
      });
      return { messageId: "wamid.plantilla" };
    },
  };
  return { deps, registro };
}

test("manda texto libre y devuelve el wamid", async () => {
  const { deps, registro } = crearDeps();
  const r = await enviarPorWhatsapp(
    { organizationId: ORG, to: TO, contenido: { modo: "texto", texto: "Hola" } },
    deps,
  );

  assert.deepEqual(r, { ok: true, providerMessageId: "wamid.texto" });
  // El token viaja desencriptado al cliente de Graph, nunca cifrado.
  assert.equal(registro.textos[0].accessToken, "token-plano");
});

test("manda la plantilla con su idioma y sus variables", async () => {
  const { deps, registro } = crearDeps();
  const r = await enviarPorWhatsapp(
    {
      organizationId: ORG,
      to: TO,
      contenido: {
        modo: "plantilla",
        plantilla: { nombre: "seguimiento_1", idioma: "es_UY" },
        parametros: ["Rosana"],
      },
    },
    deps,
  );

  assert.equal(r.ok, true);
  assert.deepEqual(registro.plantillas[0], {
    to: TO,
    templateName: "seguimiento_1",
    languageCode: "es_UY",
    params: ["Rosana"],
  });
});

test("sin conexión cargada: fallo reintentable, no excepción", async () => {
  const { deps } = crearDeps({ conexion: null });
  const r = await enviarPorWhatsapp(
    { organizationId: ORG, to: TO, contenido: { modo: "texto", texto: "Hola" } },
    deps,
  );

  assert.ok(r.ok === false);
  assert.match(r.error, /no tiene conexión/);
});

test("conexión a medio conectar: tampoco se manda", async () => {
  const { deps } = crearDeps({
    conexion: { phoneNumberId: "pn-1", accessTokenEncrypted: "x", status: "PENDING" },
  });
  const r = await enviarPorWhatsapp(
    { organizationId: ORG, to: TO, contenido: { modo: "texto", texto: "Hola" } },
    deps,
  );

  assert.ok(r.ok === false);
  assert.match(r.error, /PENDING/);
});

test("si no se puede desencriptar el token, lo dice sin lanzar", async () => {
  const { deps } = crearDeps({ desencriptarFalla: true });
  const r = await enviarPorWhatsapp(
    { organizationId: ORG, to: TO, contenido: { modo: "texto", texto: "Hola" } },
    deps,
  );

  assert.ok(r.ok === false);
  assert.match(r.error, /desencriptar/);
});

test("un error de Graph API vuelve como ok:false para que el job decida", async () => {
  const { deps } = crearDeps({
    graphFalla: new GraphApiError(400, "Template name does not exist"),
  });
  const r = await enviarPorWhatsapp(
    {
      organizationId: ORG,
      to: TO,
      contenido: {
        modo: "plantilla",
        plantilla: { nombre: "no_existe", idioma: "es" },
        parametros: [],
      },
    },
    deps,
  );

  assert.ok(r.ok === false);
  assert.match(r.error, /Template name does not exist/);
});
