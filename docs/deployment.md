# Despliegue

**Relevado el 2026-09-23** revisando el repo (config, workflows, `.env.example`)
y el historial de sesiones del brief del proyecto. Todo lo que dice "no hay"
o "no sé" está así a propósito: no se suponga nada que no esté acá.

## Resumen

**Xentech hoy no está desplegado en ningún lado.** Backend y frontend solo
corren en local (la compu de Rocco) o en el entorno cloud de desarrollo de
las sesiones de Claude. No hay hosting, URL pública, dominio ni pipeline de
despliegue configurados. Lo único "de producción" que existe es el proyecto
de Supabase (base de datos + Auth).

## Estado punto por punto

| #   | Tema                                                                    | Estado confirmado                                                                                                                                                                                                                                                                                                                                           |
| --- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Backend (Express)                                                       | **No está desplegado.** No hay config de Render, Railway, Fly.io, Docker ni Procfile en el repo. Sin URL pública.                                                                                                                                                                                                                                           |
| 2   | Frontend (Vite, `frontend/`)                                            | **No está publicado.** No hay `vercel.json`, `netlify.toml` ni equivalente. Sin URL pública. `VITE_API_URL` apunta a `http://localhost:3000` por defecto.                                                                                                                                                                                                   |
| 3   | Dominio propio                                                          | **No hay dominio confirmado.** `app.xentech.com` aparece solo como ejemplo en comentarios (`.env.example`, `src/lib/corsOrigins.ts`) y en tests; no es un dominio registrado conocido. Quién manejaría el DNS y en qué proveedor: **no sé**.                                                                                                                |
| 4   | Dominios personalizados de clientes (ej. `resenas.empresa-cliente.com`) | **No aplica todavía**: no hay servicio de frontend elegido. Depende del proveedor que se elija (ver "Decisiones pendientes").                                                                                                                                                                                                                               |
| 5   | Supabase prod vs. dev                                                   | **Hay un solo proyecto de Supabase.** Se usa a la vez como base "real" (ya tiene datos y usuarios reales) y como la base contra la que corre el entorno local de desarrollo. No hay un proyecto separado de desarrollo/pruebas.                                                                                                                             |
| 6   | Variables de entorno de "producción"                                    | No hay entorno de producción del app. Hoy existen en dos lugares: (a) **secretos del repo en GitHub Actions** (`DATABASE_URL`, `DIRECT_URL`, `SUPABASE_URL`, `SUPABASE_JWKS_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`), usados solo por `db-migrate.yml` y `e2e-smoke.yml`; (b) el `.env` local (gitignored) en el clone de la compu de Rocco. |
| 7   | Cómo se publica un cambio                                               | **No hay despliegue.** Mergear a `main` solo corre CI (`ci.yml`: typecheck, lint, format, tests, build). Los cambios de schema a la base se aplican a mano con el workflow `db-migrate.yml` (`workflow_dispatch`, `prisma db push`); mergear **no** migra la base.                                                                                          |

## Workflows de GitHub Actions existentes

- `ci.yml` — en push/PR a `main`. Verifica backend y frontend. No despliega.
- `db-migrate.yml` — manual. `prisma db push` contra la base de Supabase.
- `e2e-smoke.yml` — manual. Smoke test de punta a punta contra Supabase.

## Decisiones pendientes (de Rocco)

Antes de cualquier cosa que necesite una URL pública (webhook de WhatsApp de
Meta, links públicos de reseñas/presupuestos) hay que decidir:

1. **Hosting del backend** (Express, proceso de larga vida: el poller de
   `AgentInboundJob` necesita un proceso siempre corriendo, no serverless puro).
2. **Hosting del frontend** — y, si van a existir subdominios de clientes
   tipo `resenas.empresa-cliente.com`, que ese proveedor soporte dominios
   personalizados por cliente con SSL automático.
3. **Dominio propio de Xentech** y dónde vive su DNS.
4. **Separar Supabase de desarrollo y de producción** (hoy es uno solo).
5. **Dónde se cargan las env vars de producción** (panel del proveedor elegido).
6. **Despliegue automático al mergear a `main` o manual.**

Cuando se tome cada decisión, actualizar la tabla de arriba (sin valores
secretos: solo proveedor, URL pública y lugar donde vive cada cosa).
