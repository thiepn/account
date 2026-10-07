create or replace function private.assert_account_registry_identity_contract()
returns trigger
language plpgsql
set search_path=''
as $function$
declare
  v_app_slug text := coalesce(new.app_slug,old.app_slug);
begin
  if v_app_slug is null then
    return null;
  end if;

  if exists (
    select 1
    from public.account_apps a
    join public.account_app_manifests m on m.app_slug=a.slug
    where a.slug=v_app_slug
      and a.active=true
      and m.capabilities @> '{"account":true}'::jsonb
  )
  and not exists (
    select 1
    from public.account_app_permissions p
    where p.app_slug=v_app_slug
      and p.permission_id='identity.basic'
      and p.active=true
      and p.required=true
      and p.mutable_by_user=false
      and p.sensitivity='basic'
  ) then
    raise exception 'account_registry_identity_contract_violation:%',v_app_slug
      using errcode='23514';
  end if;

  return null;
end;
$function$;

revoke all on function private.assert_account_registry_identity_contract() from public;

drop trigger if exists account_registry_identity_manifest_contract
  on public.account_app_manifests;
create constraint trigger account_registry_identity_manifest_contract
after insert or update
on public.account_app_manifests
deferrable initially deferred
for each row
execute function private.assert_account_registry_identity_contract();

drop trigger if exists account_registry_identity_permission_contract
  on public.account_app_permissions;
create constraint trigger account_registry_identity_permission_contract
after insert or update or delete
on public.account_app_permissions
deferrable initially deferred
for each row
execute function private.assert_account_registry_identity_contract();
