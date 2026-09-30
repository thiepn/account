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
    v_bytes := coalesce(v_bytes,0);
    v_backup_impact := 'WTTN checkpoint history is deleted together with the live cloud save. A revision tombstone remains to prevent stale-client resurrection.';
  elsif p_app_slug='tms60' then
    select coalesce(sum(pg_column_size(to_jsonb(s))),0)::bigint
    into v_bytes
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

revoke all on function public.plan_thiepn_app_data_deletion(text) from public, anon;
grant execute on function public.plan_thiepn_app_data_deletion(text) to authenticated;
