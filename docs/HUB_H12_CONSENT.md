# H12 — Hub consent and authorization

Adds AccountService.hub, a protected /hub/connections page, strict response validation and a candidate PostgreSQL consent/authorization boundary. VITE_HUB_SHARING_ENABLED=v1 exposes the staged page. Default production builds hide its navigation and never call the new RPCs. No hosted schema, OAuth client, redirect, token hook or grant is changed.

Users explicitly select summary, continuation and title search. Nothing is preselected. Consent is separate from broad Notes connection/grants. Saves require the current revision, preventing silent overwrites by another tab. Every save, including revoke-all, creates a fresh UUID revision; an old revision cannot become valid after regranting. Failed saves retain the draft. Account events clear state synchronously; generation checks discard late reads/saves from earlier accounts. All backend calls stay in the service adapter.

supabase/proposals/h12_hub_consent.sql is an unapplied candidate outside migration history. It creates private RLS-enabled client/consent tables with no direct authenticated/anonymous access. The empty client allowlist denies every Hub authorization. Narrow fixed-search-path SECURITY DEFINER RPCs read these private control tables and live lifecycle/session state. They derive the owner from auth.uid(), accept no owner selector and return no app data.

Only ordinary Account sessions may manage consent; client_id-bearing tokens cannot grant themselves permission. Granting requires Notes connection/read entitlement and an active account. Revocation remains available during deletion. Authorization additionally requires the registered enabled client, thiepn-hub audience, matching current session, unexpired token and current purpose/revision. Session-row existence is not proof of immediate global JWT revocation.

Core apps/platform verifies the exact token through Supabase Auth before consuming its claims, then invokes the RPC with the same token and a publishable key. No service-role key, homemade signing protocol, grant cache or token bridge is added. Incoming managed OAuth tokens use audience thiepn-hub; the returned resource authorization uses notes-hub. Hosted token-hook, Data API audience acceptance and PKCE behavior must be qualified together. Existing H10 Google sign-in remains identity-only. H14 adds the browser token-acquisition journey.

## Hosted policy prerequisite

Metadata-only pg_policies inspection on 3 October found four permissive Notes policies, four TMS60 sync policies and seven Storage object policies without client binding, with no restrictive policies on those tables. Other Account/app tables also require review. No private rows were read and no policy was changed. This identifies review targets, not proof of successful exploitation.

Do not enable client issuance until its tokens are denied raw app/Storage access and unauthorized existing RPCs. OIDC scopes do not restrict database access. Review all exposed functions: SECURITY DEFINER can bypass table RLS. Preserve existing app sessions and verify their access. H13 must create CLI-generated migrations, qualify deployed schema/policies/audiences, mount Notes and enforce grants at its data boundary. Production activation and real-device observations remain H20.

## Checks

Account checks cover response validation, explicit choices, save failure/draft recovery, revoke-all and late-account result disposal. Hub consent PostgreSQL runs the actual SQL against pinned fixture-only PGlite 0.5.8. It exercises owner isolation, direct-table denial, optimistic revisions, revoke/regrant, client/audience/session/purpose denial, Notes entitlement and deletion restrictions. Fictional Auth fixtures do not certify hosted authorization or real session revocation.

Run with H12_PGLITE_PATH pointing to pinned pglite/dist/index.js: node scripts/test-h12-consent.mjs.
