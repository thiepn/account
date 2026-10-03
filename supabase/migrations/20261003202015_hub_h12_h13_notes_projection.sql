-- H12 candidate. Not applied to the hosted project. Register/enable no client
-- until every existing raw-data policy has been checked for OAuth-client denial.

create table private.account_hub_clients (
  client_id uuid primary key,
  enabled boolean not null default false
);
create table private.account_hub_notes_consent (
  user_id uuid primary key references auth.users(id) on delete cascade,
  permissions text[] not null default '{}',
  revision uuid not null default gen_random_uuid(),
  updated_at timestamptz not null default now(),
  check (permissions <@ array['notes.hub.summary.read','notes.hub.continue.read','notes.hub.search.read']::text[])
);
alter table private.account_hub_clients enable row level security;
alter table private.account_hub_notes_consent enable row level security;
revoke all on private.account_hub_clients, private.account_hub_notes_consent from public, anon, authenticated;

create function public.get_thiepn_hub_notes_consent() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_result jsonb;
begin
  if v_uid is null or auth.jwt()->>'client_id' is not null then
    raise exception 'hub_consent_denied' using errcode='42501';
  end if;
  select jsonb_build_object('permissions', c.permissions, 'revision', c.revision)
    into v_result from private.account_hub_notes_consent c where c.user_id=v_uid;
  return coalesce(v_result, jsonb_build_object('permissions','[]'::jsonb,'revision',null));
end $$;

create function public.set_thiepn_hub_notes_consent(p_permissions text[], p_expected_revision uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_revision uuid; v_permissions text[];
begin
  if v_uid is null or auth.jwt()->>'client_id' is not null then
    raise exception 'hub_consent_denied' using errcode='42501';
  end if;
  if p_permissions is null or cardinality(p_permissions)>3 or
     array_position(p_permissions,null) is not null or
     not (p_permissions <@ array['notes.hub.summary.read','notes.hub.continue.read','notes.hub.search.read']::text[]) then
    raise exception 'hub_consent_invalid' using errcode='22023';
  end if;
  select coalesce(array_agg(distinct p order by p),'{}') into v_permissions from unnest(p_permissions) p;
  -- Revocation remains available during account deletion.
  if cardinality(v_permissions)>0 then
    perform private.account_assert_not_deletion_pending();
    if not exists(select 1 from auth.users u where u.id=v_uid and u.deleted_at is null and not u.is_anonymous and (u.banned_until is null or u.banned_until<=now())) then
      raise exception 'hub_account_restricted' using errcode='42501';
    end if;
    if not public.has_notes_sync_access() or not exists(select 1 from public.account_app_connections c where c.user_id=v_uid and c.app_slug='notes' and c.status='connected') or
       not exists(select 1 from public.account_app_grants g where g.user_id=v_uid and g.app_slug='notes' and g.permission_id='app_data.read' and g.status='granted') then
      raise exception 'hub_notes_unavailable' using errcode='42501';
    end if;
  end if;
  -- Serializes both first-time saves and updates for this owner only.
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text, 12012));
  select c.revision into v_revision from private.account_hub_notes_consent c where c.user_id=v_uid for update;
  if v_revision is distinct from p_expected_revision then
    raise exception 'hub_consent_changed' using errcode='40001';
  end if;
  insert into private.account_hub_notes_consent(user_id,permissions) values(v_uid,v_permissions)
  on conflict(user_id) do update set permissions=excluded.permissions, revision=gen_random_uuid(),updated_at=now();
  return public.get_thiepn_hub_notes_consent();
end $$;

