# Implementation status — 2026-09-29

This file distinguishes **frontend implemented**, **backend partially existing**, **planned**, and **production certified**. Mock UX is never described as a production backend feature.

| Phase | Status | Current evidence |
| --- | --- | --- |
| P0 Product/Architecture Foundation | IMPLEMENTED BASE | Repository initialized; typed service boundary, seven-section product boundary and frontend architecture exist. |
| P1 Design System | IMPLEMENTED FOUNDATION | Semantic tokens plus shared Button, Panel, Notice, StatusBadge, EmptyState and accessible confirmation-dialog primitives exist. Specialized domain components continue to be added as their phases land. |
| P2 Application Shell | IMPLEMENTED FOUNDATION | Responsive sidebar, compact one-row mobile header, keyboard-trapped/Escape-close drawer with focus restoration and body lock, routing, title updates, theme foundation, protected shell, skip link, 404 and top-level render error boundary exist. |
| P3 Mock Runtime & Overview | IMPLEMENTED BASE | Deterministic scenarios, persisted mock auth/profile state, Query layer and Overview exist. |
| P4 Profile | IMPLEMENTED MOCK | Editable display name/language/timezone, read-only canonical identity, local theme preference, Zod validation, pending/error/success states and unsaved browser-exit protection are implemented behind AccountService. Internal-route discard protection and avatar upload remain for later P4 hardening. |
| P5 Security | IMPLEMENTED MOCK FOUNDATION | Structured security events, activity list/filter/detail routes, Google auth-method status and capability-gated protection UI are implemented behind SecurityService. Real reauth/MFA/passkey integration remains P13/P14. |
| P6 Devices/Sessions | IMPLEMENTED MOCK FOUNDATION | Devices and logical sessions are distinct models; current-session preservation, device/session detail, remote session revocation, device-wide revocation and sign-out-other-sessions state transitions are implemented behind DeviceService. |
| P7 Apps/Permissions | IMPLEMENTED MOCK FOUNDATION | Registry metadata, connection state and permission grants are separate models; connected-app list/detail, required-vs-optional access, grant/revoke mutations, limited/error states, unknown-registry fallback, disconnect semantics and app security events are implemented behind AppsService. |
| P8 Data/Sync UI | IMPLEMENTED MOCK FOUNDATION | Per-app namespace inventory, retained disconnected data, canonical sync states/timestamps/issues, sync-client summaries, retry behavior, user-controllable enable/disable semantics and per-app data routes are implemented behind DataService. Sync is explicitly distinct from backup. |
| P9 Backup/Restore UI | IMPLEMENTED MOCK FOUNDATION | Verified immutable snapshot metadata, backup history/detail, manual operation state, policy model, partial-app restore planning, warnings/blockers, pre-restore safety snapshots, durable restore IDs, generation advancement and client reconciliation status are implemented behind BackupService. Real encryption/provider storage is explicitly not claimed. |
| P10 Privacy/Lifecycle UI | IMPLEMENTED MOCK FOUNDATION | Durable-style export jobs with expiring downloads, per-app deletion plans/confirmation, cloud deletion without disconnect, backup-retention disclosure, Account deletion planning, typed confirmation, seven-day cancellable pending lifecycle and cancellation/status routes are implemented behind PrivacyService. The unsafe existing immediate production delete RPC is deliberately not wired to this UX. |
| P11 Frontend adversarial QA | FRONTEND BASELINE CERTIFIED | Vitest cross-domain invariants, Playwright desktop/mobile/lifecycle smoke tests, long-content overflow coverage, CI type/test/build gates, direct-backend import guards and strict production mock/dev-runtime exclusion are active. Extended manual browser/device/accessibility certification is carried into P20 rather than conflated with mock-runtime correctness. |
| P12 Backend adapter migration | IMPLEMENTED FIRST SLICE | Supabase-backed ApiAccountService, PKCE Auth adapter, validated return path, current-session sign-out, runtime Profile schema mapping, normalized errors, explicit service selection and conservative capability gating are implemented. Real integration currently covers Auth + Profile only; unsupported domains fail closed. |
| P13 Real Auth/Profile | IMPLEMENTED FOUNDATION / NOT YET CERTIFIED | Canonical Auth UUID identity is frozen, PKCE Google adapter and callback exist, auth-state subscription is centralized, current-session sign-out is explicit, and a private owner-only auth.users provisioning trigger now guarantees an Account Profile row. Real final-domain OAuth/reauth/device certification is still required. |
| P14 Real Security/Sessions/Devices | IMPLEMENTED SUPPORTED SLICE | Production Security reads Google/MFA state, real Account sessions are listed through `list_thiepn_account_sessions()`, session environments are mapped conservatively without claiming physical device identity, and Supabase's supported `scope:"others"` flow revokes all other sessions while preserving the current one. Individual remote-session revocation and authoritative security-event history remain unavailable until a supported server contract exists. |
| P15 App Registry/Permissions | IMPLEMENTED CONTROL PLANE / ENFORCEMENT PENDING | Real Account connection, permission-definition and user-grant tables are live with owner RLS and RPC-only writes; existing usage was backfilled; required-grant invariant is verified; ApiAccountService reads/manages real connections and optional grants. Account registry authority is separated from Core's infrastructure registry via optional core_app_id. These grants are not yet enforced on Core/app data paths, so trusted-boundary authorization remains pending. |
| P16 General Cloud Data/Sync | IMPLEMENTED ACCOUNT INVENTORY / GENERIC COMMANDS PENDING | A production auth.uid()-scoped inventory function now derives metadata from Notes, Diet, TMS60, WORDSTRIKE and WTTN canonical cloud sources without returning payloads. ApiAccountService exposes real namespace status, approximate storage, record counts, revisions/timestamps and only provable sync state. Usage now bridges into Account connections without overriding user disconnects. Generic retry/toggle commands remain unsupported because app sync engines are still app-specific and Core-wide Sync Protocol v1 is not broadly implemented. |
| P17 General Backup/Restore | IMPLEMENTED SUPPORTED RECOVERY PLANE | Production Account backup inventory aggregates verified Diet recovery snapshots and hashed TMS60 backups without exposing payloads. Manual Account backup creation honors explicit backup.include grants. TMS60 restore is server-atomic, verifies integrity, creates a safety backup and records a durable restore operation. Diet restore remains deliberately blocked in-browser because its existing backend requires an operator-reviewed runbook. No claim is made that all ecosystem apps share a universal backup engine. |
| P18 Export/Deletion Lifecycle | IMPLEMENTED PRODUCTION LIFECYCLE | Account metadata exports are durable requests with private 24-hour payloads. App-data deletion uses expiring server plans and is executable only for WTTN because its revision tombstone prevents stale resurrection; TMS60, Diet, Notes and WORDSTRIKE return explicit blockers. Full Account deletion now uses an expiring plan, typed DELETE confirmation, seven-day cancellable request, owner-only hourly pg_cron finalizer and persistent lifecycle journal. Legacy immediate delete_thiepn_account/delete_notes_auth_identity execution is revoked from authenticated users. |
| P19 Production adversarial audit | COMPLETE WITH DOCUMENTED EXTERNAL SETTINGS | Production mutation boundaries enforce auth.uid() ownership, deletion-pending locks and server-authoritative recent-session checks for sensitive permission changes, TMS60 restore, WTTN cloud deletion and Account deletion scheduling. Google reauthentication forces a fresh provider login and verifies the same Account returns. Legacy immediate Auth deletion is unavailable to authenticated callers. Account-specific missing FK indexes are fixed. CI rejects direct backend access outside the adapter and rejects production mock/scenario/dev-runtime leakage. Supabase advisor SECURITY DEFINER warnings for the intentionally authenticated Account RPC surface are reviewed and documented; leaked-password protection is not applicable to the current Google-only sign-in surface but must be enabled before any password sign-in method is introduced. |
| P20 Production v1 release | RELEASE CANDIDATE 1 | v1.0.0-rc.2 release metadata and an exact-green-SHA GitHub Pages deployment workflow are implemented. The workflow builds only with ApiAccountService/real Supabase configuration, rejects mock leakage, adds SPA deep-link fallback, emits a release manifest/checksums, and verifies the live deployment serves the exact audited commit SHA. Final v1.0.0 remains blocked on enabling GitHub Actions as the Pages source, configuring account.thiepn.dev + HTTPS, final Supabase/Google OAuth redirect configuration, and real-device/origin certification. Automated smoke coverage now spans Chromium, Firefox and WebKit engines, and release dependencies are locked by the committed pnpm lockfile with frozen installs in CI/deployment. |

