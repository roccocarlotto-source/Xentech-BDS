# Arquitectura del módulo de Agentes de IA

Documento de diseño — 20/09/2026. Describe el diseño antes de implementarlo;
se actualiza a medida que se construye (misma convención que
`docs/ai-agent-architecture.md` de `PlataformaCRM`, que es el precedente
directo de este documento — ver la nota de la sección 1).

## 1. Contexto y decisión

Fase 5 del roadmap (`docs/estado-actual.md` → doc de Cowork): lógica real de
los tres agentes de IA que Fase 4 ya dejó como toggles vacíos
(`OrganizationAgentToggle` — `WHATSAPP`, `DATABASE_MANAGEMENT`,
`REMINDERS`). Este documento diseña el primero, WhatsApp, y la
infraestructura común (orquestación, permisos, guardrails, base de
conocimiento) que los otros dos van a reusar sin rediseñarla.

**Precedente directo: `PlataformaCRM` ya tiene un módulo de agentes de IA
completo y en producción**, no solo diseñado —
`docs/ai-agent-architecture.md` de ese repo, con `Agent`/`Conversation`/
`Message`, capa de permisos, tool-calling, handoff a humano y una base de
conocimiento simple. Este documento parte de ese diseño y lo adapta a dos
diferencias reales de Xentech:

1. **Tenancy de un solo nivel.** El CRM tiene `Branch` (sucursal) dentro de
   `Organization` — un agente y un número de WhatsApp por sucursal. Xentech
   no tiene ese nivel intermedio: todo es por `Organization`.
2. **Quién escribe es el cliente final, no un empleado.** En el CRM, un
   vendedor usa el agente para hablar con SUS leads — el agente actúa en
   nombre del negocio hacia afuera, con datos que un empleado ya podía ver.
   En Xentech, quien escribe por WhatsApp ES el `Cliente` — el agente le
   contesta sobre SUS PROPIOS datos, nunca sobre los de otro. Esto no es un
   detalle: cambia el límite de seguridad central del diseño (sección 5).

**Decisiones de producto tomadas con Rocco el 20/09/2026** (antes de
diseñar el resto, porque cada una cambia partes concretas del diseño):

- **Integración de WhatsApp: API oficial de Meta (Cloud API), directo, sin
  intermediario (BSP).** Cada organización pasa su propia verificación de
  Meta Business y conecta su propio número — ver sección 4.
- **Quién configura la base de conocimiento y las reglas: el propio
  cliente**, desde su cuenta (rol `ADMIN` de su organización), no Rocco por
  cada alta. Esto significa que hace falta una pantalla de administración
  nueva del lado del tenant (Fase 4 solo construyó el panel de PLATAFORMA
  — `requirePlatformAdmin` — que prende/apaga el agente; configurarlo es
  un permiso distinto, del tenant sobre sí mismo).
- **Alcance de v1: consulta + algunas acciones controladas**, nunca sobre
  montos ni borrado. El catálogo exacto está en la sección 6.

**Principio que gobierna todo lo de acá para abajo, tomado tal cual del
CRM porque ya demostró que funciona:** _el modelo puede proponer o pedir
una acción, pero el sistema decide si se ejecuta — nunca el prompt solo._
Hay una función central que hace cumplir esto con código (sección 7), no
una instrucción que el modelo podría llegar a ignorar.

## 2. Alcance de este documento

Incluye: modelo de datos (`AgentConfig`, `Conversation`, `Message`,
`WhatsAppConnection`, `KnowledgeBaseEntry`), el loop de orquestación con
tool-calling, la capa de permisos y guardrails, el catálogo de tools v1, el
webhook de WhatsApp (API oficial de Meta), el mecanismo de handoff a
humano, y un plan de implementación por pasos.

No incluye (fuera de alcance):

- **Los otros dos agentes** (`DATABASE_MANAGEMENT`, `REMINDERS`) — van a
  reusar el loop de orquestación y la capa de permisos de este documento,
  pero su propio catálogo de tools y sus guardrails específicos se diseñan
  cuando les toque su fase. `REMINDERS` en particular necesita mensajes
  _salientes_ (fuera de la ventana de 24 horas de WhatsApp, sección 4) —
  eso implica plantillas pre-aprobadas por Meta, que este documento no
  diseña.
