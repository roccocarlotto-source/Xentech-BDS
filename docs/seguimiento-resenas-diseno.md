# Seguimiento de presupuestos y reseñas — Documento de diseño

> Documento de referencia para las sesiones de Claude Code en la nube.
> Cada sesión arranca sin contexto: leer este archivo completo antes de tocar código.
> Ubicación: `docs/seguimiento-resenas-diseno.md` de Base-de-datos-Xentech.

---

## 1. Objetivo

Sistema con dos funciones conectadas:

1. **Reseñas por link personalizado.** Cada cliente recibe un link único. Al abrirlo elige figurar con su nombre o como anónimo, pone estrellas (1–5) y, si quiere, un comentario. Sin registro.
2. **Seguimiento automático de presupuestos.** Se importa el presupuesto (.docx con hoja membretada), se extraen los datos y el sistema envía mensajes de seguimiento cada intervalo configurable, interpreta las respuestas y avisa al vendedor.

**Conexión entre ambas:** cuando un presupuesto pasa a _aceptado/vendido_, se envía automáticamente el link de reseña.

**Principio de diseño:** no es un sistema de "muchos agentes". Es una aplicación normal (web + base de datos + tareas programadas) que usa IA solo en tres puntos:

- extraer datos del presupuesto,
- interpretar respuestas de clientes,
- (opcional) redactar mensajes personalizados.

---

## 2. Decisión pendiente: ubicación del código

Evaluar antes de empezar:

- **Opción A — Módulo dentro de la plataforma CRM.** Preferida en principio: el CRM ya tiene agente de WhatsApp y funcionalidad de QRs, y comparte clientes/usuarios/vendedores.
- **Opción B — Proyecto aparte**, reutilizando la estructura de parámetros del SaaS de base de datos.

**Primera tarea en la nube:** analizar los tres repositorios (SaaS de base de datos con parámetros, CRM con QRs, agente de WhatsApp), resumir qué se puede reutilizar y recomendar A o B. No escribir código de producto en esa tarea.

### Decisiones de Rocco (2026-09-24, después del análisis de la etapa 1)

- **La opción A queda descartada.** El módulo no va dentro de PlataformaCRM.
- **Decisión final: el módulo va dentro de Xentech** (este repo), confirmado por Rocco el 2026-09-24. La empresa de cartelería es una organización más, y el módulo se habilita por organización, igual que los agentes.
  - Se reutiliza de Xentech: organizaciones y usuarios, `Cliente`, `normalizarTelefono`, el token de WhatsApp cifrado por organización (`src/lib/whatsapp/`), el patrón `LlmProvider`/`OpenRouterProvider`, el inbox con derivación a humano y el flujo de importación con vista previa y revisión.
  - Se toma como patrón de PlataformaCRM, sin copiar el código tal cual: los procesos periódicos con `FOR UPDATE SKIP LOCKED` (la idempotencia del motor de seguimiento, §6.3) y los tokens guardados como hash con prefijo visible (para `TokenResena`).
  - Encaja con el tipo de agente `REMINDERS`, que ya existe en el enum y todavía no se diseñó: mensajes salientes con plantillas de Meta. Conviene diseñarlos juntos.
  - Riesgo a resolver al empezar la etapa 2: Xentech aplica el schema con `prisma db push`, sin migraciones versionadas. Hay que decidir si se pasa a `prisma migrate` antes de agregar estas tablas.
  - El frontend es Vite + React, no Next.js (§3). La página pública `/r/<token>` va como ruta pública del SPA.
- El repo `Seguimiento-ImagenVisual`, donde nació este documento, queda sin uso.
- **Negocio:** es para una empresa de cartelería, no para concesionarias. El modelo `Quote` del CRM no aplica.
- **Presupuesto:** se crea un modelo `Presupuesto` propio.
- **IA:** se usa OpenRouter, con el mismo patrón `LlmProvider` de Xentech y del CRM. Donde este documento dice "API de Claude", leer OpenRouter. La salida estructurada va por tool calling con una única tool forzada, o por `response_format`, según lo que soporte el modelo elegido.
- **Reseñas:** son propias, no se usa Resea. Tienen que verse en la web pública de la empresa.
- **Dominio público:** los links de reseña necesitan un dominio real. La idea es usar el de la web de la empresa.
  - Pendiente (lo averigua Rocco): qué dominio es, en qué plataforma está la web y si se pueden agregar registros DNS (por ejemplo, un subdominio `resenas.`).
  - Relevado el 2026-09-23 en `docs/deployment.md`: Xentech no está desplegado (no hay hosting de backend ni de frontend, ni dominio propio) y usa un único proyecto de Supabase como base real y de desarrollo a la vez. Nada de eso bloquea construir y testear las etapas 2 a 4 con CI. Sí bloquea dos cosas:
    - **Aplicar el schema nuevo a una base:** antes hay que separar Supabase en desarrollo y producción, o que Rocco acepte explícitamente aplicarlo sobre la base real.
    - **Mandar links de reseña reales:** antes hay que desplegar. Recomendación: el mismo esquema que PlataformaCRM, backend en Render (plan pago siempre encendido, por el poller) y frontend en Vercel (dominios personalizados con SSL automático), más el subdominio de la web de la empresa.

### Decisiones de Rocco (2026-09-26): canal, proveedor de email, reseñas e importación

Preguntadas al ver que ninguno de los 4 presupuestos reales trae el email del cliente y que el teléfono aparece en 2 de 4 (ver "Etapa 4: soporte de `.doc`…" más abajo).

1. **Canal del seguimiento: los dos, email si hay email y WhatsApp si no.** No es "email obligatorio en la revisión" ni "WhatsApp en lugar de email": el canal se resuelve por presupuesto según el dato que haya. Así el motor de email de la etapa 5 sirve tal como está y WhatsApp se suma cuando existan credenciales de Meta. Consecuencias a resolver al implementarlo:
   - La revisión de la importación no exige email, pero sí exige que haya **al menos uno** de los dos datos (email o teléfono): sin ninguno no hay seguimiento posible y guardar el presupuesto igual solo esconde el problema.
   - La programación de `Envio` pasa a elegir el canal por presupuesto. Con los dos datos gana email (más barato, sin ventana de 24 h ni plantillas de Meta); WhatsApp es **respaldo, no un canal paralelo** — un mismo paso de la secuencia no se manda por los dos.
   - El consentimiento sigue siendo por canal (§5), sin cambios: el de WhatsApp lo marca la persona en la revisión, el de email es la relación precontractual.
