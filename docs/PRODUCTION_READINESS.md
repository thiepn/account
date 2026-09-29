# P20 production readiness

Release candidate: **1.0.0-rc.1**

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
- Pages artifact creation from the exact green CI commit.

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

## External configuration required before v1.0.0

These cannot be certified from repository code alone:

1. **GitHub Pages publishing source**
   - Repository Settings → Pages → Source: **GitHub Actions**.
2. **Custom domain**
   - Repository Pages custom domain: `account.thiepn.dev`.
   - DNS: `account` must resolve to the GitHub Pages host required by the repository.
   - HTTPS must become active before certification.
3. **Supabase Auth URL configuration**
   - Site URL should be the final Account origin.
   - Allowed redirect URL must include `https://account.thiepn.dev/auth/callback`.
4. **Google OAuth provider**
   - Google OAuth redirect/origin configuration must match the Supabase/Auth production flow.
5. **Real-origin certification**
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
6. **Device/browser matrix**
   - Automated before release: Chromium, Firefox and WebKit desktop engines.
   - Manual hardware remains: Edge desktop sanity check, Android Chrome, Samsung Internet, and iOS Safari when an iOS device is available.
7. **Accessibility/manual UX**
   - keyboard-only shell and dialogs;
   - 200% zoom;
   - 320px viewport;
   - screen-reader landmark/label pass;
   - light/dark/system themes.

## Release rule

Do **not** tag or describe the system as `v1.0.0` until the production origin passes the real OAuth and destructive-lifecycle smoke checks above.

Until then the accurate status is **v1.0.0-rc.1**.
