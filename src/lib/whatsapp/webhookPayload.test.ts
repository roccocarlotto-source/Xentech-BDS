import assert from "node:assert/strict";
import { test } from "node:test";
import { extraerMensajesDeTexto } from "./webhookPayload";

function payloadConUnMensaje(overrides: Record<string, unknown> = {}) {
  return {
    entry: [
      {
        changes: [
          {
            value: {
              metadata: { phone_number_id: "1234567890" },
              messages: [
                {
                  from: "59899123456",
                  id: "wamid.ABC",
                  type: "text",
                  text: { body: "hola, ¿está al día mi cuota?" },
                  ...overrides,
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

test("mensaje de texto valido -> se extrae", () => {
  const resultado = extraerMensajesDeTexto(payloadConUnMensaje());
  assert.deepEqual(resultado, [
    {
      phoneNumberId: "1234567890",
      from: "59899123456",
      messageId: "wamid.ABC",
      texto: "hola, ¿está al día mi cuota?",
    },
  ]);
});

test("varios entry/changes/messages -> se extraen todos", () => {
  const payload = {
    entry: [
      payloadConUnMensaje().entry[0],
      {
        changes: [
          {
            value: {
              metadata: { phone_number_id: "999" },
              messages: [{ from: "111", id: "wamid.2", type: "text", text: { body: "otro" } }],
            },
          },
        ],
      },
    ],
  };
  const resultado = extraerMensajesDeTexto(payload);
  assert.equal(resultado.length, 2);
});

test("mensaje que no es de tipo texto (imagen, etc.) -> se descarta", () => {
  const payload = payloadConUnMensaje();
  (payload.entry[0].changes[0].value.messages[0] as Record<string, unknown>).type = "image";
  assert.deepEqual(extraerMensajesDeTexto(payload), []);
});

test("evento de statuses (sin messages) -> ignorado, no explota", () => {
  const payload = {
    entry: [
      {
        changes: [
          {
            value: {
              metadata: { phone_number_id: "1234567890" },
              statuses: [{ id: "wamid.ABC", status: "delivered" }],
            },
          },
        ],
      },
    ],
  };
  assert.deepEqual(extraerMensajesDeTexto(payload), []);
});

test("payload vacio o con forma inesperada -> lista vacia, nunca tira", () => {
  assert.deepEqual(extraerMensajesDeTexto({}), []);
  assert.deepEqual(extraerMensajesDeTexto(null), []);
  assert.deepEqual(extraerMensajesDeTexto(undefined), []);
  assert.deepEqual(extraerMensajesDeTexto("no es un objeto"), []);
  assert.deepEqual(extraerMensajesDeTexto({ entry: "no es un array" }), []);
});

test("falta phone_number_id -> ese change se descarta", () => {
  const payload = {
    entry: [
      {
        changes: [
          { value: { messages: [{ from: "1", id: "2", type: "text", text: { body: "x" } }] } },
        ],
      },
    ],
  };
  assert.deepEqual(extraerMensajesDeTexto(payload), []);
});

test("mensaje sin body de texto (forma corrupta) -> se descarta ese mensaje, no rompe los demas", () => {
  const payload = payloadConUnMensaje();
  const messages = payload.entry[0].changes[0].value.messages as Record<string, unknown>[];
  messages.push({ from: "2", id: "wamid.OTRO", type: "text" }); // sin .text.body

  const resultado = extraerMensajesDeTexto(payload);
  assert.equal(resultado.length, 1);
  assert.equal(resultado[0].messageId, "wamid.ABC");
});
