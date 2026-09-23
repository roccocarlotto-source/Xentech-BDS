// Extrae los mensajes de texto entrantes del payload que manda Meta al
// webhook (docs/ai-agent-architecture.md §4). Forma real del payload:
//
// { entry: [ { changes: [ { value: {
//     metadata: { phone_number_id: "..." },
//     messages: [ { from, id, type, text: { body } } ]
// } } ] } ] }
//
// Un mismo POST puede traer varias entries/changes/messages (Meta agrupa
// entregas). También puede traer "statuses" (confirmaciones de entrega,
// no mensajes) en vez de "messages" -- eso no es esta función.
//
// Función pura, sin red ni DB, para poder testear la extracción sin
// simular el webhook completo. Todo lo que no es un mensaje de texto
// (type !== "text", o una forma inesperada) se descarta en silencio --
// el agente v1 solo entiende texto (§6, catálogo de tools), y Meta manda
// bastante ruido (statuses, reacciones, etc.) al mismo webhook.

export interface MensajeEntrante {
  phoneNumberId: string;
  from: string;
  messageId: string;
  texto: string;
}

function esRecord(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null;
}

export function extraerMensajesDeTexto(payload: unknown): MensajeEntrante[] {
  if (!esRecord(payload) || !Array.isArray(payload.entry)) return [];

  const resultado: MensajeEntrante[] = [];

  for (const entrada of payload.entry) {
    if (!esRecord(entrada) || !Array.isArray(entrada.changes)) continue;

    for (const cambio of entrada.changes) {
      if (!esRecord(cambio) || !esRecord(cambio.value)) continue;

      const value = cambio.value;
      const phoneNumberId =
        esRecord(value.metadata) && typeof value.metadata.phone_number_id === "string"
          ? value.metadata.phone_number_id
          : undefined;
      if (!phoneNumberId || !Array.isArray(value.messages)) continue;

      for (const mensaje of value.messages) {
        if (!esRecord(mensaje)) continue;
        if (mensaje.type !== "text") continue; // v1 solo entiende texto (§6)
        if (typeof mensaje.from !== "string" || typeof mensaje.id !== "string") continue;
        if (!esRecord(mensaje.text) || typeof mensaje.text.body !== "string") continue;

        resultado.push({
          phoneNumberId,
          from: mensaje.from,
          messageId: mensaje.id,
          texto: mensaje.text.body,
        });
      }
    }
  }

  return resultado;
}
