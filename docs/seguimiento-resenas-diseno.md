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

---

## 3. Stack

- Backend: Node + TypeScript, Prisma, Postgres (Supabase).
- Frontend: Next.js (página pública de reseñas + panel interno).
- Tareas programadas: pg_cron de Supabase o worker con node-cron, corriendo cada pocos minutos.
- IA: API de Claude con salida estructurada (JSON con esquema fijo, vía tool use).
- WhatsApp: WhatsApp Cloud API (no la app común de WhatsApp Business). Evaluar "coexistencia" para usar el mismo número en app y API.
- Email: proveedor con envío y recepción de respuestas (Resend, SendGrid o similar).

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
  - opciones: "Publicar como {Nombre}" / "Publicar como anónimo";
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

## 8. Reglas para las sesiones en la nube

- Leer este documento y el código existente antes de proponer cambios.
- Una tarea por sesión, acotada a una etapa o sub-etapa.
- Seguir las convenciones del repo (estructura, nombres, linting, tests).
- Nunca poner claves o secretos en el código. Van en variables de entorno del entorno de la nube.
- Agregar tests para la lógica crítica: validación de tokens, verificaciones del motor antes de enviar, idempotencia, detección de baja.
- Si algo de este documento choca con el código existente, señalarlo en el resumen de la rama en vez de resolverlo en silencio.
- Al terminar, dejar en el resumen qué se hizo, qué quedó pendiente y cualquier decisión que deba confirmar el usuario.