2. **Proveedor de email: Resend.** Falta la clase concreta en `src/lib/email/` que implemente `EmailProvider` (la interfaz ya existe y `getEmailProvider()` hoy devuelve `null` a propósito) más la env var con la API key. La recepción de respuestas y la detección de "BAJA" (§6.4, §7) van por el webhook de entrada de Resend.
3. **Nombre en las reseñas públicas: lo elige quien deja la reseña**, entre anónimo y **nombre + inicial del apellido** ("Laura M."). Dos cambios respecto de lo que hay hoy:
   - La opción no anónima publica el nombre **abreviado**, no `Cliente.nombre` entero. La abreviación se calcula al publicar y se guarda en `Resena.nombreVisible`, que sigue siendo una copia y no una referencia viva.
   - En `/r/<token>` las dos opciones van como **botones**, no como radios: elegir tiene que ser una sola acción.
4. **Nombre del cliente al importar: los dos, en campos separados.** La empresa (`EMPRESA:`) identifica al cliente y la persona de contacto ("Sra. …") es a quién se le escribe; son datos distintos y los dos se usan. Hoy `Cliente` tiene un solo `nombre`, así que hace falta un campo nuevo (en `Cliente` o en `Presupuesto`, a definir al implementarlo). En el presupuesto que no trae empresa, la persona queda como único nombre.

**Sigue abierta:** dominio y hosting (más arriba en esta misma sección y `docs/deployment.md`). No bloquea nada de lo de arriba; sí bloquea mandar links de reseña reales.

---

## 3. Stack

- Backend: Node + TypeScript, Prisma, Postgres (Supabase).
- Frontend: Next.js (página pública de reseñas + panel interno).
- Tareas programadas: pg_cron de Supabase o worker con node-cron, corriendo cada pocos minutos.
- IA: API de Claude con salida estructurada (JSON con esquema fijo, vía tool use).
- WhatsApp: WhatsApp Cloud API (no la app común de WhatsApp Business). Evaluar "coexistencia" para usar el mismo número en app y API.
- Email: proveedor con envío y recepción de respuestas. **Elegido el 2026-09-26: Resend** (ver las decisiones de esa fecha en §2).

Si el código va dentro del CRM, **respetar el stack y las convenciones existentes del repo** por sobre lo de esta lista.

---

## 4. Modelo de datos (orientativo)

Adaptar nombres y relaciones a lo que ya exista en el repo (clientes, usuarios, vendedores).

- **Cliente**: nombre, teléfono, email.
- **Presupuesto**: cliente, vendedor, datos extraídos (JSON), archivo original, estado, fecha de emisión, validez.
  - Estados: `pendiente`, `en_seguimiento`, `aceptado`, `rechazado`, `vencido`, `sin_respuesta`.
- **Consentimiento**: cliente, canal (`whatsapp` | `email`), origen (`whatsapp_entrante`, `verbal_vendedor`, `respuesta_whatsapp`, `relacion_presupuesto_email`), fecha, fecha de baja (nullable), registrado por.
- **ConfigSeguimiento**: intervalos (ej. `[2, 7, 15]` días), máximo de intentos, plantillas por canal y por paso.
- **Envio**: presupuesto, paso de la secuencia, canal, fecha programada, fecha enviada, estado (`programado`, `enviado`, `fallido`, `cancelado`), clave de idempotencia.
- **Mensaje**: presupuesto, cliente, canal, dirección (`entrante` | `saliente`), contenido, fecha, ID externo del proveedor, clasificación IA (nullable), resumen IA (nullable).
- **TokenResena**: token (aleatorio, no adivinable), cliente, presupuesto (nullable), vence el, usado el (nullable).
- **Resena**: token, nombre visible (nullable si anónimo), anónimo (bool), estrellas (1–5), comentario (nullable), estado de moderación, fecha.

---

## 5. Reglas de consentimiento (definidas, no cambiar sin consultar)

Contexto: Uruguay, Ley 18.331 de protección de datos personales, más las políticas de WhatsApp Business de Meta.

**Email**

- El seguimiento de un presupuesto que el cliente pidió se trata como parte de la relación precontractual.
- Todo email de seguimiento termina con una línea de baja, por ejemplo: _"Respondé BAJA si no querés más mensajes."_
- La baja se detecta automáticamente ("BAJA" o equivalentes como "no me escriban más") y corta la secuencia de inmediato. Queda registrada con fecha.
- Estos datos se usan **solo** para el seguimiento de ese presupuesto. Nada de marketing sin consentimiento activo aparte.

**WhatsApp**: solo se envía si existe consentimiento registrado, obtenido por alguno de estos caminos:

1. El cliente pidió el presupuesto por WhatsApp (él abrió el canal). Al enviarle el presupuesto, el vendedor agrega: _"Te escribo en unos días para ver qué te pareció 👍"_.
2. El vendedor lo acordó verbalmente (en persona o por teléfono) y lo marcó en el sistema.
3. El cliente respondió un mensaje de WhatsApp de la empresa.

- "Si no quiere WhatsApp, responda BAJA" **no** cuenta como consentimiento para WhatsApp.
- Al cargar un presupuesto es **obligatorio** marcar "Seguimiento por WhatsApp: sí / no". El formulario no se guarda sin ese campo.
- Sin consentimiento de WhatsApp, el seguimiento va solo por email.
- Cada mensaje de WhatsApp también ofrece la baja.

**Reseñas**

- El link de reseña no se envía selectivamente solo a clientes satisfechos, y no se ocultan reseñas negativas legítimas. La moderación es solo para spam o contenido inapropiado.

---

## 6. Módulos

### 6.1 Reseñas