## Existing Account Supabase project

Observed real structures include:

- Supabase Auth users, identities and sessions.
- `public.account_profiles`.
- `public.account_apps`.
- `public.account_user_apps`.
- `public.account_app_manifests`.
- `public.list_thiepn_account_sessions()`.
- `public.get_thiepn_ecosystem()`.
- `public.export_thiepn_platform_snapshot()`.
- `public.delete_thiepn_account(text)`.
- app-specific systems including Diet, TMS60 and other THIEPN projects.

The current account-delete RPC deletes `auth.users` directly after confirmation/storage/MFA checks. It is **not** the P18 lifecycle design and must not be presented as final production deletion semantics.

## Existing Core repository

`thiepn/core` currently contains:

- Cloudflare Gateway Worker.
- protocol/config/client packages.
- Git-owned app registry.
- Supabase migrations and pgTAP tests.
- private Health namespace and Health-specific Gateway routes.
- frozen Sync Protocol v1 specification.
- CI/deployment verification tooling.

Core's README and architecture docs explicitly state that general-purpose Core accounts, SSO/scopes, broad synchronization, encryption and backups are not implemented.


## Production auth-bootstrap hotfix — 2026-09-30

Live production browser testing reproduced a startup hang at `Checking your account…`.

Root cause: the Supabase `onAuthStateChange` callback could synchronously trigger React Query cache work/refetches while Supabase still held its internal auth lock. The real auth query then waited indefinitely on `getSession()`.

