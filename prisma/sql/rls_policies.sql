-- Row Level Security -- defensa SECUNDARIA para Xentech.
--
-- Alcance decidido con Rocco (2026-09-24, ver el chat de esa fecha): la
-- defensa PRINCIPAL sigue siendo el filtro por organizationId que hace
-- cada query de Prisma en el backend (ver los comentarios de cada
-- repository, ej. cliente.repository.ts). El backend se conecta a
-- Postgres con el rol `postgres` del pooler de Supabase, que tiene
-- BYPASSRLS -- estas policies NO lo frenan a él, a propósito: cambiar
-- eso requeriría migrar a un rol sin BYPASSRLS y reescribir cómo cada
-- request de Express abre su conexión (con SET LOCAL por transacción),
-- un cambio mucho más grande que se dejó afuera de este alcance.
--
-- Lo que ESTO sí protege: cualquier acceso a Postgres que NO pase por el
-- backend de Express -- Supabase Realtime, PostgREST llamado directo con
-- el JWT de un usuario (`anon`/`authenticated`, que Supabase da
-- SELECT/INSERT/UPDATE/DELETE por default en toda tabla nueva), o
-- cualquier código futuro que use el SDK de Supabase para pegarle
-- directo a una tabla en vez de pasar por la API. Hoy el frontend
-- (frontend/src/lib/supabase.ts) usa Supabase SOLO para auth -- nunca
-- hace `.from(...)` -- así que esto es prevención para un camino que
-- todavía no existe, no un fix de un bug activo.
--
-- No es parte del schema de Prisma (RLS/policies no son algo que
-- `prisma db push` sepa aplicar) -- se corre a mano, una vez, contra la
-- base real. Todo acá es idempotente (CREATE OR REPLACE, DROP POLICY IF
-- EXISTS + CREATE POLICY, ENABLE/FORCE que no fallan si ya estaba) --
-- correrlo de nuevo después de un cambio de schema no rompe nada.
--
-- Cómo aplicarlo: SQL Editor del dashboard de Supabase, pegar y correr
-- este archivo entero. (La descarga del motor de Prisma está bloqueada
-- por política de red tanto en el entorno cloud de Claude como en la
-- compu de Rocco -- ver CLAUDE.md -- así que esto no se puede correr
-- con un cliente de Postgres armado con Prisma desde ninguno de los
-- dos; el SQL Editor de Supabase es el camino más simple.)

-- -----------------------------------------------------------------------
-- Funciones helper (SECURITY DEFINER a propósito: necesitan leer
-- `users`/`platform_admins` SIN quedar atrapadas por el RLS que este
-- mismo archivo les va a poner a esas tablas -- si no, una función
-- STABLE normal correría con los permisos del rol que llama, que es
-- justo a quien la policy le tiene que decir que sí o que no).
-- -----------------------------------------------------------------------

create or replace function xentech_auth_organization_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select organization_id from users where id = auth.uid();
$$;

create or replace function xentech_is_platform_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (select 1 from platform_admins where id = auth.uid());
$$;

create or replace function xentech_is_org_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from users where id = auth.uid() and role = 'ADMIN'
  );
$$;

-- Mismo criterio que requireInboxAccess (src/middlewares/authorize.ts):
-- el admin de la organización siempre tiene acceso, un MEMBER solo si
-- tiene el permiso puntual.
create or replace function xentech_has_inbox_access()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from users
    where id = auth.uid() and (role = 'ADMIN' or can_handle_inbox)
  );
$$;

-- -----------------------------------------------------------------------
-- organizations -- un usuario ve/edita solo la suya; un platform admin,
-- todas (coincide con adminOrganizations.service.ts). La creación de
-- organizaciones hoy es exclusiva del platform admin (POST
-- /api/admin/organizations, requirePlatformAdmin).
-- -----------------------------------------------------------------------

alter table organizations enable row level security;
alter table organizations force row level security;

drop policy if exists organizations_select on organizations;
create policy organizations_select on organizations
  for select
  using (id = xentech_auth_organization_id() or xentech_is_platform_admin());

drop policy if exists organizations_write on organizations;
create policy organizations_write on organizations
  for all
  using (xentech_is_platform_admin())
  with check (xentech_is_platform_admin());

