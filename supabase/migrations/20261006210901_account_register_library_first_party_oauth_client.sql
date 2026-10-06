insert into public.account_first_party_oauth_clients (
  oauth_client_id,
  app_slug,
  client_name,
  client_uri,
  redirect_uri,
  automatic_identity_consent,
  active
)
values (
  '76e41661-f8a9-4181-b8b9-4084f2e2acbf'::uuid,
  'library',
  'THIEPN Library',
  'https://thiepn.dev/library/',
  'https://thiepn.dev/library/auth/callback/',
  true,
  true
)
on conflict (oauth_client_id) do update set
  app_slug=excluded.app_slug,
  client_name=excluded.client_name,
  client_uri=excluded.client_uri,
  redirect_uri=excluded.redirect_uri,
  automatic_identity_consent=excluded.automatic_identity_consent,
  active=excluded.active,
  updated_at=now();
