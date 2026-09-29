# Integration gap matrix — audited 2026-09-29

## Account frontend

The GitHub repository was empty before the current implementation slice. There was no production Account frontend to preserve.

## Account Supabase

| Planned domain | Existing backend | Gap |
| --- | --- | --- |
| Identity | Supabase Auth | Strong base; frontend Auth adapter/bootstrap contract still needed. |
| Profile | `account_profiles` + owner RLS | Needs ApiAccountService integration and explicit concurrency semantics. |
| Sessions | `list_thiepn_account_sessions()` | Read exists; revocation and stable device abstraction are missing. |
| Devices | No durable Account device model found | Must not infer physical devices from UA strings. |
| App Registry | `account_apps` + `account_app_manifests` | Must reconcile with Core's Git registry before P15. |
| Account↔App | `account_user_apps` | Currently usage tracking, not a complete authorization connection model. |
| Permissions | No Account permission grants found | P15 is missing server-enforced scope grants. |
| Export | `export_thiepn_platform_snapshot()` | Synchronous metadata snapshot, not durable portable export jobs. |
| Account deletion | `delete_thiepn_account()` | Immediate deletion; no plan/grace period/journal/external cleanup verification. |
| Security activity | No dedicated Account event model found | P5/P14 backend missing. |
| Backup/restore | No general Account recovery subsystem | P17 missing. |

## Core

| Planned capability | Current Core state | Gap |
| --- | --- | --- |
| Gateway | Implemented | Preserve as trusted application-facing boundary. |
| Registry | Git-owned `registry/apps.json` | No Account permission grants. |
| Auth bridge | Implemented for Health | Narrow Account bearer verification, not general SSO platform. |
| Sync protocol | Detailed frozen v1 specification | Broad implementation has not started. |
| Health data | Implemented Phase 1 | Must not be generalized implicitly. |
| Broad app sync | Not implemented | P16 future work. |
| General backup/restore | Not implemented | P17 future work. |
| General encryption | Not implemented | P17 needs an explicit custody design. |

## Security-advisor findings

The Account Supabase security advisor currently reports, among other items:

- multiple authenticated-callable `SECURITY DEFINER` functions that require intentional review;
- leaked-password protection disabled;
- several RLS-enabled tables with no policies (some may be intentionally inaccessible).

These are P19 inputs, not automatic vulnerabilities; each callable definer function must be reviewed against its intended authorization logic.

## Immediate implementation order

1. Complete P0-P3 frontend foundation.
2. Implement P4-P10 fully against `MockAccountService`.
3. Execute P11 frontend state/adversarial QA.
4. Add `ApiAccountService` and migrate the lowest-risk real identity/profile slice.
5. Reconcile Account and Core registry ownership before P15.
6. Do not surface the current immediate account-delete RPC as the final Privacy UI.
