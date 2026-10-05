begin;
-- All identities, client enablement and synced fixtures below are transaction-local.
create temporary table h17_ids as select gen_random_uuid() as owner,gen_random_uuid() as other,gen_random_uuid() as client,gen_random_uuid() as session,gen_random_uuid() as revision,gen_random_uuid() as note,gen_random_uuid() as reminder;
insert into auth.users(id) select owner from h17_ids union all select other from h17_ids;
insert into auth.sessions(id,user_id) select session,owner from h17_ids;
insert into notes_private.notes_sync_access(user_id) select owner from h17_ids;
insert into public.account_app_connections(user_id,app_slug) select owner,'notes' from h17_ids;
insert into public.account_app_grants(user_id,app_slug,permission_id,status) select owner,'notes','app_data.read','granted' from h17_ids;
insert into private.account_hub_clients(client_id,enabled) select client,true from h17_ids;
insert into private.account_hub_notes_consent(user_id,permissions,revision) select owner,array['notes.hub.summary.read','notes.hub.continue.read','notes.hub.search.read','notes.hub.inbox.read','notes.hub.inbox.attention.write'],revision from h17_ids;
select set_config('request.jwt.claims',jsonb_build_object('sub',owner,'client_id',client,'session_id',session,'aud','authenticated','role','authenticated','exp',floor(extract(epoch from now()))+3600)::text,true) from h17_ids;
insert into public.notes_sync_records(user_id,entity_type,entity_id,payload,payload_hash,client_updated_at)
select owner,'note',note::text,jsonb_build_object('id',note,'type','text','title','Fictional reminder note','content','BODY_MUST_NOT_LEAK','trashedAt',null),'fictional',1 from h17_ids
union all
select owner,'reminder',reminder::text,jsonb_build_object('id',reminder,'noteId',note,'dueAt',1,'createdAt',1,'status','active','completedAt',null,'dismissedAt',null),'fictional',1 from h17_ids;
create temporary table h17_results(name text,passed boolean);
do $$
declare ids record; response jsonb; first jsonb; updated text; req uuid:=gen_random_uuid(); before_payload jsonb; result2 jsonb;
begin
 select * into ids from h17_ids;
 response:=public.authorize_thiepn_hub_notes('summary',ids.revision);
 if jsonb_array_length(response->'permissions')<>3 then raise exception 'legacy permission projection broadened'; end if;
 insert into h17_results values('legacy Core permission response preserved',true);
 response:=public.thiepn_hub_notes_inbox(ids.revision,gen_random_uuid());
 if response->>'status'<>'ready' or response->'data'->'items'->0->>'title'<>'Fictional reminder note' or response::text like '%BODY_MUST_NOT_LEAK%' then raise exception 'projection failed'; end if;
 insert into h17_results values('real owner projection and body exclusion',true);
 first:=response->'data'->'items'->0; updated:=first->>'updatedAt';
 select payload into before_payload from public.notes_sync_records where user_id=ids.owner and entity_type='reminder';
 response:=public.thiepn_hub_notes_inbox(ids.revision,req,'mark-read',first->>'issueId',updated);
 if response->'data'->'items'->0->>'attention'<>'read' or response->'data'->'items'->0->>'state'<>'open' then raise exception 'read confirmation failed'; end if;
 result2:=public.thiepn_hub_notes_inbox(ids.revision,req,'mark-read',first->>'issueId',updated);
 if result2->'data' is distinct from response->'data' or (select count(*) from private.account_hub_notes_attention_receipts where user_id=ids.owner)<>1 then raise exception 'replay failed'; end if;
 insert into h17_results values('mark read and idempotent replay',true);
 begin
   perform public.thiepn_hub_notes_inbox(ids.revision,req,'dismiss',first->>'issueId',updated);
   raise exception 'changed replay accepted';
 exception when serialization_failure then insert into h17_results values('changed replay rejected',true); end;
 begin
   perform public.thiepn_hub_notes_inbox(ids.revision,gen_random_uuid(),'dismiss',first->>'issueId',updated);
   raise exception 'stale compare and set accepted';
 exception when serialization_failure then insert into h17_results values('stale action rejected',true); end;
 response:=public.thiepn_hub_notes_inbox(ids.revision,gen_random_uuid(),'dismiss',first->>'issueId',response->'data'->'items'->0->>'updatedAt');
 if response->'data'->'items'->0->>'attention'<>'dismissed' then raise exception 'dismiss tombstone missing'; end if;
 response:=public.thiepn_hub_notes_inbox(ids.revision,gen_random_uuid());
 if response->>'status'<>'empty' then raise exception 'dismissed item leaked'; end if;
 if (select payload from public.notes_sync_records where user_id=ids.owner and entity_type='reminder') is distinct from before_payload then raise exception 'native reminder changed'; end if;
 insert into h17_results values('dismissal tombstone and native lifecycle preservation',true);
 -- A new explicitly scheduled occurrence revives attention.
 update public.notes_sync_records set payload=jsonb_set(payload,'{dueAt}','2'),updated_at=clock_timestamp(),version=version+1 where user_id=ids.owner and entity_type='reminder';
 response:=public.thiepn_hub_notes_inbox(ids.revision,gen_random_uuid());
 if response->'data'->'items'->0->>'attention'<>'unread' then raise exception 'new occurrence hidden'; end if;
 insert into h17_results values('rescheduled occurrence is unread',true);
 update public.notes_sync_records set payload=jsonb_set(payload,'{trashedAt}','1') where user_id=ids.owner and entity_type='note';
 response:=public.thiepn_hub_notes_inbox(ids.revision,gen_random_uuid());
 if response->>'status'<>'empty' then raise exception 'trashed note projected'; end if;
 update public.notes_sync_records set payload=jsonb_set(payload,'{trashedAt}','null') where user_id=ids.owner and entity_type='note';
 update public.notes_sync_records set payload=jsonb_set(payload,'{dueAt}',to_jsonb(floor(extract(epoch from now())*1000)+60000)) where user_id=ids.owner and entity_type='reminder';
 response:=public.thiepn_hub_notes_inbox(ids.revision,gen_random_uuid());
 if response->>'status'<>'empty' then raise exception 'future reminder projected'; end if;
 insert into h17_results values('trashed and future reminders excluded',true);
 update public.notes_sync_records set payload=jsonb_set(payload,'{dueAt}','1') where user_id=ids.owner and entity_type='reminder';
 update public.notes_sync_records set payload=payload||'{"locked":true}'::jsonb where user_id=ids.owner and entity_type='note';
 response:=public.thiepn_hub_notes_inbox(ids.revision,gen_random_uuid());
 if response->>'status'<>'empty' then raise exception 'locked note projected'; end if;
 update public.notes_sync_records set payload=payload-'locked' where user_id=ids.owner and entity_type='note';
 update public.notes_sync_records set payload=jsonb_set(payload,'{dueAt}','"malformed"') where user_id=ids.owner and entity_type='reminder';
 response:=public.thiepn_hub_notes_inbox(ids.revision,gen_random_uuid());
 if response->>'status'<>'empty' then raise exception 'malformed date projected'; end if;
 insert into h17_results values('privacy markers and malformed reminder timestamps excluded',true);
 -- Current grant is checked by actual canonical authorization, not a fake helper.
 update private.account_hub_notes_consent set permissions=array['notes.hub.inbox.read'] where user_id=ids.owner;
 begin
  perform public.thiepn_hub_notes_inbox(ids.revision,gen_random_uuid(),'dismiss',first->>'issueId',updated);
  raise exception 'missing write grant accepted';
 exception when insufficient_privilege then insert into h17_results values('write grant independently enforced',true); end;
 update private.account_hub_notes_consent set revision=gen_random_uuid() where user_id=ids.owner;
 begin
  perform public.thiepn_hub_notes_inbox(ids.revision,gen_random_uuid()); raise exception 'revoked revision accepted';
 exception when insufficient_privilege then insert into h17_results values('revocation enforced',true); end;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ids.other,'client_id',ids.client,'session_id',ids.session,'aud','authenticated','role','authenticated','exp',floor(extract(epoch from now()))+3600)::text,true);
 begin
  perform public.thiepn_hub_notes_inbox(ids.revision,gen_random_uuid()); raise exception 'wrong owner accepted';
 exception when insufficient_privilege then insert into h17_results values('cross owner access denied',true); end;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ids.owner,'aud','authenticated','role','authenticated','exp',floor(extract(epoch from now()))+3600)::text,true);
 begin
  perform public.thiepn_hub_notes_inbox(ids.revision,gen_random_uuid()); raise exception 'ordinary token accepted';
 exception when insufficient_privilege then insert into h17_results values('ordinary native token denied',true); end;
end $$;
select jsonb_agg(to_jsonb(r)) as owner_tests from h17_results r;
rollback;
