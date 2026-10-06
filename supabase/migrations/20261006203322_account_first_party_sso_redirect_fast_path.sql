create or replace function public.resolve_thiepn_first_party_oauth_redirect(
  p_redirect_uri text
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_app_slug text;
  v_app_name text;
  v_client_id uuid;
  v_client_name text;
  v_client_uri text;
  v_redirect_uri text;
begin
  if (select auth.uid()) is null then
    raise exception 'not_authenticated' using errcode='42501';
  end if;
  if coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false) then
    raise exception 'anonymous_identity_not_supported' using errcode='42501';
  end if;
  if (((select auth.jwt())->>'client_id')) is not null then
    raise exception 'native_account_session_required' using errcode='42501';
  end if;

  select c.app_slug,a.name,c.oauth_client_id,c.client_name,c.client_uri,c.redirect_uri
  into v_app_slug,v_app_name,v_client_id,v_client_name,v_client_uri,v_redirect_uri
  from public.account_first_party_oauth_clients c
  join public.account_apps a on a.slug=c.app_slug and a.active=true
  where c.redirect_uri=p_redirect_uri
    and c.active=true;

  if not found then
    raise exception 'first_party_oauth_client_unavailable' using errcode='22023';
  end if;

  return jsonb_build_object(
    'clientId',v_client_id,
    'appSlug',v_app_slug,
    'appName',v_app_name,
    'clientName',v_client_name,
    'clientUri',v_client_uri,
    'redirectUri',v_redirect_uri,
    'automaticIdentityConsent',true
  );
end;
$function$;

revoke all on function public.resolve_thiepn_first_party_oauth_redirect(text) from public, anon;
grant execute on function public.resolve_thiepn_first_party_oauth_redirect(text) to authenticated;

create unique index if not exists account_first_party_oauth_clients_redirect_uidx
  on public.account_first_party_oauth_clients(redirect_uri)
  where active=true;
