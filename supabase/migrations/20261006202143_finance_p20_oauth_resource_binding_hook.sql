create table private.finance_mcp_oauth_clients (
  client_id uuid primary key references auth.oauth_clients(id) on delete cascade,
  resource text not null default 'https://finance.thiepn.dev/api/mcp',
  created_at timestamptz not null default now(),
  constraint finance_mcp_oauth_clients_resource_check
    check (resource = 'https://finance.thiepn.dev/api/mcp')
);

revoke all on table private.finance_mcp_oauth_clients
  from public, anon, authenticated;
grant select on table private.finance_mcp_oauth_clients
  to supabase_auth_admin;
grant usage on schema private
  to supabase_auth_admin;

create or replace function public.thiepn_account_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  claims jsonb;
  client_text text;
  client_uuid uuid;
  finance_resource text;
begin
  if event is null or pg_catalog.jsonb_typeof(event) <> 'object' then
    return event;
  end if;

  claims := event->'claims';
  if claims is null or pg_catalog.jsonb_typeof(claims) <> 'object' then
    return event;
  end if;

  client_text := claims->>'client_id';
  if client_text is null
     or client_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return pg_catalog.jsonb_build_object('claims', claims);
  end if;

  client_uuid := client_text::uuid;

  select binding.resource
    into finance_resource
    from private.finance_mcp_oauth_clients as binding
   where binding.client_id = client_uuid;

  if finance_resource is not null then
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
  end if;

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

comment on table private.finance_mcp_oauth_clients is
  'P20 allowlist binding THIEPN Account OAuth client IDs to the canonical Finance MCP resource. Empty until a real ChatGPT client is registered.';

comment on function public.thiepn_account_access_token_hook(jsonb) is
  'Staged custom access-token hook. Leaves all tokens unchanged unless client_id is explicitly bound in private.finance_mcp_oauth_clients, then resource-binds aud and resource to Finance MCP. Must not be enabled in Auth settings until qualified.';
