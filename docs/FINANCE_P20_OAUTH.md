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