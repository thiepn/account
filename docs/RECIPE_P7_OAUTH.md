# P7 — THIEPN Recipe OAuth consent and resource binding

This is the Account-side companion to `thiepn/recipe` P7. The Recipe MCP resource is `https://recipe.thiepn.dev/api/mcp`. THIEPN Account remains the only identity authority; Finance MCP remains bound to its distinct resource.

## Policy

- The existing authenticated `/oauth/consent` flow handles Recipe requests only when `VITE_RECIPE_MCP_OAUTH_ENABLED=staged-v1`.
- A Recipe request must contain the *exact* Recipe MCP `resource`, a ChatGPT-owned callback, the same verified Account user, a UUID OAuth client and only `openid email profile offline_access` scopes.
- The visible approval screen states that ChatGPT may **read private recipes and create private drafts** but cannot edit or delete existing recipes.
- A consent denial goes only to the strict ChatGPT callback with an approved `access_denied` error. No external arbitrary redirect accepted.
- Finance and Hub continue using their separate protected resources and validated consent paths.

## Token-binding migration

`20261008093000_account_recipe_mcp_oauth_resource_binding.sql` extends the existing resource-binding access token hook. It adds the private, grant-restricted `private.recipe_mcp_oauth_clients` table with a fixed Recipe resource value.

**Migration alone grants no client access:** the binding table is empty. The Account OAuth issuer will issue a Recipe-audience token only after an authorized operator explicitly registers the verified ChatGPT client ID in the binding table.

Example **administrator-controlled** registration (replace UUID only after verifying the OAuth client's identity, redirect URI and owner consent):

```sql
insert into private.recipe_mcp_oauth_clients (client_id)
values ('<verified-chatgpt-oauth-client-uuid>');
```

For the existing Finance MCP, the hook continues binding known Finance clients to `https://finance.thiepn.dev/api/mcp`. If a client is accidentally registered in both tables, neither resource binding is added (fail-closed).

Do not give `anon` or `authenticated` INSERT or EXECUTE privileges on the private mapping or hook.

## Production activation

1. Review and apply the migration to the **Account**, not the Core, Supabase project.
2. Ensure the existing custom access-token hook is enabled under Account Auth settings.
3. Deploy Account with `VITE_RECIPE_MCP_OAUTH_ENABLED=staged-v1` only after the Recipe MCP endpoint exists and is HTTPS-reachable.
4. Use ChatGPT OAuth/DCR setup to discover the new client ID and exact ChatGPT callback, then allowlist that client in the private binding table.
5. Re-run OAuth consent and verify `aud` and `resource` both equal Recipe MCP URL. Never log or paste bearer token bytes.
6. Check user A/B private recipe isolation and Finance OAuth remains functional.
7. Verify that disabling the Recipe flag blocks new approvals without changing normal Account, Hub or Finance sign-in.

## Qualification status

The git implementation and unit tests can be reviewed and merged independently of production Auth settings. The live OAuth Server, staging flag, token-binding table migration, client allowlisting and real ChatGPT OAuth flow must be verified separately before describing P7 as connected.
