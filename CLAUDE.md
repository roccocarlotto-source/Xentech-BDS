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
  clientes (con cálculo de cuota/atraso), estadística tipo dona. Hay
  un proyecto real de Supabase provisionado y schema aplicado. Falta:
  Fase 3 (importación Excel/TXT/PDF).
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
