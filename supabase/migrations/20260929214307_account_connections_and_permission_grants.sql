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

grant select on public.account_app_permissions to authenticated;
grant select on public.account_app_connections to authenticated;
grant select on public.account_app_grants to authenticated;

grant all on public.account_app_permissions to service_role;
grant all on public.account_app_connections to service_role;
grant all on public.account_app_grants to service_role;

drop policy if exists account_app_permissions_select_authenticated on public.account_app_permissions;
create policy account_app_permissions_select_authenticated
  on public.account_app_permissions
  for select to authenticated
  using (active = true);

drop policy if exists account_app_connections_select_own on public.account_app_connections;
create policy account_app_connections_select_own
  on public.account_app_connections
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists account_app_grants_select_own on public.account_app_grants;
create policy account_app_grants_select_own
  on public.account_app_grants
  for select to authenticated
  using ((select auth.uid()) = user_id);

insert into public.account_app_permissions
  (app_slug, permission_id, name, description, required, mutable_by_user, sensitivity, sort_order)
select a.slug, p.permission_id, p.name, p.description, p.required, p.mutable_by_user, p.sensitivity, p.sort_order
from public.account_apps a
cross join lateral (
  values
    ('identity.basic','Basic account identity','Use your stable Account ID and basic profile identity.',true,false,'basic',10),
    ('app_data.read','Read app cloud data','Read this app''s own cloud-data namespace.',true,false,'basic',20),
    ('app_data.write','Update app cloud data','Create and update this app''s own cloud-data namespace.',true,false,'basic',30)
) as p(permission_id,name,description,required,mutable_by_user,sensitivity,sort_order)
where a.slug in ('notes','diet','wordstrike','wttn','tms60')
on conflict (app_slug, permission_id) do update set
  name=excluded.name,
  description=excluded.description,
  required=excluded.required,
  mutable_by_user=excluded.mutable_by_user,
  sensitivity=excluded.sensitivity,
  sort_order=excluded.sort_order,
  active=true,
  updated_at=now();

insert into public.account_app_permissions
  (app_slug, permission_id, name, description, required, mutable_by_user, sensitivity, sort_order)
values
  ('tms60','backup.include','Backup inclusion','Allow TMS60 cloud data to be included in THIEPN Account backup snapshots.',false,true,'sensitive',100)
on conflict (app_slug, permission_id) do update set
  name=excluded.name,
  description=excluded.description,
  required=excluded.required,
  mutable_by_user=excluded.mutable_by_user,
  sensitivity=excluded.sensitivity,
  sort_order=excluded.sort_order,
  active=true,
  updated_at=now();

insert into public.account_app_connections
  (user_id, app_slug, status, source, connected_at, last_used_at)
select
  ua.user_id,
  ua.app_slug,
  'connected',
  'migration',
  ua.first_used_at,
  ua.last_used_at
from public.account_user_apps ua
join public.account_apps a on a.slug=ua.app_slug and a.active=true
on conflict (user_id, app_slug) do update set
  last_used_at=greatest(public.account_app_connections.last_used_at, excluded.last_used_at),
  updated_at=now();

insert into public.account_app_grants
  (user_id, app_slug, permission_id, status, granted_at)
select
  c.user_id,
  c.app_slug,
  p.permission_id,
  case when p.required then 'granted' else 'denied' end,
  case when p.required then c.connected_at else null end
from public.account_app_connections c
join public.account_app_permissions p
  on p.app_slug=c.app_slug and p.active=true
on conflict (user_id, app_slug, permission_id) do nothing;

