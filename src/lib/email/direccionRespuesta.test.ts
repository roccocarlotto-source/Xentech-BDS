import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buscarPresupuestoIdEnDestinatarios,
  direccionDeRespuesta,
  presupuestoIdDeDireccion,
} from "./direccionRespuesta";

const PRESU = "0f8fad5b-d9cb-469f-a165-70867728950e";

test("arma el Reply-To con el id del presupuesto como tag", () => {
  assert.equal(
    direccionDeRespuesta("respuestas@ejemplo.test", PRESU),
    `respuestas+${PRESU}@ejemplo.test`,
  );
});

test("si la base ya traía un tag, lo reemplaza en vez de apilarlo", () => {
  assert.equal(
    direccionDeRespuesta("respuestas+viejo@ejemplo.test", PRESU),
    `respuestas+${PRESU}@ejemplo.test`,
  );
});

test("una base inválida devuelve null en vez de armar una dirección rota", () => {
  assert.equal(direccionDeRespuesta("no-es-un-email", PRESU), null);
  assert.equal(direccionDeRespuesta("@ejemplo.test", PRESU), null);
  assert.equal(direccionDeRespuesta("respuestas@", PRESU), null);
});

test("extrae el id del presupuesto de la dirección", () => {
  assert.equal(presupuestoIdDeDireccion(`respuestas+${PRESU}@ejemplo.test`), PRESU);
});

test("sin tag, o con un tag que no es uuid, devuelve null", () => {
  assert.equal(presupuestoIdDeDireccion("respuestas@ejemplo.test"), null);
  assert.equal(presupuestoIdDeDireccion("respuestas+hola@ejemplo.test"), null);
  assert.equal(presupuestoIdDeDireccion("cualquier cosa"), null);
});

test("busca el primer tag válido entre varios destinatarios", () => {
  const destinatarios = [
    "otra-persona@ejemplo.test",
    "respuestas@ejemplo.test",
    `respuestas+${PRESU}@ejemplo.test`,
  ];
  assert.equal(buscarPresupuestoIdEnDestinatarios(destinatarios), PRESU);
});

test("sin ningún tag entre los destinatarios, null", () => {
  assert.equal(buscarPresupuestoIdEnDestinatarios(["a@b.test", "c@d.test"]), null);
  assert.equal(buscarPresupuestoIdEnDestinatarios([]), null);
});

test("ida y vuelta: lo que se arma es lo que se lee", () => {
  const armada = direccionDeRespuesta("Respuestas@Ejemplo.Test", PRESU);
  assert.ok(armada);
  assert.equal(presupuestoIdDeDireccion(armada), PRESU);
});