-- -----------------------------------------------------------------------
-- users -- un usuario ve a los demás usuarios de SU organización.
-- Escribir (alta/gestión de permisos) es cosa del admin de esa
-- organización -- mismo criterio que requireOrgAdmin/PATCH
-- /api/users/:id/permissions. SIN bypass de platform admin a propósito
-- (ver la nota en agent_configs más abajo): el panel de plataforma nunca
-- lee la lista de usuarios de un tenant, así que darle ese acceso acá
-- sería un privilegio que la propia app nunca otorga.
-- -----------------------------------------------------------------------

alter table users enable row level security;
alter table users force row level security;

drop policy if exists users_select on users;
create policy users_select on users
  for select
  using (organization_id = xentech_auth_organization_id());

drop policy if exists users_write on users;
create policy users_write on users
  for all
  using (organization_id = xentech_auth_organization_id() and xentech_is_org_admin())
  with check (organization_id = xentech_auth_organization_id() and xentech_is_org_admin());

-- -----------------------------------------------------------------------
-- clientes -- cualquier usuario de la organización (ADMIN o MEMBER, el
-- backend no distingue rol acá -- ver clientes.ts) puede leer y escribir
-- los clientes de SU organización, nada de otra.
-- -----------------------------------------------------------------------

alter table clientes enable row level security;
alter table clientes force row level security;

drop policy if exists clientes_all on clientes;
create policy clientes_all on clientes
  for all
  using (organization_id = xentech_auth_organization_id())
  with check (organization_id = xentech_auth_organization_id());

-- -----------------------------------------------------------------------
-- organization_agent_toggles -- la organización puede ver sus propios
-- toggles (para saber qué agentes tiene habilitados), pero solo un
-- platform admin los escribe -- el comentario del modelo en
-- schema.prisma ya lo dice: "Solo un PlatformAdmin puede escribir acá".
-- -----------------------------------------------------------------------

alter table organization_agent_toggles enable row level security;
alter table organization_agent_toggles force row level security;

drop policy if exists agent_toggles_select on organization_agent_toggles;
create policy agent_toggles_select on organization_agent_toggles
  for select
  using (
    organization_id = xentech_auth_organization_id()
    or xentech_is_platform_admin()
  );

drop policy if exists agent_toggles_write on organization_agent_toggles;
create policy agent_toggles_write on organization_agent_toggles
  for all
  using (xentech_is_platform_admin())
  with check (xentech_is_platform_admin());

-- -----------------------------------------------------------------------
-- agent_configs -- la organización puede leer su config; solo el admin
-- de esa organización la escribe (requireOrgAdmin en agentConfig.ts).
-- SIN bypass de platform admin: el panel de plataforma solo prende/apaga
-- el toggle del agente (organization_agent_toggles), nunca lee las
-- instrucciones/guardrails que configuró el tenant -- ese es contenido
-- del propio cliente de Xentech, no de Rocco. Mismo criterio para
-- knowledge_base_entries/conversations/messages más abajo: el platform
-- admin bypassea RLS solo en las 2 tablas que su propio panel toca de
-- verdad (organizations, organization_agent_toggles), no en el resto --
-- darle acceso de más acá sería un privilegio que la app nunca otorga.
-- -----------------------------------------------------------------------

alter table agent_configs enable row level security;
alter table agent_configs force row level security;

drop policy if exists agent_configs_select on agent_configs;
create policy agent_configs_select on agent_configs
  for select
  using (organization_id = xentech_auth_organization_id());

-- Postgres no permite combinar varios eventos en un mismo FOR (solo ALL o
-- uno solo) -- 3 policies separadas en vez de una lista.
drop policy if exists agent_configs_insert on agent_configs;
create policy agent_configs_insert on agent_configs
  for insert
  with check (organization_id = xentech_auth_organization_id() and xentech_is_org_admin());

drop policy if exists agent_configs_update on agent_configs;
create policy agent_configs_update on agent_configs
  for update
  using (organization_id = xentech_auth_organization_id() and xentech_is_org_admin())
  with check (organization_id = xentech_auth_organization_id() and xentech_is_org_admin());

drop policy if exists agent_configs_delete on agent_configs;
create policy agent_configs_delete on agent_configs
  for delete
  using (organization_id = xentech_auth_organization_id() and xentech_is_org_admin());

