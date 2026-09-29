create table public.account_export_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  scope text not null check (scope in ('account','selected-apps')),
  app_slugs text[] null,
  status text not null default 'ready' check (status in ('ready','failed')),
  requested_at timestamptz not null default now(),
  completed_at timestamptz not null default now(),
  expires_at timestamptz not null,
  size_bytes bigint not null default 0 check (size_bytes >= 0)
);

create table private.account_export_payloads (
  export_id uuid primary key references public.account_export_requests(id) on delete cascade,
  payload jsonb not null
);

alter table public.account_export_requests enable row level security;
revoke all on public.account_export_requests from anon, authenticated;
grant select on public.account_export_requests to authenticated;
grant all on public.account_export_requests to service_role;

create policy account_export_requests_select_own
  on public.account_export_requests
  for select to authenticated
  using ((select auth.uid()) = user_id);

create index account_export_requests_user_requested_idx
  on public.account_export_requests(user_id,requested_at desc);

create table public.account_app_deletion_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  app_slug text not null,
  expected_revision bigint null,
  storage_bytes bigint not null default 0,
  blockers jsonb not null default '[]'::jsonb,
  warnings jsonb not null default '[]'::jsonb,
  backup_impact text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create table public.account_app_deletion_operations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  app_slug text not null,
  status text not null check (status in ('completed','failed')),
  started_at timestamptz not null default now(),
  completed_at timestamptz not null default now(),
  result jsonb null,
  error_code text null
);

alter table public.account_app_deletion_plans enable row level security;
alter table public.account_app_deletion_operations enable row level security;

revoke all on public.account_app_deletion_plans, public.account_app_deletion_operations from anon, authenticated;
grant select on public.account_app_deletion_plans, public.account_app_deletion_operations to authenticated;
grant all on public.account_app_deletion_plans, public.account_app_deletion_operations to service_role;

create policy account_app_deletion_plans_select_own
  on public.account_app_deletion_plans for select to authenticated
  using ((select auth.uid())=user_id);
create policy account_app_deletion_operations_select_own
  on public.account_app_deletion_operations for select to authenticated
  using ((select auth.uid())=user_id);

create table public.account_deletion_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  app_count integer not null default 0,
  namespace_count integer not null default 0,
  backup_count integer not null default 0,
  blockers jsonb not null default '[]'::jsonb,
  warnings jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create table public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  status text not null check (status in ('pending','deleting','completed','failed','cancelled')),
  requested_at timestamptz not null default now(),
  cancellable_until timestamptz null,
  scheduled_deletion_at timestamptz null,
  completed_at timestamptz null,
  error_code text null
);

alter table public.account_deletion_plans enable row level security;
alter table public.account_deletion_requests enable row level security;

revoke all on public.account_deletion_plans, public.account_deletion_requests from anon, authenticated;
grant select on public.account_deletion_plans, public.account_deletion_requests to authenticated;
grant all on public.account_deletion_plans, public.account_deletion_requests to service_role;

create policy account_deletion_plans_select_own
  on public.account_deletion_plans for select to authenticated
  using ((select auth.uid())=user_id);
create policy account_deletion_requests_select_own
  on public.account_deletion_requests for select to authenticated
  using ((select auth.uid())=user_id);

create unique index account_deletion_requests_one_active_uidx
  on public.account_deletion_requests(user_id)
  where status in ('pending','deleting');

create index account_deletion_requests_due_idx
  on public.account_deletion_requests(scheduled_deletion_at)
  where status='pending';

