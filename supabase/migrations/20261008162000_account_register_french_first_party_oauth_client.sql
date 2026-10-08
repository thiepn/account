-- Pin the manually registered THIEPN French public OAuth client.
-- Registration was performed once in Supabase Auth; this migration does not create an OAuth client.
do $$
declare
  v_client constant uuid := 'bf2e7fca-98dd-4833-9fee-306ecd6fc7d7'::uuid;
  v_uri constant text := 'https://french.thiepn.dev/';
begin
  if not exists (
    select 1 from auth.oauth_clients c
    where c.id = v_client
      and c.client_name = 'THIEPN French'
      and c.redirect_uris = v_uri
      and c.client_type::text = 'public'
      and c.token_endpoint_auth_method = 'none'
      and c.deleted_at is null
      and c.grant_types = 'authorization_code,refresh_token'
      and (c.client_uri is null or c.client_uri = v_uri)
  ) then
    raise exception 'french_oauth_client_missing_or_mismatched';
  end if;

  if not exists (
    select 1 from public.account_apps a
    where a.slug = 'french' and a.active = true
  ) then
    raise exception 'french_account_app_not_active';
  end if;

  if exists (
    select 1 from public.account_first_party_oauth_clients c
    where (c.app_slug = 'french' or c.oauth_client_id = v_client)
      and (c.app_slug <> 'french' or c.oauth_client_id <> v_client or c.redirect_uri <> v_uri)
  ) then
    raise exception 'french_oauth_client_registry_conflict';
  end if;

  -- Dashboard-created public clients do not always populate client_uri.
  -- Account's first-party resolver requires an exact non-null match.
  update auth.oauth_clients c
  set client_uri = v_uri, updated_at = now()
  where c.id = v_client and c.client_uri is null;

  insert into public.account_first_party_oauth_clients (
    oauth_client_id,app_slug,client_name,client_uri,redirect_uri,
    automatic_identity_consent,active
  ) values (
    v_client,'french','THIEPN French',v_uri,v_uri,true,true
  )
  on conflict (app_slug,redirect_uri) do update
  set client_name = excluded.client_name,
      client_uri = excluded.client_uri,
      automatic_identity_consent = excluded.automatic_identity_consent,
      active = excluded.active,
      updated_at = now();
end
$$;
