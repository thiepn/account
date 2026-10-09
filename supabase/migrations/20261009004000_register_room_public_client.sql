-- Activate the already-created public THIEPN Room OAuth client.
-- One reviewed first-party client, no DCR/secret creation.
do $$
declare
  v_client constant uuid := '7b5663cb-ac37-4f90-8d00-6317206c9027';
  v_origin constant text := 'https://room.thiepn.dev/';
  v_redirect constant text := 'https://room.thiepn.dev/auth/callback/';
begin
  if not exists (
    select 1 from auth.oauth_clients c
    where c.id=v_client
      and c.client_name='THIEPN Room'
      and c.client_type::text='public'
      and c.redirect_uris=v_redirect
      and c.token_endpoint_auth_method='none'
      and c.grant_types='authorization_code,refresh_token'
      and c.deleted_at is null
      and (c.client_uri=v_origin or c.client_uri is null)
  ) then
    raise exception 'room_public_oauth_client_mismatch';
  end if;
  if not exists (
    select 1 from public.account_apps a
    join public.account_app_manifests m on m.app_slug=a.slug
    join public.account_app_permissions p on p.app_slug=a.slug
    where a.slug='room'
      and a.product_url=v_origin
      and m.capabilities->>'account'='true'
      and p.permission_id='identity.basic'
      and p.required=true and p.mutable_by_user=false and p.sensitivity='basic'
  ) then
    raise exception 'room_first_party_app_contract_missing';
  end if;
  if exists (
    select 1 from public.account_first_party_oauth_clients c
    where (c.app_slug='room' or c.oauth_client_id=v_client)
      and (c.app_slug<>'room' or c.oauth_client_id<>v_client or c.redirect_uri<>v_redirect or c.client_uri<>v_origin)
  ) then
    raise exception 'room_public_oauth_client_registry_conflict';
  end if;
  -- The dashboard may leave client_uri unset; ensure exact Account probe origin.
  update auth.oauth_clients set client_uri=v_origin,updated_at=now()
  where id=v_client and client_uri is null;
  insert into public.account_first_party_oauth_clients
     (oauth_client_id,app_slug,client_name,client_uri,redirect_uri,automatic_identity_consent,active)
  values (v_client,'room','THIEPN Room',v_origin,v_redirect,true,true)
  on conflict (app_slug,redirect_uri) do update set
     oauth_client_id=excluded.oauth_client_id,
     client_name=excluded.client_name,
     client_uri=excluded.client_uri,
     automatic_identity_consent=excluded.automatic_identity_consent,
     active=excluded.active,
     updated_at=now();
  update public.account_apps set active=true,updated_at=now()
  where slug='room' and product_url=v_origin;
end
$$;
