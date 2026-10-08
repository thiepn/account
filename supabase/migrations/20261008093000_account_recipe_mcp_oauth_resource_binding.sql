-- P7: extend the existing staged Account access-token resource-binding hook.
-- No OAuth client is granted Recipe access by this migration. A trusted
-- operator must register each approved ChatGPT OAuth client ID separately.
create table if not exists private.recipe_mcp_oauth_clients (
  client_id uuid primary key references auth.oauth_clients(id) on delete cascade,
  resource text not null default 'https://recipe.thiepn.dev/api/mcp',
  created_at timestamptz not null default now(),
  constraint recipe_mcp_oauth_clients_resource_check
    check (resource = 'https://recipe.thiepn.dev/api/mcp')
);
revoke all on table private.recipe_mcp_oauth_clients
  from public, anon, authenticated;
grant usage on schema private to supabase_auth_admin;
grant select on table private.recipe_mcp_oauth_clients
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
  recipe_resource text;
  bound_resource text;
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

  select binding.resource into finance_resource
    from private.finance_mcp_oauth_clients as binding
   where binding.client_id = client_uuid;
  select binding.resource into recipe_resource
    from private.recipe_mcp_oauth_clients as binding
   where binding.client_id = client_uuid;

  -- A client bound to both resources cannot obtain an audience-bound token
  -- for either. Do not silently privilege one product over the other.
  if finance_resource is not null and recipe_resource is not null then
    return pg_catalog.jsonb_build_object('claims', claims);
  end if;

  bound_resource := pg_catalog.coalesce(finance_resource, recipe_resource);
  if bound_resource is not null then
    claims := pg_catalog.jsonb_set(
      claims, '{aud}', pg_catalog.to_jsonb(bound_resource), true);
    claims := pg_catalog.jsonb_set(
      claims, '{resource}', pg_catalog.to_jsonb(bound_resource), true);
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

comment on table private.recipe_mcp_oauth_clients is
  'P7 owner-consented ChatGPT Recipe MCP OAuth client resource binding. Empty by default.';
comment on function public.thiepn_account_access_token_hook(jsonb) is
  'Bound THIEPN Finance/Recipe MCP client audience binding. Unregistered OAuth clients do not receive resource claims.';
