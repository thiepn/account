# Account SSO production burn-in

This gate continuously verifies the public production contract around THIEPN Account without storing user credentials in GitHub Actions.

## Automated coverage

`.github/workflows/account-sso-production-burn-in.yml` runs:

- after a successful `Deploy Account` workflow;
- once per day at 04:17 UTC;
- on manual dispatch.

It verifies:

1. the canonical Supabase OAuth issuer, authorization endpoint and token endpoint;
2. Authorization Code + refresh grants, PKCE S256, public-client exchange and the required identity scopes;
3. `https://account.thiepn.dev/release.json` is a real-service THIEPN Account release with a Git commit SHA;
4. Account's deterministic production routes are published;
5. Library, Languages and Japanese production surfaces are reachable and render non-empty application shells;
6. Account's Languages and Japanese entry boundaries reject an empty/invalid request deterministically;
7. a fresh browser opened on live Library can embed the Account `/sso/probe` route and receive the exact registered Library client response from `https://account.thiepn.dev`;
8. the fresh browser has no Account session and the registered Library client remains eligible for first-party SSO.

The Library probe test is intentionally cross-origin. It catches regressions in Account routing, the production first-party registry/RPC, referrer/origin binding, frame policy and the `postMessage` contract.

## What this does not certify

The workflow never stores Google credentials, Account refresh tokens or a long-lived production test user. It therefore cannot certify authenticated human behavior.

Before calling the first-party SSO rollout fully accepted, manually verify with a real Account:

- Google sign-in completes on `account.thiepn.dev`;
- Library attaches through THIEPN Account rather than invoking Google directly;
- the Library callback completes and the app receives its own app-scoped session;
- disconnecting Library in Account makes silent SSO ineligible and revokes Library-specific OAuth sessions without signing out the native Account dashboard;
- an explicit reconnect can restore Library with only required/basic grants;
- account switching and reauthentication preserve same-Account enforcement;
- the flow works on the intended desktop and mobile browsers.

Sensitive optional permissions remain outside automatic SSO and must never be granted by this burn-in flow.