- `generarTokenResena(clienteId, presupuestoId?)`: token criptográficamente aleatorio, vencimiento configurable (default 30 días).
- Página pública `/r/[token]`:
  - token inválido, vencido o usado → mensaje amable, sin revelar datos del cliente;
  - opciones, como dos botones: "Publicar como {Nombre + inicial del apellido}" / "Publicar como anónimo" (decisión del 2026-09-26, §2);
  - estrellas obligatorias, comentario opcional (con límite de caracteres).
- `POST` de la reseña: valida el token, lo marca como usado **en la misma transacción** y guarda la reseña.
- Listado público de reseñas aprobadas, y moderación en el panel.

### 6.2 Importación de presupuestos

- Subida de .docx → texto con `mammoth`.
- Si la plantilla usa controles de contenido de Word, extraerlos de forma determinística primero y usar la IA solo como respaldo.
- Llamada a Claude con esquema fijo: `cliente_nombre`, `telefono`, `email`, `vehiculo_o_items`, `monto`, `moneda`, `fecha_emision`, `validez`, `vendedor`. Campos no encontrados → `null`. Nunca inventar datos.
- Pantalla de revisión: una persona corrige y confirma antes de guardar, y marca el consentimiento de WhatsApp (obligatorio).
- Pendiente: conseguir un presupuesto de ejemplo real (con datos ficticios) para ajustar la extracción.

### 6.3 Motor de seguimiento

Job periódico:

1. Busca `Envio` con estado `programado` y fecha vencida.
2. Antes de enviar, verifica que:
   - el presupuesto siga abierto (`pendiente` o `en_seguimiento`);
   - no haya baja para ese canal;
   - exista consentimiento válido para el canal;
   - no se haya superado el máximo de intentos.
3. Envía por el canal y registra el `Mensaje`.
4. Programa el siguiente paso, o marca `sin_respuesta` si terminó la secuencia.

Requisitos:

- **Idempotente**: si el job corre dos veces o en paralelo, nunca envía dos veces el mismo mensaje (clave de idempotencia + bloqueo de fila o actualización condicional).
- Zona horaria America/Montevideo. No enviar fuera de horario razonable (ej. 9–20 h), configurable.

### 6.4 Canales

**WhatsApp**

- Fuera de la ventana de 24 h desde el último mensaje del cliente: solo **plantillas aprobadas por Meta**, con variables (`{{nombre}}`, `{{vehiculo}}`...).
- Dentro de la ventana: mensajes libres (la IA puede conversar).
- Webhook de entrada: verificar la firma y asociar cada mensaje al cliente/presupuesto por número.
- Tener en cuenta el costo por plantilla (categorías "utilidad" vs "marketing").
- Reutilizar el agente de WhatsApp existente del CRM si aplica.

**Email**

- Reply-to que el sistema pueda recibir (webhook de entrada del proveedor).
- Asociar respuestas al presupuesto por dirección con identificador o por encabezados de hilo (`In-Reply-To` / `References`).
- Limpiar citas del mensaje original antes de pasarlo a la IA.

### 6.5 Interpretación de respuestas (IA)

Cada mensaje entrante va a Claude con salida estructurada:

- `clasificacion`: `interesado` | `pide_descuento` | `quiere_llamada` | `lo_esta_pensando` | `acepta` | `rechaza` | `compro_en_otro_lado` | `baja` | `otro`
- `resumen`: una línea
- `requiere_vendedor`: bool

Acciones:

- `baja` → cortar la secuencia y registrar la baja;
- `acepta` → presupuesto `aceptado`, cortar secuencia, enviar link de reseña;
- `rechaza` / `compro_en_otro_lado` → `rechazado`, cortar secuencia;
- `requiere_vendedor` → notificar al vendedor asignado.

La detección de "BAJA" literal se hace también por regla simple, sin depender solo de la IA.

### 6.6 Panel interno

- Lista de presupuestos con estado, próximo envío e historial de mensajes.
- Configuración de intervalos, máximo de intentos, horario de envío y plantillas.
- Moderación de reseñas.
- Carga e importación de presupuestos.

---

## 7. Etapas

Cada etapa debe quedar usable por sí sola.

1. **Análisis de repos** y decisión módulo vs proyecto aparte (sección 2).
2. **Modelo de datos** + migraciones.
3. **Reseñas** completas (token, página pública, guardado, listado, moderación).
4. **Importación de presupuestos** con revisión humana.
5. **Motor de seguimiento por email** (envío + recepción + baja).
6. **WhatsApp** (plantillas, webhook, ventana de 24 h).
7. **Interpretación de respuestas con IA** + notificaciones al vendedor + link de reseña automático.
8. **Panel** completo.

---

### Estado de la etapa 2 (2026-09-24)

Hecha, en código:

- **Modelos nuevos en `prisma/schema.prisma`:** `ConfigSeguimiento`, `Presupuesto`, `Consentimiento`, `Envio`, `MensajeSeguimiento`, `TokenResena` y `Resena`, con sus enums.
- **Validación de la configuración con Zod:** `src/schemas/configSeguimiento.schema.ts`, con tests.

Qué garantiza el diseño del schema:

- **Solo agrega tablas y enums nuevos.** El diff contra `main` (`prisma migrate diff`) no tiene ningún `DROP` ni cambia tablas existentes, así que `db push` lo aplica sin `--accept-data-loss`.
- **Aislamiento entre organizaciones en la base:** todas las relaciones hacia Cliente, User, Presupuesto y Envio usan FK compuesta `(organizationId, id)`.

Diferencias con §4 (decididas, a confirmar por Rocco):

- `TokenResena` guarda el **hash** del token, no el token. Consecuencia: un link no se puede reenviar desde la base, se genera uno nuevo.
- `Resena` usa **post-moderación**: se publica aprobada y solo se rechaza por spam o contenido inapropiado. Así cumple §5 (no ocultar reseñas negativas legítimas).
- `Mensaje` se llama `MensajeSeguimiento`, para no chocar con `Message` del agente de WhatsApp.

Pendiente:

- **Aplicar el schema a la base:** Rocco decidió usar el mismo proyecto de Supabase de Xentech, que tiene datos reales. Se aplica con el workflow `db-migrate.yml` después de mergear, y lo dispara Rocco. Nunca desde una sesión en la nube.
- **Habilitación por organización:** el toggle del módulo (un valor nuevo de `AgentType` o un flag aparte) queda para la etapa 3, junto con la primera funcionalidad que lo necesite.

