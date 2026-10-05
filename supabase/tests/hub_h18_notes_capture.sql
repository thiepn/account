begin;
-- All identities, client enablement and synced fixtures below are transaction-local.
create temporary table h17_ids as select gen_random_uuid() as owner,gen_random_uuid() as other,gen_random_uuid() as client,gen_random_uuid() as session,gen_random_uuid() as revision,gen_random_uuid() as note,gen_random_uuid() as reminder;
insert into auth.users(id) select owner from h17_ids union all select other from h17_ids;
insert into auth.sessions(id,user_id) select session,owner from h17_ids;
insert into notes_private.notes_sync_access(user_id) select owner from h17_ids;
insert into public.account_app_connections(user_id,app_slug) select owner,'notes' from h17_ids;
insert into public.account_app_grants(user_id,app_slug,permission_id,status) select owner,'notes','app_data.read','granted' from h17_ids;
insert into private.account_hub_clients(client_id,enabled) select client,true from h17_ids;
insert into private.account_hub_notes_consent(user_id,permissions,revision) select owner,array['notes.hub.summary.read','notes.hub.continue.read','notes.hub.search.read','notes.hub.inbox.read','notes.hub.inbox.attention.write','notes.hub.capture.create'],revision from h17_ids;
select set_config('request.jwt.claims',jsonb_build_object('sub',owner,'client_id',client,'session_id',session,'aud','authenticated','role','authenticated','exp',floor(extract(epoch from now()))+3600)::text,true) from h17_ids;
insert into public.account_app_grants(user_id,app_slug,permission_id,status) select owner,'notes','app_data.write','granted' from h17_ids;
create temporary table h18_results(name text,passed boolean,payload jsonb,hash text);

do $$
declare ids record; req uuid:=gen_random_uuid(); r jsonb; again jsonb; note_payload jsonb;
begin
 select * into ids from h17_ids;
 r:=public.thiepn_hub_notes_capture(ids.revision,req,'notes:unfiled','Fictional capture','Unicode: 한글 café "quote" newline'||chr(10));
 again:=public.thiepn_hub_notes_capture(ids.revision,req,'notes:unfiled','Fictional capture','Unicode: 한글 café "quote" newline'||chr(10));
 if r<>again or (select count(*) from public.notes_sync_records where user_id=ids.owner)<>1 then raise exception 'duplicate capture';end if;
 insert into h18_results(name,passed) values('durable exact-command replay creates one native note',true);
 select payload into note_payload from public.notes_sync_records where user_id=ids.owner;
 if note_payload->>'type'<>'text' or (select count(*) from jsonb_object_keys(note_payload))<>12 then raise exception 'native schema incompatible';end if;
 insert into h18_results(name,passed,payload,hash) select 'native Notes text record fields',true,payload,payload_hash from public.notes_sync_records where user_id=ids.owner;
 begin
  perform public.thiepn_hub_notes_capture(ids.revision,req,'notes:unfiled','Changed','body');raise exception 'changed command accepted';
 exception when serialization_failure then insert into h18_results(name,passed) values('changed replay rejected',true);end;
 delete from public.notes_sync_records where user_id=ids.owner;
 again:=public.thiepn_hub_notes_capture(ids.revision,req,'notes:unfiled','Fictional capture','Unicode: 한글 café "quote" newline'||chr(10));
 if again<>r or exists(select 1 from public.notes_sync_records where user_id=ids.owner) then raise exception 'deleted capture resurrected';end if;
 insert into h18_results(name,passed) values('receipt does not resurrect a deleted note',true);
 update public.account_app_grants set status='denied' where user_id=ids.owner and permission_id='app_data.write';
 begin
  perform public.thiepn_hub_notes_capture(ids.revision,gen_random_uuid(),'notes:unfiled','a','b');raise exception 'missing app write accepted';
 exception when insufficient_privilege then insert into h18_results(name,passed) values('native app write grant enforced',true);end;
 update public.account_app_grants set status='granted' where user_id=ids.owner and permission_id='app_data.write';
 update private.account_hub_notes_consent set permissions=array['notes.hub.inbox.read'] where user_id=ids.owner;
 begin
  perform public.thiepn_hub_notes_capture(ids.revision,gen_random_uuid(),'notes:unfiled','a','b');raise exception 'missing capture consent accepted';
 exception when insufficient_privilege then insert into h18_results(name,passed) values('create consent independent of Inbox read',true);end;
 update private.account_hub_notes_consent set permissions=array['notes.hub.capture.create'] where user_id=ids.owner;
 begin
  perform public.thiepn_hub_notes_capture(ids.revision,gen_random_uuid(),'notes:other','a','b');raise exception 'unknown destination accepted';
 exception when invalid_parameter_value then insert into h18_results(name,passed) values('destination allowlist enforced',true);end;
 begin
  perform public.thiepn_hub_notes_capture(ids.revision,gen_random_uuid(),'notes:unfiled','',repeat('a',16001));raise exception 'oversize accepted';
 exception when invalid_parameter_value then insert into h18_results(name,passed) values('text bounds enforced',true);end;
 update private.account_hub_notes_consent set revision=gen_random_uuid() where user_id=ids.owner;
 begin
  perform public.thiepn_hub_notes_capture(ids.revision,req,'notes:unfiled','Fictional capture','Unicode: 한글 café "quote" newline'||chr(10));raise exception 'revoked replay accepted';
 exception when insufficient_privilege then insert into h18_results(name,passed) values('revocation enforced even for receipt lookup',true);end;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',ids.owner,'session_id',ids.session,'aud','authenticated','role','authenticated','exp',floor(extract(epoch from now()))+3600)::text,true);
 begin
  perform public.thiepn_hub_notes_capture(ids.revision,gen_random_uuid(),'notes:unfiled','a','b');raise exception 'native token accepted';
 exception when insufficient_privilege then insert into h18_results(name,passed) values('native tokens cannot impersonate consumer',true);end;
end $$;
select jsonb_agg(to_jsonb(r) order by name) as assertions from h18_results r;
rollback;
