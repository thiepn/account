# THIEPN Account v1.0.0 — final human release certification

**Status:** the shared Account authentication/SSO system is developed and deployed. The
public site is still a **release candidate**, not a signed final 1.0.0 release.

**Release evidence ledger:** `docs/release-certification.json`.
**Rules:** `docs/PRODUCTION_READINESS.md`.
**Live site:** https://account.thiepn.dev

## Prerequisites

Use a dedicated **disposable Google test Account** for any deletion, restore or
account-switch case. Never test destructive operations on the primary Account or
real TMS60/WTTN records. Do not create throwaway production OAuth clients: reuse
the registered first-party clients. Test Account must be independently owned and
must not be an administrator/service-role session. A second disposable Google
identity is necessary to test rejection of reauthentication as a different owner.

Before testing, record the *exact* production SHA from
`https://account.thiepn.dev/release.json` and the matching green GitHub
**Account CI → Deploy Account → Account SSO Production Burn-In** runs.

No password, refresh token, OAuth code/state, session cookie, user UUID,
complete export payload or raw personal record should be committed, attached
to GitHub, or pasted into the release ledger. Record only sanitized descriptions,
test screenshots with private information obscured, or links to restricted
test reports. Evidence references must be accessible to the release reviewer.

## Actual test cases

Run against the live Account origin, not the Vite mock/scenario runtime.

| Ledger ID | Human action | Passing evidence |
| --- | --- | --- |
| `google-signin` | Fresh browser profile; open Account, select Google sign-in, finish callback. | Protected Account appears and verified identity is stable after reload. |
| `protected-deeplink` | While signed out, open `/security#sessions`, authenticate. | Lands back in Security with sessions anchor, not Overview or an external URL. |
| `current-session-signout` | Sign out from Account and open `/profile` directly. | Profile redirects to sign-in; private state is not displayed. |
| `same-account-reauth` | Start a sensitive grant or privacy action with a stale assurance window; reauthenticate using the same Google user. | The originally authenticated Account remains owner and the user may continue after approval. |
| `different-account-reauth` | With two **disposable** Google identities, reauthenticate using the other identity. | Request is rejected; owner data is not mutated or displayed under the wrong identity. |
| `sessions-other` | Use two independent browsers; view sessions and sign out all *other* sessions. | Original browser stays signed in; other session cannot renew access. |
| `profile-update` | Set a harmless test display name, save and reload. | Same name appears; restore the test user's original value. |
| `app-permission` | Review an optional grant on a connected test app; approve/revoke with proper assurance. | Owner-only change persists; required grants remain protected; no unrelated app gains access. |
| `app-disconnect-reconnect` | Disconnect a registered test app, attempt auto connection, then request explicit reconnect. | No silent reconnection; explicit Account consent required; optional sensitive grants stay denied. |
| `data-inventory-export` | Open Data inventory; request Account metadata export and download it within the published expiry. | Inventory is owner scoped, export can be retrieved only by owner and expires as documented. |
| `wttn-delete` | Create disposable WTTN data; preview deletion plan and execute **only on test data**. | Namespace becomes deleted; an outdated client cannot resurrect the deleted revision. |
| `tms60-restore` | Create disposable TMS60 state; create verified backup; change state; restore. | Restored state matches snapshot; pre-restore safety backup and operation history exist. |
| `account-delete-cancel` | On a **disposable Account only**, review deletion plan, schedule seven-day deletion then cancel immediately. | Scheduled restriction appears; cancellation restores normal state. **Never allow the finalizer to run for this test.** |
| `android-chrome` | Real Android device + Chrome; sign in, navigate profile, sign out, rotate/reflow. | No blocked controls, identity mix-up, or horizontal overflow. |
| `samsung-internet` | Real Android device + Samsung Internet; sign in, navigate dialogs, sign out. | Sign-in and restricted storage behavior are safe and usable. |
| `edge-desktop` | Real desktop Edge; sign in, use keyboard-sensitive confirmation and sign out. | All important actions and focus restoration work. |
| `keyboard-zoom` | Keyboard-only Tab/Shift+Tab/Enter/Escape and *native browser 200% zoom* on Overview, Profile, Security, Apps and Privacy. | Skip link works, dialogs trap/restore focus; readable content without clipped critical controls. |
| `screen-reader` | Use a real screen reader (e.g. NVDA/VoiceOver); traverse landmarks, form labels, sign-in, consent and destructive dialogs. | Labels, live statuses and confirmation risks are announced understandably. |
| `theme-modes` | Cycle system, light, dark; reload; change OS dark/light preference while in system mode. | Expected contrast, legibility and persistent preference; OS preference changes apply in system mode. |
| `ios-safari` | Where an iOS device is available: run login, menu, profile, dialogs and logout in Safari. | Pass with evidence, or mark **not-applicable** and record why no iOS device was available. |

## Evidence and signing

For each row, enter `status: "passed"`, `verifiedBy`, an ISO UTC
`verifiedAt`, and a useful `evidence` reference in
`docs/release-certification.json`. Leave any incomplete mandatory case
`"pending"`; do not make a claim from mock UI or a simulated zoom.

Automated Chromium/Firefox/WebKit, OAuth discovery and fresh-browser SSO probes
are *separate* CI gates. They do not satisfy Google credentials, account
switching, physical-device, backup/restore or screen-reader verification.

The optional `ios-safari` case may be `"not-applicable"` with a written
reason, reviewer and timestamp; none of the other cases may be skipped.

When all mandatory rows have passed:
1. Ensure production's exact source SHA passed all CI, deploy and burn-in runs.
2. Set `reviewedBy` and `reviewedAt` with a release reviewer, after checking evidence.
3. Change both `package.json` and the ledger's `release` to `1.0.0` in a reviewed PR.
4. The `check-release-certification.mjs` CI and deployment gates must pass.
5. Merge, verify deployed release SHA and live smoke again; only then publish
   the final `v1.0.0` tag/release and close the P20 release issue.

**If any required evidence is missing, stop at `1.0.0-rc.2` and keep P20
open.** This is still an integration-ready, production-deployed platform, not
evidence of a completed final release.

## Scope explicitly excluded from v1

- Universal consumer-app data synchronization and backup engines.
- Individual-session remote revocation (only documented supported session
  operations are exposed).
- Authoritative production security-event history until a trusted event
  ingestion/query contract exists.
- Automatically registering arbitrary OAuth clients or authenticating every
  unfinished consumer app.
- Consumer-specific consent enforcement on data backends not yet migrated.