- **RAG / embeddings para la base de conocimiento** — v1 es texto plano en
  el prompt (sección 8), igual que decidió el CRM. Se revisa si un cliente
  real tiene tanto contenido que deja de entrar cómodo en el contexto.
- **Proveedor de LLM final** — se abstrae detrás de una interfaz propia
  (sección 9), un solo adaptador al principio. Cuál exactamente es una
  decisión de implementación, no de este documento.
- **Facturación del uso de IA a cada organización** — hoy el costo de los
  mensajes lo absorbe Xentech; si en algún momento se traslada a cada
  cliente, es una decisión de producto aparte con su propio diseño.

## 3. Modelo de datos

```prisma
// Configuración de UN agente para UNA organización. Fila ausente = el
// agente todavía no tiene configuración propia, aunque
// OrganizationAgentToggle.enabled sea true (se puede prender el toggle
// antes de terminar de configurar — el agente simplemente no contesta
// hasta que haya instructions).
model AgentConfig {
  id             String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  organizationId String    @db.Uuid
  agentType      AgentType // reusa el enum de Fase 4 — WHATSAPP, DATABASE_MANAGEMENT, REMINDERS
  instructions   String    @db.Text // el prompt de fondo: objetivo, tono, contexto del negocio
  guardrails     Json      // forma documentada en la sección 7, sin enforcement de forma a nivel de Postgres
  enabledTools   String[]  // subconjunto del catálogo de la sección 6
  modelProvider  String    // string, no enum — cambia más rápido que un catálogo cerrado
  modelName      String
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt

  organization Organization @relation(fields: [organizationId], references: [id])

  @@unique([organizationId, agentType])
}

// Un número de WhatsApp Business conectado a una organización. Existe
// aparte de AgentConfig porque conectar el número (OAuth con Meta) y
// configurar el comportamiento del agente son dos pasos y dos permisos
// potencialmente distintos, y porque el ciclo de vida es distinto (un
// número se puede desconectar/reconectar sin perder instructions/guardrails).
model WhatsAppConnection {
  id                 String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  organizationId     String    @unique @db.Uuid // un número por organización en v1 (no hay Branch)
  phoneNumberId      String    @unique // el "phone_number_id" de la Cloud API — es la clave con la que Meta rutea el webhook
  wabaId             String    // WhatsApp Business Account id
  displayPhoneNumber String    // el número en formato legible, solo para mostrar en el panel
  accessTokenEncrypted String  // token de sistema de Meta, encriptado en reposo (nunca en texto plano en la base)
  status             WhatsAppConnectionStatus @default(PENDING)
  connectedAt        DateTime?
  createdAt          DateTime  @default(now())
  updatedAt          DateTime  @updatedAt

  organization Organization @relation(fields: [organizationId], references: [id])
}

enum WhatsAppConnectionStatus {
  PENDING     // conexión iniciada, verificación de Meta sin completar
  CONNECTED
  DISCONNECTED // el propio tenant lo desconectó, o Meta revocó el token
}

enum ConversationStatus {
  ACTIVE
  TRANSFERRED_TO_HUMAN
  CLOSED
}

enum MessageDirection {
  INBOUND
  OUTBOUND
}

enum MessageSenderType {
  CLIENTE // quien escribe por WhatsApp
  AGENT   // el agente de IA
  HUMAN   // alguien de la organización tomó la conversación
}

model Conversation {
  id                String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  organizationId    String   @db.Uuid
  agentConfigId     String   @db.Uuid // qué config la atendió al crearse; no se pisa en un handoff (mismo criterio que el CRM)
  clienteId         String?  @db.Uuid // NULL si el número no matchea ningún Cliente de la organización (sección 5)
  externalThreadId  String   // el número de WhatsApp de quien escribe — identifica el hilo
  status            ConversationStatus @default(ACTIVE)
  lastMessageAt     DateTime?
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  // Sin deletedAt: "cerrada" es un status, no un soft delete — es historia
  // que se conserva tal cual (mismo criterio que Booking/Conversation del CRM).

  organization Organization @relation(fields: [organizationId], references: [id])
  cliente      Cliente?     @relation(fields: [clienteId], references: [id])

  @@unique([organizationId, externalThreadId, status]) // ver nota sobre reapertura de hilo, sección 5
}

model Message {
  id                String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  organizationId    String   @db.Uuid // denormalizado desde conversationId, mismo criterio que el resto del schema
  conversationId    String   @db.Uuid
  direction         MessageDirection
  senderType        MessageSenderType
  senderUserId      String?  @db.Uuid // solo cuando senderType = HUMAN
  content           String   @db.Text
  toolCalls         Json?    // auditoría: qué tool se intentó, con qué argumentos, si se permitió, qué devolvió
  externalMessageId String?  @unique // id del mensaje de WhatsApp — deduplica ante reentregas del webhook
  createdAt         DateTime @default(now())

  conversation Conversation @relation(fields: [conversationId], references: [id])
}

// Entradas de la base de conocimiento — una lista de FAQs/políticas con
// título, no un campo único de texto libre. Editables por separado desde
// la pantalla que va a construir el tenant admin (sección 10).
model KnowledgeBaseEntry {
  id             String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  organizationId String    @db.Uuid
  titulo         String    @db.VarChar(200)
  contenido      String    @db.Text
  isActive       Boolean   @default(true)
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt
  deletedAt      DateTime?

  organization Organization @relation(fields: [organizationId], references: [id])
}
```

