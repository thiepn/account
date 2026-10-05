begin;
-- OAuth consumers use dedicated projections, never native Account management APIs.
-- Preserve each reviewed function's arguments, defaults, result shape and volatility.
-- Move the implementation out of the exposed schema; its public wrapper rejects
-- managed tokens before invoking any native implementation, including definers.
do $h20$
declare f record; args text; invocation text; result text; body text;
begin
 for f in select p.*, pg_get_function_arguments(p.oid) as declaration,
   pg_get_function_identity_arguments(p.oid) as identity,
   pg_get_function_result(p.oid) as result_type
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname=any(array[
 'cancel_thiepn_account_deletion','claim_notes_sync_access','connect_thiepn_app',
 'create_thiepn_account_backup','disable_notes_sync_access','disconnect_thiepn_app',
 'execute_thiepn_app_data_deletion','get_thiepn_account_auth_assurance',
 'get_thiepn_account_backup_inventory','get_thiepn_account_data_inventory',
 'get_thiepn_account_export_payload','list_notes_auth_sessions','list_thiepn_account_sessions',
 'notes_auth_identity_delete_status','plan_thiepn_account_deletion',
 'plan_thiepn_app_data_deletion','request_thiepn_account_deletion',
 'request_thiepn_account_export','set_thiepn_app_permission'])
 loop
   if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='private' and p.proname='h20_native_'||f.proname) then
     raise exception 'H20 native implementation name already exists: %',f.proname;
   end if;
   select coalesce(string_agg(format('$%s',i),','),'') into invocation
     from generate_series(1,f.pronargs) i;
   execute format('alter function public.%I(%s) rename to %I',f.proname,f.identity,'h20_native_'||f.proname);
   execute format('alter function public.%I(%s) set schema private','h20_native_'||f.proname,f.identity);
   execute format('revoke all on function private.%I(%s) from public,anon,authenticated','h20_native_'||f.proname,f.identity);
   body:=format('begin if auth.uid() is null or auth.jwt()->>''client_id'' is not null then raise exception ''native_account_required'' using errcode=''42501''; end if; %s private.%I(%s); end;',
      case when f.proretset then 'return query select * from' else 'return' end,
      'h20_native_'||f.proname,invocation);
   execute format('create function public.%I(%s) returns %s language plpgsql security definer %s set search_path='''' as %L',
     f.proname,f.declaration,f.result_type,
     case f.provolatile when 's' then 'stable' when 'i' then 'immutable' else 'volatile' end,body);
   execute format('revoke all on function public.%I(%s) from public,anon,authenticated',f.proname,f.identity);
   execute format('grant execute on function public.%I(%s) to authenticated',f.proname,f.identity);
 end loop;
end $h20$;

-- Native Account rows must not provide a second path around the guarded RPCs.
do $h20_tables$
declare t record;
begin
 for t in select c.relname,c.relrowsecurity from pg_class c
 join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relkind='r' and c.relname like 'account_%'
 and exists(select 1 from pg_attribute a where a.attrelid=c.oid and a.attname='user_id' and not a.attisdropped)
 loop
  if not t.relrowsecurity then raise exception 'Account table lacks RLS: %',t.relname;end if;
  execute format('create policy account_native_no_oauth on public.%I as restrictive for all to authenticated using ((select auth.jwt()->>''client_id'') is null) with check ((select auth.jwt()->>''client_id'') is null)',t.relname);
 end loop;
end $h20_tables$;

-- Existing native attachment policies remain authoritative. This restrictive
-- policy adds a denial for managed tokens on the Notes bucket only.
create policy notes_attachments_no_oauth on storage.objects as restrictive
for all to authenticated
using (bucket_id <> 'notes-attachments' or (select auth.jwt()->>'client_id') is null)
with check (bucket_id <> 'notes-attachments' or (select auth.jwt()->>'client_id') is null);
commit;
