# Account API contract — integration v1

## Current real slice

P12 intentionally integrates only the backend capabilities already verified as safe and low-risk:

### Authentication

- Provider: Supabase Auth / Google.
- Browser flow: PKCE.
- Production/session checks use `auth.getUser()`, which validates the current token with Supabase Auth rather than treating local storage as authorization truth.
- Current-session sign-out uses `scope: "local"`.
- OAuth redirects return through `/auth/callback`; only validated internal `returnTo` paths are preserved.

### Canonical identity

The authenticated Supabase Auth user UUID is the canonical `AccountId` for the current THIEPN Account platform. Email and provider metadata are not ownership identifiers.

### Profile

Physical backend:

```text
public.account_profiles
  user_id uuid PK -> auth.users(id)
  display_name
  preferred_language
  timezone
  created_at
  updated_at
```

Frontend domain:

```text
AccountProfile
  displayName
  preferredLanguage
  timezone
```

The API adapter owns snake_case/camelCase conversion.

Profile read/write is owner-RLS protected. The frontend independently scopes mutations to the authenticated user ID, but RLS remains the actual authorization boundary.

### Missing-profile behavior

P13 migration `20260929205538_account_profile_provisioning_from_auth` now provisions one Account Profile row when a new `auth.users` identity is created and backfilled any previous missing rows. The frontend still treats an unexpected missing Profile as an integrity error rather than silently creating one.

## Conservative capabilities

Until later phases are really integrated:

- profileRead: true
- profileWrite: true
- securityRead: false
- devicesRead: false
- appsRead: false
- dataRead: false
- privacyRead: false

Unsupported domains fail with `CAPABILITY_UNAVAILABLE`. They never fall back to mock data in real/production mode.
