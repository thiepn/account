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

Migration `20261006202143_finance_p20_oauth_resource_binding_hook.sql` stages a private OAuth-client binding table and a custom access-token hook. The binding table starts empty. The hook is not enabled by this migration, and non-bound Account/Hub sessions keep their existing audience unchanged.

For an explicitly bound Finance MCP OAuth client, the hook sets both `aud` and `resource` to the canonical Finance MCP resource. Finance must independently require the same resource together with the approved `client_id`; this prevents a valid THIEPN Account OAuth token issued for another application from being replayed against Finance.

The hook may be enabled in **Authentication → Hooks → Custom Access Token** only after the real Finance MCP OAuth client exists and its UUID has been inserted into `private.finance_mcp_oauth_clients`.

## Final OAuth activation order

1. Finance production hosting and protected-resource metadata are qualified at `https://finance.thiepn.dev/api/mcp`.
2. THIEPN Account OAuth 2.1 discovery is live and advertises DCR, PKCE S256, authorization-code + refresh grants, public-client token exchange and `offline_access`.
3. Create the actual Finance MCP connection in a supported ChatGPT custom-MCP surface and obtain the DCR-generated OAuth client UUID.
4. Bind that UUID in `private.finance_mcp_oauth_clients`.
5. Put the same UUID in Finance server variable `THIEPN_FINANCE_MCP_CLIENT_IDS`.
6. Enable `public.thiepn_account_access_token_hook(jsonb)` as the Custom Access Token hook.
7. Set Account repository variable `VITE_FINANCE_MCP_OAUTH_ENABLED=staged-v1` and deploy Account.
8. Run the manual **Finance P20 OAuth Production Smoke** workflow and require a green result. It checks issuer equality, DCR, PKCE S256, authorization-code + refresh grants, public-client token exchange, the full scope set, and the expected callback mode.
9. Start a fresh OAuth authorization so the issued access token contains the Finance resource binding.
10. Verify the MCP resource rejects wrong-client, wrong-resource, and insufficient-scope tokens before real-user qualification.

Do not pre-populate a guessed ChatGPT client UUID and do not enable the hook or Finance consent flag before the Finance deployment and real OAuth client are available.


## Hosted DCR qualification — 2026-10-07

The public THIEPN Account `registration_endpoint` was exercised with a disposable public OAuth client using:

- authorization-code + refresh-token grants;
- token endpoint authentication method `none`;
- ChatGPT callback-ID-shaped HTTPS redirect;
- Finance as the client URI.

THIEPN Account returned HTTP `201` with a dynamically generated UUID client id. The disposable client was then deleted and production was verified to contain zero rows for that fixture in both `auth.oauth_clients` and `private.finance_mcp_oauth_clients`.

This proves the hosted DCR path before the real ChatGPT connection is created. Do not pre-register or guess the real ChatGPT client id; use the id created by the actual ChatGPT connection.
