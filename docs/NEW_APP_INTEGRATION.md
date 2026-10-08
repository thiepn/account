# Integrating a new app with THIEPN Account

This is the **Account-side integration contract**. The Account service and SDK can be completed and released independently from consumer apps. A new app should require configuration and onboarding, not a new login or token-sharing mechanism.

## What Account owns

- One canonical user UUID and one upstream Google sign-in at `account.thiepn.dev`.
- OAuth 2.1/OIDC Authorization Code + PKCE, refresh-token rotation, callback/redirect validation and public-client discovery.
- Per-app OAuth client identity (`client_id`), first-party registration and automatic basic-identity consent for explicitly approved clients.
- Owner-scoped app connections and required/basic grants, explicit reconnection after disconnect, optional sensitive permission grants, sessions and account deletion.
- Shared `@thiepn/account-session` runtime, tokenless same-browser SSO eligibility probe, and cross-origin navigation fallback.

## What an app owns

- Its own app-specific access/refresh token **on its own origin**. No shared parent-domain auth cookie.
- Calling `initialize()` **before displaying personal authenticated data**.
- The exact registered OAuth callback route and handling its result before private UI loads.
- Holding user-specific caches under the verified Account UUID, and clearing them on sign-out/account switch; no account-A data may render for account B.
- Its own backend ownership checks, `client_id` enforcement, data synchronization and product-specific recovery behavior.
- The guest experience, if it is guest-first.

## One-time registration (no Account frontend changes)

1. Add the product to the Account app registry, with an HTTPS product URL, stable slug and required `identity.basic` only. Sensitive grants remain separate.
2. Register **one OAuth 2.1 public client** on the Account Supabase issuer using the operator-only process described in [FIRST_PARTY_CLIENT_ONBOARDING.md](./FIRST_PARTY_CLIENT_ONBOARDING.md). DCR must never run automatically on PR/push. Do not create duplicate clients.
3. Bind its issued UUID and exact HTTPS redirect URI to the app slug in `account_first_party_oauth_clients` with a reviewed migration. Enable automatic identity consent only for the trusted first-party, basic-scope client.
4. Check the exact client URI/origin and registration using the `/sso/probe` boundary, OAuth discovery, and an interactive disposable-account test.
5. Pin a reviewed `thiepn/account` package commit; do not hardcode an unregistered UUID or use Google OAuth from the client app.

**Transport security:** the shared SDK requires HTTPS for both the OAuth issuer and the exact redirect URI. HTTP is accepted only for an explicit `localhost`, `127.0.0.1` or `[::1]` development loopback; private LAN addresses and HTTP production hosts are rejected. Production registrations remain HTTPS-only.

## Minimal browser integration

Install the shared `@thiepn/account-session` package from a **pinned, reviewed commit**. In a browser entry module:

```ts
import { createThiepnAccountSession, createThiepnBrowserSso } from '@thiepn/account-session';

const session = createThiepnAccountSession({
  issuer: 'https://<YOUR-ACCOUNT-SUPABASE-ISSUER>',
  publishableKey: '<PUBLIC-PUBLISHABLE-KEY>',
  clientId: '<REGISTERED-OAUTH-CLIENT-UUID>',
  redirectUri: 'https://your-app.thiepn.dev/auth/callback/',
  storageKey: 'thiepn:your-app:sso:v1',
  authPolicy: 'guest-first', // or 'required'
});

export const sso = createThiepnBrowserSso(session, {
  accountOrigin: 'https://account.thiepn.dev',
});

// At your callback route, before app loading:
if (location.pathname === new URL(session.redirectUri).pathname) {
  const identity = await sso.completeCallback(location);
  // Validate result, remove the one-use code from history, then navigate home.
  // Do not show account-owned data if identity.status !== 'signed-in'.
} else {
  const result = await sso.initialize();
  if (result.status === 'redirecting') {
    // Browser navigates to Account OAuth flow: do not show private data.
  } else if (result.identity.status === 'signed-in') {
    // Scope every private query/cache by result.identity.id and verify grants.
  } else if (result.identity.status === 'unavailable') {
    // Display retry/offline UI; never invent an authenticated user.
  } else {
    // Public/guest view; offer a visible "Continue with THIEPN Account" action.
  }
}

// Explicit user action:
document.querySelector('#connect')?.addEventListener('click', () => void sso.connect());

// App-local logout does NOT log the user out of their canonical Account
// session or other products, and it suppresses silent auto-reconnect.
document.querySelector('#signout')?.addEventListener('click', () => {
  clearAppPrivateCaches();
  sso.signOutLocal();
});
```

Use `sso.getAccessToken()` for authenticated Core/data requests; the gateway must verify the bearer and derive user ownership server-side. `getAccessToken()` is not an authorization decision and must never be used to bypass RLS.

### Automatic sign-in rules

On first visit with no local app session, the SDK probes Account for a **boolean-only** `signedIn/eligible` reply bound to the exact registered client origin. If signed in and eligible, it initiates first-party OAuth immediately, with no repeated Google picker. Account issues a one-time PKCE-bound code; the app exchanges it locally and verifies its identity.

For signed-out, disconnected, offline, blocked-iframe or unavailable probes, the app does **not** auto-redirect repeatedly. An explicit user click uses top-level OAuth, which generally works where embedded storage checks are blocked. Signing out locally suppresses auto-attach until the user explicitly reconnects.

Cookies/privacy policies can prevent a guaranteed zero-navigation experience. Different browsers, profiles and devices do not magically share sessions.

## Acceptance checklist for every consumer

- [ ] Exact registered HTTPS origin, callback and client UUID are configured; the upstream Google login is invoked only by Account.
- [ ] Initial app loading waits for verified identity before rendering personal data.
- [ ] Account signed in first → new app recognizes it without requiring another Google selection (a top-level redirect is acceptable).
- [ ] App signed in first → Account shares the same canonical user UUID.
- [ ] No local session + Account signed out → guest UI or required-auth entry, without redirect loops.
- [ ] Manual disconnect, local sign-out, revoked app grants and account-switch A→B are respected.
- [ ] Browser storage restrictions, offline refresh/retry, duplicate tabs and expired tokens do not show stale private data.
- [ ] Backends verify `auth.uid()`, `client_id` and permission grants for the correct data operations.
- [ ] Chromium, Firefox, WebKit, keyboard, mobile and a disposable user sign-in/sign-out are qualified.

**Account platform acceptance is distinct from per-app acceptance.** Do not claim all apps are synchronized just because the Account issuer and SDK are qualified.