### Estado de la etapa 3 (2026-09-24)

Hecha, en código (PR del backend + PR del frontend):

- **Habilitación por organización:** valor nuevo `SEGUIMIENTO_RESENAS` en `AgentType`, con el mismo toggle del panel de plataforma ("Seguimiento y reseñas"). `GET /api/me` devuelve `agentesHabilitados`.
- **Tokens:** `src/lib/resenas/token.ts` (32 bytes aleatorios en base64url; en la base, solo el sha256). Vencimiento: `ConfigSeguimiento.diasValidezTokenResena`, o 30 días sin config.
- **Rutas públicas** (`src/routes/resenasPublic.ts`): formulario y publicación por token (el token va en el body, no en la URL, para que no quede en los logs), y `GET /api/public/organizaciones/:slug/resenas` con CORS abierto solo en esa ruta, para la web de la empresa.
- **Uso único:** publicar hace, en una transacción, un `UPDATE` condicional del token y recién ahí crea la reseña. Probado contra Postgres real: 10 POST concurrentes con el mismo token dan 1 sola reseña.
- **Panel** (`/resenas` en el frontend): generar link para un cliente (cualquier usuario), ver reseñas y moderar (solo admin; rechazar exige motivo).
- **Páginas públicas del SPA:** `/r/<token>` (formulario) y `/o/<slug>/resenas` (listado de aprobadas).

Decisiones tomadas en esta etapa, a confirmar por Rocco:

- Un solo toggle para todo el módulo, llamado `SEGUIMIENTO_RESENAS`.
- Generar links: cualquier usuario de la organización. Moderar: solo el admin.
- Si el cliente no elige anónimo, se publica `Cliente.nombre` completo, tal como está cargado.

Pendiente:

- **El link se manda a mano** (el vendedor lo copia desde el panel). El envío automático al aceptar un presupuesto es de la etapa 7.
- **Dominio:** el link se arma con el origen del frontend (`window.location.origin`). Hasta que haya despliegue y dominio (§2), no se pueden mandar links reales.
- **Aplicar a la base:** el valor nuevo de `AgentType` se aplica junto con el schema de la etapa 2, con `db-migrate.yml`, cuando Rocco lo dispare. Después, correr `prisma/sql/rls_policies.sql` en el SQL Editor de Supabase (ya cubre las 7 tablas nuevas).

### Estado de la etapa 4, paso 1: extracción (2026-09-25)

Hecha, en código (sin persistir nada todavía):

- **`POST /api/presupuestos/import/preview`** (`src/routes/presupuestosImport.ts`, gate igual que `/api/resenas`: `authenticate` + `requireAgentEnabled("SEGUIMIENTO_RESENAS")`, cualquier usuario de la organización): recibe un `.docx`, lo procesa en memoria (no lo guarda) y devuelve `{ archivoNombre, textoExtraido, datos }` — nada se escribe en la base.
- **`src/services/presupuestoImport.service.ts`:** `mammoth.extractRawText` para el texto plano, después una llamada al `LlmProvider` con una tool forzada (`tool_choice`, agregado a `LlmCompletionParams`/`OpenRouterProvider` en este PR — el loop del agente no lo necesitaba, ahí el modelo elige) para forzar la salida estructurada de los 9 campos de §6.2, con `null` donde no aparece.
- Modelo configurable por `PRESUPUESTO_EXTRACTION_MODEL` (default `anthropic/claude-3.5-haiku`), **sin probar todavía contra OpenRouter real** (no hay `OPENROUTER_API_KEY` en la nube) — los tests mockean el `LlmProvider`, mismo criterio que `orchestrator.test.ts`.
- Fixture de prueba: `src/services/__fixtures__/presupuesto-ejemplo.docx`, generado con datos 100% ficticios (no es el presupuesto real pedido en §6.2, que sigue pendiente de Rocco).

Decisión propia, a confirmar por Rocco:

- El campo `vehiculo_o_items` de §6.2 pasó a llamarse **`items`** en el schema y en la tool — §6.2 se escribió antes de que Rocco descartara la opción A y confirmara que el negocio es cartelería, no concesionarias (§2), y el nombre original no tenía sentido para lo que se está presupuestando.

Explícitamente NO cubierto en este paso (queda para pasos siguientes):

- **Persistencia:** no crea `Presupuesto`, `Cliente` ni `Consentimiento`. Falta la pantalla de revisión (donde una persona corrige, matchea o crea el `Cliente`, y marca `seguimientoWhatsapp`) y el endpoint de commit — mismo patrón de dos pasos que `clientesImport.ts`.
- **Controles de contenido de Word:** §6.2 pide extraerlos de forma determinística antes de recurrir a la IA, si la plantilla los usa. Este paso llama a la IA siempre sobre el texto plano de mammoth; no se investigó si Rocco usa plantillas con controles de contenido.
- **Presupuesto de ejemplo real:** sigue pendiente (§6.2) — sin uno, no se puede ajustar la extracción contra un caso real ni saber si el prompt/schema actual sirve.

### Estado de la etapa 4, paso 2: revisión + guardado (2026-09-25)

Hecha, en código -- con esto la etapa 4 queda usable de punta a punta (§7: "cada etapa debe quedar usable por sí sola"):