**Por qué `AgentConfig` es una tabla aparte de `OrganizationAgentToggle`.**
El toggle (Fase 4) lo escribe el platform admin — es la decisión de "¿este
cliente puede usar este agente?". La configuración (`instructions`,
`guardrails`, `enabledTools`) la escribe el propio tenant (decisión de
Rocco, sección 1) — es "¿cómo se comporta MI agente?". Son dos actores con
dos permisos distintos escribiendo dos cosas distintas; mezclarlas en una
tabla obligaría a que cualquiera de los dos pueda escribir cualquier
columna, o a un chequeo de columna-por-columna dentro del mismo endpoint.
Separado, cada tabla tiene un solo escritor y una sola ruta de
autorización (`requirePlatformAdmin` para el toggle, `authenticate` +
`role: ADMIN` del propio tenant para `AgentConfig`).

**Por qué `guardrails` es `Json` y no columnas.** Mismo motivo que el CRM:
la sección 7 lista varias dimensiones de guardrail distintas y cada
organización va a necesitar una combinación diferente. La forma esperada
está documentada ahí, no forzada por Postgres.

**Por qué `Conversation.clienteId` es nullable.** A diferencia del CRM
(donde un visitante anónimo se convierte en un `Contact` placeholder),
acá NO se crea un `Cliente` nuevo solo porque alguien escribió por
WhatsApp — ver sección 5. Si el número no matchea ningún `Cliente`
existente de la organización, la conversación igual se registra (para
poder auditarla y, eventualmente, derivarla a un humano), pero
`clienteId` queda `NULL`.

## 4. Conexión de WhatsApp (API oficial de Meta, por organización)

Cada organización conecta su **propio** número de WhatsApp Business —
mismo criterio que el CRM con "un número por sucursal", pero acá al nivel
de `Organization` porque no hay `Branch`.

**Flujo de conexión** (lo arma el tenant admin, no Rocco — coherente con
la decisión de la sección 1):

1. El tenant ya tiene (o crea) una cuenta de WhatsApp Business y pasa la
   verificación de Meta Business por su cuenta — esto es un trámite
   externo con Meta, fuera de este sistema, y puede demorar. El panel de
   Xentech no puede acelerarlo, solo guiar los pasos.
