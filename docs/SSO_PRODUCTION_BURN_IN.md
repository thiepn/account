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
7. fresh browsers opened on live Library and live Languages can each embed the Account `/sso/probe` route and receive the exact response for their registered client from `https://account.thiepn.dev`;
8. those fresh browsers have no Account session and both registered clients remain eligible for first-party SSO.

The Library/Languages probe tests are intentionally cross-origin. It catches regressions in Account routing, the production first-party registry/RPC, referrer/origin binding, frame policy and the `postMessage` contract.

## What this does not certify

The workflow never stores Google credentials, Account refresh tokens or a long-lived production test user. It therefore cannot certify authenticated human behavior.

Before calling the first-party SSO rollout fully accepted, manually verify with a real Account:

- Google sign-in completes on `account.thiepn.dev`;
- each consumer that has cut over to first-party SSO attaches through THIEPN Account rather than invoking Google directly;
- its exact registered callback completes and the app receives its own app-scoped session;
- disconnecting the app in Account makes silent SSO ineligible and revokes only that app's OAuth sessions without signing out the native Account dashboard;
- an explicit reconnect restores only required/basic grants;
- account switching and reauthentication preserve same-Account enforcement;
- the flow works on the intended desktop and mobile browsers.

Sensitive optional permissions remain outside automatic SSO and must never be granted by this burn-in flow.
