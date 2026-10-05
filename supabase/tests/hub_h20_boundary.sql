begin;
-- Fictional identities and rows only; every mutation is rolled back.
create temporary table h20_ids as select gen_random_uuid() owner,gen_random_uuid() other,
 gen_random_uuid() client,gen_random_uuid() session,gen_random_uuid() revision;
insert into auth.users(id) select owner from h20_ids union all select other from h20_ids;
insert into auth.sessions(id,user_id) select session,owner from h20_ids;
insert into notes_private.notes_sync_access(user_id) select owner from h20_ids;
insert into public.account_app_connections(user_id,app_slug) select owner,'notes' from h20_ids;
insert into public.account_app_grants(user_id,app_slug,permission_id,status)
 select owner,'notes',p,'granted' from h20_ids cross join unnest(array['app_data.read','app_data.write']) p;
insert into private.account_hub_clients(client_id,enabled) select client,true from h20_ids;
insert into private.account_hub_notes_consent(user_id,permissions,revision)
 select owner,array['notes.hub.capture.create'],revision from h20_ids;
insert into public.notes_sync_records(user_id,entity_type,entity_id,payload,payload_hash,client_updated_at)
 select u,'note',gen_random_uuid()::text,'{"content":"H20_FICTIONAL"}'::jsonb,'fixture',1
 from h20_ids cross join lateral unnest(array[owner,other]) u;
insert into public.tms60_sync_state(user_id,state_schema,state,client_updated_at)
 select owner,6,'{}',1 from h20_ids;
insert into public.library_sync_state(user_id,state) select owner,'{}' from h20_ids;
insert into storage.objects(bucket_id,name) select 'notes-attachments',owner::text||'/h20-fixture.txt' from h20_ids;
create temporary table h20_results(name text primary key,passed boolean not null check(passed));
grant select on h20_ids to authenticated;
grant select,insert on h20_results to authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',owner,'session_id',session,
 'role','authenticated','aud','authenticated','exp',floor(extract(epoch from now()))+3600)::text,true) from h20_ids;
set local role authenticated;
do $$begin
 if (select count(*) from public.notes_sync_records)<>1 then raise exception 'native Notes access or owner isolation changed';end if;
 if not exists(select 1 from storage.objects where bucket_id='notes-attachments' and name=auth.uid()::text||'/h20-fixture.txt') then raise exception 'native attachment access changed';end if;
 if not exists(select 1 from public.get_thiepn_account_data_inventory() where app_slug='notes') then raise exception 'native inventory changed';end if;
 insert into h20_results values('native Notes, attachment and inventory remain available to their owner',true);
end $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',owner,'session_id',session,'client_id',client,
 'role','authenticated','aud','authenticated','exp',floor(extract(epoch from now()))+3600)::text,true) from h20_ids;
set local role authenticated;
do $$declare f record; args text; n integer; ids record; r jsonb;
begin
 if exists(select 1 from public.notes_sync_records) or exists(select 1 from public.tms60_sync_state) or exists(select 1 from public.library_sync_state) then raise exception 'managed raw rows visible';end if;
 insert into h20_results values('managed raw Notes, TMS60 and Library reads denied',true);
 if exists(select 1 from public.account_app_grants) or exists(select 1 from public.account_app_connections) then raise exception 'managed Account rows visible';end if;
 insert into h20_results values('managed native Account rows denied',true);
 if exists(select 1 from storage.objects where bucket_id='notes-attachments') then raise exception 'managed attachments visible';end if;
 insert into h20_results values('managed attachment reads denied',true);
 begin
  insert into storage.objects(bucket_id,name) values('notes-attachments',auth.uid()::text||'/h20-managed.txt');
  raise exception 'managed attachment write accepted';
 exception when insufficient_privilege then insert into h20_results values('managed attachment insert denied',true);end;
 update storage.objects set metadata='{"h20":true}' where bucket_id='notes-attachments';
 get diagnostics n=row_count;if n<>0 then raise exception 'managed attachment update accepted';end if;
 begin
  delete from storage.objects where bucket_id='notes-attachments';
  get diagnostics n=row_count;if n<>0 then raise exception 'managed attachment delete accepted';end if;
 exception when insufficient_privilege then null; -- Storage also guards direct deletion.
 end;
 insert into h20_results values('managed attachment update and delete denied',true);
 for f in select p.* from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and exists(select 1 from pg_proc q join pg_namespace m on m.oid=q.pronamespace where m.nspname='private' and q.proname='h20_native_'||p.proname)
 loop
  select coalesce(string_agg('null::'||format_type(t,null),',' order by i),'') into args from unnest(f.proargtypes::oid[]) with ordinality a(t,i);
  begin
   execute format('select public.%I(%s)',f.proname,args);raise exception 'managed native RPC accepted: %',f.proname;
  exception when insufficient_privilege then insert into h20_results values('managed native RPC denied: '||f.proname,true);end;
 end loop;
 select * into ids from h20_ids;
 r:=public.thiepn_hub_notes_capture(ids.revision,gen_random_uuid(),'notes:unfiled','Fictional H20','Owner-confirmed boundary test');
 if r->>'accountId'<>ids.owner::text or r->>'status'<>'confirmed' then raise exception 'scoped capture unavailable';end if;
 insert into h20_results values('scoped owner capture succeeds under authenticated role',true);
end $$;
reset role;
delete from auth.sessions where id=(select session from h20_ids);
set local role authenticated;
do $$declare ids record;begin
 select * into ids from h20_ids;
 begin perform public.thiepn_hub_notes_capture(ids.revision,gen_random_uuid(),'notes:unfiled','a','b');raise exception 'revoked session accepted';
 exception when insufficient_privilege then insert into h20_results values('revoked session rejects scoped capture',true);end;
end $$;
reset role;
do $$begin
 if (select count(*) from h20_results where name like 'managed native RPC denied:%')<>19 then raise exception 'native RPC qualification incomplete';end if;
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname like 'h20_native_%' and (has_function_privilege('anon',p.oid,'execute') or has_function_privilege('authenticated',p.oid,'execute'))) then raise exception 'private implementation exposed';end if;
 insert into h20_results values('private native implementations inaccessible to API roles',true);
end $$;
select jsonb_agg(to_jsonb(r) order by name) as assertions from h20_results r;
rollback;
