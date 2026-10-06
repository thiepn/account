-- Library personal-file cloud lifecycle integration for THIEPN Account.

create or replace function public.get_thiepn_library_file_inventory()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_count bigint := 0;
  v_bytes bigint := 0;
  v_updated timestamptz;
  v_status text := 'retained';
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode='42501'; end if;
  if ((select auth.jwt())->>'client_id') is not null then
    raise exception 'native_account_required' using errcode='42501';
  end if;

  select
    count(*)::bigint,
    coalesce(sum(case
      when coalesce(o.metadata->>'size','') ~ '^[0-9]+$' then (o.metadata->>'size')::bigint
      else 0
    end),0)::bigint,
    max(o.updated_at)
  into v_count,v_bytes,v_updated
  from storage.objects o
  where o.bucket_id='library-personal-books'
    and (storage.foldername(o.name))[1]=v_uid::text;

  if exists (
    select 1
    from public.account_app_connections c
    where c.user_id=v_uid and c.app_slug='library'
      and c.status in ('connected','limited','error')
  ) then
    v_status := 'active';
  end if;

  return jsonb_build_object(
    'objectCount',v_count,
    'storageBytes',v_bytes,
    'updatedAt',v_updated,
    'namespaceStatus',v_status
  );
end;
$function$;

revoke all on function public.get_thiepn_library_file_inventory() from public, anon;
grant execute on function public.get_thiepn_library_file_inventory() to authenticated;

create or replace function private.p1_plan_library_data_deletion()
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_id uuid;
  v_revision bigint := 0;
  v_state_bytes bigint := 0;
  v_file_count bigint := 0;
  v_file_bytes bigint := 0;
  v_blockers jsonb := '[]'::jsonb;
  v_warnings jsonb := jsonb_build_array(
    'Local Library data and personal files already stored on your devices are not erased by this cloud deletion.'
  );
  v_backup_impact text;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode='42501'; end if;

  select s.revision,pg_column_size(to_jsonb(s))::bigint
  into v_revision,v_state_bytes
  from public.library_sync_state s
  where s.user_id=v_uid;

  v_revision := coalesce(v_revision,0);
  v_state_bytes := coalesce(v_state_bytes,0);

  select
    count(*)::bigint,
    coalesce(sum(case
      when coalesce(o.metadata->>'size','') ~ '^[0-9]+$' then (o.metadata->>'size')::bigint
      else 0
    end),0)::bigint
  into v_file_count,v_file_bytes
  from storage.objects o
  where o.bucket_id='library-personal-books'
    and (storage.foldername(o.name))[1]=v_uid::text;

  if v_revision=0 and v_file_count=0 then
    v_blockers := jsonb_build_array('No Library cloud data exists for this Account.');
  end if;

  v_backup_impact :=
    'Library reading-state sync and private personal-book cloud objects are deleted. Browser-local reading data, device-local files, and manual JSON backups remain untouched.';

  insert into public.account_app_deletion_plans(
    user_id,app_slug,expected_revision,storage_bytes,blockers,warnings,backup_impact,expires_at
  )
  values(
    v_uid,'library',v_revision,v_state_bytes+v_file_bytes,v_blockers,v_warnings,v_backup_impact,now()+interval '10 minutes'
  )
  returning id into v_id;

  return jsonb_build_object(
    'id',v_id,
    'appId','library',
    'storageBytes',v_state_bytes+v_file_bytes,
    'blockers',v_blockers,
    'warnings',v_warnings,
    'backupImpact',v_backup_impact,
    'requiresReauthentication',false,
    'expiresAt',now()+interval '10 minutes'
  );
end;
$function$;

