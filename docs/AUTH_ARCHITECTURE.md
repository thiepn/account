# Authentication architecture

## Current production identity authority

THIEPN Account uses the existing **THIEPN Account Supabase Auth** project. Google is the current user-facing provider.

```text
Google
  ↓
Supabase Auth identity
  ↓
auth.users.id
  ↓
canonical THIEPN AccountId
  ↓
public.account_profiles.user_id
```

P13 freezes `auth.users.id` as the canonical Account identity for the existing Account platform. Email, provider display name and avatar metadata are attributes, never ownership keys.

## Browser session model

The frontend uses `@supabase/supabase-js` behind `ApiAccountService`.

- OAuth flow: PKCE.
- Session persistence/refresh: Supabase Auth client.
- Session presence may be read from the local browser session, but authenticated state is verified through `auth.getUser()` before the frontend treats the Account as signed in.
- Auth state changes are subscribed centrally; pages do not subscribe directly.
- Normal Sign out uses `scope: "local"` so other device sessions are not implicitly revoked.
- Global/other-session revocation belongs to P14.

## First-party app entry boundary

THIEPN first-party apps do not create independent identity systems. Browser PKCE state remains with the requesting app, while user-facing sign-in is handed through an Account-owned tokenless entry that validates the exact authorization issuer, provider, PKCE method and callback before forwarding to Supabase Auth.

Current entry routes include:

- Hub: `/hub/entry`
- Languages: `/languages/entry`
- Japanese: `/japanese/entry` → `https://thiepn.dev/japanese/auth/callback/`

No access token, refresh token or PKCE verifier is passed through the Account origin. All apps resolve to the same canonical `auth.users.id` Account identity.

## OAuth callback

`/auth/callback` exchanges the PKCE code with Supabase and removes callback state through route replacement.

Only a validated internal route is stored as the return target. External/protocol-relative/auth-loop destinations fall back to `/`.

## Account/Profile provisioning

Migration `20260929205538_account_profile_provisioning_from_auth.sql` creates an AFTER INSERT trigger on `auth.users`.

The trigger:

- runs as a private owner-only SECURITY DEFINER function;
- creates at most one `account_profiles` row for the new Auth user;
- sanitizes/truncates provider display-name metadata only for presentation;
- uses `ON CONFLICT DO NOTHING` for idempotency;
- grants no callable permission to `anon` or `authenticated`;
- never uses user metadata for authorization.

The migration also backfills any Auth users that lack a Profile. Verification immediately after deployment found zero missing Profile rows.

## Preferences

The database allows nullable language/timezone. When absent, the frontend uses the browser locale/timezone as presentation defaults; persistence occurs only when the user explicitly saves Profile preferences.

## Not yet production-certified

P13 still requires real Google OAuth testing on the final `account.thiepn.dev` origin, explicit real reauthentication semantics, multi-device real-session testing and final provider/callback configuration certification before it can be marked complete.


## P14 session management

Supabase Auth's supported sign-out scopes are used as the session-revocation authority:

- `local`: current session only.
- `others`: every other session, current session survives.
- `global`: all sessions.

THIEPN Account currently exposes normal local sign-out and “sign out all other sessions.” It does not directly delete rows in the internal `auth.sessions` schema.

The session list RPC is read-only. User-agent strings are treated as coarse client-environment metadata only.


## P20 canonical OAuth origin

Production OAuth redirects are never derived from the browser's current host. The release build requires `VITE_ACCOUNT_CANONICAL_ORIGIN=https://account.thiepn.dev` and uses that exact HTTPS origin for both normal Google sign-in and sensitive-action reauthentication callbacks.

Development builds continue to use the local browser origin so real-adapter testing on localhost remains possible.
