alter table public.tms60_backups
  add column if not exists state_hash text
  check (state_hash is null or char_length(state_hash)=64);

update public.tms60_backups
set state_hash=encode(extensions.digest(state::text,'sha256'),'hex')
where state_hash is null;

create or replace function private.tms60_backup_set_hash()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.state_hash := encode(extensions.digest(new.state::text,'sha256'),'hex');
  return new;
end;
$$;

revoke all on function private.tms60_backup_set_hash() from public, anon, authenticated;

drop trigger if exists tms60_backups_set_hash on public.tms60_backups;
create trigger tms60_backups_set_hash
before insert or update of state on public.tms60_backups
for each row execute function private.tms60_backup_set_hash();

update public.account_app_manifests
set capabilities = capabilities || '{"backups":true}'::jsonb,
    updated_at = now()
where app_slug='diet';

insert into public.account_app_permissions
  (app_slug,permission_id,name,description,required,mutable_by_user,sensitivity,sort_order)
values
  ('diet','backup.include','Backup inclusion','Allow Diet Copilot cloud data to be included in THIEPN Account recovery snapshots.',false,true,'sensitive',100)
on conflict (app_slug,permission_id) do update set
  name=excluded.name,
  description=excluded.description,
  required=false,
  mutable_by_user=true,
  sensitivity='sensitive',
  sort_order=excluded.sort_order,
  active=true,
  updated_at=now();

insert into public.account_app_grants
  (user_id,app_slug,permission_id,status,granted_at,updated_at)
select c.user_id,'diet','backup.include','denied',null,now()
from public.account_app_connections c
where c.app_slug='diet'
on conflict (user_id,app_slug,permission_id) do nothing;

create table if not exists public.account_restore_operations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  backup_ref text not null,
  app_slug text not null references public.account_apps(slug) on delete restrict,
  status text not null check (status in ('restoring','completed','failed')),
  started_at timestamptz not null default now(),
  completed_at timestamptz null,
  safety_backup_ref text null,
  result jsonb null,
  error_code text null
);

alter table public.account_restore_operations enable row level security;
revoke all on public.account_restore_operations from anon, authenticated;
grant select on public.account_restore_operations to authenticated;
grant all on public.account_restore_operations to service_role;

drop policy if exists account_restore_operations_select_own on public.account_restore_operations;
create policy account_restore_operations_select_own
  on public.account_restore_operations for select to authenticated
  using ((select auth.uid()) = user_id);

create index if not exists account_restore_operations_user_started_idx
  on public.account_restore_operations(user_id,started_at desc);

