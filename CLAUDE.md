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
- **Status / Phase:** Fases 0-2 completas: fundamentos, CRUD de
  clientes (con cálculo de cuota/atraso), estadística tipo dona. Fase 3
  (importación) parcial: Excel listo (`/clientes/importar`, preview +
  mapeo de columnas + revisión), TXT y PDF todavía no. Hay un proyecto
  real de Supabase provisionado y schema aplicado, pero falta un
  usuario de prueba (Auth) y el anon key del proyecto para poder
  verificar el frontend/CRUD de punta a punta contra datos reales —
  ver "Próximo paso" en el doc de estado.
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
