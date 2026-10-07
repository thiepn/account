# P20 production readiness

Release candidate: **1.0.0-rc.2**

Target origin: **https://account.thiepn.dev**

## Automated gates

The release candidate must pass:

- Account CI typecheck;
- Vitest unit/runtime invariants;
- Playwright Chromium, Firefox and WebKit smoke/lifecycle tests;
- deterministic install from the committed `pnpm-lock.yaml` using `--frozen-lockfile`;
- production Vite build;
- direct-backend boundary scan;
- mock/scenario/dev-runtime bundle exclusion;
- production Supabase-origin assertion;
- production canonical OAuth-origin assertion for `https://account.thiepn.dev`;
- Pages artifact creation from the exact green CI commit;
- embedded `release.json` + SHA-256 manifest;
- post-deploy verification that the live `release.json` commit equals the audited CI SHA.

## Database/backend gates already verified

- canonical Account identity = Supabase Auth user UUID;
- new Auth users receive an Account Profile;
- Account owner-facing tables use RLS/read restrictions where exposed;
- legacy immediate Auth-account deletion is not callable by authenticated users;
- full Account deletion uses a seven-day cancellable lifecycle;
- deletion finalizer is owner-only and scheduled hourly;
- sensitive actions use a server-authoritative recent-session window;
- WTTN app deletion has a stale-client-resistant revision tombstone;
- TMS60 restore verifies backup integrity and creates a safety backup;
- Account-specific missing foreign-key indexes reported during P19 were fixed.

## Production configuration verified

As of 2026-10-07, the one-time production configuration is no longer a release blocker:

- GitHub Pages publishes through GitHub Actions;
- `account.thiepn.dev` is the live HTTPS origin;
- the deployed release manifest is checked against the exact green commit SHA;
- Supabase Auth uses the production Account origin/callback;
- the Google OAuth flow has completed successfully on the production origin;
- the Account OAuth 2.1 discovery endpoint is live and advertises Authorization Code, refresh tokens and PKCE S256;
- canonical first-party Library and Languages clients are registered and pass the live cross-origin SSO probe.

## Remaining manual certification before v1.0.0

These still require human or physical-device evidence:

1. **Real-origin destructive and recovery workflows**
   - fresh Google sign-in;
   - sign-out;
   - deep-link sign-in return;
   - sensitive-action reauthentication;
   - same-Account enforcement after reauth;
   - session list and sign-out-other-sessions;
   - Profile update;
   - connected-app permission mutation;
   - Data inventory;
   - Account metadata export;
   - WTTN deletion plan/blocker behavior;
   - TMS60 backup/restore using disposable test state only;
   - Account deletion plan and cancellation using a disposable test Account only.
2. **Device/browser matrix**
   - Automated before release: Chromium, Firefox and WebKit desktop engines.
   - Manual hardware remains: Edge desktop sanity check, Android Chrome, Samsung Internet, and iOS Safari when an iOS device is available.
3. **Accessibility/manual UX**
   - keyboard-only shell and dialogs;
   - 200% zoom;
   - 320px viewport;
   - screen-reader landmark/label pass;
   - light/dark/system themes.

## Release rule

Do **not** tag or describe the system as `v1.0.0` until the remaining destructive/recovery, physical-device and accessibility certification gates above are complete.

Until then the accurate status is **v1.0.0-rc.2**.


## External configuration verification

On 2026-09-30, the one-time Pages, custom-domain/DNS and production OAuth configuration steps were reported complete. By 2026-10-07, the full Account CI → production artifact → Pages preflight → deploy → live `release.json` SHA verification chain had passed on the production origin, followed by a green Account SSO production burn-in.


## Live Google OAuth initiation

The production post-deploy browser smoke verifies that `Continue with Google` initiates the real Supabase Google OAuth flow and carries the exact canonical callback:

`https://account.thiepn.dev/auth/callback`

The automated smoke deliberately stops before entering Google credentials, but separate live production verification has already confirmed successful Google authorization, PKCE callback, token exchange and authenticated Account reads. Future releases must preserve both automated initiation checks and human end-to-end regression coverage.


## First-party SSO release gate

The Account SSO production burn-in is now part of the production acceptance chain. It verifies:

- canonical OAuth discovery metadata;
- deterministic Account production routes, allowing only bounded same-origin trailing-slash redirects;
- live Library, Languages and Japanese surfaces remain reachable;
- invalid Languages/Japanese Account entry requests fail deterministically;
- fresh-browser Library and Languages `/sso/probe` calls resolve the exact registered client and remain eligible;
- no fresh burn-in browser unexpectedly inherits an Account session.

The burn-in does not store Google credentials or production refresh tokens. Human authenticated callback, disconnect/reconnect and device/browser behavior therefore remain separate evidence where applicable.