Fix:
- defer auth-state listeners to a later macrotask;
- update the cached auth-state value directly instead of clearing the whole QueryClient;
- remove only non-auth protected queries on sign-out;
- bound `getSession()` and authenticated `getUser()` verification to eight seconds so production can never spin forever.

The deployed live-browser smoke test is the release gate for this fix.


## P20 live authenticated production verification — 2026-09-30

Real production evidence now confirms:

- Google OAuth authorization initiated from `account.thiepn.dev` with the canonical callback.
- Google PKCE callback completed successfully.
- Token exchange completed successfully.
- Authenticated Account profile reads returned 200.
- Connected-app registry/manifests/connections/grants reads returned 200.
- Cloud-data inventory RPC returned 200.
- The only post-login Account-origin error was `get_thiepn_account_backup_inventory`, traced to an invalid PostgreSQL UNION ORDER BY clause.
- Migration `20260930150238_account_backup_inventory_order_fix` wraps the union and orders by the projected `created_at` column.
- The corrected backup inventory was replayed under the authenticated role and returned verified recovery rows successfully.

No other Account-origin 4xx/5xx responses were observed in the inspected post-login window.


## P20 deletion-plan empty-namespace hardening

Production certification exposed a WTTN planning edge case: when no live WTTN save existed, PL/pgSQL `SELECT ... INTO` replaced the initialized zero-byte value with NULL and violated the deletion-plan table constraint.

Migration `20260930150847_account_app_deletion_plan_empty_namespace_fix` now normalizes missing namespace size to zero.

Verified under the authenticated role inside rolled-back transactions:

- WTTN deletion plan succeeds for an empty live namespace.
- Full Account deletion plan succeeds and inventories current apps/namespaces/backups.
- A stale session cannot execute WTTN deletion.
- A stale session cannot schedule full Account deletion.
- Neither rejected destructive action creates an operation/request.
- Metadata export request + owner payload retrieval succeeds using the same two-request semantics as production.
