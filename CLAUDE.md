# CLAUDE.md

## Project Identity

- **Project:** Xentech
- **Description:** SaaS multi-tenant para gestionar una base de datos
  interactiva de clientes (contacto + estado de cuota), con agentes de
  IA opcionales habilitables por organización por el admin de
  plataforma.

---

## Project Context

> Editar esta sección a medida que avanza el proyecto.

- **Stack:** Backend — Node.js + Express + TypeScript, Prisma ORM,
  PostgreSQL (Supabase), autenticación Supabase Auth (JWT vía JWKS).
  Frontend (`frontend/`) — Vite + React + TypeScript, react-router-dom,
  @tanstack/react-query, @supabase/supabase-js. Mismo stack y
  convenciones que `PlataformaCRM`/`plataforma-crm-frontend`, de los
  que se reutilizan patrones de multi-tenancy y autenticación (no el
  código: repo nuevo, proyectos de frontend/backend independientes).
- **Status / Phase:** Fases 0-3 completas: fundamentos, CRUD de
  clientes (con cálculo de cuota/atraso), estadística tipo dona,
  importación de clientes desde Excel (.xlsx), TXT/CSV (autodetección
  de delimitador) y PDF (tabla con bordes/grilla, vía `pdf-parse`) —
  los tres formatos comparten el mismo flujo de preview + mapeo de
  columnas + revisión en `/clientes/importar`. El backend de
  `/api/clientes` siempre tuvo el CRUD completo (`POST`/`PATCH`/`DELETE`),
  pero hasta ahora la pantalla `/` (`ClientesPage`) era de solo lectura
  -- se agregó `ClienteForm` (mismos campos que la importación,
  `cuotaPeriodicidad` se fija sola en "MENSUAL" al cargar una fecha de
  pago porque es la única que existe) para alta/edición manual, y
  botones de editar/eliminar (con confirmación) en `ClientesTable` --
  gap real que Rocco notó navegando la web (2026-09-24), no estaba
  documentado como pendiente hasta ese momento. Fase 4 (estructura del
  panel de admin de plataforma) lista: `/admin/organizations` permite
  habilitar/deshabilitar por
  organización los tres tipos de agente (WhatsApp, gestión de base de
  datos, recordatorios) — todavía sin lógica funcional de ningún
  agente. Verificado de punta a punta contra Supabase Auth + Postgres
  reales (no mocks) vía el workflow manual `e2e-smoke.yml` — ver
  `scripts/e2e-smoke.ts`. Fase 5 (lógica real de los agentes),
  agente por agente, empezando por WhatsApp: diseño completo en
  `docs/ai-agent-architecture.md` (precedente: el módulo de agentes
  ya construido en `PlataformaCRM`), con las 3 decisiones de Rocco
  (2026-09-19: Meta Cloud API directo, config de KB/reglas la hace el
  propio cliente, v1 = consulta + acciones controladas). Implementación,
  paso a paso según el plan del doc (§11): paso 1 (schema — PR #17) y
  paso 2 (backend del loop de orquestación — PR #19) completos:
  `LlmProvider` y `OpenRouterProvider`, catálogo de 5 tools v1, gate de
  permisos (`puedeEjecutarTool`), loop de orquestación con corte
  determinístico a las `MAX_TOOL_ROUNDS_PER_TURN` rondas, endpoint de
  prueba (`POST /api/agent-config/:agentType/test-message`) y CRUD de
  `AgentConfig`/`KnowledgeBaseEntry` (con `requireOrgAdmin`, nuevo
  middleware — configura el propio admin de la organización, no el
  admin de plataforma). Paso 3 (pantalla de configuración del tenant en
  `frontend/` — PR #22) también completo: ruta `/agente-whatsapp`
  (gate `RequireOrgAdmin`, espejo del middleware del backend) con
  instructions/modelo/tools/guardrails, CRUD de la base de
  conocimiento, y un panel de prueba contra el endpoint interno.
  Paso 4 (mecanismo de derivación a humano e inbox de conversaciones —
  PR #24 backend, PR #25 frontend) también completo, con dos
  decisiones de Rocco (2026-09-19, vía AskUserQuestion): se construyó
  el inbox ANTES que la conexión real de WhatsApp (paso 5) — las
  respuestas de una persona quedan guardadas pero pendientes de
  enviar hasta que esa conexión exista —, y el acceso es un permiso
  puntual por usuario (`User.canHandleInbox`, otorgado por el admin
  vía `/usuarios`), no un rol nuevo; el admin de la organización
  siempre tiene acceso. Rutas `/api/conversations` (lista con filtro
  `?status=`, detalle, responder, cerrar/devolver al agente) y
  `/api/users` (gestión del permiso), gate `requireInboxAccess`.
  Frontend: `/inbox` y `/usuarios`. Paso 6 (normalización de números
  de teléfono — PR #27) también completo: `normalizarTelefono()` en
  `src/utils/telefono.ts` (vía `libphonenumber-js`, a E.164, default
  UY configurable) usada por `clienteRepository.findByTelefono`
  (compara en memoria, dato existente sin backfill) y por
  `create`/`update` (alta manual, importación y la tool
  `actualizar_mi_telefono` guardan el dato ya normalizado). Paso 5
  (conexión real de WhatsApp — PRs #30/#31/#32) con todo el código
  armado y testeado, pero SIN probar de punta a punta todavía —
  falta el trámite de Meta Business (Embedded Signup) para tener
  credenciales reales, que depende de Rocco. Lo que ya existe:
  encriptación del token (`src/lib/whatsapp/tokenCrypto.ts`, AES-256-GCM,
  requiere `WHATSAPP_TOKEN_ENCRYPTION_KEY`), verificación de firma y
  handshake del webhook (`webhookVerification.ts`), cliente de envío
  por Graph API (`graphApiClient.ts`), extracción de mensajes del
  payload de Meta (`webhookPayload.ts`), la cola de procesamiento —
  tabla + poller simple, `AgentInboundJob` en el schema, arrancado
  desde `server.ts` cada 5s — y la ruta real
  `POST/GET /api/webhooks/whatsapp` (sin `authenticate`, la identidad
  la da la firma/verify_token de Meta). El envío real de la respuesta
  pasa en el poller (`inboundJobProcessor.ts`), no en el handler del
  webhook. Decisión propia (documentada como tal, reemplazable sin
  tocar el resto): AES-256-GCM para el token y tabla+poller para la
  cola, ambas eran "decisiones abiertas" del doc de arquitectura.
  Otro gap real que había quedado sin documentar hasta que Rocco lo
  notó navegando la web (2026-09-24): el modelo `WhatsAppConnection`
  y el webhook que lo LEE existían, pero no había ninguna forma -- ni
  de API ni de UI -- de escribirlo. Se agregó `PUT/GET/DELETE
/api/whatsapp-connection` (`requireOrgAdmin`) y una tarjeta de
  conexión en `/agente-whatsapp` (`WhatsAppConnectionCard`). Decisión
  propia documentada en `services/whatsappConnection.service.ts`:
  carga MANUAL de los 3 valores (`phoneNumberId`, `wabaId`, token) en
  vez de automatizar el flujo OAuth completo (Embedded Signup) de
  Meta -- automatizarlo requiere una Meta App ya configurada, que
  depende del mismo trámite de Meta Business que sigue pendiente de
  Rocco. El status pasa a `CONNECTED` apenas se guarda (para cuando
  el admin tiene esos 3 valores en la mano, Meta ya confirmó el
  número de su lado). De paso, el webhook ahora también chequea
  `status === "CONNECTED"` antes de encolar un mensaje entrante (antes
  solo se chequeaba al momento de responder, en el poller).
- **RLS (Row Level Security):** `prisma/sql/rls_policies.sql` -- defensa
  SECUNDARIA, no reemplaza el filtro por organizationId de cada query de
  Prisma (esa sigue siendo la principal). Alcance acordado con Rocco
  (2026-09-24): protege contra cualquier acceso a Postgres que NO pase
  por el backend de Express (Supabase Realtime, un cliente pegándole
  directo a una tabla con el JWT de un usuario) -- NO protege contra el
  propio backend, que se conecta con el rol `postgres` del pooler de
  Supabase (tiene `BYPASSRLS`); hacer que también lo frene a él requeriría
  migrar a un rol sin ese bypass y reescribir cada request para abrir su
  conexión con `SET LOCAL`, alcance explícitamente dejado afuera por ser
  mucho más grande/invasivo. Hoy el frontend usa Supabase solo para auth
  (nunca `.from(...)` directo), así que esto es prevención, no el fix de
  un bug activo. Probado de punta a punta contra un Postgres 16 local
  (schema real vía `prisma db push` + un stub de `auth.uid()` + los
  grants por default de Supabase a `anon`/`authenticated`): aislamiento
  entre tenants, bloqueo de escritura cruzada, gate de solo-admin en
  `agent_configs`/`knowledge_base_entries`, deny-all en
  `whatsapp_connections`/`agent_inbound_jobs`/`platform_admins`, y que el
  platform admin bypassea RLS SOLO en `organizations` y
  `organization_agent_toggles` (las 2 tablas que su propio panel toca) --
  no en el resto, a propósito: la primera versión le daba bypass en todas
  las tablas de tenant "por las dudas", y el propio test lo agarró (un
  privilegio que la app nunca otorga). No es parte del schema de Prisma
  (`prisma db push` no sabe de policies) -- **falta que Rocco lo corra a
  mano, una vez, en el SQL Editor del dashboard de Supabase** (mismo
  motivo que bloquea correr un cliente de Postgres armado con Prisma
  desde acá: la descarga del motor está bloqueada por política de red).
- **Key context:** el brief completo de producto (MVP, modelo de
  datos, roadmap) vive en el doc de Cowork enlazado desde
  `docs/estado-actual.md` — leerlo ahí antes de asumir alcance.

---

## Política de merge

A diferencia de `PlataformaCRM` (que prohíbe el auto-merge por decisión
de proceso), **en Xentech el auto-merge está permitido y es la regla
por defecto**: Rocco confirmó esto explícitamente el 2026-09-19, ya
sabiendo que el CRM usa el criterio contrario — es una decisión
deliberada para este repo, no un descuido.

- Se mergea automáticamente (`gh pr merge --squash` o equivalente)
  cuando el PR pasa CI (typecheck, lint, format, tests) sin errores.
- Si el CI falla, no se mergea: se reporta el estado y ahí termina la
  tarea (o se corrige, si la tarea lo permite).
- Cambios de alto riesgo (migraciones destructivas, borrado de datos,
  cambios de seguridad/permisos) siguen pidiendo confirmación explícita
  de Rocco antes de mergear, aunque el CI esté verde — el auto-merge
  cubre el trabajo de rutina, no todo sin excepción.

## GitHub CLI (`gh`)

Mismo criterio que `PlataformaCRM`: PRs con `gh pr create --body-file`
(nunca `--body` inline), estado de CI con `gh pr checks` / `gh run
watch` en vez de pedir capturas.

## Acceso a la API de GitHub desde Cowork (importante)

Descubierto el 2026-09-19 en un contenedor cloud nuevo (el anterior se
había reciclado — normal, pasa cada tanto): `git` (fetch/push por HTTPS
con el PAT embebido en la URL del remote) funciona bien desde el Bash
del contenedor cloud, pero cualquier request a `api.github.com` desde
ahí devuelve 403 ("GitHub access to this repository is not enabled for
this session. Use add_repo..." — esa herramienta `add_repo` es de
Claude Code/GitHub Actions, no está expuesta en Cowork). Esto bloquea
`gh` y cualquier uso directo de la API (crear/mergear PRs,
workflow_dispatch, secrets, issues) desde el contenedor cloud. `gh` ni
siquiera está instalado ahí, y `cli.github.com` también está
bloqueado, así que instalarlo no sirve.

Workaround que funciona: la compu de Rocco (linked device, herramientas
`device_bash`/`device_stage_files`/`device_commit_files`) sí tiene
salida normal a `api.github.com`. Flujo:

1. Codear y commitear en el contenedor cloud, como siempre.
2. `git bundle create` de la rama → `SendUserFile` → `device_commit_files`
   a `Proyectos/` en la compu de Rocco (el clone que vive ahí,
   `Proyectos/xentech`, ya tiene un remote con el mismo PAT).
3. En `device_bash`: `git fetch <ruta del bundle> <rama>:<rama>`,
   después `git push origin <rama>`.
4. PRs, estado de CI y merge: `curl` con el PAT contra `api.github.com`
   desde `device_bash` (no `gh`, no está instalado ahí) — `curl -o
archivo.json ...` y despues `node -e "const d=require('archivo.json'); ..."`
   para parsear la respuesta, más simple que pelearse con JSON en bash.

Si una sesión futura ve el mismo 403 al pegarle a `api.github.com`
desde el contenedor cloud, no vale la pena reinstalar `gh` ni
reintentar ahí — ir directo a este flujo con `device_bash`.

## Si `prisma:generate`/`typecheck` falla en Actions: leer el log primero

Aprendido el 2026-09-19 (PR #17), de la forma difícil: varios reruns
seguidos del MISMO commit dieron resultados distintos (pasó una vez,
falló varias otras, a veces en `prisma:generate`, a veces recién en
`typecheck`), lo que llevó a asumir que era `binaries.prisma.sh`
(descarga del motor de Prisma) flaqueando de forma intermitente en
los runners de Actions — un problema ya conocido de red, no de
código. Esa fue una conclusión prematura: cuando finalmente se
capturó el log completo (agregando temporalmente un paso `if:
failure()` que abre un issue con el output, como ya hacen
`db-migrate.yml`/`e2e-smoke.yml`), el error real era `P1012`, un
schema inválido — `Conversation.organization` sin el campo de
relación opuesto en `Organization` (`prisma validate`/`generate` lo
exige siempre, de forma determinística, no es un chequeo de red).
Los reintentos "pasando" antes probablemente fueron por otra causa
(cache de npm, engine parcialmente cacheado) que enmascaró el error
real la mayoría de las veces.

**Moraleja: ante un fallo de `prisma:generate`/`typecheck` en CI, leer
el log del paso ANTES de asumir flakiness de red y agregar
reintentos.** `ci.yml` igual quedó con un reintento (3 intentos,
regenerando el cliente entero en cada vuelta — `rm -rf
node_modules/.prisma && prisma generate && typecheck` — no solo
`prisma generate` solo, porque un cliente corrupto no se arregla
reintentando solo el typecheck) por si la flakiness de red real
aparece en el futuro, y `db-migrate.yml`/`e2e-smoke.yml` reintentan
`prisma generate` con el mismo mecanismo simple. Pero el primer paso
siempre es mirar el error real, no reintentar a ciegas.
