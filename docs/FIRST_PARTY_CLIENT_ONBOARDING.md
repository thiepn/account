# First-party OAuth client onboarding

THIEPN first-party browser apps use Account's OAuth 2.1 Authorization Code + PKCE flow. OAuth client creation is a production control-plane action, not an ordinary CI action.

## Non-negotiable rule

A workflow that **creates** an OAuth client through dynamic client registration (DCR) must be manual-only.

- allowed trigger: `workflow_dispatch`;
- forbidden triggers: `push`, `pull_request`, `pull_request_target`, `schedule`, `workflow_run`, and `repository_dispatch`;
- do not merge a disposable registration workflow into `main`;
- after one successful registration, pin the issued client UUID in a normal Account migration and remove/close the disposable workflow immediately.

Account CI enforces this with `pnpm check:oauth-workflows`. The guard detects workflows that POST to the OAuth DCR registration endpoint and rejects any automatic trigger.

This policy exists because GitHub may run a PR workflow more than once for the same logical change. DCR is intentionally non-idempotent: every successful registration creates a new client.

## Registration procedure

1. **Register the Account app first.**
   - `account_apps.slug` exists and is active.
   - required/basic permissions are already defined.
   - the canonical product URL is known.
2. **Freeze the exact OAuth contract.**
   - HTTPS client URI;
   - one exact production callback URI;
   - public client;
   - `token_endpoint_auth_method=none`;
   - Authorization Code + refresh-token grants;
   - PKCE S256 at runtime.
3. **Check existing production state before creating anything.**
   - search `auth.oauth_clients` for the exact client name, client URI, and callback;
   - search `account_first_party_oauth_clients` for the app/callback;
   - if a matching client already exists, stop and reconcile it instead of registering again.
4. **Create exactly one public OAuth client.**
   - use a deliberate one-shot manual action;
   - capture the returned UUID;
   - verify the returned client has no secret and uses token auth method `none`.
5. **Pin the UUID in Account.**
   - add an idempotent migration inserting the UUID into `account_first_party_oauth_clients`;
   - bind it to exactly one app slug and exact callback;
   - set `automatic_identity_consent=true` only for the approved identity-only first-party flow.
6. **Verify the production boundary.**
   - `resolve_thiepn_first_party_sso_probe(client_id)` returns the expected app and exact origin;
   - a fresh browser receives `signedIn=false` and the expected eligibility bit;
   - authenticated authorization completes only against the exact registered callback.
7. **Remove the registration mechanism.**
   - close/delete the one-shot workflow branch;
   - never leave DCR client creation attached to an automatic repository event.

## Duplicate recovery

Do not delete a duplicate OAuth client merely because its metadata looks identical.

Before deletion, prove the candidate has no references in at least:

- `auth.sessions.oauth_client_id`;
- `auth.oauth_authorizations.client_id`;
- `auth.oauth_consents.client_id`;
- Account's first-party client registry;
- any resource-specific binding/session tables such as Finance MCP bindings.

Only an unreferenced duplicate may be removed. Keep one canonical client, pin it in the Account registry, then re-run the production SSO probe.

## Current production clients

The authoritative production IDs and callbacks are recorded in [FIRST_PARTY_SSO.md](./FIRST_PARTY_SSO.md). Do not create a replacement merely to rotate a branch, workflow, or deployment.
