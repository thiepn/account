# Finance P20 — ChatGPT OAuth consent

THIEPN Account is the authorization server for the Finance MCP connection.

## Consent route

The protected Account route remains /oauth/consent?authorization_id=... and now serves both the existing strict THIEPN Hub authorization flow and staged ChatGPT → THIEPN Finance MCP authorization.

Hub validation is unchanged.

## Finance acceptance boundary

Finance consent is accepted only when:

- VITE_FINANCE_MCP_OAUTH_ENABLED=staged-v1;
- the current Account session owns the authorization request;
- the OAuth redirect belongs to https://chatgpt.com/connector/oauth/<callback-id>;
- the OAuth resource is exactly https://finance.thiepn.dev/api/mcp;
- the OAuth client id is bounded and valid;
- requested scopes are limited to openid, email, profile, and offline_access.

Successful and denied redirect URLs are revalidated before browser navigation. No arbitrary next parameter, external redirect, fragment, duplicate code/state, or non-ChatGPT callback is followed.

## User-facing permission

The Finance consent page states that ChatGPT receives only read-only Finance MCP access. The MCP resource server independently enforces that property: no Finance write tools are exposed in P20.

## Activation

Merging this code does not enable OAuth by itself. Hosted THIEPN Account must have its OAuth 2.1 authorization-server configuration enabled and point its authorization path to /oauth/consent.

The production Pages workflow reads the repository variable `VITE_FINANCE_MCP_OAUTH_ENABLED` into the build. Leave that variable unset (or any value other than `staged-v1`) until the hosted OAuth Server configuration and Finance MCP deployment are ready. Activation then requires only setting the repository variable to `staged-v1` and running/allowing the normal Account deployment; no code edit is required.

## Finance resource binding

The Finance MCP resource identifier is fixed to `https://finance.thiepn.dev/api/mcp`.

Migration `20261006202143_finance_p20_oauth_resource_binding_hook.sql` introduced the staged hook boundary. Migration `20261007070212_finance_p20_automatic_dcr_session_binding.sql` supersedes manual client binding with automatic per-session DCR binding. The legacy client table remains only for migration compatibility and is not used by the public plugin flow.

The hook sets both `aud` and `resource` to the canonical Finance MCP resource only for an approved ChatGPT Finance OAuth session. Account/Hub tokens and unrelated OAuth sessions keep their existing audience unchanged.

Enable the hook once in **Authentication → Hooks → Custom Access Token** after the automatic-session migration is deployed. No ChatGPT client UUID needs to be copied into Supabase or Vercel.

## Automatic public-plugin DCR binding

Public Plugin Directory installs may dynamically register more than one OAuth client over time. Finance therefore does not require operators to copy each DCR client UUID into an allowlist.

On initial authorization-code token issuance, the Account custom access-token hook binds the exact OAuth session only when all of these conditions hold:

- the Account user owns the approved authorization;
- resource is exactly `https://finance.thiepn.dev/api/mcp`;
- redirect is a bounded `https://chatgpt.com/connector/oauth/<callback-id>` URL;
- the client is a non-deleted dynamic public OAuth client using token auth method `none`;
- scopes contain exactly the supported Finance identity/refresh scope set.

The hook persists `session_id + client_id + user_id + resource` in `private.finance_mcp_oauth_sessions`. Refresh-token issuance is resource-bound only when all four values still match that stored session binding. A client-level binding alone is never sufficient.

This lets ChatGPT DCR scale across public plugin installs without weakening the Finance resource boundary or requiring per-client Vercel edits.

## Final OAuth activation order

1. Deploy and verify `https://finance.thiepn.dev/api/mcp` and protected-resource metadata.
2. Enable the THIEPN Account OAuth 2.1 server with authorization path `/oauth/consent`. Prefer dynamic client registration for MCP clients when supported by the connecting ChatGPT configuration.
3. Enable `public.thiepn_account_access_token_hook(jsonb)` as the Custom Access Token hook once for THIEPN Account.
4. Set Account repository variable `VITE_FINANCE_MCP_OAUTH_ENABLED=staged-v1` and deploy Account.
5. Run the manual **Finance P20 OAuth Production Smoke** workflow and require a green result. It checks issuer equality, DCR, PKCE S256, authorization-code + refresh grants, public-client token exchange, the full scope set, and the expected callback mode.
6. Start a fresh OAuth authorization. The Account hook automatically creates the Finance session binding and issues a resource-bound token.
7. Verify the MCP resource rejects wrong-resource and insufficient-scope tokens before real-user qualification.

Do not pre-populate ChatGPT client UUIDs. Public plugin DCR registration is automatic; the Finance deployment and Account hook/consent boundary must be live before real-user qualification.
