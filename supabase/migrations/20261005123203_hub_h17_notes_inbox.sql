begin;
alter table private.account_hub_notes_consent drop constraint account_hub_notes_consent_permissions_check;
alter table private.account_hub_notes_consent add constraint account_hub_notes_consent_permissions_check check (permissions <@ array['notes.hub.summary.read','notes.hub.continue.read','notes.hub.search.read','notes.hub.inbox.read','notes.hub.inbox.attention.write']::text[]);
create or replace function public.set_thiepn_hub_notes_consent(p_permissions text[], p_expected_revision uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_revision uuid; v_permissions text[];
begin
  if v_uid is null or auth.jwt()->>'client_id' is not null then
    raise exception 'hub_consent_denied' using errcode='42501';
  end if;
  if p_permissions is null or cardinality(p_permissions)>5 or
     array_position(p_permissions,null) is not null or
     not (p_permissions <@ array['notes.hub.summary.read','notes.hub.continue.read','notes.hub.search.read','notes.hub.inbox.read','notes.hub.inbox.attention.write']::text[]) then
    raise exception 'hub_consent_invalid' using errcode='22023';
  end if;
  if 'notes.hub.inbox.attention.write'=any(p_permissions) and not ('notes.hub.inbox.read'=any(p_permissions)) then raise exception 'hub_consent_invalid' using errcode='22023'; end if;
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

create or replace function public.authorize_thiepn_hub_notes(p_operation text, p_revision uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_claims jsonb := auth.jwt(); v_permissions text[]; v_exp numeric;
begin
  if v_uid is null or v_claims->>'aud' is distinct from 'authenticated' or
     v_claims->>'role' is distinct from 'authenticated' or
     v_claims->>'is_anonymous'='true' or
     p_operation not in ('summary','continue','search','inbox') or p_operation is null then
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

-- Attention is separate from native reminder lifecycle. Only narrow RPCs access it.
create table private.account_hub_notes_attention (
  user_id uuid not null references auth.users(id) on delete cascade,
  entity_type text not null default 'reminder' check (entity_type='reminder'),
  reminder_id text not null,
  generation text not null,
  attention text not null check (attention in ('read','dismissed')),
  updated_at timestamptz not null,
  primary key(user_id,reminder_id),
  foreign key(user_id,entity_type,reminder_id) references public.notes_sync_records(user_id,entity_type,entity_id) on delete cascade
);
create table private.account_hub_notes_attention_receipts (
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  command jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key(user_id,request_id)
);
alter table private.account_hub_notes_attention enable row level security;
alter table private.account_hub_notes_attention_receipts enable row level security;
revoke all on private.account_hub_notes_attention,private.account_hub_notes_attention_receipts from public,anon,authenticated;

-- Internal projection; never return note bodies or unbounded JSON payloads.
create function private.hub_notes_attention_items(p_uid uuid)
returns table(issue_id text,dedupe_key text,title text,generation text,attention text,updated_at timestamptz,reminder_id text)
language sql stable security definer set search_path='' as $$
  select 'reminder:'||r.entity_id,'reminder:'||r.entity_id,
    coalesce(nullif(left(regexp_replace(n.payload->>'title','[[:cntrl:]]',' ','g'),160),''),'Notes reminder'),
    (r.payload->>'dueAt')||':'||(r.payload->>'createdAt'),
    case when a.generation=(r.payload->>'dueAt')||':'||(r.payload->>'createdAt') then coalesce(a.attention,'unread') else 'unread' end,
    greatest(r.updated_at,n.updated_at,case when a.generation=(r.payload->>'dueAt')||':'||(r.payload->>'createdAt') then a.updated_at else null end),
    r.entity_id
  from public.notes_sync_records r
  join public.notes_sync_records n on n.user_id=r.user_id and n.entity_type='note' and n.entity_id=r.payload->>'noteId'
  left join private.account_hub_notes_attention a on a.user_id=r.user_id and a.reminder_id=r.entity_id
  where r.user_id=p_uid and r.entity_type='reminder' and r.deleted_at is null and n.deleted_at is null
    and r.entity_id ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    and r.payload->>'id'=r.entity_id and n.payload->>'id'=n.entity_id
    and r.payload->>'status'='active' and r.payload->>'completedAt' is null and r.payload->>'dismissedAt' is null
    and n.payload->>'trashedAt' is null
    and n.payload->>'type' in ('text','checklist')
    and (case when r.payload->>'dueAt' ~ '^[0-9]{1,16}$' then (r.payload->>'dueAt')::numeric between 0 and least(8640000000000000, floor(extract(epoch from statement_timestamp())*1000)) else false end)
    and (case when r.payload->>'createdAt' ~ '^[0-9]{1,16}$' then (r.payload->>'createdAt')::numeric between 0 and 8640000000000000 else false end)
    -- Fail closed if a later owner schema adds a per-note privacy/lock marker.
    and not (n.payload ?| array['locked','isLocked','encrypted','private','isPrivate']);
$$;
revoke all on function private.hub_notes_attention_items(uuid) from public,anon,authenticated;

create function public.thiepn_hub_notes_inbox(
  p_revision uuid,p_request_id uuid,p_action text default null,
  p_issue_id text default null,p_expected_updated_at text default null
) returns jsonb language plpgsql security definer set search_path=''
set lock_timeout='200ms' set statement_timeout='1s' as $$
declare
  v_uid uuid:=auth.uid(); v_auth jsonb; v_item record; v_items jsonb; v_result jsonb;
  v_observed timestamptz; v_exp timestamptz; v_budget integer; v_command jsonb; v_previous jsonb; v_target text;
begin
  if p_request_id is null or p_revision is null or
    (p_action is null and (p_issue_id is not null or p_expected_updated_at is not null)) or
    (p_action is not null and (p_action not in ('mark-read','dismiss') or p_issue_id is null or char_length(p_issue_id)>128 or
      p_expected_updated_at is null or p_expected_updated_at !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$')) then
    raise exception 'inbox_unavailable' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text,12012));
  perform 1 from private.account_hub_notes_consent where user_id=v_uid for share;
  v_auth:=public.authorize_thiepn_hub_notes('inbox',p_revision);
  if v_auth is null then raise exception 'inbox_unavailable' using errcode='42501'; end if;
  if p_action is not null and not (v_auth->'permissions' ? 'notes.hub.inbox.attention.write') then
    raise exception 'inbox_unavailable' using errcode='42501';
  end if;
  insert into private.account_hub_notes_budget(user_id,window_started_at,requests) values(v_uid,clock_timestamp(),1)
    on conflict(user_id) do update set
      window_started_at=case when private.account_hub_notes_budget.window_started_at<=clock_timestamp()-interval '1 minute' then clock_timestamp() else private.account_hub_notes_budget.window_started_at end,
      requests=case when private.account_hub_notes_budget.window_started_at<=clock_timestamp()-interval '1 minute' then 1 else private.account_hub_notes_budget.requests+1 end
    where private.account_hub_notes_budget.window_started_at<=clock_timestamp()-interval '1 minute' or private.account_hub_notes_budget.requests<60
    returning requests into v_budget;
  if v_budget is null then raise exception 'inbox_unavailable' using errcode='54000'; end if;
  if p_action is not null then
    select * into v_item from private.hub_notes_attention_items(v_uid) where issue_id=p_issue_id;
    if not found then raise exception 'inbox_changed' using errcode='40001'; end if;
    -- Lock both native records: sync/removal cannot race the attention write.
    perform 1 from public.notes_sync_records r where r.user_id=v_uid and
      ((r.entity_type='reminder' and r.entity_id=v_item.reminder_id) or
       (r.entity_type='note' and r.entity_id=(select payload->>'noteId' from public.notes_sync_records where user_id=v_uid and entity_type='reminder' and entity_id=v_item.reminder_id)))
      order by entity_type,entity_id for share;
    select * into v_item from private.hub_notes_attention_items(v_uid) where issue_id=p_issue_id;
    if not found then raise exception 'inbox_changed' using errcode='40001'; end if;
    v_command:=jsonb_build_object('revision',p_revision,'issueId',p_issue_id,'action',p_action,'expectedUpdatedAt',p_expected_updated_at,'generation',v_item.generation);
    select command into v_previous from private.account_hub_notes_attention_receipts where user_id=v_uid and request_id=p_request_id;
    if found then
      if v_previous is distinct from v_command or v_item.attention is distinct from (case when p_action='dismiss' then 'dismissed' else 'read' end) then
        raise exception 'inbox_changed' using errcode='40001';
      end if;
    else
      if to_char(v_item.updated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') is distinct from p_expected_updated_at or v_item.attention='dismissed' then
        raise exception 'inbox_changed' using errcode='40001';
      end if;
      delete from private.account_hub_notes_attention_receipts where user_id=v_uid and created_at<clock_timestamp()-interval '24 hours';
      if (select count(*) from private.account_hub_notes_attention_receipts where user_id=v_uid)>=4096 then
        raise exception 'inbox_unavailable' using errcode='54000';
      end if;
      insert into private.account_hub_notes_attention(user_id,reminder_id,generation,attention,updated_at)
        values(v_uid,v_item.reminder_id,v_item.generation,case when p_action='dismiss' then 'dismissed' else 'read' end,
          greatest(clock_timestamp(),v_item.updated_at+interval '1 millisecond'))
        on conflict(user_id,reminder_id) do update set generation=excluded.generation,attention=excluded.attention,updated_at=excluded.updated_at;
      insert into private.account_hub_notes_attention_receipts(user_id,request_id,command) values(v_uid,p_request_id,v_command);
    end if;
    v_target:=p_issue_id;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('issueId',x.issue_id,'dedupeKey',x.dedupe_key,'title',x.title,
    'type','reminder','severity','normal','state','open','attention',x.attention,
    'updatedAt',to_char(x.updated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'expiresAt',null,'actionKey','open')),'[]'::jsonb)
    into v_items from (select * from private.hub_notes_attention_items(v_uid)
      where attention<>'dismissed' or issue_id=v_target
      order by (issue_id=v_target) desc nulls last,updated_at desc,issue_id limit 10) x;
  if public.authorize_thiepn_hub_notes('inbox',p_revision) is null then raise exception 'inbox_unavailable' using errcode='42501'; end if;
  v_observed:=clock_timestamp();
  v_exp:=least(v_observed+interval '120 seconds',to_timestamp((v_auth->>'expiresAt')::numeric/1000));
  if v_exp<=v_observed then raise exception 'inbox_unavailable' using errcode='42501'; end if;
  v_result:=jsonb_build_object('schemaVersion',1,'providerId','notes','operation','inbox','requestId',p_request_id,
    'context',jsonb_build_object('scope','account','accountId',v_uid,'workspaceId',null,'grantRevision',p_revision,'translationId',null),
    'privacy','private','coverage','cloud-snapshot','status',case when jsonb_array_length(v_items)=0 then 'empty' else 'ready' end,
    'observedAt',to_char(v_observed at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'expiresAt',to_char(v_exp at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'sourceUpdatedAt',null,'data',jsonb_build_object('items',v_items));
  if octet_length(v_result::text)>32768 then raise exception 'inbox_unavailable' using errcode='54000'; end if;
  return v_result;
end $$;
revoke all on function public.thiepn_hub_notes_inbox(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.thiepn_hub_notes_inbox(uuid,uuid,text,text,text) to authenticated;
commit;