create or replace function public.connect_thiepn_app(p_app_slug text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode='42501';
  end if;

  if not exists (
    select 1
    from public.account_apps a
    join public.account_app_manifests m on m.app_slug=a.slug
    where a.slug=p_app_slug and a.active=true
  ) then
    raise exception 'app_unavailable' using errcode='22023';
  end if;

  insert into public.account_app_connections
    (user_id, app_slug, status, source, connected_at, disconnected_at, updated_at)
  values
    (v_uid, p_app_slug, 'connected', 'account', now(), null, now())
  on conflict (user_id, app_slug) do update set
    status='connected',
    disconnected_at=null,
    updated_at=now();

  insert into public.account_app_grants
    (user_id, app_slug, permission_id, status, granted_at, updated_at)
  select
    v_uid,
    p.app_slug,
    p.permission_id,
    case when p.required then 'granted' else 'denied' end,
    case when p.required then now() else null end,
    now()
  from public.account_app_permissions p
  where p.app_slug=p_app_slug and p.active=true
  on conflict (user_id, app_slug, permission_id) do update set
    status=case
      when excluded.permission_id in (
        select p2.permission_id
        from public.account_app_permissions p2
        where p2.app_slug=p_app_slug and p2.required=true
      ) then 'granted'
      else public.account_app_grants.status
    end,
    granted_at=case
      when excluded.permission_id in (
        select p3.permission_id
        from public.account_app_permissions p3
        where p3.app_slug=p_app_slug and p3.required=true
      ) then coalesce(public.account_app_grants.granted_at, now())
      else public.account_app_grants.granted_at
    end,
    updated_at=now();

  return jsonb_build_object('app_slug',p_app_slug,'status','connected');
end;
$$;

create or replace function public.set_thiepn_app_permission(
  p_app_slug text,
  p_permission_id text,
  p_granted boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_permission public.account_app_permissions%rowtype;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode='42501';
  end if;

  if not exists (
    select 1 from public.account_app_connections c
    where c.user_id=v_uid
      and c.app_slug=p_app_slug
      and c.status in ('connected','limited')
  ) then
    raise exception 'connection_not_active' using errcode='22023';
  end if;

  select * into v_permission
  from public.account_app_permissions p
  where p.app_slug=p_app_slug
    and p.permission_id=p_permission_id
    and p.active=true;

  if not found then
    raise exception 'permission_not_found' using errcode='22023';
  end if;

  if v_permission.required or not v_permission.mutable_by_user then
    raise exception 'permission_not_mutable' using errcode='22023';
  end if;

  insert into public.account_app_grants
    (user_id, app_slug, permission_id, status, granted_at, updated_at)
  values
    (v_uid, p_app_slug, p_permission_id,
     case when p_granted then 'granted' else 'denied' end,
     case when p_granted then now() else null end,
     now())
  on conflict (user_id, app_slug, permission_id) do update set
    status=excluded.status,
    granted_at=excluded.granted_at,
    updated_at=now();

  return jsonb_build_object(
    'app_slug',p_app_slug,
    'permission_id',p_permission_id,
    'status',case when p_granted then 'granted' else 'denied' end
  );
end;
$$;

create or replace function public.disconnect_thiepn_app(p_app_slug text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode='42501';
  end if;

  update public.account_app_connections
  set status='disconnected',
      disconnected_at=now(),
      updated_at=now()
  where user_id=v_uid
    and app_slug=p_app_slug
    and status <> 'disconnected';

  if not found then
    return jsonb_build_object('app_slug',p_app_slug,'status','disconnected','changed',false);
  end if;

  update public.account_app_grants
  set status='denied',
      granted_at=null,
      updated_at=now()
  where user_id=v_uid
    and app_slug=p_app_slug;

  return jsonb_build_object('app_slug',p_app_slug,'status','disconnected','changed',true);
end;
$$;

revoke all on function public.connect_thiepn_app(text) from public, anon;
revoke all on function public.set_thiepn_app_permission(text,text,boolean) from public, anon;
revoke all on function public.disconnect_thiepn_app(text) from public, anon;

grant execute on function public.connect_thiepn_app(text) to authenticated;
grant execute on function public.set_thiepn_app_permission(text,text,boolean) to authenticated;
grant execute on function public.disconnect_thiepn_app(text) to authenticated;

comment on table public.account_app_connections is
  'THIEPN Account user-to-app control-plane connection state. This table alone does not authorize app data access.';
comment on table public.account_app_grants is
  'User-visible Account permission grants. Enforcement by application/Core data paths is a separate trusted-boundary requirement.';
comment on function public.connect_thiepn_app(text) is
  'Creates or reconnects Account control-plane metadata for auth.uid(). Does not establish trusted application identity.';
