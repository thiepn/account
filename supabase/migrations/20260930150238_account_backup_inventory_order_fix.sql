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
  select q.backup_ref,
         q.app_slug,
         q.app_name,
         q.created_at,
         q.backup_status,
         q.backup_type,
         q.size_bytes,
         q.source_revision,
         q.schema_version,
         q.metadata
  from (
    select
      ('diet:' || s.snapshot_id::text)::text as backup_ref,
      'diet'::text as app_slug,
      coalesce((select a.name from public.account_apps a where a.slug='diet'),'Diet Copilot')::text as app_name,
      s.captured_at as created_at,
      case
        when s.verification_status='verified' then 'verified'
        when s.verification_status='failed' then 'corrupted'
        else 'unverified'
      end::text as backup_status,
      case
        when s.source in ('scheduled','monthly') then 'automatic'
        when s.source='pre_restore' then 'pre-restore'
        else 'manual'
      end::text as backup_type,
      s.payload_bytes::bigint as size_bytes,
      null::bigint as source_revision,
      1::integer as schema_version,
      jsonb_build_object(
        'source',s.source,
        'schemaVersion',s.schema_version,
        'migrationVersion',s.migration_version,
        'verifiedAt',s.verified_at
      ) as metadata
    from private.diet_recovery_snapshots s
    where s.user_id=v_uid

    union all

    select
      ('tms60:' || b.id::text)::text as backup_ref,
      'tms60'::text as app_slug,
      (coalesce((select a.name from public.account_apps a where a.slug='tms60'),'TMS60') || ' · ' || upper(b.translation_id))::text as app_name,
      b.created_at as created_at,
      case
        when b.state_hash is null then 'unverified'
        when b.state_hash=encode(extensions.digest(b.state::text,'sha256'),'hex') then 'verified'
        else 'corrupted'
      end::text as backup_status,
      'manual'::text as backup_type,
      pg_column_size(b.state)::bigint as size_bytes,
      b.source_revision::bigint as source_revision,
      b.state_schema::integer as schema_version,
      jsonb_build_object(
        'translationId',b.translation_id,
        'deviceId',b.device_id
      ) as metadata
    from public.tms60_backups b
    where b.user_id=v_uid
  ) q
  order by q.created_at desc;
end;
$$;

revoke all on function public.get_thiepn_account_backup_inventory() from public, anon;
grant execute on function public.get_thiepn_account_backup_inventory() to authenticated;