- **`POST /api/presupuestos/import/commit`** (mismo router y gate que `/preview`): recibe JSON (no el archivo -- el `.docx` no se vuelve a subir) con lo que la persona confirmó en la pantalla de revisión, y crea `Cliente` (si eligió "nuevo"), `Presupuesto` y su(s) `Consentimiento`(s) en una sola transacción (`src/repositories/presupuesto.repository.ts`).
- **Cliente:** existente (elegido de la lista) o nuevo, cargado ahí mismo -- mismos campos que el alta manual (`createClienteSchema`). El backend valida que un `clienteId` existente sea de la organización que hace el request.
- **`vendedorId`:** opcional, valida contra `User` de la organización si se manda -- pero **el frontend todavía no lo pide** (`/api/users` es solo para el admin de la organización, y esta pantalla es para cualquier usuario; falta decidir cómo exponerlo sin ese gate). El nombre del vendedor tal como vino del `.docx` queda en `datosExtraidos` igual.
- **Consentimiento de email:** se registra SIEMPRE al crear el presupuesto (`RELACION_PRESUPUESTO_EMAIL`), tenga o no el cliente un email cargado -- decisión propia, sigue el comentario de `Consentimiento` en `prisma/schema.prisma` ("es parte de la relación precontractual"), a confirmar por Rocco.
- **Consentimiento de WhatsApp:** `seguimientoWhatsapp` (sí/no, sin default) es obligatorio; si es sí, la pantalla exige elegir uno de los DOS orígenes que tiene sentido marcar acá mismo (`WHATSAPP_ENTRANTE` o `VERBAL_VENDEDOR`) -- el tercero (`RESPUESTA_WHATSAPP`) lo registrará el sistema más adelante, a partir de un mensaje entrante real, no desde esta pantalla.
- **Archivo original:** NO se persiste -- `Presupuesto.archivoPath` queda `null` (sigue sin existir el bucket de Supabase Storage, comentario del schema); solo se guarda `archivoNombre`.
- **Frontend:** `/presupuestos/importar` (mismo gate que `/resenas`), con link desde `/` -- dos pasos (elegir archivo → revisar y confirmar), sugiere un `Cliente` existente por coincidencia de teléfono contra el draft de la IA, precarga los campos editables, y no deja guardar sin elegir sí/no de WhatsApp (ni sin el origen, si es sí).
- Tests: `presupuestoImport.service.test.ts` (repos en memoria, nunca Prisma real) + `ImportPresupuestosPage.test.tsx` (fetch mockeado). Todo el backend (178 tests) y todo el frontend (43 tests) en verde, typecheck/lint/format en verde en los dos.

Pendiente:

- **Archivo original en Storage:** falta decidir y armar el bucket de Supabase Storage (§2 ya lo marcaba como no bloqueante para construir/testear).
- **Selector de vendedor en el frontend:** bloqueado por el gate de `/api/users` (solo admin) -- decidir si se abre un endpoint más chico (ej. `/api/users/vendedores`, sin admin) o se deja así.
- **Presupuesto de ejemplo real** (arrastrado del paso 1): sigue sin llegar.
- **Motor de seguimiento (etapa 5):** todavía no consume nada de esto -- un `Presupuesto` creado hoy no genera ningún `Envio` todavía (eso es la etapa 5, "motor de seguimiento por email").

### Estado de la etapa 5, paso 1: programar los `Envio` de email (2026-09-25)

Hecha, en código -- SOLO la parte de programar, no la de enviar (§7 separa "motor de seguimiento por email" en un paso, este PR cubre nada más que la creación de las filas `Envio`):

- **`src/lib/seguimiento/envioScheduling.ts`:** función pura `calcularEnviosEmail()`, un `Envio` por cada entrada de `intervalosDias`. §4 dice "días entre el envío del presupuesto y cada paso de seguimiento" -- se interpretó como offsets desde LA MISMA fecha de referencia (no acumulados: `[2, 7, 15]` son los días 2, 7 y 15), consistente con que `configSeguimiento.schema.ts` ya exige que sean estrictamente crecientes.
- **`presupuesto.repository.ts` (`crearConConsentimientos`):** ahora, en la MISMA transacción que crea el `Presupuesto` y sus `Consentimiento`, busca la `ConfigSeguimiento` de la organización (si existe) y programa los `Envio` de EMAIL -- WhatsApp queda para la etapa 6, a propósito. Sin fila de config (todavía no hay panel para cargarla, eso es la etapa 8), usa los mismos defaults que el schema de Prisma (`[2, 7, 15]` días, 9 h, `America/Montevideo`).
- Fecha de referencia = `fechaEmision` del presupuesto si se pudo determinar, si no el momento en que se cargó -- decisión propia, a confirmar por Rocco.
- Tests: `envioScheduling.test.ts` (función pura, sin DB) -- **no hay test de `presupuesto.repository.ts` en sí** (ninguna otra transacción de Prisma del repo lo tiene tampoco: `npm test` no levanta Postgres, ver `.github/workflows/ci.yml`), así que la llamada real a `tx.configSeguimiento.findUnique` + `tx.envio.createMany` no se probó contra una base real. Backend 183 tests, typecheck/lint/format en verde.

Explícitamente NO cubierto en este paso (queda para pasos siguientes de la etapa 5):

- **Envío real:** no hay job periódico, ni integración con ningún proveedor de email (Resend/SendGrid, §3 -- sigue sin elegirse). Las filas `Envio` quedan en `PROGRAMADO` para siempre hasta que exista ese paso.
- **Las verificaciones antes de enviar** (§6.3 punto 2: presupuesto sigue abierto, no hay baja, consentimiento válido, no se pasó `maxIntentos`) -- son del job de envío, no de la programación.
- **Recepción de respuestas y detección de "BAJA"** (§7, mismo paso de etapa que "envío"): tampoco cubierto todavía.
- **No se puede probar de punta a punta:** las tablas de la etapa 2 (incluida `envios`) siguen sin aplicarse a la base real (`db-migrate.yml` sigue sin correrse -- ver el estado de la etapa 2 más arriba).

### Estado de la etapa 5, paso 2: el job que procesa los `Envio` vencidos (2026-09-25)

Hecha, en código, TODA la lógica de negocio del job -- pero sin ningún proveedor de email real conectado todavía (§3 sigue sin elegirse, es decisión de Rocco, preguntada por mensaje -- ver el doc de Cowork):

