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
| P11 Frontend adversarial QA | IN PROGRESS | Vitest cross-domain invariants, Playwright desktop/mobile smoke tests, long-content overflow coverage, CI test/build gates and production mock-marker exclusion are implemented. The full P11 matrix, accessibility/visual/browser campaign and all adversarial scenarios remain before certification. |
| P12 Backend adapter migration | IMPLEMENTED FIRST SLICE | Supabase-backed ApiAccountService, PKCE Auth adapter, validated return path, current-session sign-out, runtime Profile schema mapping, normalized errors, explicit service selection and conservative capability gating are implemented. Real integration currently covers Auth + Profile only; unsupported domains fail closed. |
| P13 Real Auth/Profile | IMPLEMENTED FOUNDATION / NOT YET CERTIFIED | Canonical Auth UUID identity is frozen, PKCE Google adapter and callback exist, auth-state subscription is centralized, current-session sign-out is explicit, and a private owner-only auth.users provisioning trigger now guarantees an Account Profile row. Real final-domain OAuth/reauth/device certification is still required. |
| P14 Real Security/Sessions/Devices | IMPLEMENTED SUPPORTED SLICE | Production Security reads Google/MFA state, real Account sessions are listed through `list_thiepn_account_sessions()`, session environments are mapped conservatively without claiming physical device identity, and Supabase's supported `scope:"others"` flow revokes all other sessions while preserving the current one. Individual remote-session revocation and authoritative security-event history remain unavailable until a supported server contract exists. |
| P15 App Registry/Permissions | IMPLEMENTED CONTROL PLANE / ENFORCEMENT PENDING | Real Account connection, permission-definition and user-grant tables are live with owner RLS and RPC-only writes; existing usage was backfilled; required-grant invariant is verified; ApiAccountService reads/manages real connections and optional grants. Account registry authority is separated from Core's infrastructure registry via optional core_app_id. These grants are not yet enforced on Core/app data paths, so trusted-boundary authorization remains pending. |
| P16 General Cloud Data/Sync | IMPLEMENTED ACCOUNT INVENTORY / GENERIC COMMANDS PENDING | A production auth.uid()-scoped inventory function now derives metadata from Notes, Diet, TMS60, WORDSTRIKE and WTTN canonical cloud sources without returning payloads. ApiAccountService exposes real namespace status, approximate storage, record counts, revisions/timestamps and only provable sync state. Usage now bridges into Account connections without overriding user disconnects. Generic retry/toggle commands remain unsupported because app sync engines are still app-specific and Core-wide Sync Protocol v1 is not broadly implemented. |
| P17 General Backup/Restore | NOT YET | App-specific recovery exists elsewhere; Core explicitly says general backup/restore is absent. |
| P18 Export/Deletion Lifecycle | PARTIAL / NOT TARGET-SAFE | Platform snapshot export + immediate account-delete RPC exist; no grace-period/durable verified lifecycle. |
| P19 Production adversarial audit | NOT YET | Supabase security advisors still report warnings requiring review. |
| P20 Production v1 release | NOT YET | No Account frontend deployment or certified v1.0.0 release. |

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
