import assert from "node:assert/strict";
import { test } from "node:test";
import { ResendEmailProvider } from "./resendEmailProvider";
import { getEmailProvider, resetEmailProviderParaTests } from "./emailProvider";

// Datos 100% inventados, como pide §8 del diseño: nunca los presupuestos
// reales de docs/ejemplos-presupuestos/.
const EMAIL = {
  to: "contacto@panaderia-la-espiga.test",
  subject: "Seguimiento de tu presupuesto",
  body: "Hola. Respondé BAJA si no querés más mensajes.",
};

function fetchQueDevuelve(
  status: number,
  cuerpo: string,
  registro?: { url?: string; init?: RequestInit },
): typeof fetch {
  return (async (url: string, init: RequestInit) => {
    if (registro) {
      registro.url = url;
      registro.init = init;
    }
    return new Response(cuerpo, {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }) as unknown as typeof fetch;
}

test("enviar manda el mail a la API de Resend y devuelve el id del mensaje", async () => {
  const registro: { url?: string; init?: RequestInit } = {};
  const provider = new ResendEmailProvider(
    "re_clave_de_prueba",
    "Imagen Visual <presupuestos@ejemplo.test>",
    null,
    fetchQueDevuelve(200, JSON.stringify({ id: "a1b2c3d4-0000-4000-8000-000000000001" }), registro),
  );

  const resultado = await provider.enviar(EMAIL);

  assert.deepEqual(resultado, {
    ok: true,
    providerMessageId: "a1b2c3d4-0000-4000-8000-000000000001",
  });
  assert.equal(registro.url, "https://api.resend.com/emails");
  assert.equal(registro.init?.method, "POST");
  const headers = registro.init?.headers as Record<string, string>;
  assert.equal(headers.Authorization, "Bearer re_clave_de_prueba");
  assert.equal(headers["Content-Type"], "application/json");

  const body = JSON.parse(registro.init?.body as string);
  assert.equal(body.from, "Imagen Visual <presupuestos@ejemplo.test>");
  assert.equal(body.to, EMAIL.to);
  assert.equal(body.subject, EMAIL.subject);
  // El cuerpo va como texto plano, no como HTML (armarEmailSeguimiento
  // devuelve texto), y la línea de baja viaja tal cual.
  assert.equal(body.text, EMAIL.body);
  assert.equal(body.html, undefined);
  // Sin reply-to configurado, el campo no se manda (no va como null).
  assert.ok(!("reply_to" in body));
});

test("enviar incluye reply_to cuando está configurado", async () => {
  const registro: { url?: string; init?: RequestInit } = {};
  const provider = new ResendEmailProvider(
    "re_clave_de_prueba",
    "presupuestos@ejemplo.test",
    "respuestas@ejemplo.test",
    fetchQueDevuelve(200, JSON.stringify({ id: "id-1" }), registro),
  );

  await provider.enviar(EMAIL);

  const body = JSON.parse(registro.init?.body as string);
  assert.equal(body.reply_to, "respuestas@ejemplo.test");
});

test("enviar devuelve ok:false con el status y el detalle cuando Resend rechaza el envío", async () => {
  const provider = new ResendEmailProvider(
    "re_clave_invalida",
    "presupuestos@ejemplo.test",
    null,
    fetchQueDevuelve(403, JSON.stringify({ message: "domain is not verified" })),
  );

  const resultado = await provider.enviar(EMAIL);

  assert.equal(resultado.ok, false);
  assert.ok(resultado.ok === false);
  assert.match(resultado.error, /403/);
  assert.match(resultado.error, /domain is not verified/);
});

test("enviar recorta el detalle del error para no arrastrar respuestas gigantes", async () => {
  const provider = new ResendEmailProvider(
    "re_clave_de_prueba",
    "presupuestos@ejemplo.test",
    null,
    fetchQueDevuelve(500, "x".repeat(5_000)),
  );

  const resultado = await provider.enviar(EMAIL);

  assert.ok(resultado.ok === false);
  assert.ok(resultado.error.length < 400, `error demasiado largo: ${resultado.error.length}`);
});

test("enviar no lanza si la red falla: devuelve ok:false para que el job reintente", async () => {
  const fetchQueExplota = (async () => {
    throw new Error("getaddrinfo ENOTFOUND api.resend.com");
  }) as unknown as typeof fetch;
  const provider = new ResendEmailProvider(
    "re_clave_de_prueba",
    "presupuestos@ejemplo.test",
    null,
    fetchQueExplota,
  );

  const resultado = await provider.enviar(EMAIL);

  assert.ok(resultado.ok === false);
  assert.match(resultado.error, /No se pudo contactar a Resend/);
  assert.match(resultado.error, /ENOTFOUND/);
});

test("enviar trata un 200 sin id como fallo: sin id no hay con qué cruzar la respuesta", async () => {
  const provider = new ResendEmailProvider(
    "re_clave_de_prueba",
    "presupuestos@ejemplo.test",
    null,
    fetchQueDevuelve(200, JSON.stringify({ algo: "otra cosa" })),
  );

  const resultado = await provider.enviar(EMAIL);

  assert.ok(resultado.ok === false);
  assert.match(resultado.error, /sin el id/);
});

test("enviar no lanza si la respuesta no es JSON", async () => {
  const provider = new ResendEmailProvider(
    "re_clave_de_prueba",
    "presupuestos@ejemplo.test",
    null,
    fetchQueDevuelve(200, "<html>gateway</html>"),
  );

  const resultado = await provider.enviar(EMAIL);

  assert.ok(resultado.ok === false);
  assert.match(resultado.error, /ilegible/);
});

// --- getEmailProvider() ---

// Las env vars se leen una sola vez por proceso (singleton perezoso), así que
// cada test las setea, resetea el singleton y deja todo como estaba. `delete`
// y no `= undefined`: asignar undefined guarda el string "undefined".
function conEnv(valores: Record<string, string | undefined>, fn: () => void): void {
  const previos: Record<string, string | undefined> = {};
  for (const [clave, valor] of Object.entries(valores)) {
    previos[clave] = process.env[clave];
    if (valor === undefined) delete process.env[clave];
    else process.env[clave] = valor;
  }
  resetEmailProviderParaTests();
  try {
    fn();
  } finally {
    for (const [clave, valor] of Object.entries(previos)) {
      if (valor === undefined) delete process.env[clave];
      else process.env[clave] = valor;
    }
    resetEmailProviderParaTests();
  }
}

test("getEmailProvider devuelve null sin RESEND_API_KEY", () => {
  conEnv({ RESEND_API_KEY: undefined, EMAIL_FROM: "presupuestos@ejemplo.test" }, () => {
    assert.equal(getEmailProvider(), null);
  });
});

test("getEmailProvider devuelve null si hay API key pero falta EMAIL_FROM", () => {
  conEnv({ RESEND_API_KEY: "re_clave_de_prueba", EMAIL_FROM: undefined }, () => {
    assert.equal(getEmailProvider(), null);
  });
});

test("getEmailProvider devuelve el provider de Resend con las dos env vars, y lo reusa", () => {
  conEnv({ RESEND_API_KEY: "re_clave_de_prueba", EMAIL_FROM: "presupuestos@ejemplo.test" }, () => {
    const provider = getEmailProvider();
    assert.ok(provider instanceof ResendEmailProvider);
    assert.equal(getEmailProvider(), provider);
  });
});
