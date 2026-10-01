# H2 Hub entry contract

Implementation pending production certification, 2026-10-01. Paired with THIEPN Hub H2; deploy Account first, then certify the callback and enable Hub.

The public `/hub/entry` route accepts exactly one `request` query field containing a Google S256 authorization URL from the existing pinned Supabase project. `validateHubAuthorization` requires the exact HTTPS issuer/path, one of each supported field, a 43-character challenge, `prompt=select_account`, and `https://thiepn.dev/home/auth/callback/` with exactly one 64-hex flow nonce. Alternate destinations, duplicate parameters, implicit/token fields, fragments and credentials fail closed. Unsupported/wrong project build configuration cannot enable this route's continuation.

The request is tokenless: Hub holds its verifier and exchanges its own callback code. Account's current session is neither exported nor replaced. Continue with Google establishes a separate Hub session under the same canonical THIEPN UUID authority. Account session reuse without Google OAuth is not implemented or claimed. Existing internal Account callback/return validation remains intact.

The entry request is removed from history after mount; outbound links suppress the referrer. The route offers a fixed Return to Hub link, and existing Account desktop/mobile navigation gains the same link. No new backend/RPC, registry grant, schema, storage key or OAuth callback is introduced in Account. No private data is read by the entry page. React StrictMode's repeated initialization is safe because request parsing is pure and URL cleanup occurs in an effect.

Account local sign-out remains Account-local. Account's sign-out-all-other-sessions can revoke Hub refresh eligibility under existing Supabase semantics; existing access JWT expiry still applies. H2 does not claim immediate global logout or cloud Hub preference sync.

Validation: 29 unit checks (15 added request-boundary cases), typecheck and production build pass. Paired built-app Chromium validation uses the actual entry page, real Hub Supabase SDK and fake provider/API, including verifier/challenge matching, two UUIDs, local/cross-tab sign-out, callback rejection, failures/cancellation, keyboard continuation and 320/1440 responsive/axe checks. Actual Google, deployment allowlist and multi-device revocation remain production gates. The existing Account bundle-size warning remains; no dependencies changed.

Current Supabase primary documentation: [PKCE](https://supabase.com/docs/guides/auth/sessions/pkce-flow), [session lifecycle](https://supabase.com/docs/guides/auth/sessions), [sign-out](https://supabase.com/docs/guides/auth/signout), [redirects](https://supabase.com/docs/guides/auth/redirect-urls). Full Hub contract and reproduction commands live in the paired Hub `docs/HUB_H2.md`.