create or replace function private.p1_execute_library_data_deletion(p_plan_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_plan public.account_app_deletion_plans%rowtype;
  v_result jsonb;
  v_operation uuid;
  v_remaining_files bigint := 0;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode='42501'; end if;

  select * into v_plan
  from public.account_app_deletion_plans p
  where p.id=p_plan_id and p.user_id=v_uid and p.app_slug='library'
  for update;

  if not found then raise exception 'deletion_plan_not_found' using errcode='22023'; end if;
  if v_plan.expires_at<=now() then raise exception 'deletion_plan_stale' using errcode='22023'; end if;
  if jsonb_array_length(v_plan.blockers)>0 then raise exception 'deletion_blocked' using errcode='22023'; end if;

  perform private.account_assert_not_deletion_pending();
  perform private.account_require_recent_session(interval '10 minutes');

  if not exists (
    select 1
    from public.library_file_deletion_authorizations a
    where a.user_id=v_uid
      and a.plan_id=p_plan_id
      and a.expected_revision=coalesce(v_plan.expected_revision,0)
      and a.expires_at>now()
  ) then
    raise exception 'library_file_deletion_not_authorized' using errcode='42501';
  end if;

  select count(*) into v_remaining_files
  from storage.objects o
  where o.bucket_id='library-personal-books'
    and (storage.foldername(o.name))[1]=v_uid::text;

  if v_remaining_files>0 then
    raise exception 'library_storage_objects_remaining' using errcode='55000';
  end if;

  if coalesce(v_plan.expected_revision,0)=0 then
    if exists (select 1 from public.library_sync_state s where s.user_id=v_uid) then
      raise exception 'deletion_conflict' using errcode='40001';
    end if;
  else
    delete from public.library_sync_state
    where user_id=v_uid and revision=v_plan.expected_revision;
    if not found then
      raise exception 'deletion_conflict' using errcode='40001';
    end if;
  end if;

  delete from public.library_file_deletion_authorizations
  where user_id=v_uid and plan_id=p_plan_id;

  v_result := jsonb_build_object(
    'status','deleted',
    'appId','library',
    'deletedRevision',coalesce(v_plan.expected_revision,0),
    'personalFilesDeleted',true,
    'staleClientPolicy','missing-cloud-is-conflict'
  );

  insert into public.account_app_deletion_operations(user_id,app_slug,status,result)
  values(v_uid,'library','completed',v_result)
  returning id into v_operation;

  return jsonb_build_object(
    'id',v_operation,
    'appId','library',
    'status','completed',
    'completedAt',now()
  );
end;
$function$;

create or replace function public.plan_thiepn_app_data_deletion(p_app_slug text)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
begin
  if auth.uid() is null or auth.jwt()->>'client_id' is not null then
    raise exception 'native_account_required' using errcode='42501';
  end if;
  if p_app_slug='library' then
    return private.p1_plan_library_data_deletion();
  end if;
  return private.h20_native_plan_thiepn_app_data_deletion(p_app_slug);
end;
$function$;

revoke all on function public.plan_thiepn_app_data_deletion(text) from public, anon;
grant execute on function public.plan_thiepn_app_data_deletion(text) to authenticated;

create or replace function public.execute_thiepn_app_data_deletion(p_plan_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_library boolean := false;
begin
  if v_uid is null or auth.jwt()->>'client_id' is not null then
    raise exception 'native_account_required' using errcode='42501';
  end if;

  select exists (
    select 1
    from public.account_app_deletion_plans p
    where p.id=p_plan_id and p.user_id=v_uid and p.app_slug='library'
  ) into v_library;

  if v_library then
    return private.p1_execute_library_data_deletion(p_plan_id);
  end if;
  return private.h20_native_execute_thiepn_app_data_deletion(p_plan_id);
end;
$function$;

revoke all on function public.execute_thiepn_app_data_deletion(uuid) from public, anon;
grant execute on function public.execute_thiepn_app_data_deletion(uuid) to authenticated;

create or replace function public.plan_thiepn_account_deletion()
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_result jsonb;
  v_plan_id uuid;
  v_file_count bigint := 0;
  v_blocker text;
  v_blockers jsonb;
begin
  if v_uid is null or auth.jwt()->>'client_id' is not null then
    raise exception 'native_account_required' using errcode='42501';
  end if;

  v_result := private.h20_native_plan_thiepn_account_deletion();

  select count(*) into v_file_count
  from storage.objects o
  where o.bucket_id='library-personal-books'
    and (storage.foldername(o.name))[1]=v_uid::text;

  if v_file_count>0 then
    v_plan_id := (v_result->>'id')::uuid;
    v_blocker := format(
      'Delete Library cloud data first so %s private personal-book object(s) can be removed through the certified Library deletion lifecycle.',
      v_file_count
    );
    update public.account_deletion_plans
    set blockers=blockers || jsonb_build_array(v_blocker)
    where id=v_plan_id and user_id=v_uid
    returning blockers into v_blockers;
    v_result := jsonb_set(v_result,'{blockers}',coalesce(v_blockers,'[]'::jsonb),true);
  end if;

  return v_result;
end;
$function$;

revoke all on function public.plan_thiepn_account_deletion() from public, anon;
grant execute on function public.plan_thiepn_account_deletion() to authenticated;

comment on function public.get_thiepn_library_file_inventory() is
  'Owner-scoped Account inventory for private Library personal-book objects; returns metadata only, never file bytes.';
comment on function private.p1_plan_library_data_deletion() is
  'Builds the Library cloud deletion plan including private personal-book Storage bytes.';
comment on function private.p1_execute_library_data_deletion(uuid) is
  'Completes Library cloud deletion only after recent-auth planned Storage cleanup and revision-safe reading-state deletion.';
