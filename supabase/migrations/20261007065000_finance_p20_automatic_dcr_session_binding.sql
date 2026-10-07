create table private.finance_mcp_oauth_sessions (
  session_id uuid primary key,
  client_id uuid not null references auth.oauth_clients(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  resource text not null default 'https://finance.thiepn.dev/api/mcp',
  created_at timestamptz not null default now(),
  constraint finance_mcp_oauth_sessions_resource_check
    check (resource = 'https://finance.thiepn.dev/api/mcp')
);

revoke all on table private.finance_mcp_oauth_sessions
  from public, anon, authenticated;
grant select on table private.finance_mcp_oauth_sessions
  to supabase_auth_admin;

comment on table private.finance_mcp_oauth_sessions is
  'P20 Finance MCP OAuth session bindings. Created automatically only from an approved ChatGPT DCR authorization for the canonical Finance resource and reused for refresh-token issuance.';

comment on table private.finance_mcp_oauth_clients is
  'Deprecated P20 manual client binding table retained for migration compatibility. Automatic public-plugin authorization uses private.finance_mcp_oauth_sessions instead.';

create or replace function public.thiepn_account_access_token_hook(event jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  claims jsonb;
  auth_method text;
  client_text text;
  session_text text;
  user_text text;
  scope_text text;
  client_uuid uuid;
  session_uuid uuid;
  user_uuid uuid;
  finance_resource constant text := 'https://finance.thiepn.dev/api/mcp';
  finance_bound boolean := false;
begin
  if event is null or pg_catalog.jsonb_typeof(event) <> 'object' then
    return event;
  end if;

  claims := event->'claims';
  if claims is null or pg_catalog.jsonb_typeof(claims) <> 'object' then
    return event;
  end if;

  auth_method := event->>'authentication_method';
  client_text := claims->>'client_id';
  session_text := claims->>'session_id';
  user_text := event->>'user_id';
  scope_text := coalesce(claims->>'scope', '');

  if client_text is null
     or session_text is null
     or user_text is null
     or client_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or session_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or user_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or claims->>'sub' is distinct from user_text then
    return pg_catalog.jsonb_build_object('claims', claims);
  end if;

  client_uuid := client_text::uuid;
  session_uuid := session_text::uuid;
  user_uuid := user_text::uuid;

  if auth_method = 'oauth_provider/authorization_code' then
    select exists (
      select 1
        from auth.oauth_authorizations as authz
        join auth.oauth_clients as client
          on client.id = authz.client_id
       where authz.client_id = client_uuid
         and authz.user_id = user_uuid
         and authz.status::text = 'approved'
         and authz.resource = finance_resource
         and authz.expires_at > pg_catalog.now()
         and authz.redirect_uri ~ '^https://chatgpt[.]com/connector/oauth/[A-Za-z0-9._~-]+
         and client.deleted_at is null
         and client.registration_type::text = 'dynamic'
         and client.client_type::text = 'public'
         and client.token_endpoint_auth_method = 'none'
         and not exists (
           select 1
             from pg_catalog.regexp_split_to_table(
               pg_catalog.btrim(authz.scope),
               '[[:space:]]+'
             ) as requested(scope)
            where requested.scope not in (
              'openid',
              'email',
              'profile',
              'offline_access'
            )
         )
         and authz.scope ~ '(^|[[:space:]])openid([[:space:]]|$)'
         and authz.scope ~ '(^|[[:space:]])email([[:space:]]|$)'
         and authz.scope ~ '(^|[[:space:]])profile([[:space:]]|$)'
         and authz.scope ~ '(^|[[:space:]])offline_access([[:space:]]|$)'
    ) into finance_bound;

    if finance_bound then
      insert into private.finance_mcp_oauth_sessions (
        session_id,
        client_id,
        user_id,
        resource
      ) values (
        session_uuid,
        client_uuid,
        user_uuid,
        finance_resource
      )
      on conflict (session_id) do update
        set client_id = excluded.client_id,
            user_id = excluded.user_id,
            resource = excluded.resource;
    end if;
  elsif auth_method = 'token_refresh' then
    select exists (
      select 1
        from private.finance_mcp_oauth_sessions as binding
       where binding.session_id = session_uuid
         and binding.client_id = client_uuid
         and binding.user_id = user_uuid
         and binding.resource = finance_resource
    ) into finance_bound;
  end if;

  if not finance_bound then
    return pg_catalog.jsonb_build_object('claims', claims);
  end if;

  if not (
    scope_text ~ '(^|[[:space:]])openid([[:space:]]|$)'
    and scope_text ~ '(^|[[:space:]])email([[:space:]]|$)'
    and scope_text ~ '(^|[[:space:]])profile([[:space:]]|$)'
    and scope_text ~ '(^|[[:space:]])offline_access([[:space:]]|$)'
  ) then
    return pg_catalog.jsonb_build_object('claims', claims);
  end if;

  claims := pg_catalog.jsonb_set(
    claims,
    '{aud}',
    pg_catalog.to_jsonb(finance_resource),
    true
  );
  claims := pg_catalog.jsonb_set(
    claims,
    '{resource}',
    pg_catalog.to_jsonb(finance_resource),
    true
  );

  return pg_catalog.jsonb_build_object('claims', claims);
exception
  when invalid_text_representation then
    return pg_catalog.jsonb_build_object('claims', claims);
end
$$;

revoke all on function public.thiepn_account_access_token_hook(jsonb)
  from public, anon, authenticated;
grant execute on function public.thiepn_account_access_token_hook(jsonb)
  to supabase_auth_admin;

comment on function public.thiepn_account_access_token_hook(jsonb) is
  'P20 automatic Finance resource-binding hook. Initial OAuth issuance binds only an approved public ChatGPT DCR authorization for the canonical Finance resource; refresh issuance reuses the exact OAuth session binding. Other Account, Hub, OAuth and refresh tokens remain unchanged.';

         and pg_catalog.char_length(authz.redirect_uri) between 37 and 292
         and client.deleted_at is null
         and client.registration_type::text = 'dynamic'
         and client.client_type::text = 'public'
         and client.token_endpoint_auth_method = 'none'
         and not exists (
           select 1
             from pg_catalog.regexp_split_to_table(
               pg_catalog.btrim(authz.scope),
               E'\\s+'
             ) as requested(scope)
            where requested.scope not in (
              'openid',
              'email',
              'profile',
              'offline_access'
            )
         )
         and authz.scope ~ '(^|[[:space:]])openid([[:space:]]|$)'
         and authz.scope ~ '(^|[[:space:]])email([[:space:]]|$)'
         and authz.scope ~ '(^|[[:space:]])profile([[:space:]]|$)'
         and authz.scope ~ '(^|[[:space:]])offline_access([[:space:]]|$)'
    ) into finance_bound;

    if finance_bound then
      insert into private.finance_mcp_oauth_sessions (
        session_id,
        client_id,
        user_id,
        resource
      ) values (
        session_uuid,
        client_uuid,
        user_uuid,
        finance_resource
      )
      on conflict (session_id) do update
        set client_id = excluded.client_id,
            user_id = excluded.user_id,
            resource = excluded.resource;
    end if;
  elsif auth_method = 'token_refresh' then
    select exists (
      select 1
        from private.finance_mcp_oauth_sessions as binding
       where binding.session_id = session_uuid
         and binding.client_id = client_uuid
         and binding.user_id = user_uuid
         and binding.resource = finance_resource
    ) into finance_bound;
  end if;

  if not finance_bound then
    return pg_catalog.jsonb_build_object('claims', claims);
  end if;

  if not (
    scope_text ~ '(^|[[:space:]])openid([[:space:]]|$)'
    and scope_text ~ '(^|[[:space:]])email([[:space:]]|$)'
    and scope_text ~ '(^|[[:space:]])profile([[:space:]]|$)'
    and scope_text ~ '(^|[[:space:]])offline_access([[:space:]]|$)'
  ) then
    return pg_catalog.jsonb_build_object('claims', claims);
  end if;

  claims := pg_catalog.jsonb_set(
    claims,
    '{aud}',
    pg_catalog.to_jsonb(finance_resource),
    true
  );
  claims := pg_catalog.jsonb_set(
    claims,
    '{resource}',
    pg_catalog.to_jsonb(finance_resource),
    true
  );

  return pg_catalog.jsonb_build_object('claims', claims);
exception
  when invalid_text_representation then
    return pg_catalog.jsonb_build_object('claims', claims);
end
$$;

revoke all on function public.thiepn_account_access_token_hook(jsonb)
  from public, anon, authenticated;
grant execute on function public.thiepn_account_access_token_hook(jsonb)
  to supabase_auth_admin;

comment on function public.thiepn_account_access_token_hook(jsonb) is
  'P20 automatic Finance resource-binding hook. Initial OAuth issuance binds only an approved public ChatGPT DCR authorization for the canonical Finance resource; refresh issuance reuses the exact OAuth session binding. Other Account, Hub, OAuth and refresh tokens remain unchanged.';
