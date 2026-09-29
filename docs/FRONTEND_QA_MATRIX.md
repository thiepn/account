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
