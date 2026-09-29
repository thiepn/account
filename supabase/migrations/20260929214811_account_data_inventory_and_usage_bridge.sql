create or replace function private.account_sync_usage_connection()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.account_app_connections
    (user_id, app_slug, status, source, connected_at, last_used_at, updated_at)
  values
    (new.user_id, new.app_slug, 'connected', 'usage', new.first_used_at, new.last_used_at, now())
  on conflict (user_id, app_slug) do update set
    last_used_at = greatest(public.account_app_connections.last_used_at, excluded.last_used_at),
    updated_at = now();

  insert into public.account_app_grants
    (user_id, app_slug, permission_id, status, granted_at, updated_at)
  select
    c.user_id,
    c.app_slug,
    p.permission_id,
    'granted',
    coalesce(c.connected_at, now()),
    now()
  from public.account_app_connections c
  join public.account_app_permissions p
    on p.app_slug=c.app_slug
   and p.active=true
   and p.required=true
  where c.user_id=new.user_id
    and c.app_slug=new.app_slug
    and c.status in ('connected','limited')
  on conflict (user_id, app_slug, permission_id) do nothing;

  return new;
end;
$$;

revoke all on function private.account_sync_usage_connection() from public, anon, authenticated;

drop trigger if exists account_sync_usage_connection on public.account_user_apps;
create trigger account_sync_usage_connection
after insert or update of last_used_at on public.account_user_apps
for each row
execute function private.account_sync_usage_connection();

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
as $$
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
    s.records,
    s.bytes,
    s.last_change,
    s.max_revision,
    null::integer,
    'unavailable'::text,
    null::timestamptz,
    true
  from s
  where s.records > 0;

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
  s as (
    select coalesce(sum(c),0)::bigint records,coalesce(sum(b),0)::bigint bytes,max(u) last_change from pieces
  )
  select
    'diet'::text,
    coalesce((select a.name from public.account_apps a where a.slug='diet'),'Diet Copilot')::text,
    'diet:default'::text,
    case when exists (
      select 1 from public.account_app_connections c
      where c.user_id=v_uid and c.app_slug='diet' and c.status in ('connected','limited','error')
    ) then 'active' else 'retained' end::text,
    s.records,
    s.bytes,
    s.last_change,
    null::bigint,
    null::integer,
    'unavailable'::text,
    null::timestamptz,
    false
  from s
  where s.records > 0;

  return query
  with s as (
    select
      count(*)::bigint records,
      coalesce(sum(pg_column_size(to_jsonb(t))),0)::bigint bytes,
      max(t.updated_at) last_change,
      max(t.revision)::bigint max_revision,
      max(t.state_schema)::integer max_schema
    from public.tms60_sync_state t
    where t.user_id=v_uid
  )
  select
    'tms60'::text,
    coalesce((select a.name from public.account_apps a where a.slug='tms60'),'TMS60')::text,
    'tms60:default'::text,
    case when exists (
      select 1 from public.account_app_connections c
      where c.user_id=v_uid and c.app_slug='tms60' and c.status in ('connected','limited','error')
    ) then 'active' else 'retained' end::text,
    s.records,
    s.bytes,
    s.last_change,
    s.max_revision,
    s.max_schema,
    'up-to-date'::text,
    s.last_change,
    true
  from s
  where s.records > 0;

  return query
  with s as (
    select
      count(*)::bigint records,
      coalesce(sum(pg_column_size(to_jsonb(w))),0)::bigint bytes,
      max(w.updated_at) last_change,
      max(w.revision)::bigint max_revision
    from public.wordstrike_player_profiles w
    where w.user_id=v_uid
  )
  select
    'wordstrike'::text,
    coalesce((select a.name from public.account_apps a where a.slug='wordstrike'),'WORDSTRIKE')::text,
    'wordstrike:profile'::text,
    case when exists (
      select 1 from public.account_app_connections c
      where c.user_id=v_uid and c.app_slug='wordstrike' and c.status in ('connected','limited','error')
    ) then 'active' else 'retained' end::text,
    s.records,
    s.bytes,
    s.last_change,
    s.max_revision,
    null::integer,
    'unavailable'::text,
    null::timestamptz,
    true
  from s
  where s.records > 0;

  return query
  with s as (
    select
      count(*) filter (where not w.deleted and w.snapshot is not null)::bigint records,
      coalesce(sum(case when not w.deleted and w.snapshot is not null then octet_length(w.snapshot) else 0 end),0)::bigint bytes,
      max(w.updated_at) filter (where not w.deleted and w.snapshot is not null) last_change,
      max(w.revision) filter (where not w.deleted and w.snapshot is not null)::bigint max_revision
    from wttn_private.saves w
    where w.user_id=v_uid
  )
  select
    'wttn'::text,
    coalesce((select a.name from public.account_apps a where a.slug='wttn'),'Word to the Nations')::text,
    'wttn:save'::text,
    case when exists (
      select 1 from public.account_app_connections c
      where c.user_id=v_uid and c.app_slug='wttn' and c.status in ('connected','limited','error')
    ) then 'active' else 'retained' end::text,
    s.records,
    s.bytes,
    s.last_change,
    s.max_revision,
    1::integer,
    'unavailable'::text,
    null::timestamptz,
    true
  from s
  where s.records > 0;
end;
$$;

revoke all on function public.get_thiepn_account_data_inventory() from public, anon;
grant execute on function public.get_thiepn_account_data_inventory() to authenticated;

comment on function public.get_thiepn_account_data_inventory() is
  'Returns auth.uid()-scoped metadata only for existing THIEPN app cloud data. Sizes are approximate database row/payload bytes, not billing storage. Sync status is reported only where the source backend can prove it.';