2. Con la cuenta verificada, el flujo de conexión (OAuth de Meta,
   "Embedded Signup" de la Cloud API) le devuelve a Xentech un
   `phone_number_id`, el `waba_id`, y un token de acceso de sistema — se
   guardan en `WhatsAppConnection` (`accessTokenEncrypted`, nunca en texto
   plano).
3. `WhatsAppConnection.status` pasa a `CONNECTED` recién cuando Meta
   confirma el número — hasta ahí queda `PENDING` y el agente no contesta
   nada por ese canal.

**Webhook único, ruteo por `phone_number_id`.** Meta manda todos los
mensajes entrantes de todos los números conectados a UN solo endpoint
(`POST /api/webhooks/whatsapp`) — el payload trae el `phone_number_id`
que identifica a QUÉ organización pertenece ese mensaje
(`WhatsAppConnection.phoneNumberId` es `@unique` justamente por esto).
Meta también exige un handshake de verificación
(`GET /api/webhooks/whatsapp` con `hub.challenge`, comparado contra un
`WHATSAPP_WEBHOOK_VERIFY_TOKEN` propio) y firma cada request
(`X-Hub-Signature-256`, HMAC-SHA256 con el App Secret) — se valida esa
firma antes de procesar nada, mismo criterio que ya usa este repo para
otros webhooks... _(nota: Xentech todavía no tiene otro webhook — este es
el primero; el criterio de "responder rápido, procesar aparte,
deduplicar por id externo" es el mismo que documentó el CRM para su
webhook de Google Calendar)_.

**Responder rápido, procesar aparte.** Meta espera una respuesta 200 en
segundos o reintenta la entrega — no se puede bloquear el response
esperando a que el LLM termine de generar la respuesta. El handler del
webhook: valida la firma, persiste el `Message` entrante (deduplicado por
`externalMessageId`), encola el procesamiento real (ver sección 10 sobre
la cola concreta a elegir) y devuelve 200 de inmediato. El envío de la
respuesta real a WhatsApp (`POST` a la Graph API con el
`accessTokenEncrypted` de esa organización) pasa en el worker que procesa
la cola, no en el handler del webhook.

**Ventana de 24 horas.** Meta solo permite mensajes de formato libre
dentro de las 24 horas desde el último mensaje ENTRANTE del cliente — fuera
de esa ventana hace falta una plantilla pre-aprobada. El agente de
WhatsApp de este documento es reactivo (solo contesta lo que le
preguntan), así que siempre cae dentro de la ventana por construcción. Es
relevante para cuando se diseñe `REMINDERS` (mensajes salientes,
proactivos) — ese agente sí va a necesitar plantillas aprobadas, fuera de
alcance acá.

## 5. Resolución de identidad: de un número de teléfono a un `Cliente`

Este es el punto donde el diseño diverge más del CRM, y donde hay que ser
más estricto.

Al llegar un mensaje: se busca un `Cliente` de esa organización cuyo
`telefono` normalizado coincida con el número de quien escribe. **Si hay
match, la conversación queda atada a ese `clienteId` y CADA tool que el
agente pueda ejecutar en esa conversación opera exclusivamente sobre ESE
`Cliente`** — nunca sobre un `clienteId` que el modelo elija o reciba
como argumento (mismo patrón que el CRM aplicó a `contactId` en
`create_booking`: lo resuelve el wrapper, nunca es un argumento del
modelo). Es la garantía central de este documento: un cliente que
escribe por WhatsApp solo puede llegar a ver o tocar SUS PROPIOS datos,
estructuralmente, no por una regla que el prompt podría llegar a no
respetar.

**Si NO hay match:** no se crea un `Cliente` nuevo automáticamente (a
diferencia del `Contact` placeholder del CRM). Acá crear un registro
nuevo por cualquiera que le escriba al número sería llenar la base de
clientes de un negocio con gente que no es necesariamente su cliente. En
v1: el agente responde con un mensaje genérico configurable por el
tenant (ej. "no encontramos tu número registrado — contactanos por
[medio alternativo]") y la conversación se guarda igual (con
`clienteId: NULL`) para que el tenant la pueda revisar. Registrar
`Cliente`s nuevos desde WhatsApp queda fuera de alcance de v1 — es
territorio del futuro agente `DATABASE_MANAGEMENT`, no de este.