-- -----------------------------------------------------------------------
-- knowledge_base_entries -- mismo criterio que agent_configs: lectura
-- para la organización, escritura solo para su admin.
-- -----------------------------------------------------------------------

alter table knowledge_base_entries enable row level security;
alter table knowledge_base_entries force row level security;

drop policy if exists knowledge_base_select on knowledge_base_entries;
create policy knowledge_base_select on knowledge_base_entries
  for select
  using (organization_id = xentech_auth_organization_id());

drop policy if exists knowledge_base_insert on knowledge_base_entries;
create policy knowledge_base_insert on knowledge_base_entries
  for insert
  with check (organization_id = xentech_auth_organization_id() and xentech_is_org_admin());

drop policy if exists knowledge_base_update on knowledge_base_entries;
create policy knowledge_base_update on knowledge_base_entries
  for update
  using (organization_id = xentech_auth_organization_id() and xentech_is_org_admin())
  with check (organization_id = xentech_auth_organization_id() and xentech_is_org_admin());

drop policy if exists knowledge_base_delete on knowledge_base_entries;
create policy knowledge_base_delete on knowledge_base_entries
  for delete
  using (organization_id = xentech_auth_organization_id() and xentech_is_org_admin());

-- -----------------------------------------------------------------------
-- conversations / messages -- contienen el contenido real de las
-- conversaciones con clientes. Mismo gate que requireInboxAccess: solo
-- lectura, y solo para quien tiene acceso al inbox de esa organización.
-- Sin policies de escritura a propósito: hoy TODA escritura pasa por el
-- backend (el orquestador, el poller, las rutas de /api/conversations
-- con sus efectos secundarios -- responder también manda el mensaje
-- real) -- no hay ningún caso de uso de escribir estas tablas directo
-- desde un cliente, y replicar esa lógica en SQL sería reinventar el
-- service layer. Sin policy de INSERT/UPDATE/DELETE = denegado por
-- default para anon/authenticated (el backend sigue pudiendo porque usa
-- el rol que bypassea RLS).
-- -----------------------------------------------------------------------

alter table conversations enable row level security;
alter table conversations force row level security;

drop policy if exists conversations_select on conversations;
create policy conversations_select on conversations
  for select
  using (organization_id = xentech_auth_organization_id() and xentech_has_inbox_access());

alter table messages enable row level security;
alter table messages force row level security;

drop policy if exists messages_select on messages;
create policy messages_select on messages
  for select
  using (organization_id = xentech_auth_organization_id() and xentech_has_inbox_access());

-- -----------------------------------------------------------------------
-- whatsapp_connections -- tiene el token de acceso (encriptado, pero
-- igual nunca debe salir por ningún canal que no sea el backend mismo,
-- mismo criterio que "el token nunca sale de acá" en
-- whatsappConnection.service.ts). RLS habilitado, CERO policies: acceso
-- denegado por default para cualquier rol que no bypassee RLS. Además,
-- REVOKE explícito de los grants por default de Supabase (anon/
-- authenticated tienen SELECT/INSERT/UPDATE/DELETE en toda tabla nueva a
-- menos que se revoque) -- belt-and-suspenders: aunque alguien deshabilite
-- RLS por error más adelante, esto solo no alcanza para exponer la tabla.
-- -----------------------------------------------------------------------

alter table whatsapp_connections enable row level security;
alter table whatsapp_connections force row level security;
revoke all on whatsapp_connections from anon, authenticated;

-- -----------------------------------------------------------------------
-- agent_inbound_jobs -- cola interna de procesamiento (mensajes
-- entrantes sin encolar todavía). No es algo que ningún cliente necesite
-- leer o escribir nunca -- mismo criterio que whatsapp_connections.
-- -----------------------------------------------------------------------

alter table agent_inbound_jobs enable row level security;
alter table agent_inbound_jobs force row level security;
revoke all on agent_inbound_jobs from anon, authenticated;

-- -----------------------------------------------------------------------
-- platform_admins -- ningún tenant necesita ver ni tocar esta tabla
-- nunca. Mismo criterio: RLS + revoke, deny-all para anon/authenticated.
-- -----------------------------------------------------------------------

alter table platform_admins enable row level security;
alter table platform_admins force row level security;
revoke all on platform_admins from anon, authenticated;
