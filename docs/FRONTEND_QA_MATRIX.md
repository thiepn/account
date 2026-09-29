# Frontend QA matrix

P11 will expand this into the complete release matrix.

| Route | Scenario | Viewport | Theme | Expected | Status |
| --- | --- | --- | --- | --- | --- |
| `/` | default | 390px | light | Compact header, no overflow, Overview loads | TODO |
| `/` | security-warning | 1440px | dark | One actionable warning, stable shell | TODO |
| `/devices` | many-devices | 320px | light | Device list wraps without horizontal overflow | TODO |
| `/apps` | many-apps | 1440px | dark | Large list remains usable | TODO |
| `/data` | sync-problem | 390px | dark | Sync attention state visible | TODO |
| `/privacy` | deletion-pending | 390px | light | Lifecycle state remains understandable | TODO |

Golden scenarios currently supported by `MockAccountService`:

- default
- new-account
- many-apps
- many-devices
- security-warning
- sync-problem
- backup-failed
- offline
- partial-backend
- deletion-pending
- long-content


## P19 production-boundary certification — 2026-09-29

| Area | Evidence | Result |
| --- | --- | --- |
| Type safety | `pnpm typecheck` in CI | PASS |
| Unit invariants | Vitest runtime invariants + return-target tests | PASS |
| Browser smoke | Chromium desktop/mobile/profile/overflow + lifecycle tests | REQUIRED PASS on current head |
| Production build | `pnpm build` | REQUIRED PASS |
| Mock isolation | CI scans production `dist` for mock/scenario/dev-runtime markers | REQUIRED PASS |
| Backend boundary | CI rejects Supabase client/backend calls outside Account adapter | REQUIRED PASS |
| Destructive confirmation | Exact `DELETE` browser regression | COVERED |
| Deletion-pending visibility | Global shell regression | COVERED |
| Return-target safety | External/protocol-relative/auth-loop values fall back to `/` | PASS |
| DB recent auth | Current JWT `session_id` must map to a session created within ten minutes | VERIFIED |
| DB lifecycle lock | Profile / Account connections / sensitive grants blocked while deletion pending | VERIFIED |
| Legacy immediate account deletion | Authenticated EXECUTE revoked | VERIFIED |
| Account RLS no-policy findings | None in current Supabase advisor output | VERIFIED |
| Account FK indexing findings | None after P19 migration | VERIFIED |

P20 still owns physical-device/browser verification, live Google OAuth on the final production origin, and deployment-origin configuration.