**Normalización del teléfono.** `Cliente.telefono` hoy es texto libre
(sin formato forzado, cargado a mano o importado). Hace falta una función
de normalización (quitar espacios/guiones, resolver prefijo de país) que
se aplique tanto al buscar como — recomendado, aparte de este
documento — al importar/cargar un cliente, para que el match no falle por
formato. Se diseña en el paso de implementación correspondiente (sección
10), no acá.

## 6. Catálogo de tools — v1

Alcance decidido con Rocco: consulta + algunas acciones controladas,
nunca sobre montos ni borrado.

| Tool                                                              | Qué hace                                                                                                                                                                      | Nivel                          |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| `consultar_mi_cuota()`                                            | Devuelve el estado de cuota (al día/atrasado/sin datos), monto, último pago del `Cliente` de la conversación. Sin argumentos — siempre el `Cliente` resuelto en la sección 5. | Consulta                       |
| `consultar_mis_datos()`                                           | Devuelve nombre, teléfono, email y notas en archivo del `Cliente` de la conversación.                                                                                         | Consulta                       |
| `actualizar_mi_telefono(telefono)` / `actualizar_mi_email(email)` | Actualiza el dato de contacto del `Cliente` de la conversación — mismo `updateClienteSchema` que ya valida el alta manual.                                                    | Acción controlada, bajo riesgo |
| `solicitar_hablar_con_alguien(motivo)`                            | Dispara el handoff (sección 8). Siempre disponible — ningún guardrail la puede bloquear.                                                                                      | Escape hatch                   |

**Explícitamente fuera del catálogo v1** (y no por omisión — es la
decisión de alcance de la sección 1): cualquier tool que toque
`cuotaMonto`/`cuotaUltimoPago`/`cuotaPeriodicidad`, que borre o cree un
`Cliente`, o que lea datos de otra organización o de otro `Cliente`. Si
en algún momento se agrega una tool nueva a este catálogo, entra acá y a
la lista de `enabledTools` posibles que el tenant puede habilitar — nunca
como una tool genérica de "ejecutar lo que el modelo pida".

## 7. Guardrails y capa de permisos

Misma forma que el CRM, con los campos que aplican al catálogo de la
sección 6 (sin `datosRequeridosAntesDeAccion` variado como el de
`create_booking` del CRM — acá las dos tools de acción no necesitan datos
adicionales más allá del propio argumento):

```json
{
  "temasProhibidos": ["asesoramiento legal", "diagnósticos médicos", "descuentos no publicados"],
  "accionesProhibidas": [],
  "condicionesDeDerivacion": [
    "el cliente pide hablar con una persona",
    "reclamo o queja",
    "pide algo sobre el monto de su cuota"
  ],
  "promesasProhibidas": ["plazos o montos no confirmados por el negocio"]
}
```

`accionesProhibidas` empieza vacía por defecto (todo `enabledTools` está
disponible) pero existe para que un tenant pueda, por ejemplo, deshabilitar
`actualizar_mi_telefono`/`actualizar_mi_email` si prefiere que ese dato
solo lo cambien ellos.

**`puedeEjecutarTool(agentConfig, toolName, args, conversation)`** — la
función central, llamada antes de CUALQUIER tool (paso 4 del loop, sección
9). Chequea en orden: (1) `toolName` está en `agentConfig.enabledTools`;
(2) no está en `guardrails.accionesProhibidas`; (3) `conversation.clienteId`
no es `NULL` (ninguna tool de acción o consulta corre sin un `Cliente`
resuelto — ver sección 5). Devuelve `{ allowed, reason? }`, nunca ejecuta
nada — mismo contrato que el CRM.

`temasProhibidos`, `promesasProhibidas` y `condicionesDeDerivacion` no son
gates de ejecución (no hay una "acción" que bloquear): se incorporan al
system prompt como instrucciones explícitas, igual que decidió el CRM —
es un juicio sobre el contenido de la conversación, el trabajo para el
que sirve un modelo de lenguaje, no un chequeo de código.

