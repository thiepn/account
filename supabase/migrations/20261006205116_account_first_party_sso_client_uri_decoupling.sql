revoke all on function public.resolve_thiepn_first_party_oauth_client(uuid,text,text,text) from public, anon, authenticated;
drop function public.resolve_thiepn_first_party_oauth_client(uuid,text,text,text);

create or replace function public.resolve_thiepn_first_party_oauth_client(
  p_client_id uuid,
  p_redirect_uri text,
  p_scope text
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
  v_client_name text;
  v_client_uri text;
  v_redirect_uri text;
  v_automatic_identity_consent boolean;
  v_scope_item text;
  v_scopes text[];
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

  select c.app_slug,a.name,c.client_name,c.client_uri,c.redirect_uri,c.automatic_identity_consent
  into v_app_slug,v_app_name,v_client_name,v_client_uri,v_redirect_uri,v_automatic_identity_consent
  from public.account_first_party_oauth_clients c
  join public.account_apps a on a.slug=c.app_slug and a.active=true
  where c.oauth_client_id=p_client_id
    and c.active=true
    and c.redirect_uri=p_redirect_uri;

  if not found then
    raise exception 'first_party_oauth_client_unavailable' using errcode='22023';
  end if;

  v_scopes := regexp_split_to_array(trim(coalesce(p_scope,'email')), E'\\s+');
  if coalesce(array_length(v_scopes,1),0)=0 then
    raise exception 'first_party_oauth_scope_invalid' using errcode='22023';
  end if;

  foreach v_scope_item in array v_scopes loop
    if v_scope_item not in ('openid','email','profile','offline_access') then
      raise exception 'first_party_oauth_scope_invalid' using errcode='22023';
    end if;
  end loop;

  return jsonb_build_object(
    'clientId',p_client_id,
    'appSlug',v_app_slug,
    'appName',v_app_name,
    'clientName',v_client_name,
    'clientUri',v_client_uri,
    'redirectUri',v_redirect_uri,
    'automaticIdentityConsent',v_automatic_identity_consent
  );
end;
$function$;

revoke all on function public.resolve_thiepn_first_party_oauth_client(uuid,text,text) from public, anon;
grant execute on function public.resolve_thiepn_first_party_oauth_client(uuid,text,text) to authenticated;