- **`src/lib/email/emailProvider.ts`:** interfaz `EmailProvider` (mismo patrón que `LlmProvider`) + `getEmailProvider()`, que hoy siempre devuelve `null` -- a propósito, no hay ninguna clase que la implemente todavía. `envioJob.ts` trata `null` como "la función de envío no está configurada": no lee ni toca ninguna fila de `Envio` en ese caso, para no gastarles `intentos` contra algo que no existe. El poller (`envioJobPoller.ts`, arrancado desde `server.ts`, tick de 60 s) corre siempre, igual que el de WhatsApp, pero queda "encendido pero inactivo" hasta que se elija un proveedor.
- **`src/lib/seguimiento/envioChecks.ts`:** `evaluarPrecondicionesEnvio()`, pura -- las 4 verificaciones de §6.3 punto 2 (presupuesto abierto, sin baja, consentimiento válido, máximo de intentos), en ese orden. Devuelve `CANCELADO` (el presupuesto se cerró, hubo baja, no hay consentimiento o el cliente no tiene email -- nunca va a poder enviarse) o `FALLIDO` (se agotaron los reintentos de algo en principio transitorio) para poder distinguir los dos casos en el job.
- **`src/lib/seguimiento/envioVentana.ts`:** `estaDentroDeVentanaDeEnvio()` -- el chequeo de horario/zona horaria de §6.3 (`horaFinEnvio` es exclusive, comentario del schema). Se chequea ANTES de reclamar la fila (si está fuera de horario, ni se intenta -- se reintenta en un tick futuro).
- **`src/lib/seguimiento/envioContenido.ts`:** `armarEmailSeguimiento()` -- usa la plantilla de `ConfigSeguimiento.plantillas.EMAIL[paso - 1]` si existe (todavía nunca, sin panel -- etapa 8), si no un texto genérico. Agrega SIEMPRE la línea de baja (§5: "no va en la plantilla, la agrega el motor de envío a todo email") sea cual sea el caso.
- **`src/lib/seguimiento/envioJob.ts`:** `procesarEnviosVencidos()`, el orquestador -- deps inyectables, mismo patrón que `inboundJobProcessor.ts`/`resena.service.ts`. Por cada `Envio` vencido (canal EMAIL, ordenados por `programadoPara`): chequea la ventana horaria de SU organización, reclama la fila con un UPDATE condicional (`estado = PROGRAMADO` -> `ENVIANDO`, incrementando `intentos` en el mismo UPDATE -- si el count es 0, otra corrida ya se la llevó) -- eso, sumado a la `claveIdempotencia` única que ya existía, es el "idempotente" de §6.3. Corre las precondiciones, arma el email y llama a `EmailProvider.enviar()`. Éxito: `ENVIADO` + `MensajeSeguimiento` saliente + `Presupuesto` a `EN_SEGUIMIENTO` (si estaba `PENDIENTE`). Falla transitoria con intentos disponibles: vuelve a `PROGRAMADO` (mismo `programadoPara`, sin backoff -- decisión propia). Después de CUALQUIER resultado terminal (`ENVIADO`, `CANCELADO` o `FALLIDO`), chequea si quedan otros `Envio` pendientes de ese presupuesto: si no queda ninguno, lo pasa a `SIN_RESPUESTA` (si seguía `PENDIENTE`/`EN_SEGUIMIENTO`) -- interpretación propia de "marca sin_respuesta si terminó la secuencia" (§6.3 punto 4), a confirmar por Rocco: corre apenas se resuelve el ÚLTIMO paso programado, no después de esperar una respuesta (no hay mecanismo de recepción de respuestas todavía, así que nada puede "ganarle" a esta marca en el medio).
- **`EnvioEstado` (schema):** se agregó `ENVIANDO` (estado transitorio del claim, ver comentario ahí) -- adición pura, sin tocar filas ni tablas existentes.
- Tests: `envioChecks.test.ts`, `envioContenido.test.ts`, `envioVentana.test.ts`, `envioJob.test.ts` (con fakes, sin Prisma real -- mismo motivo que el resto). Backend 213 tests, typecheck/lint/format en verde.

Explícitamente NO cubierto en este paso (queda para pasos siguientes de la etapa 5, o depende de elegir proveedor):

- **Ningún proveedor de email real conectado.** Elegir entre Resend/SendGrid (decisión de Rocco, ya preguntada por mensaje) y escribir la clase concreta en `src/lib/email/` que implemente `EmailProvider`, más la env var con la API key.
- **Recepción de respuestas y detección de "BAJA"** (§7, mismo paso de etapa que "envío"): sigue sin cubrir. Depende del proveedor elegido (formato del webhook de entrada).
- **No probado contra Postgres real:** mismo motivo que el paso 1 (`npm test` no levanta DB) -- ni contra un proveedor de email real (no hay ninguno conectado).
- **Sin backoff en los reintentos** ni límite de tasa de envío por organización -- si hace falta, es un paso siguiente.

### Etapa 4: soporte de `.doc` y lo que muestran los presupuestos reales (2026-09-26)

Rocco subió 4 presupuestos reales a `docs/ejemplos-presupuestos/`. **Tienen datos reales de clientes**, así que el repo pasó a privado ese mismo día (ver "Visibilidad del repo" más abajo). Nunca usarlos como fixture de tests ni copiar su contenido a código, commits o PRs.

**Hecho:** la importación acepta `.doc` (Word 97-2003), que es el formato en que la empresa guarda sus presupuestos y que `mammoth` no lee. Detalle:

- Se usa `word-extractor` (JavaScript puro, sin binarios en el servidor).
- El lector se elige por el contenido del archivo (firma ZIP u OLE), no por la extensión, así que un archivo mal renombrado se lee igual.
- El fixture `src/services/__fixtures__/presupuesto-ejemplo.doc` es el `.docx` ficticio de siempre convertido con LibreOffice.

**Qué muestran los 4 presupuestos reales:**

