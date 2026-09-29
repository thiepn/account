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

For the current backend, the authenticated Supabase Auth user UUID is provisionally adapted as `AccountId`. P13 must formally freeze that identity decision before broader ecosystem integration.

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

No automatic auth-user provisioning trigger was found during the P12 audit. The adapter therefore returns `PROFILE_NOT_FOUND`; it does not silently create persistent Account records from the browser. P13 owns canonical Account/Profile provisioning.

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
