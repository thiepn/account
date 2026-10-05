update public.account_app_manifests
set capabilities = capabilities || '{"delete_app_data":true}'::jsonb,
    updated_at = now()
where app_slug='library';

create or replace function public.get_thiepn_account_data_inventory()
returns table (
  app_slug text,
  app_name text,
  namespace_id text,
  namespace_status text,
  record_count bigint,
  storage_bytes bigint,
  updated_at timestamptz,
  revision bigint,
  schema_version integer,
  sync_status text,
  last_successful_sync_at timestamptz,
  sync_supported boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode='42501';
  end if;

  return query
  with s as (
    select
      count(*)::bigint as records,
      coalesce(sum(pg_column_size(to_jsonb(r))),0)::bigint as bytes,
      max(r.updated_at) as last_change,
      max(r.version)::bigint as max_revision
    from public.notes_sync_records r
    where r.user_id=v_uid
  )
  select
    'notes'::text,
    coalesce((select a.name from public.account_apps a where a.slug='notes'),'Notes')::text,
    'notes:default'::text,
    case when exists (
      select 1 from public.account_app_connections c
      where c.user_id=v_uid and c.app_slug='notes' and c.status in ('connected','limited','error')
    ) then 'active' else 'retained' end::text,
    s.records,s.bytes,s.last_change,s.max_revision,null::integer,'unavailable'::text,null::timestamptz,true
  from s where s.records > 0;

  return query
  with pieces as (
    select count(*)::bigint c,coalesce(sum(pg_column_size(to_jsonb(t))),0)::bigint b,max(t.updated_at) u from public.profiles t where t.user_id=v_uid
    union all select count(*)::bigint,coalesce(sum(pg_column_size(to_jsonb(t))),0)::bigint,max(t.updated_at) from public.activity_daily t where t.user_id=v_uid
    union all select count(*)::bigint,coalesce(sum(pg_column_size(to_jsonb(t))),0)::bigint,max(t.created_at) from public.ai_actions t where t.user_id=v_uid
    union all select count(*)::bigint,coalesce(sum(pg_column_size(to_jsonb(t))),0)::bigint,max(t.created_at) from public.change_log t where t.user_id=v_uid
    union all select count(*)::bigint,coalesce(sum(pg_column_size(to_jsonb(t))),0)::bigint,max(t.updated_at) from public.daily_logs t where t.user_id=v_uid
    union all select count(*)::bigint,coalesce(sum(pg_column_size(to_jsonb(t))),0)::bigint,max(t.created_at) from public.diet_native_devices t where t.user_id=v_uid
    union all select count(*)::bigint,coalesce(sum(pg_column_size(to_jsonb(t))),0)::bigint,max(t.updated_at) from public.goal_phases t where t.user_id=v_uid
    union all select count(*)::bigint,coalesce(sum(pg_column_size(to_jsonb(t))),0)::bigint,max(t.updated_at) from public.meal_items t where t.user_id=v_uid
    union all select count(*)::bigint,coalesce(sum(pg_column_size(to_jsonb(t))),0)::bigint,max(t.updated_at) from public.meals t where t.user_id=v_uid
    union all select count(*)::bigint,coalesce(sum(pg_column_size(to_jsonb(t))),0)::bigint,max(t.updated_at) from public.saved_food_portions t where t.user_id=v_uid
    union all select count(*)::bigint,coalesce(sum(pg_column_size(to_jsonb(t))),0)::bigint,max(t.updated_at) from public.saved_foods t where t.user_id=v_uid
    union all select count(*)::bigint,coalesce(sum(pg_column_size(to_jsonb(t))),0)::bigint,max(t.updated_at) from public.saved_meal_items t where t.user_id=v_uid
    union all select count(*)::bigint,coalesce(sum(pg_column_size(to_jsonb(t))),0)::bigint,max(t.updated_at) from public.saved_meals t where t.user_id=v_uid
    union all select count(*)::bigint,coalesce(sum(pg_column_size(to_jsonb(t))),0)::bigint,max(t.created_at) from public.target_recommendations t where t.user_id=v_uid
    union all select count(*)::bigint,coalesce(sum(pg_column_size(to_jsonb(t))),0)::bigint,max(t.updated_at) from public.training_days t where t.user_id=v_uid
    union all select count(*)::bigint,coalesce(sum(pg_column_size(to_jsonb(t))),0)::bigint,max(t.updated_at) from public.training_distribution_settings t where t.user_id=v_uid
    union all select count(*)::bigint,coalesce(sum(pg_column_size(to_jsonb(t))),0)::bigint,max(t.created_at) from public.weekly_reviews t where t.user_id=v_uid
    union all select count(*)::bigint,coalesce(sum(pg_column_size(to_jsonb(t))),0)::bigint,max(t.updated_at) from public.weight_entries t where t.user_id=v_uid
  ),
  s as (select coalesce(sum(c),0)::bigint records,coalesce(sum(b),0)::bigint bytes,max(u) last_change from pieces)
  select
    'diet'::text,
    coalesce((select a.name from public.account_apps a where a.slug='diet'),'Diet Copilot')::text,
    'diet:default'::text,
    case when exists (
      select 1 from public.account_app_connections c
      where c.user_id=v_uid and c.app_slug='diet' and c.status in ('connected','limited','error')
    ) then 'active' else 'retained' end::text,
    s.records,s.bytes,s.last_change,null::bigint,null::integer,'unavailable'::text,null::timestamptz,false
  from s where s.records > 0;

  return query
  with s as (
    select count(*)::bigint records,
      coalesce(sum(pg_column_size(to_jsonb(t))),0)::bigint bytes,
      max(t.updated_at) last_change,
      max(t.revision)::bigint max_revision,
      max(t.state_schema)::integer max_schema
    from public.tms60_sync_state t where t.user_id=v_uid
  )
  select
    'tms60'::text,
    coalesce((select a.name from public.account_apps a where a.slug='tms60'),'TMS60')::text,
    'tms60:default'::text,
    case when exists (
      select 1 from public.account_app_connections c
      where c.user_id=v_uid and c.app_slug='tms60' and c.status in ('connected','limited','error')
    ) then 'active' else 'retained' end::text,
    s.records,s.bytes,s.last_change,s.max_revision,s.max_schema,'up-to-date'::text,s.last_change,true
  from s where s.records > 0;

  return query
  with s as (
    select count(*)::bigint records,
      coalesce(sum(pg_column_size(to_jsonb(w))),0)::bigint bytes,
      max(w.updated_at) last_change,
      max(w.revision)::bigint max_revision
    from public.wordstrike_player_profiles w where w.user_id=v_uid
  )
  select
    'wordstrike'::text,
    coalesce((select a.name from public.account_apps a where a.slug='wordstrike'),'WORDSTRIKE')::text,
    'wordstrike:profile'::text,
    case when exists (
      select 1 from public.account_app_connections c
      where c.user_id=v_uid and c.app_slug='wordstrike' and c.status in ('connected','limited','error')
    ) then 'active' else 'retained' end::text,
    s.records,s.bytes,s.last_change,s.max_revision,null::integer,'unavailable'::text,null::timestamptz,true
  from s where s.records > 0;

  return query
  with s as (
    select
      count(*) filter (where not w.deleted and w.snapshot is not null)::bigint records,
      coalesce(sum(case when not w.deleted and w.snapshot is not null then octet_length(w.snapshot) else 0 end),0)::bigint bytes,
      max(w.updated_at) filter (where not w.deleted and w.snapshot is not null) last_change,
      max(w.revision) filter (where not w.deleted and w.snapshot is not null)::bigint max_revision
    from wttn_private.saves w where w.user_id=v_uid
  )
  select
    'wttn'::text,
    coalesce((select a.name from public.account_apps a where a.slug='wttn'),'Word to the Nations')::text,
    'wttn:save'::text,
    case when exists (
      select 1 from public.account_app_connections c
      where c.user_id=v_uid and c.app_slug='wttn' and c.status in ('connected','limited','error')
    ) then 'active' else 'retained' end::text,
    s.records,s.bytes,s.last_change,s.max_revision,1::integer,'unavailable'::text,null::timestamptz,true
  from s where s.records > 0;

  return query
  with s as (
    select count(*)::bigint records,
      coalesce(sum(pg_column_size(to_jsonb(f))),0)::bigint bytes,
      max(f.updated_at) last_change,
      max(f.revision)::bigint max_revision,
      max(case when (f.state->>'schema') ~ '^[0-9]+$' then (f.state->>'schema')::integer else null end)::integer max_schema
    from public.french_sync_state f where f.user_id=v_uid
  )
  select
    'french'::text,
    coalesce((select a.name from public.account_apps a where a.slug='french'),'French')::text,
    'french:default'::text,
    case when exists (
      select 1 from public.account_app_connections c
      where c.user_id=v_uid and c.app_slug='french' and c.status in ('connected','limited','error')
    ) then 'active' else 'retained' end::text,
    s.records,s.bytes,s.last_change,s.max_revision,s.max_schema,'up-to-date'::text,s.last_change,true
  from s where s.records > 0;

  return query
  with s as (
    select count(*)::bigint records,
      coalesce(sum(pg_column_size(to_jsonb(l))),0)::bigint bytes,
      max(l.updated_at) last_change,
      max(l.revision)::bigint max_revision,
      max(case when (l.state->>'schemaVersion') ~ '^[0-9]+$' then (l.state->>'schemaVersion')::integer else null end)::integer max_schema
    from public.library_sync_state l where l.user_id=v_uid
  )
  select
    'library'::text,
    coalesce((select a.name from public.account_apps a where a.slug='library'),'Library')::text,
    'library:default'::text,
    case when exists (
      select 1 from public.account_app_connections c
      where c.user_id=v_uid and c.app_slug='library' and c.status in ('connected','limited','error')
    ) then 'active' else 'retained' end::text,
    s.records,s.bytes,s.last_change,s.max_revision,s.max_schema,'up-to-date'::text,s.last_change,true
  from s where s.records > 0;
end;
$function$;

revoke all on function public.get_thiepn_account_data_inventory() from public, anon;
grant execute on function public.get_thiepn_account_data_inventory() to authenticated;

create or replace function public.plan_thiepn_app_data_deletion(p_app_slug text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_id uuid;
  v_revision bigint;
  v_bytes bigint := 0;
  v_blockers jsonb := '[]'::jsonb;
  v_warnings jsonb := jsonb_build_array('Local app data on your devices is not erased by this cloud deletion.');
  v_backup_impact text;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode='42501'; end if;

  if p_app_slug='wttn' then
    select s.revision,coalesce(octet_length(s.snapshot),0)
    into v_revision,v_bytes
    from wttn_private.saves s
    where s.user_id=v_uid and not s.deleted;
    v_revision := coalesce(v_revision,0);
    v_bytes := coalesce(v_bytes,0);
    v_backup_impact := 'WTTN checkpoint history is deleted together with the live cloud save. A revision tombstone remains to prevent stale-client resurrection.';
  elsif p_app_slug='library' then
    select s.revision,pg_column_size(to_jsonb(s))::bigint
    into v_revision,v_bytes
    from public.library_sync_state s
    where s.user_id=v_uid;
    if v_revision is null then
      v_revision := 0;
      v_bytes := 0;
      v_blockers := jsonb_build_array('No Library cloud snapshot exists for this Account.');
    end if;
    v_backup_impact := 'Library cloud sync state is deleted. Browser-local reading data and manual JSON backups remain untouched. Personal EPUB/PDF file bytes were never stored in THIEPN Account.';
  elsif p_app_slug='tms60' then
    select coalesce(sum(pg_column_size(to_jsonb(s))),0)::bigint into v_bytes
    from public.tms60_sync_state s where s.user_id=v_uid;
    v_bytes := coalesce(v_bytes,0);
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

  v_bytes := coalesce(v_bytes,0);

  insert into public.account_app_deletion_plans(
    user_id,app_slug,expected_revision,storage_bytes,blockers,warnings,backup_impact,expires_at
  )
  values(v_uid,p_app_slug,v_revision,v_bytes,v_blockers,v_warnings,v_backup_impact,now()+interval '10 minutes')
  returning id into v_id;

  return jsonb_build_object(
    'id',v_id,'appId',p_app_slug,'storageBytes',v_bytes,'blockers',v_blockers,
    'warnings',v_warnings,'backupImpact',v_backup_impact,'requiresReauthentication',false,
    'expiresAt',now()+interval '10 minutes'
  );
end;
$function$;

revoke all on function public.plan_thiepn_app_data_deletion(text) from public, anon;
grant execute on function public.plan_thiepn_app_data_deletion(text) to authenticated;

create or replace function public.execute_thiepn_app_data_deletion(p_plan_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_plan public.account_app_deletion_plans%rowtype;
  v_result jsonb;
  v_operation uuid;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode='42501'; end if;

  select * into v_plan
  from public.account_app_deletion_plans p
  where p.id=p_plan_id and p.user_id=v_uid
  for update;

  if not found then raise exception 'deletion_plan_not_found' using errcode='22023'; end if;
  if v_plan.expires_at<=now() then raise exception 'deletion_plan_stale' using errcode='22023'; end if;
  if jsonb_array_length(v_plan.blockers)>0 then raise exception 'deletion_blocked' using errcode='22023'; end if;

  perform private.account_assert_not_deletion_pending();
  perform private.account_require_recent_session(interval '10 minutes');

  if v_plan.app_slug='wttn' then
    v_result := wttn_private.command('delete',null,coalesce(v_plan.expected_revision,0),gen_random_uuid(),false,false);
    if coalesce(v_result->>'status','')<>'deleted' then
      raise exception 'deletion_conflict' using errcode='40001';
    end if;
  elsif v_plan.app_slug='library' then
    delete from public.library_sync_state
    where user_id=v_uid and revision=v_plan.expected_revision;
    if not found then
      raise exception 'deletion_conflict' using errcode='40001';
    end if;
    v_result := jsonb_build_object(
      'status','deleted','appId','library','deletedRevision',v_plan.expected_revision,
      'staleClientPolicy','missing-cloud-is-conflict'
    );
  else
    raise exception 'deletion_not_supported' using errcode='22023';
  end if;

  insert into public.account_app_deletion_operations(user_id,app_slug,status,result)
  values(v_uid,v_plan.app_slug,'completed',v_result)
  returning id into v_operation;

  return jsonb_build_object(
    'id',v_operation,'appId',v_plan.app_slug,'status','completed','completedAt',now()
  );
end;
$function$;

revoke all on function public.execute_thiepn_app_data_deletion(uuid) from public, anon;
grant execute on function public.execute_thiepn_app_data_deletion(uuid) to authenticated;

comment on function public.get_thiepn_account_data_inventory() is
  'Returns auth.uid()-scoped metadata only for existing THIEPN app cloud data, including Library revisioned cloud snapshots. Sizes are approximate database row/payload bytes, not billing storage.';
comment on function public.plan_thiepn_app_data_deletion(text) is
  'Builds an expiring owner-scoped app-data deletion plan. Library plans capture the current sync revision so execution is conflict-safe.';
comment on function public.execute_thiepn_app_data_deletion(uuid) is
  'Executes certified app-data deletion contracts after recent-auth and account-lifecycle checks. Library deletion is revision-CAS and does not delete browser-local reading data or personal files.';
