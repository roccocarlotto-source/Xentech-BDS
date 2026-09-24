import assert from "node:assert/strict";
import { test } from "node:test";
import { upsertWhatsAppConnectionSchema } from "./whatsappConnection.schema";

test("acepta los 4 campos completos", () => {
  const input = {
    phoneNumberId: "1234567890",
    wabaId: "999888777",
    displayPhoneNumber: "+598 99 123 456",
    accessToken: "EAAG...token-largo",
  };
  assert.deepEqual(upsertWhatsAppConnectionSchema.parse(input), input);
});

test("displayPhoneNumber es opcional", () => {
  const input = { phoneNumberId: "1", wabaId: "2", accessToken: "token" };
  const resultado = upsertWhatsAppConnectionSchema.parse(input);
  assert.equal(resultado.displayPhoneNumber, undefined);
});

test("rechaza sin phoneNumberId, wabaId o accessToken", () => {
  assert.throws(() => upsertWhatsAppConnectionSchema.parse({ wabaId: "2", accessToken: "t" }));
  assert.throws(() =>
    upsertWhatsAppConnectionSchema.parse({ phoneNumberId: "1", accessToken: "t" }),
  );
  assert.throws(() => upsertWhatsAppConnectionSchema.parse({ phoneNumberId: "1", wabaId: "2" }));
});

test("rechaza strings vacíos (trim primero)", () => {
  assert.throws(() =>
    upsertWhatsAppConnectionSchema.parse({ phoneNumberId: "  ", wabaId: "2", accessToken: "t" }),
  );
});

test("recorta espacios de los campos de texto", () => {
  const resultado = upsertWhatsAppConnectionSchema.parse({
    phoneNumberId: " 1 ",
    wabaId: " 2 ",
    accessToken: " t ",
  });
  assert.equal(resultado.phoneNumberId, "1");
  assert.equal(resultado.wabaId, "2");
  assert.equal(resultado.accessToken, "t");
});