create or replace function public.request_thiepn_account_export(p_app_slugs text[] default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_payload jsonb;
  v_apps jsonb;
  v_id uuid;
  v_scope text;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode='42501';
  end if;

  v_payload := public.export_thiepn_platform_snapshot();

  if p_app_slugs is not null and cardinality(p_app_slugs)>0 then
    select coalesce(jsonb_agg(e),'[]'::jsonb)
    into v_apps
    from jsonb_array_elements(coalesce(v_payload->'apps','[]'::jsonb)) e
    where e->>'slug'=any(p_app_slugs);

    v_payload := jsonb_set(v_payload,'{apps}',v_apps,true);
    v_scope := 'selected-apps';
  else
    v_scope := 'account';
  end if;

  v_payload := v_payload || jsonb_build_object(
    'exportKind','thiepn-account-metadata',
    'appPayloadsIncluded',false,
    'note','App-owned content exports remain app-specific.'
  );

  insert into public.account_export_requests(
    user_id,scope,app_slugs,status,requested_at,completed_at,expires_at,size_bytes
  )
  values(
    v_uid,v_scope,p_app_slugs,'ready',now(),now(),now()+interval '24 hours',
    pg_column_size(v_payload)
  )
  returning id into v_id;

  insert into private.account_export_payloads(export_id,payload)
  values(v_id,v_payload);

  return v_id;
end;
$$;

create or replace function public.get_thiepn_account_export_payload(p_export_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_payload jsonb;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode='42501';
  end if;

  select p.payload into v_payload
  from public.account_export_requests r
  join private.account_export_payloads p on p.export_id=r.id
  where r.id=p_export_id
    and r.user_id=v_uid
    and r.status='ready'
    and r.expires_at>now();

  if v_payload is null then
    raise exception 'export_not_available' using errcode='22023';
  end if;

  return v_payload;
end;
$$;

create or replace function public.plan_thiepn_app_data_deletion(p_app_slug text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_id uuid;
  v_revision bigint;
  v_bytes bigint := 0;
  v_blockers jsonb := '[]'::jsonb;
  v_warnings jsonb := jsonb_build_array('Local app data on your devices is not erased by this cloud deletion.');
  v_backup_impact text;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode='42501';
  end if;

  if p_app_slug='wttn' then
    select s.revision,coalesce(octet_length(s.snapshot),0)
    into v_revision,v_bytes
    from wttn_private.saves s
    where s.user_id=v_uid and not s.deleted;

    v_revision := coalesce(v_revision,0);
    v_backup_impact := 'WTTN checkpoint history is deleted together with the live cloud save. A revision tombstone remains to prevent stale-client resurrection.';
  elsif p_app_slug='tms60' then
    select coalesce(sum(pg_column_size(to_jsonb(s))),0)::bigint
    into v_bytes
    from public.tms60_sync_state s where s.user_id=v_uid;
    v_blockers := jsonb_build_array('TMS60 cloud deletion is blocked until the sync protocol has a deletion tombstone/epoch that stale clients must honor.');
    v_backup_impact := 'The current TMS60 delete RPC removes live sync state and TMS60 backups, but stale-client resurrection is not yet safely prevented.';
  elsif p_app_slug='diet' then
    v_blockers := jsonb_build_array('Diet Copilot does not yet expose an app-only whole-namespace deletion command.');
    v_backup_impact := 'Diet recovery snapshots are governed by the Diet recovery lifecycle and full Account deletion cascade.';
  elsif p_app_slug='notes' then
    v_blockers := jsonb_build_array('Notes cloud deletion requires coordinated sync-record, attachment-storage and workspace-ownership cleanup.');
    v_backup_impact := 'Notes attachment/storage lifecycle must be resolved before app-only deletion can be enabled.';
  elsif p_app_slug='wordstrike' then
    v_blockers := jsonb_build_array('WORDSTRIKE app-only deletion is blocked until profile, leaderboard and submission retention semantics are explicitly separated.');
    v_backup_impact := 'No Account backup deletion action is performed.';
  else
    v_blockers := jsonb_build_array('This app does not expose a certified whole-namespace deletion contract.');
    v_backup_impact := 'No backup action is performed.';
  end if;

  insert into public.account_app_deletion_plans(
    user_id,app_slug,expected_revision,storage_bytes,blockers,warnings,backup_impact,expires_at
  )
  values(
    v_uid,p_app_slug,v_revision,v_bytes,v_blockers,v_warnings,v_backup_impact,now()+interval '10 minutes'
  )
  returning id into v_id;

  return jsonb_build_object(
    'id',v_id,
    'appId',p_app_slug,
    'storageBytes',v_bytes,
    'blockers',v_blockers,
    'warnings',v_warnings,
    'backupImpact',v_backup_impact,
    'requiresReauthentication',false,
    'expiresAt',now()+interval '10 minutes'
  );
end;
$$;

create or replace function public.execute_thiepn_app_data_deletion(p_plan_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_plan public.account_app_deletion_plans%rowtype;
  v_result jsonb;
  v_operation uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode='42501';
  end if;

  select * into v_plan
  from public.account_app_deletion_plans p
  where p.id=p_plan_id and p.user_id=v_uid
  for update;

  if not found then
    raise exception 'deletion_plan_not_found' using errcode='22023';
  end if;
  if v_plan.expires_at<=now() then
    raise exception 'deletion_plan_stale' using errcode='22023';
  end if;
  if jsonb_array_length(v_plan.blockers)>0 then
    raise exception 'deletion_blocked' using errcode='22023';
  end if;
  if v_plan.app_slug<>'wttn' then
    raise exception 'deletion_not_supported' using errcode='22023';
  end if;

  v_result := wttn_private.command(
    'delete',
    null,
    coalesce(v_plan.expected_revision,0),
    gen_random_uuid(),
    false,
    false
  );

  if coalesce(v_result->>'status','')<>'deleted' then
    raise exception 'deletion_conflict' using errcode='40001';
  end if;

  insert into public.account_app_deletion_operations(
    user_id,app_slug,status,result
  )
  values(v_uid,v_plan.app_slug,'completed',v_result)
  returning id into v_operation;

  return jsonb_build_object(
    'id',v_operation,
    'appId',v_plan.app_slug,
    'status','completed',
    'completedAt',now()
  );
end;
$$;

create or replace function public.plan_thiepn_account_deletion()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_id uuid;
  v_app_count integer;
  v_namespace_count integer;
  v_backup_count integer;
  v_storage_count bigint;
  v_blockers jsonb := '[]'::jsonb;
  v_warnings jsonb := jsonb_build_array(
    'Deleting THIEPN Account does not delete your Google identity or other external provider accounts.',
    'After the grace period, Account identity and cascading THIEPN app data are irreversible.'
  );
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode='42501';
  end if;

  select count(*)::integer into v_app_count
  from public.account_app_connections c
  where c.user_id=v_uid and c.status<>'disconnected';

  select count(*)::integer into v_namespace_count
  from public.get_thiepn_account_data_inventory();

  select count(*)::integer into v_backup_count
  from public.get_thiepn_account_backup_inventory();

  select count(*) into v_storage_count
  from storage.objects o
  where o.bucket_id='notes-attachments'
    and (storage.foldername(o.name))[1]=v_uid::text;

  if v_storage_count>0 then
    v_blockers := v_blockers || jsonb_build_array(
      format('Remove %s Notes attachment object(s) before Account deletion can be scheduled.',v_storage_count)
    );
  end if;

  insert into public.account_deletion_plans(
    user_id,app_count,namespace_count,backup_count,blockers,warnings,expires_at
  )
  values(
    v_uid,v_app_count,v_namespace_count,v_backup_count,v_blockers,v_warnings,now()+interval '10 minutes'
  )
  returning id into v_id;

  return jsonb_build_object(
    'id',v_id,
    'appCount',v_app_count,
    'namespaceCount',v_namespace_count,
    'backupCount',v_backup_count,
    'blockers',v_blockers,
    'warnings',v_warnings,
    'gracePeriodDays',7,
    'requiresReauthentication',false,
    'expiresAt',now()+interval '10 minutes'
  );
end;
$$;

create or replace function public.request_thiepn_account_deletion(
  p_plan_id uuid,
  p_confirmation text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_plan public.account_deletion_plans%rowtype;
  v_request public.account_deletion_requests%rowtype;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode='42501';
  end if;
  if p_confirmation<>'DELETE' then
    raise exception 'confirmation_mismatch' using errcode='22023';
  end if;

  select * into v_plan
  from public.account_deletion_plans p
  where p.id=p_plan_id and p.user_id=v_uid
  for update;

  if not found then
    raise exception 'deletion_plan_not_found' using errcode='22023';
  end if;
  if v_plan.expires_at<=now() then
    raise exception 'deletion_plan_stale' using errcode='22023';
  end if;
  if jsonb_array_length(v_plan.blockers)>0 then
    raise exception 'deletion_blocked' using errcode='22023';
  end if;

  select * into v_request
  from public.account_deletion_requests r
  where r.user_id=v_uid and r.status in ('pending','deleting')
  order by r.requested_at desc
  limit 1;

  if found then
    return jsonb_build_object(
      'id',v_request.id,
      'status',v_request.status,
      'requestedAt',v_request.requested_at,
      'cancellableUntil',v_request.cancellable_until,
      'scheduledDeletionAt',v_request.scheduled_deletion_at
    );
  end if;

  insert into public.account_deletion_requests(
    user_id,status,requested_at,cancellable_until,scheduled_deletion_at
  )
  values(
    v_uid,'pending',now(),now()+interval '7 days',now()+interval '7 days'
  )
  returning * into v_request;

  return jsonb_build_object(
    'id',v_request.id,
    'status',v_request.status,
    'requestedAt',v_request.requested_at,
    'cancellableUntil',v_request.cancellable_until,
    'scheduledDeletionAt',v_request.scheduled_deletion_at
  );
end;
$$;

create or replace function public.cancel_thiepn_account_deletion()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_request public.account_deletion_requests%rowtype;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode='42501';
  end if;

  update public.account_deletion_requests
  set status='cancelled',
      completed_at=now()
  where user_id=v_uid
    and status='pending'
    and cancellable_until>now()
  returning * into v_request;

  if not found then
    raise exception 'no_cancellable_deletion' using errcode='22023';
  end if;

  return jsonb_build_object(
    'id',v_request.id,
    'status',v_request.status,
    'requestedAt',v_request.requested_at,
    'cancellableUntil',v_request.cancellable_until,
    'scheduledDeletionAt',v_request.scheduled_deletion_at,
    'completedAt',v_request.completed_at
  );
end;
$$;

create or replace function private.finalize_due_thiepn_account_deletions()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.account_deletion_requests%rowtype;
  v_storage_count bigint;
  v_done integer := 0;
begin
  for r in
    select *
    from public.account_deletion_requests
    where status='pending'
      and scheduled_deletion_at<=now()
    order by scheduled_deletion_at
    for update skip locked
  loop
    select count(*) into v_storage_count
    from storage.objects o
    where o.bucket_id='notes-attachments'
      and (storage.foldername(o.name))[1]=r.user_id::text;

    if v_storage_count>0 then
      update public.account_deletion_requests
      set status='failed',
          completed_at=now(),
          error_code='notes_storage_objects_remaining'
      where id=r.id;
      continue;
    end if;

    update public.account_deletion_requests
    set status='deleting'
    where id=r.id;

    if exists (
      select 1
      from notes_private.notes_sync_access a
      where a.user_id=r.user_id and a.disabled_at is null
    ) then
      update notes_private.notes_sync_workspace_state
      set locked=true,
          locked_at=timezone('utc'::text,now()),
          former_user_id=r.user_id
      where singleton=true;

      delete from notes_private.notes_sync_access
      where user_id=r.user_id;
    end if;

    delete from auth.users where id=r.user_id;

    update public.account_deletion_requests
    set status='completed',
        completed_at=now(),
        error_code=null
    where id=r.id;

    v_done:=v_done+1;
  end loop;

  return v_done;
end;
$$;

revoke all on function public.request_thiepn_account_export(text[]) from public, anon;
revoke all on function public.get_thiepn_account_export_payload(uuid) from public, anon;
revoke all on function public.plan_thiepn_app_data_deletion(text) from public, anon;
revoke all on function public.execute_thiepn_app_data_deletion(uuid) from public, anon;
revoke all on function public.plan_thiepn_account_deletion() from public, anon;
revoke all on function public.request_thiepn_account_deletion(uuid,text) from public, anon;
revoke all on function public.cancel_thiepn_account_deletion() from public, anon;
revoke all on function private.finalize_due_thiepn_account_deletions() from public, anon, authenticated;

grant execute on function public.request_thiepn_account_export(text[]) to authenticated;
grant execute on function public.get_thiepn_account_export_payload(uuid) to authenticated;
grant execute on function public.plan_thiepn_app_data_deletion(text) to authenticated;
grant execute on function public.execute_thiepn_app_data_deletion(uuid) to authenticated;
grant execute on function public.plan_thiepn_account_deletion() to authenticated;
grant execute on function public.request_thiepn_account_deletion(uuid,text) to authenticated;
grant execute on function public.cancel_thiepn_account_deletion() to authenticated;

revoke execute on function public.delete_thiepn_account(text) from authenticated;
revoke execute on function public.delete_notes_auth_identity() from authenticated;

comment on function public.delete_thiepn_account(text) is
  'Legacy immediate Account deletion path. P18 revokes authenticated execution in favor of the grace-period lifecycle.';
comment on function public.delete_notes_auth_identity() is
  'Legacy shared Auth identity deletion path. P18 revokes authenticated execution in favor of THIEPN Account lifecycle.';
comment on function private.finalize_due_thiepn_account_deletions() is
  'Finalizes due Account deletion requests after the seven-day grace period. Intended for pg_cron owner execution.';

do $$
declare
  v_jobid bigint;
begin
  for v_jobid in select jobid from cron.job where jobname='account-deletion-finalizer'
  loop
    perform cron.unschedule(v_jobid);
  end loop;

  perform cron.schedule(
    'account-deletion-finalizer',
    '17 * * * *',
    'select private.finalize_due_thiepn_account_deletions();'
  );
end $$;