## 8. Handoff a humano

`solicitar_hablar_con_alguien` (sección 6) es el mecanismo principal —
el modelo la llama cuando el cliente lo pide explícitamente o cuando una
`condicionDeDerivacion` configurada coincide con la conversación. Al
dispararse: `Conversation.status = TRANSFERRED_TO_HUMAN`, se persiste un
mensaje de cierre fijo, y el agente deja de responder en ese hilo hasta
que alguien de la organización lo reactive.

**Red de seguridad determinística** (no depende de que el modelo decida
bien): si el loop de tool-calling de un turno supera un tope de rondas
sin producir una respuesta final, corta, deriva y persiste un mensaje de
cierre — mismo mecanismo que el CRM, mismo motivo (que el loop nunca
quede colgado ni invente una respuesta).

**Dónde ve el tenant las conversaciones derivadas.** A diferencia del
CRM (que reusa su sistema de `Activity`/tareas ya existente), Xentech no
tiene ese módulo — hace falta una bandeja nueva, aunque sea simple: una
pantalla que liste `Conversation`s por `status` (activas / derivadas /
cerradas) con su hilo de `Message`s, para que alguien de la organización
pueda leer el contexto y responder manualmente por su propio WhatsApp (v1
no incluye "contestar desde el panel de Xentech y que salga como
WhatsApp" — eso es una extensión futura, no de este documento). Una
notificación por email cuando se dispara un handoff sería valioso para
que de verdad funcione 24/7 sin que alguien tenga la bandeja abierta todo
el día, pero Xentech hoy no tiene infraestructura de envío de emails —
queda propuesto como una mejora de v1.1, no bloqueante para v1 (la
bandeja en el panel sí lo es).

## 9. Loop de orquestación

1. Llega un mensaje (webhook de WhatsApp, sección 4) → se resuelve o crea
   la `Conversation` (por `externalThreadId` + organización, `status
ACTIVE`; si la única conversación existente para ese hilo está
   `CLOSED`, se abre una nueva — una conversación `TRANSFERRED_TO_HUMAN`
   NO recibe mensajes nuevos del agente, ver sección 8) y se persiste
   como `Message` (`INBOUND`, `senderType: CLIENTE`).
2. Se resuelve el `Cliente` por teléfono si la conversación es nueva
   (sección 5).
3. Se arma el contexto: `agentConfig.instructions` + las
   `KnowledgeBaseEntry` activas de la organización (texto plano, sección 10) + los guardrails informativos (sección 7) como system prompt, una
   ventana de los últimos N `Message` de la conversación, y el catálogo
   de tools filtrado por `agentConfig.enabledTools`.
4. Se llama al proveedor de LLM (interfaz abstracta, sección 10... nota:
   la numeración de "decisiones abiertas" queda para cuando se elija el
   proveedor) con tool-calling habilitado.
5. Si el modelo pide una tool, pasa por `puedeEjecutarTool` (sección 7)
   antes de ejecutarse — nunca directo.
6. Si está permitida, se ejecuta el wrapper real (que llama al service
   existente — `clienteService`, mismo código que usa el CRUD manual) y
   el resultado se registra en `Message.toolCalls`.
7. La respuesta final se manda por la Graph API de WhatsApp y se persiste
   como `Message` (`OUTBOUND`, `senderType: AGENT`).

**Este loop se prueba primero por un endpoint interno, no contra WhatsApp
real** — mismo aprendizaje del CRM: un endpoint
`POST /api/agent-config/:agentType/test-message` (ADMIN del tenant,
autenticado, sin pasar por WhatsApp) deja ejercitar el loop completo —
permisos, guardrails, base de conocimiento, tools — mientras en paralelo
se resuelve la conexión real con Meta (sección 4), que depende de un
trámite externo y puede demorar. Encontrar un problema de diseño ahí es
mucho más barato que encontrarlo en producción.

## 10. Base de conocimiento

`KnowledgeBaseEntry` (sección 3): lista de entradas con título, texto
plano, sin embeddings ni búsqueda semántica en v1 — se suman todas las
activas de la organización al prompt tal cual. El tenant admin las crea,
edita y desactiva desde su propia pantalla (decisión de la sección 1).

Se revisa si hace falta algo más sofisticado (RAG, troceo, búsqueda
semántica) cuando algún cliente real tenga tanto contenido que deje de
entrar cómodo en el contexto — no antes, sería trabajo especulativo sobre
un problema que todavía no existe.

## 11. Plan de implementación sugerido

1. **Schema:** `AgentConfig`, `Conversation`, `Message`,
   `WhatsAppConnection`, `KnowledgeBaseEntry` + migración. Base de todo lo
   demás.
2. **Fundamentos + loop, sin WhatsApp todavía:** interfaz `LlmProvider` +
   un primer adaptador, capa de permisos (`puedeEjecutarTool`), el loop
   completo de la sección 9, las cuatro tools de la sección 6 sobre
   `clienteService` existente, y el endpoint interno de prueba
   (`POST /api/agent-config/:agentType/test-message`). Se puede construir
   y probar de punta a punta sin depender de que la conexión con Meta
   esté lista.
3. **Pantalla de configuración del tenant:** editor de
   `AgentConfig.instructions`/`guardrails`/`enabledTools` y CRUD de
   `KnowledgeBaseEntry`, bajo `role: ADMIN` del propio tenant (nueva ruta
   de autorización — no es `requirePlatformAdmin`, es "admin de MI
   organización"; hoy no existe ese chequeo en el código, hay que
   agregarlo).
4. **Handoff a humano** (sección 8): la tool `solicitar_hablar_con_alguien`,
   el tope de rondas, y la bandeja de conversaciones del tenant.
5. **Conexión de WhatsApp real** (sección 4): flujo de conexión (Embedded
   Signup de Meta), `WhatsAppConnection`, el webhook firmado y
   deduplicado, el envío real vía Graph API. Puede arrancar en paralelo
   al paso 2 dado que el trámite de verificación de Meta es lento y no
   depende de este código.
6. **Normalización de teléfono** (sección 5) — necesaria antes de que el
   paso 5 reciba tráfico real, no antes.

## 12. Decisiones abiertas / pendientes

- **Proveedor de LLM inicial** — sin decidir. Recomendado (no resuelto):
  mismo criterio que el CRM, una interfaz `LlmProvider` propia con un
  primer adaptador reemplazable — así la elección de proveedor no bloquea
  el resto del diseño ni obliga a reescribir el loop después.
- **Cola de procesamiento del webhook** (sección 4) — sin decidir entre
  algo simple (una tabla propia tipo "job pendiente" + un poller) o algo
  con más infraestructura (una cola real tipo BullMQ + Redis, que hoy
  este proyecto no tiene). Para el volumen esperado en un MVP, probablemente
  alcanza con lo simple — se revisa si el volumen real lo justifica.
- **Notificación de handoff fuera del panel** (sección 8) — email
  propuesto, no construido; depende de que el proyecto tenga (o agregue)
  infraestructura de envío de emails, que hoy no tiene.
- **Tamaño de la ventana de contexto** (mensajes recientes de la
  conversación que se le pasan al modelo) — sin decidir, mismo criterio
  que el CRM: empezar con un truncado simple (últimos N mensajes) y
  revisar si hace falta algo más sofisticado cuando haya conversaciones
  reales de ese largo.
- **Rate limiting del loop del agente** — cada turno paga una llamada real
  a un LLM; hace falta un límite propio (por organización y/o por
  `Cliente`) más estricto que cualquier rate limiter genérico que ya use
  el resto de las rutas, para acotar el costo de un uso abusivo. Sin
  diseñar en detalle todavía.
- **Encriptación de `WhatsAppConnection.accessTokenEncrypted`** — qué
  mecanismo exacto (KMS, una clave de la app, etc.) queda para el paso de
  implementación correspondiente (sección 11, paso 5) — este documento
  solo fija que nunca se guarda en texto plano.
