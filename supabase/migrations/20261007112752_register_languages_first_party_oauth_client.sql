do $$
declare
  v_canonical uuid := 'c4522235-beb3-4f48-94fb-e274e92b7c84'::uuid;
  v_duplicate uuid;
begin
  if not exists (
    select 1
    from auth.oauth_clients c
    where c.id=v_canonical
      and c.client_name='THIEPN Languages'
      and c.client_uri='https://languages.thiepn.dev/'
      and c.redirect_uris='https://languages.thiepn.dev/auth/callback/'
      and c.token_endpoint_auth_method='none'
  ) then
    raise exception 'canonical_languages_oauth_client_missing_or_mismatched';
  end if;

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
    v_canonical,
    'languages',
    'THIEPN Languages',
    'https://languages.thiepn.dev/',
    'https://languages.thiepn.dev/auth/callback/',
    true,
    true
  )
  on conflict (app_slug, redirect_uri) do update set
    oauth_client_id=excluded.oauth_client_id,
    client_name=excluded.client_name,
    client_uri=excluded.client_uri,
    automatic_identity_consent=excluded.automatic_identity_consent,
    active=excluded.active,
    updated_at=now();

  foreach v_duplicate in array array[
    '35d1f9de-3c6b-4f82-8ae7-8ef84349be7f'::uuid,
    '5c005e37-5f95-450b-91d9-b3540e65fa92'::uuid
  ] loop
    if exists (select 1 from auth.sessions where oauth_client_id=v_duplicate)
       or exists (select 1 from auth.oauth_authorizations where client_id=v_duplicate)
       or exists (select 1 from auth.oauth_consents where client_id=v_duplicate)
       or exists (select 1 from private.finance_mcp_oauth_clients where client_id=v_duplicate)
       or exists (select 1 from private.finance_mcp_oauth_sessions where client_id=v_duplicate)
       or exists (select 1 from public.account_first_party_oauth_clients where oauth_client_id=v_duplicate)
    then
      raise exception 'languages_oauth_duplicate_is_referenced:%',v_duplicate;
    end if;

    delete from auth.oauth_clients c
    where c.id=v_duplicate
      and c.client_name='THIEPN Languages'
      and c.client_uri='https://languages.thiepn.dev/'
      and c.redirect_uris='https://languages.thiepn.dev/auth/callback/'
      and c.token_endpoint_auth_method='none';
  end loop;
end
$$;