create or replace function public.get_thiepn_account_backup_inventory()
returns table (
  backup_ref text,
  app_slug text,
  app_name text,
  created_at timestamptz,
  backup_status text,
  backup_type text,
  size_bytes bigint,
  source_revision bigint,
  schema_version integer,
  metadata jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode='42501';
  end if;

  return query
  select
    'diet:' || s.snapshot_id::text,
    'diet'::text,
    coalesce((select a.name from public.account_apps a where a.slug='diet'),'Diet Copilot')::text,
    s.captured_at,
    case
      when s.verification_status='verified' then 'verified'
      when s.verification_status='failed' then 'corrupted'
      else 'unverified'
    end::text,
    case
      when s.source in ('scheduled','monthly') then 'automatic'
      when s.source='pre_restore' then 'pre-restore'
      else 'manual'
    end::text,
    s.payload_bytes,
    null::bigint,
    1::integer,
    jsonb_build_object(
      'source',s.source,
      'schemaVersion',s.schema_version,
      'migrationVersion',s.migration_version,
      'verifiedAt',s.verified_at
    )
  from private.diet_recovery_snapshots s
  where s.user_id=v_uid

  union all

  select
    'tms60:' || b.id::text,
    'tms60'::text,
    (coalesce((select a.name from public.account_apps a where a.slug='tms60'),'TMS60') || ' · ' || upper(b.translation_id))::text,
    b.created_at,
    case
      when b.state_hash is null then 'unverified'
      when b.state_hash=encode(extensions.digest(b.state::text,'sha256'),'hex') then 'verified'
      else 'corrupted'
    end::text,
    'manual'::text,
    pg_column_size(b.state)::bigint,
    b.source_revision,
    b.state_schema,
    jsonb_build_object(
      'translationId',b.translation_id,
      'deviceId',b.device_id
    )
  from public.tms60_backups b
  where b.user_id=v_uid

  order by created_at desc;
end;
$$;

create or replace function public.create_thiepn_account_backup()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_diet_snapshot uuid;
  v_tms_backup uuid;
  v_created jsonb := '[]'::jsonb;
  r record;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode='42501';
  end if;

  if exists (
    select 1
    from public.account_app_grants g
    where g.user_id=v_uid
      and g.app_slug='diet'
      and g.permission_id='backup.include'
      and g.status='granted'
  ) and exists (
    select 1 from public.profiles p where p.user_id=v_uid
  ) then
    v_diet_snapshot := private.diet_p15_capture_owner_snapshot(v_uid,'manual');
    v_created := v_created || jsonb_build_array('diet:' || v_diet_snapshot::text);
  end if;

  if exists (
    select 1
    from public.account_app_grants g
    where g.user_id=v_uid
      and g.app_slug='tms60'
      and g.permission_id='backup.include'
      and g.status='granted'
  ) then
    for r in
      select *
      from public.tms60_sync_state s
      where s.user_id=v_uid
      order by s.translation_id
    loop
      insert into public.tms60_backups(
        user_id,state_schema,state,source_revision,device_id,translation_id
      )
      values(
        v_uid,r.state_schema,r.state,r.revision,'account-manual',r.translation_id
      )
      returning id into v_tms_backup;

      v_created := v_created || jsonb_build_array('tms60:' || v_tms_backup::text);
    end loop;
  end if;

  return jsonb_build_object('created',v_created);
end;
$$;

create or replace function public.restore_thiepn_tms60_backup(p_backup_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_backup public.tms60_backups%rowtype;
  v_current public.tms60_sync_state%rowtype;
  v_operation uuid;
  v_safety uuid;
  v_new_revision bigint;
  v_now_ms bigint;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode='42501';
  end if;

  select * into v_backup
  from public.tms60_backups b
  where b.id=p_backup_id and b.user_id=v_uid;

  if not found then
    raise exception 'backup_not_found' using errcode='22023';
  end if;

  if v_backup.state_hash is null
     or v_backup.state_hash<>encode(extensions.digest(v_backup.state::text,'sha256'),'hex') then
    raise exception 'backup_integrity_failed' using errcode='22023';
  end if;

  insert into public.account_restore_operations(
    user_id,backup_ref,app_slug,status
  )
  values(v_uid,'tms60:' || v_backup.id::text,'tms60','restoring')
  returning id into v_operation;

  select * into v_current
  from public.tms60_sync_state s
  where s.user_id=v_uid and s.translation_id=v_backup.translation_id
  for update;

  if found then
    insert into public.tms60_backups(
      user_id,state_schema,state,source_revision,device_id,translation_id
    )
    values(
      v_uid,v_current.state_schema,v_current.state,v_current.revision,
      'account-pre-restore',v_current.translation_id
    )
    returning id into v_safety;
    v_new_revision := v_current.revision + 1;
  else
    v_new_revision := greatest(v_backup.source_revision + 1,1);
  end if;

  v_now_ms := floor(extract(epoch from clock_timestamp()) * 1000)::bigint;

  insert into public.tms60_sync_state(
    user_id,translation_id,revision,state_schema,state,state_hash,
    client_updated_at,device_id,created_at,updated_at
  )
  values(
    v_uid,v_backup.translation_id,v_new_revision,v_backup.state_schema,v_backup.state,
    encode(extensions.digest(v_backup.state::text,'sha256'),'hex'),
    v_now_ms,'account-restore',now(),now()
  )
  on conflict (user_id,translation_id) do update set
    revision=excluded.revision,
    state_schema=excluded.state_schema,
    state=excluded.state,
    state_hash=excluded.state_hash,
    client_updated_at=excluded.client_updated_at,
    device_id=excluded.device_id,
    updated_at=now();

  update public.account_restore_operations
  set status='completed',
      completed_at=now(),
      safety_backup_ref=case when v_safety is null then null else 'tms60:' || v_safety::text end,
      result=jsonb_build_object(
        'appId','tms60',
        'translationId',v_backup.translation_id,
        'verified',true,
        'newRevision',v_new_revision
      )
  where id=v_operation and user_id=v_uid;

  return jsonb_build_object(
    'operationId',v_operation,
    'status','completed',
    'safetyBackupRef',case when v_safety is null then null else 'tms60:' || v_safety::text end,
    'newRevision',v_new_revision,
    'translationId',v_backup.translation_id
  );
end;
$$;

revoke all on function public.get_thiepn_account_backup_inventory() from public, anon;
revoke all on function public.create_thiepn_account_backup() from public, anon;
revoke all on function public.restore_thiepn_tms60_backup(uuid) from public, anon;

grant execute on function public.get_thiepn_account_backup_inventory() to authenticated;
grant execute on function public.create_thiepn_account_backup() to authenticated;
grant execute on function public.restore_thiepn_tms60_backup(uuid) to authenticated;

comment on function public.get_thiepn_account_backup_inventory() is
  'Returns auth.uid()-owned Diet recovery and TMS60 backup metadata only; payloads are not returned.';
comment on function public.create_thiepn_account_backup() is
  'Creates Account-requested snapshots only for apps where auth.uid() granted backup.include.';
comment on function public.restore_thiepn_tms60_backup(uuid) is
  'Atomically restores one owned verified TMS60 translation backup after creating a safety backup when live state exists.';