- **Formato:** texto plano con líneas `ETIQUETA: valor`, sin controles de contenido de Word. El respaldo determinístico de §6.2 no aplica; la IA sobre el texto es el camino.
- **Cliente:** la empresa va en `EMPRESA:` y la persona de contacto en la línea siguiente ("Sra. …"), a veces con el celular en la misma línea. En uno de los 4 no hay empresa, solo la persona.
- **Email del cliente: no aparece en ninguno.** El teléfono aparece en 2 de 4. Consecuencia directa para la etapa 5: si el email no se carga a mano en la revisión, el seguimiento por email no tiene a quién escribir. **Decisión abierta para Rocco:** ¿el email es obligatorio en la revisión, o el canal principal pasa a ser WhatsApp?
- **Montos:** en pesos (`$`), casi siempre "+ IVA". Hay presupuestos con varias opciones alternativas ("OPCION 1", "OPCION 2") y con ítems adicionales sueltos, así que no siempre hay un total único. El prompt ahora dice que en ese caso `monto` va `null`.
- **Validez:** siempre como "MANTENIMIENTO DE LA OFERTA: 15 días" (días desde la fecha, no una fecha de vencimiento).
- **Vendedor:** en la firma, antes de "p. Imagen Visual".
- **Otros datos que la IA hoy no extrae:** plazo de producción, forma de pago, dirección de la obra y condiciones generales.

Sin probar todavía contra OpenRouter real (no hay `OPENROUTER_API_KEY` en la nube). Cuando haya una clave, correr la extracción sobre los 4 ejemplos es la prueba que falta.

### Estado de la etapa 5: proveedor de email real, Resend (2026-09-26)

Hecho el adapter, con lo que eso implica: el motor del paso 2 deja de estar "encendido pero inactivo" en cuanto existan las env vars.

- **`src/lib/email/resendEmailProvider.ts`:** `ResendEmailProvider` implementa `EmailProvider` con un solo `fetch` a `POST https://api.resend.com/emails`, sin SDK -- mismo criterio que `OpenRouterProvider`. El cuerpo va como `text` (lo que devuelve `armarEmailSeguimiento`, incluida la línea de baja de §5), nunca como `html`.
- **Nunca lanza.** Todo error -- red caída, status de error, respuesta ilegible, 200 sin `id` -- vuelve como `{ ok: false, error }`, porque es `envioJob.ts` el que decide entre reintentar y marcar `FALLIDO` según los intentos. Una excepción acá abortaría el lote entero de `Envio` vencidos.
- **`getEmailProvider()`** ahora devuelve el provider cuando están **`RESEND_API_KEY` y `EMAIL_FROM`**, y `null` si falta alguna. Exige las dos a propósito: sin remitente de dominio verificado Resend devuelve 403 a todo, y arrancar "medio configurado" solo gastaría los `intentos` de cada `Envio` contra un error seguro. Con la API key puesta y `EMAIL_FROM` faltando, avisa por `console.warn` una sola vez -- el caso peligroso es el silencioso. `EMAIL_REPLY_TO` es opcional (sin ella, las respuestas van al remitente).
- Tests: `resendEmailProvider.test.ts` (10 casos, `fetch` inyectado, sin red). Backend 229 tests, typecheck/lint/format en verde.

Explícitamente NO cubierto:

- **Sin probar contra Resend real.** Falta una API key y, sobre todo, un dominio verificado: eso depende de la decisión de dominio/hosting, que sigue abierta (§2 y `docs/deployment.md`). Hasta entonces el motor sigue inactivo, ahora por falta de configuración y no por falta de código.
- **Recepción de respuestas y detección de "BAJA"** (§6.4, §7): sigue sin cubrir. Es el webhook de entrada de Resend, paso aparte.
- **Riesgo conocido, sin cubrir: envío exitoso con respuesta perdida.** Si Resend acepta el mail pero la respuesta HTTP se corta, el job lo toma como fallo transitorio, vuelve el `Envio` a `PROGRAMADO` y lo reintenta: el cliente recibe el mismo mail dos veces. La idempotencia de §6.3 (`claveIdempotencia` + UPDATE condicional) cubre "dos corridas en paralelo", no este caso. El arreglo natural es mandar `claveIdempotencia` en el header `Idempotency-Key` de Resend (válido 24 h), pero hay un detalle a resolver antes: Resend rechaza la misma clave con un payload distinto, así que un reintento después de corregir el email del cliente pasaría de fallo transitorio a error duro. Requiere decidir qué entra en la clave; queda anotado, no implementado.

### Estado de la etapa 3: nombre abreviado en las reseñas y dos botones (2026-09-26)

Implementa la decisión 3 del 2026-09-26 (§2). Los dos cambios son chicos pero tocan backend y frontend, porque el botón tiene que decir exactamente lo que se va a publicar.

- **`src/lib/resenas/nombreVisible.ts`:** `abreviarNombreVisible()`, pura -- primera palabra + inicial de la última ("Laura Martínez" → "Laura M.", "Laura de los Santos" → "Laura S."). Una sola palabra queda tal cual; un nombre ya abreviado ("Laura M.") no acumula otra inicial. La usan los DOS lugares (`obtenerFormularioPublico` para el texto del botón y `publicarResena` para `Resena.nombreVisible`): si difirieran, la persona elegiría una cosa y se publicaría otra.
- **`ResenaPublicaPage.tsx`:** las dos opciones pasan de radios a botones, con `aria-pressed` y el elegido marcado por borde y fondo. `aria-pressed` y no `role="radio"` porque son dos botones alternativos, no un grupo navegable con flechas.
- Tests: `nombreVisible.test.ts` (7 casos, incluidos acentos y entradas degeneradas) y los de `resena.service.test.ts` / `ResenaPublicaPage.test.tsx` actualizados. Backend 236 tests, frontend 43, typecheck/lint/format/build en verde.

Dos cosas a tener en cuenta:

- **No hay backfill.** Las reseñas ya publicadas conservan el `nombreVisible` con el que se guardaron. Hoy no importa (no hay ninguna: nada está desplegado), pero si aparece alguna antes de desplegar, hay que abreviarla a mano.
- **Con el cliente cargado como empresa, la abreviación queda rara** ("Panadería La Espiga" → "Panadería E."). Se resuelve solo cuando entre la decisión 4 (empresa y persona de contacto en campos separados): la reseña tiene que usar el nombre de la PERSONA, no el de la empresa. Anotado ahí.

### Estado de la etapa 4: empresa y persona de contacto separadas (2026-09-26)

Implementa la decisión 4 del 2026-09-26 (§2). Toca el modelo, la extracción y las dos pantallas donde se carga un cliente.

