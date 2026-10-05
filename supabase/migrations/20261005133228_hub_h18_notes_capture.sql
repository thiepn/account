begin;
alter table private.account_hub_notes_consent drop constraint account_hub_notes_consent_permissions_check;
alter table private.account_hub_notes_consent add constraint account_hub_notes_consent_permissions_check check (permissions <@ array['notes.hub.summary.read','notes.hub.continue.read','notes.hub.search.read','notes.hub.inbox.read','notes.hub.inbox.attention.write','notes.hub.capture.create']::text[]);
create or replace function public.set_thiepn_hub_notes_consent(p_permissions text[], p_expected_revision uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_revision uuid; v_permissions text[];
begin
  if v_uid is null or auth.jwt()->>'client_id' is not null then
    raise exception 'hub_consent_denied' using errcode='42501';
  end if;
  if p_permissions is null or cardinality(p_permissions)>6 or
     array_position(p_permissions,null) is not null or
     not (p_permissions <@ array['notes.hub.summary.read','notes.hub.continue.read','notes.hub.search.read','notes.hub.inbox.read','notes.hub.inbox.attention.write','notes.hub.capture.create']::text[]) then
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


create table private.account_hub_notes_capture_receipts (
 user_id uuid not null references auth.users(id) on delete cascade,
 request_id uuid not null,
 command_hash text not null,
 note_id uuid not null,
 created_at bigint not null,
 primary key(user_id,request_id)
);
alter table private.account_hub_notes_capture_receipts enable row level security;
revoke all on private.account_hub_notes_capture_receipts from public,anon,authenticated;

create function private.hub_notes_capture_authorized(p_revision uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); j jsonb:=auth.jwt();
begin
 return u is not null and j->>'aud'='authenticated' and j->>'role'='authenticated' and coalesce(j->>'is_anonymous','false')<>'true'
 and coalesce(j->>'exp','') ~ '^[0-9]{1,12}$'
 and case when coalesce(j->>'exp','') ~ '^[0-9]{1,12}$' then (j->>'exp')::numeric>extract(epoch from now()) else false end
 and exists(select 1 from private.account_hub_clients c where c.client_id::text=j->>'client_id' and c.enabled)
 and exists(select 1 from auth.users a where a.id=u and a.deleted_at is null and not a.is_anonymous and (a.banned_until is null or a.banned_until<=now()))
 and exists(select 1 from auth.sessions a where a.user_id=u and a.id::text=j->>'session_id' and (a.not_after is null or a.not_after>now()))
 and not exists(select 1 from public.account_deletion_requests a where a.user_id=u and a.status in ('pending','deleting'))
 and public.has_notes_sync_access()
 and exists(select 1 from public.account_app_connections c where c.user_id=u and c.app_slug='notes' and c.status='connected')
 and exists(select 1 from public.account_app_grants g where g.user_id=u and g.app_slug='notes' and g.permission_id='app_data.read' and g.status='granted')
 and exists(select 1 from public.account_app_grants g where g.user_id=u and g.app_slug='notes' and g.permission_id='app_data.write' and g.status='granted')
 and exists(select 1 from private.account_hub_notes_consent c where c.user_id=u and c.revision=p_revision and 'notes.hub.capture.create'=any(c.permissions));
end $$;
revoke all on function private.hub_notes_capture_authorized(uuid) from public,anon,authenticated;

create function public.thiepn_hub_notes_capture(p_revision uuid,p_request_id uuid,p_destination text,p_title text,p_content text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); h text; receipt private.account_hub_notes_capture_receipts%rowtype; payload jsonb; canonical text; t bigint; n uuid;
begin
 if u is null or p_request_id is null or p_revision is null or p_destination is distinct from 'notes:unfiled'
 or p_title is null or p_content is null or char_length(p_title)>500 or octet_length(p_title)>2000 or char_length(p_content)>16000 or octet_length(p_content)>64000
 or (btrim(p_title)='' and btrim(p_content)='') then raise exception 'hub_capture_invalid' using errcode='22023'; end if;
 -- Locks serialize consent changes and underlying write-grant revocation.
 perform 1 from public.account_app_grants where user_id=u and app_slug='notes' for share;
 perform pg_advisory_xact_lock(hashtextextended(u::text,12012));
 perform 1 from private.account_hub_notes_consent where user_id=u for share;
 if not coalesce(private.hub_notes_capture_authorized(p_revision),false) then raise exception 'hub_capture_denied' using errcode='42501'; end if;
 h:=encode(sha256(convert_to(jsonb_build_array(p_destination,p_title,p_content)::text,'UTF8')),'hex');
 select * into receipt from private.account_hub_notes_capture_receipts where user_id=u and request_id=p_request_id;
 if found then
  if receipt.command_hash is distinct from h then raise exception 'hub_capture_changed' using errcode='40001'; end if;
 else
  -- Never expire receipts: an old retry must not recreate a deleted/edited note.
  if (select count(*) from private.account_hub_notes_capture_receipts where user_id=u)>=4096 then raise exception 'hub_capture_capacity' using errcode='54000'; end if;
  t:=floor(extract(epoch from clock_timestamp())*1000)::bigint; n:=gen_random_uuid();
  payload:=jsonb_build_object('id',n,'type','text','title',p_title,'content',p_content,'color','default','createdAt',t,'updatedAt',t,'pinnedAt',null,'archivedAt',null,'trashedAt',null,'position',0,'revision',1);
  -- Match native Notes stableStringify: sorted keys, no separator whitespace.
  select '{'||string_agg(to_jsonb(key)::text||':'||value::text,',' order by key collate "C")||'}' into canonical from jsonb_each(payload);
  insert into public.notes_sync_records(user_id,entity_type,entity_id,payload,payload_hash,client_updated_at)
  values(u,'note',n::text,payload,encode(sha256(convert_to(canonical,'UTF8')),'hex'),t);
  insert into private.account_hub_notes_capture_receipts(user_id,request_id,command_hash,note_id,created_at) values(u,p_request_id,h,n,t) returning * into receipt;
 end if;
 if not coalesce(private.hub_notes_capture_authorized(p_revision),false) then raise exception 'hub_capture_denied' using errcode='42501'; end if;
 return jsonb_build_object('schemaVersion',1,'accountId',u,'grantRevision',p_revision,'requestId',p_request_id,'destination','notes:unfiled','noteId',receipt.note_id,'createdAt',receipt.created_at,'status','confirmed');
end $$;
revoke all on function public.thiepn_hub_notes_capture(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.thiepn_hub_notes_capture(uuid,uuid,text,text,text) to authenticated;
commit;
