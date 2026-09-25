import assert from "node:assert/strict";
import { test } from "node:test";
import { armarEmailSeguimiento, LINEA_BAJA } from "./envioContenido";

test("armarEmailSeguimiento usa el texto genérico cuando no hay plantilla, con el monto formateado", () => {
  const email = armarEmailSeguimiento({
    clienteNombre: "Panadería La Espiga",
    monto: 1500,
    moneda: "UYU",
  });

  assert.equal(email.asunto, "Seguimiento de tu presupuesto");
  assert.match(email.cuerpo, /Panadería La Espiga/);
  assert.match(email.cuerpo, /UYU 1500/);
});

test("armarEmailSeguimiento no menciona el monto si no hay", () => {
  const email = armarEmailSeguimiento({
    clienteNombre: "Panadería La Espiga",
    monto: null,
    moneda: null,
  });
  assert.doesNotMatch(email.cuerpo, /\$/);
  assert.match(email.cuerpo, /el presupuesto que te enviamos/);
});

test("armarEmailSeguimiento usa la plantilla configurada cuando existe", () => {
  const email = armarEmailSeguimiento(
    { clienteNombre: "Panadería La Espiga", monto: 1500, moneda: "UYU" },
    { asunto: "¿Viste nuestro presupuesto?", cuerpo: "Cuerpo de la plantilla." },
  );

  assert.equal(email.asunto, "¿Viste nuestro presupuesto?");
  assert.match(email.cuerpo, /^Cuerpo de la plantilla\./);
});

test("armarEmailSeguimiento agrega SIEMPRE la línea de baja, con o sin plantilla", () => {
  const sinPlantilla = armarEmailSeguimiento({
    clienteNombre: "Cliente",
    monto: null,
    moneda: null,
  });
  const conPlantilla = armarEmailSeguimiento(
    { clienteNombre: "Cliente", monto: null, moneda: null },
    { asunto: "Asunto", cuerpo: "Cuerpo" },
  );

  assert.ok(sinPlantilla.cuerpo.endsWith(LINEA_BAJA));
  assert.ok(conPlantilla.cuerpo.endsWith(LINEA_BAJA));
});