- **`Cliente.personaContacto`** (nullable, `VarChar(200)`): a quién se le escribe. `Cliente.nombre` pasa a ser "cómo se identifica al cliente" -- la empresa cuando la hay, la persona suelta cuando no. **Columna nueva: falta que Rocco corra `db-migrate.yml`** (ver las reglas de más abajo). No hay tabla nueva, así que `prisma/sql/rls_policies.sql` no cambia.
- **Extracción:** `cliente_nombre` se parte en `cliente_empresa` y `cliente_persona` (10 campos, antes 9). El prompt ahora dice que la empresa está en `EMPRESA:` y la persona en la línea siguiente, que el tratamiento ("Sra.", "Arq.") no va en el nombre, y que si la línea trae el celular pegado va separado a `telefono`.
- **`nombreDeLaPersona()`** (`src/utils/nombreCliente.ts`): `personaContacto` con respaldo en `nombre`. Una sola función en vez de repetir el `??` en cada lugar y que alguno se olvide. La usan el saludo del email de seguimiento y el nombre de la reseña -- los dos le hablan a una persona, no a una empresa. Esto también arregla lo que quedó anotado en el estado de la etapa 3: la reseña ya no abrevia el nombre de la empresa.
- **Pantalla de revisión de la importación:** dos campos separados. Si el presupuesto no trae empresa (1 de los 4 ejemplos reales), la persona pasa a ser el nombre del cliente y el campo de contacto queda vacío, para no dejar el mismo nombre duplicado en los dos.
- **Alta manual de clientes** (`ClienteForm`) y **mapeo de columnas de la importación de clientes desde Excel**: los dos aceptan el campo nuevo.
- Tests: `nombreCliente.test.ts` nuevo, más los de extracción, reseñas, job de envío y las dos pantallas actualizados. Backend 239 tests, frontend 44, typecheck/lint/format/build en verde.

Explícitamente NO cubierto:

- **La revisión todavía no exige "al menos email o teléfono"** (decisión 1): es del paso del canal, no de este.
- **Sin backfill:** los clientes ya cargados quedan con `personaContacto` en null, y el respaldo a `nombre` los cubre. Hoy no hay ninguno en la base real de todas formas.
- **No se probó la extracción contra los 4 presupuestos reales:** sigue faltando `OPENROUTER_API_KEY`. El prompt nuevo se escribió a partir de lo que ya está descrito en este documento, no de una corrida real.

### Estado de la etapa 5: el canal se elige por presupuesto (2026-09-26)

Implementa la decisión 1 del 2026-09-26 (§2): email si el cliente tiene email, WhatsApp si no.

- **`elegirCanalSeguimiento()`** (`envioScheduling.ts`), pura: email primero (más barato, sin ventana de 24 h ni plantillas de Meta; su consentimiento es la relación precontractual de §5, que se registra siempre). Sin email, WhatsApp **solo si hay teléfono Y consentimiento de WhatsApp**. Si no se cumple ninguna, devuelve `null` y no se programa nada -- mejor que dejar filas `Envio` que nunca van a poder salir.
- **`calcularEnviosEmail()` pasa a ser `calcularEnvios()`**, con el canal como parámetro: la `claveIdempotencia` queda `"<presupuestoId>:<paso>:<canal>"`, como ya decía el comentario del modelo.
- **`presupuesto.repository.ts`** lee el email y el teléfono del cliente DENTRO de la transacción que crea el presupuesto, así el canal se decide con el estado con el que se está creando y no con uno anterior.
- **La revisión exige al menos un dato de contacto**, email o teléfono: en el schema para un cliente nuevo, en el service para uno existente (ahí el schema solo ve el id), y en la pantalla para no hacer el viaje al backend. El email dejó de ser obligatorio.
- De paso, dos textos de la pantalla que la decisión dejó desactualizados: la opción de WhatsApp decía "No, solo por email" (ahora "No, sin consentimiento de WhatsApp") y la ayuda del fieldset decía que sin consentimiento el seguimiento va solo por email.
- Tests: 5 casos nuevos de canal en `envioScheduling.test.ts`, `presupuestoImport.schema.test.ts` nuevo (6 casos), más los de service y pantalla. Backend 251 tests, frontend 45, typecheck/lint/format/build en verde.

Explícitamente NO cubierto:

- **Los `Envio` de WhatsApp se programan pero no salen.** El job del paso 2 filtra por canal EMAIL a propósito: mandar por WhatsApp es la etapa 6 y además depende del trámite de Meta. Las filas quedan en `PROGRAMADO`, que es el mismo estado en que quedaban TODAS antes de que hubiera motor de email -- no es una regresión, es trabajo pendiente visible en la base.
- **No hay cambio de canal después de crear el presupuesto.** Si a un cliente sin email se le carga uno más tarde, la secuencia ya programada sigue siendo de WhatsApp. Reprogramar al cambiar los datos de contacto es un paso aparte, si hace falta.
- **Un presupuesto puede quedar sin seguimiento:** cliente con solo teléfono y sin consentimiento de WhatsApp. Es deliberado (§5 no permite escribir sin consentimiento) y la pantalla lo dice.

### Visibilidad del repo

Base-de-datos-Xentech es **privado** desde el 2026-09-26, por los presupuestos reales de `docs/ejemplos-presupuestos/`. **Antes de volver a hacerlo público:**

1. Mover los ejemplos a un lugar que siga privado.
2. Sacarlos de TODO el historial de git: el commit `5f695e9` "Add files via upload" y cualquier rama que los contenga. Borrarlos con un commit nuevo no alcanza.

## 8. Reglas para las sesiones en la nube

- Leer este documento y el código existente antes de proponer cambios.
- Una tarea por sesión, acotada a una etapa o sub-etapa.
- Seguir las convenciones del repo (estructura, nombres, linting, tests).
- Nunca poner claves o secretos en el código. Van en variables de entorno del entorno de la nube.
- Agregar tests para la lógica crítica: validación de tokens, verificaciones del motor antes de enviar, idempotencia, detección de baja.
- Si algo de este documento choca con el código existente, señalarlo en el resumen de la rama en vez de resolverlo en silencio.
- Al terminar, dejar en el resumen qué se hizo, qué quedó pendiente y cualquier decisión que deba confirmar el usuario.
