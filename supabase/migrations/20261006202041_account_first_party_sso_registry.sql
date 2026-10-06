create table if not exists public.account_first_party_oauth_clients (
  oauth_client_id uuid primary key,
  app_slug text not null references public.account_apps(slug) on delete cascade,
  client_name text not null,
  client_uri text not null,
  redirect_uri text not null,
  automatic_identity_consent boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (app_slug, redirect_uri),
  check (client_name <> ''),
  check (client_uri ~ '^https://'),
  check (redirect_uri ~ '^https://')
);

comment on table public.account_first_party_oauth_clients is
  'Trusted first-party THIEPN OAuth public clients. OAuth client creation remains owned by Supabase Auth Admin; this table binds the issued client UUID to one Account app and exact production callback.';

alter table public.account_first_party_oauth_clients enable row level security;
revoke all on public.account_first_party_oauth_clients from public, anon, authenticated;
grant all on public.account_first_party_oauth_clients to service_role;

create or replace function public.is_thiepn_first_party_oauth_client_for_app(p_app_slug text)
returns boolean
language sql
stable
security definer
set search_path=''
as $function$
  select case
    when ((select auth.jwt())->>'client_id') is null then false
    when not (((select auth.jwt())->>'client_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$') then false
    else exists (
      select 1
      from public.account_first_party_oauth_clients c
      join public.account_apps a on a.slug=c.app_slug and a.active=true
      where c.oauth_client_id=(((select auth.jwt())->>'client_id')::uuid)
        and c.app_slug=p_app_slug
        and c.active=true
    )
  end;
$function$;

revoke all on function public.is_thiepn_first_party_oauth_client_for_app(text) from public, anon;
grant execute on function public.is_thiepn_first_party_oauth_client_for_app(text) to authenticated;

create or replace function public.resolve_thiepn_first_party_oauth_client(
  p_client_id uuid,
  p_client_uri text,
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
    and c.client_uri=p_client_uri
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

revoke all on function public.resolve_thiepn_first_party_oauth_client(uuid,text,text,text) from public, anon;
grant execute on function public.resolve_thiepn_first_party_oauth_client(uuid,text,text,text) to authenticated;

create or replace function public.ensure_thiepn_first_party_app_connection(
  p_client_id uuid,
  p_app_slug text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_status text;
  v_created boolean := false;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode='42501';
  end if;
  if coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false) then
    raise exception 'anonymous_identity_not_supported' using errcode='42501';
  end if;
  if (((select auth.jwt())->>'client_id')) is not null then
    raise exception 'native_account_session_required' using errcode='42501';
  end if;

  if not exists (
    select 1
    from public.account_first_party_oauth_clients c
    where c.oauth_client_id=p_client_id
      and c.app_slug=p_app_slug
      and c.active=true
  ) then
    raise exception 'first_party_oauth_client_unavailable' using errcode='22023';
  end if;

  select c.status into v_status
  from public.account_app_connections c
  where c.user_id=v_uid and c.app_slug=p_app_slug;

  if not found then
    perform public.connect_thiepn_app(p_app_slug);
    v_status := 'connected';
    v_created := true;
  elsif v_status in ('connected','limited') then
    update public.account_app_connections
    set last_used_at=now(),updated_at=now()
    where user_id=v_uid and app_slug=p_app_slug;
  end if;

  return jsonb_build_object('appSlug',p_app_slug,'status',v_status,'created',v_created);
end;
$function$;

revoke all on function public.ensure_thiepn_first_party_app_connection(uuid,text) from public, anon;
grant execute on function public.ensure_thiepn_first_party_app_connection(uuid,text) to authenticated;
