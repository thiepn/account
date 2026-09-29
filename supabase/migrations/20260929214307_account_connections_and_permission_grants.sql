alter table public.account_app_manifests
  add column if not exists core_app_id text null
  check (core_app_id is null or core_app_id ~ '^[a-z0-9-]+$');

create unique index if not exists account_app_manifests_core_app_id_uidx
  on public.account_app_manifests(core_app_id)
  where core_app_id is not null;

update public.account_app_manifests
set core_app_id = case app_slug
  when 'diet' then 'diet'
  when 'tms60' then 'tms60'
  else core_app_id
end
where app_slug in ('diet','tms60');

create table if not exists public.account_app_permissions (
  app_slug text not null references public.account_apps(slug) on delete cascade,
  permission_id text not null check (permission_id ~ '^[a-z0-9._-]+$'),
  name text not null,
  description text not null,
  required boolean not null default false,
  mutable_by_user boolean not null default true,
  sensitivity text not null default 'basic' check (sensitivity in ('basic','sensitive')),
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (app_slug, permission_id),
  check (not required or not mutable_by_user)
);

create table if not exists public.account_app_connections (
  user_id uuid not null references auth.users(id) on delete cascade,
  app_slug text not null references public.account_apps(slug) on delete cascade,
  status text not null default 'connected'
    check (status in ('connected','limited','disconnected','suspended','error')),
  source text not null default 'account'
    check (source in ('usage','account','migration')),
  connected_at timestamptz not null default now(),
  last_used_at timestamptz null,
  disconnected_at timestamptz null,
  updated_at timestamptz not null default now(),
  primary key (user_id, app_slug)
);

create table if not exists public.account_app_grants (
  user_id uuid not null,
  app_slug text not null,
  permission_id text not null,
  status text not null default 'denied' check (status in ('granted','denied')),
  granted_at timestamptz null,
  updated_at timestamptz not null default now(),
  primary key (user_id, app_slug, permission_id),
  foreign key (user_id, app_slug)
    references public.account_app_connections(user_id, app_slug)
    on delete cascade,
  foreign key (app_slug, permission_id)
    references public.account_app_permissions(app_slug, permission_id)
    on delete cascade
);

alter table public.account_app_permissions enable row level security;
alter table public.account_app_connections enable row level security;
alter table public.account_app_grants enable row level security;

revoke all on public.account_app_permissions from anon, authenticated;
revoke all on public.account_app_connections from anon, authenticated;
revoke all on public.account_app_grants from anon, authenticated;
grant select on public.account_app_permissions, public.account_app_connections, public.account_app_grants to authenticated;
grant all on public.account_app_permissions, public.account_app_connections, public.account_app_grants to service_role;

drop policy if exists account_app_permissions_select_authenticated on public.account_app_permissions;
create policy account_app_permissions_select_authenticated on public.account_app_permissions
for select to authenticated using (active = true);

drop policy if exists account_app_connections_select_own on public.account_app_connections;
create policy account_app_connections_select_own on public.account_app_connections
for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists account_app_grants_select_own on public.account_app_grants;
create policy account_app_grants_select_own on public.account_app_grants
for select to authenticated using ((select auth.uid()) = user_id);

-- Permission seed, connection backfill, and the three owner-scoped RPCs
-- are defined in the applied production migration of the same version.
-- Keep the production migration as the source of truth for exact SQL.
