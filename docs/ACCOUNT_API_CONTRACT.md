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


## P14 Security / sessions adapter

### Security summary

The browser uses the authenticated Supabase client to call `auth.mfa.listFactors()`. A verified TOTP/phone factor is represented as Account two-step verification enabled. No secret factor material is surfaced to the frontend.

### Sessions

`public.list_thiepn_account_sessions()` remains the owner-scoped read boundary over `auth.sessions`.

The adapter exposes each active Supabase session as a **session-derived environment**. It parses only coarse browser/platform labels from the stored user-agent string and does not claim a stable physical device identity.

### Revocation

Supported production revocation currently uses the documented Supabase Auth client:

```ts
supabase.auth.signOut({ scope: "others" })
```

This revokes every other session and preserves the current session.

Specific remote-session or one-device revocation is deliberately capability-disabled. The frontend does not write directly to `auth.sessions` or depend on undocumented auth-schema mutation behavior.

### Security event history

The current production backend has no authoritative Account security-event journal. The frontend advertises `securityActivityRead=false` and does not fabricate events.


## P15 connected-app control plane

Real Account app state is backed by:

- `account_apps`
- `account_app_manifests`
- `account_app_permissions`
- `account_app_connections`
- `account_app_grants`

Authenticated clients may SELECT registry metadata and their own connection/grant rows through RLS.

Writes are not granted directly. Account mutations use owner-scoped RPCs:

- `connect_thiepn_app(app_slug)`
- `set_thiepn_app_permission(app_slug, permission_id, granted)`
- `disconnect_thiepn_app(app_slug)`

Required permissions cannot be independently revoked. Disconnect marks the control-plane connection disconnected and denies grants; it does not delete app cloud data.

These records do not yet authorize Core namespace operations. Data-path enforcement must consume trusted app identity plus Account grant state in a later phase.


## P16 cloud-data inventory

Production Account data reads use `public.get_thiepn_account_data_inventory()`.

The function is a narrow `auth.uid()`-scoped SECURITY DEFINER metadata boundary. It returns no app payloads.

Current sources:

- Notes: `notes_sync_records`
- Diet Copilot: owner-scoped Diet tables
- TMS60: `tms60_sync_state`
- WORDSTRIKE: `wordstrike_player_profiles`
- Word to the Nations: `wttn_private.saves`

Returned storage bytes are approximate PostgreSQL row/payload bytes, not billing storage.

Only TMS60 currently reports an explicit successful sync timestamp from a canonical sync-state source. Other apps expose cloud-data facts while reporting generic sync state as unavailable rather than manufacturing health.

`retrySync()` and Account-level sync toggles deliberately remain unsupported in the real adapter until a common server command contract exists.

The `account_sync_usage_connection` trigger bridges future `account_user_apps` usage into missing Account connections, but never changes an existing disconnected connection back to connected.