create function public.authorize_thiepn_hub_notes(p_operation text, p_revision uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_claims jsonb := auth.jwt(); v_permissions text[]; v_exp numeric;
begin
  if v_uid is null or v_claims->>'aud' is distinct from 'authenticated' or
     v_claims->>'role' is distinct from 'authenticated' or
     v_claims->>'is_anonymous'='true' or
     p_operation not in ('summary','continue','search') or p_operation is null then
    return null;
  end if;
  if not exists(select 1 from private.account_hub_clients c where c.client_id::text=v_claims->>'client_id' and c.enabled) then return null; end if;
  if not exists(select 1 from auth.users u where u.id=v_uid and u.deleted_at is null and not u.is_anonymous and (u.banned_until is null or u.banned_until<=now())) then return null; end if;
  -- JWT authenticity is provided by PostgREST; current state is checked here.
  if not exists(select 1 from auth.sessions s where s.user_id=v_uid and s.id::text=v_claims->>'session_id' and (s.not_after is null or s.not_after>now())) then return null; end if;
  if exists(select 1 from public.account_deletion_requests r where r.user_id=v_uid and r.status in ('pending','deleting')) then return null; end if;
  if not public.has_notes_sync_access() or not exists(select 1 from public.account_app_connections c where c.user_id=v_uid and c.app_slug='notes' and c.status='connected') or
     not exists(select 1 from public.account_app_grants g where g.user_id=v_uid and g.app_slug='notes' and g.permission_id='app_data.read' and g.status='granted') then return null; end if;
  select c.permissions into v_permissions from private.account_hub_notes_consent c where c.user_id=v_uid and c.revision=p_revision;
  if v_permissions is null or not ('notes.hub.'||p_operation||'.read'=any(v_permissions)) then return null; end if;
  if coalesce(v_claims->>'exp','') !~ '^[0-9]{1,12}$' then return null; end if;
  v_exp := (v_claims->>'exp')::numeric;
  if v_exp <= extract(epoch from now()) then return null; end if;
  return jsonb_build_object('accountId',v_uid,'consumer','thiepn-hub','audience','notes-hub',
    'permissions',v_permissions,'grantRevision',p_revision,'expiresAt',v_exp*1000,
    'accountState','active','notesSyncAccess',true);
end $$;
revoke all on function public.get_thiepn_hub_notes_consent(), public.set_thiepn_hub_notes_consent(text[],uuid), public.authorize_thiepn_hub_notes(text,uuid) from public,anon,authenticated;
grant execute on function public.get_thiepn_hub_notes_consent(), public.set_thiepn_hub_notes_consent(text[],uuid), public.authorize_thiepn_hub_notes(text,uuid) to authenticated;

-- Disconnect or loss of the underlying Notes entitlement permanently revokes
-- Hub consent. Reconnecting Notes does not resurrect an earlier grant/revision.
create function private.revoke_hub_notes_on_entitlement_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_row jsonb; v_revoke boolean := false;
begin
  v_row := case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
  if v_row->>'app_slug'='notes' then
    if tg_table_name='account_app_connections' then
      v_revoke := tg_op='DELETE' or v_row->>'status' is distinct from 'connected';
    elsif tg_table_name='account_app_grants' and v_row->>'permission_id'='app_data.read' then
      v_revoke := tg_op='DELETE' or v_row->>'status' is distinct from 'granted';
    end if;
  end if;
  if v_revoke then
    update private.account_hub_notes_consent set permissions='{}', revision=gen_random_uuid(),updated_at=now()
      where user_id=(v_row->>'user_id')::uuid;
  end if;
  if tg_op='DELETE' then return old; else return new; end if;
end $$;
revoke all on function private.revoke_hub_notes_on_entitlement_change() from public,anon,authenticated;
create trigger hub_notes_connection_revocation after update of status or delete on public.account_app_connections
for each row execute function private.revoke_hub_notes_on_entitlement_change();
create trigger hub_notes_entitlement_revocation after update of status or delete on public.account_app_grants
for each row execute function private.revoke_hub_notes_on_entitlement_change();


-- Candidate for the canonical Account/Notes project, not Core's separate DB.
-- H12 consent SQL is a prerequisite. Do not enable OAuth issuance yet.

create table private.account_hub_notes_budget (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_started_at timestamptz not null,
  requests integer not null check (requests between 1 and 60)
);
alter table private.account_hub_notes_budget enable row level security;
revoke all on private.account_hub_notes_budget from public, anon, authenticated;

-- Existing first-party sync sessions keep their current policies. Every OAuth
-- client is denied raw Notes payloads even if a permissive owner policy matches.
create policy notes_sync_no_oauth_raw on public.notes_sync_records
as restrictive for all to authenticated
using (auth.jwt()->>'client_id' is null)
with check (auth.jwt()->>'client_id' is null);

create index notes_hub_recent_owner on public.notes_sync_records
(user_id, client_updated_at desc, entity_id)
where entity_type='note' and deleted_at is null
and payload->>'trashedAt' is null;

create function public.read_thiepn_hub_notes(p_operation text, p_revision uuid, p_query text default null)
returns jsonb language plpgsql security definer set search_path = ''
set lock_timeout = '200ms' set statement_timeout = '1s' as $$
declare v_uid uuid := auth.uid(); v_auth jsonb; v_pattern text; v_rows jsonb; v_budget integer;
begin
  if p_operation not in ('summary','continue','search') or p_operation is null or
     (p_operation='search' and (p_query is null or char_length(p_query)>256 or btrim(p_query)='' or p_query ~ '[[:cntrl:]]')) or
     (p_operation<>'search' and p_query is not null) then
    raise exception 'projection_unavailable' using errcode='22023';
  end if;
  -- Serialize consent saves; the row lock also serializes trigger revocation.
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text,12012));
  perform 1 from private.account_hub_notes_consent where user_id=v_uid for share;
  v_auth := public.authorize_thiepn_hub_notes(p_operation,p_revision);
  if v_auth is null then raise exception 'projection_unavailable' using errcode='42501'; end if;
  -- One row per owner, shared across functions/instances/tokens. No search text.
  insert into private.account_hub_notes_budget(user_id,window_started_at,requests)
    values(v_uid,clock_timestamp(),1)
  on conflict(user_id) do update set
    window_started_at=case when private.account_hub_notes_budget.window_started_at<=clock_timestamp()-interval '1 minute' then clock_timestamp() else private.account_hub_notes_budget.window_started_at end,
    requests=case when private.account_hub_notes_budget.window_started_at<=clock_timestamp()-interval '1 minute' then 1 else private.account_hub_notes_budget.requests+1 end
  where private.account_hub_notes_budget.window_started_at<=clock_timestamp()-interval '1 minute' or private.account_hub_notes_budget.requests<60
  returning requests into v_budget;
  if v_budget is null then raise exception 'projection_unavailable' using errcode='54000'; end if;
  if p_operation='search' then
    v_pattern := '%'||replace(replace(replace(btrim(p_query),E'\\',E'\\\\'),'%',E'\\%'),'_',E'\\_')||'%';
  end if;
  -- The definer bypass is deliberately confined to this metadata projection.
  -- No owner parameter, dynamic SQL, whole JSON payload, body or Storage access.
  select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) into v_rows from (
    select user_id::text,entity_type,left(entity_id::text,37) as entity_id,deleted_at,
      left(payload->>'id',37) as note_id,left(payload->>'type',10) as note_type,
      left(payload->>'title',501) as title,left(payload->>'updatedAt',32) as note_updated_at,
      left(payload->>'archivedAt',32) as archived_at,left(payload->>'trashedAt',32) as trashed_at,
      to_char(updated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as synced_at
    from public.notes_sync_records
    where user_id=v_uid and entity_type='note' and deleted_at is null
      and payload->>'trashedAt' is null
      and (case when p_operation='search' then payload->>'title' ilike v_pattern escape E'\\'
           else payload->>'archivedAt' is null end)
    order by client_updated_at desc,entity_id asc
    limit case when p_operation='search' then 20 else 10 end
  ) r;
  -- Check current lifecycle/entitlement again before releasing this transaction.
  if public.authorize_thiepn_hub_notes(p_operation,p_revision) is null then
    raise exception 'projection_unavailable' using errcode='42501';
  end if;
  return v_rows;
end $$;
revoke all on function public.read_thiepn_hub_notes(text,uuid,text) from public,anon,authenticated;
grant execute on function public.read_thiepn_hub_notes(text,uuid,text) to authenticated;

