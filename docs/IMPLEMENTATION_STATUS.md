# Implementation status — 2026-09-29

This file distinguishes **frontend implemented**, **backend partially existing**, **planned**, and **production certified**. Mock UX is never described as a production backend feature.

| Phase | Status | Current evidence |
| --- | --- | --- |
| P0 Product/Architecture Foundation | IMPLEMENTED BASE | Repository initialized; typed service boundary, seven-section product boundary and frontend architecture exist. |
| P1 Design System | PARTIAL | Semantic tokens, responsive spacing/radius foundation and shared Panel component exist. Full primitive library remains. |
| P2 Application Shell | IMPLEMENTED BASE | Responsive sidebar, compact one-row mobile header, drawer, routing, title updates, theme foundation and protected shell exist. |
| P3 Mock Runtime & Overview | IMPLEMENTED BASE | Deterministic scenarios, persisted mock auth/profile state, Query layer and Overview exist. |
| P4 Profile | IMPLEMENTED MOCK | Editable display name/language/timezone, read-only canonical identity, local theme preference, Zod validation, pending/error/success states and unsaved browser-exit protection are implemented behind AccountService. Internal-route discard protection and avatar upload remain for later P4 hardening. |
| P5 Security | NOT YET | Mock summary only. |
| P6 Devices/Sessions | NOT YET | Mock list only. |
| P7 Apps/Permissions | NOT YET | Mock connected-app list only. |
| P8 Data/Sync UI | NOT YET | Mock summary only. |
| P9 Backup/Restore UI | NOT YET | Mock summary only. |
| P10 Privacy/Lifecycle UI | NOT YET | Capability placeholder only. |
| P11 Frontend adversarial QA | NOT YET | Planned only. |
| P12 Backend adapter migration | NOT YET | Existing backend audited; `ApiAccountService` not implemented. |
| P13 Real Auth/Profile | PARTIAL BACKEND | Supabase Auth + `account_profiles` exist. |
| P14 Real Security/Sessions/Devices | PARTIAL BACKEND | `list_thiepn_account_sessions()` exists; no durable Account device model/security event system found. |
| P15 App Registry/Permissions | PARTIAL BACKEND | `account_apps`, `account_user_apps`, `account_app_manifests` exist; no real permission-grant policy model. |
| P16 General Cloud Data/Sync | SPEC / APP-SPECIFIC | Core has frozen Sync Protocol v1 spec and Health-specific implementation; broad sync is explicitly not implemented. |
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
