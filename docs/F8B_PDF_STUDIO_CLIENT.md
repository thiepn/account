# F8B — PDF Studio first-party Account onboarding

## Authoritative account ownership

PDF Studio is an **optional, guest-first, local-first** app served from `https://thiepn.dev/pdf/`.
Only the user's goal text is sent to THIEPN Core for Luna workflow planning after Account authorization.
PDFs, filenames, forms and document bytes are not shared with Account or Luna.

Migration `20261009083000_pdf_app_registration_inactive.sql` creates the `pdf` Account application, its minimal Account manifest and one required `identity.basic` permission. **It remains inactive until its own public OAuth client has been registered and audited.** It does not create auth clients or sessions.

## One-time client registration — manual control plane only

Follow [FIRST_PARTY_CLIENT_ONBOARDING.md](FIRST_PARTY_CLIENT_ONBOARDING.md). The required immutable registration contract:

| Property | Exact value |
| --- | --- |
| Account app slug | `pdf` |
| Client name | `THIEPN PDF Studio` |
| Client URI | `https://thiepn.dev/pdf/` |
| Redirect URI | `https://thiepn.dev/pdf/` |
| OAuth client type | Public |
| Client authentication | `none` |
| OAuth grants | `authorization_code,refresh_token` |
| PKCE | S256 |
| Scope | `openid email profile offline_access` |
| Automatic consent | Basic identity only |
| Confidential data / cloud access | None |

The callback deliberately uses the existing root of the Github Pages path-hosted SPA. A nested `/pdf/auth/callback/` route would 404 without additional GitHub Pages rewriting; do not register an unhosted callback URL.

**No existing PDF OAuth client was present in the Account production Auth registry as checked on October 9, 2026.** Check again immediately before client creation.

1. Deploy and verify the inactive app/manifest/permission migration.
2. Register **exactly one** client using a reviewed, *manual-only* DCR operation, never a pull-request or push workflow. Record the real issued OAuth client UUID.
3. Check that `auth.oauth_clients` contains the exact public-client contract with no secret. Verify no duplicates.
4. Create a second *idempotent, UUID-pinned Account migration*, using the established Room/Library model, to insert into `public.account_first_party_oauth_clients` and to activate `public.account_apps.slug='pdf'`. Reject any mismatch and never invent a UUID.
5. Verify `resolve_thiepn_first_party_sso_probe(client_id)` and the Account consent path allow only the exact origin and callback. Verify an explicit disconnect remains disconnected.
6. Set the public UUID as `VITE_PDF_ACCOUNT_CLIENT_ID` on the PDF Studio build and the same UUID as `THIEPN_ACCOUNT_PDF_CLIENT_ID` in the Core Worker; the Core service denies any other client token.
7. Configure the real public issuer, Core base origin, redirect URI and public Account key. Complete the F8B privacy, auth and E2E verification before production promotion.

Do not use the existing Room, Library or Languages OAuth client ID for PDF Studio. Do not clone or reuse their refresh tokens.

## Remaining F8B gates

- The client registration is a manual operator action and is **not** performed by this PR.
- Server-only `THIEPN_AI_PDF_SECRET` must be provisioned independently on THIEPN AI (Vercel) and Core (Cloudflare) with the same strong value. Never put it in a PDF `VITE_` variable.
- F5 → F6 → F7 → F8 → F8B PRs must qualify and merge in order.
- Real Account sessions, silent SSO, reconnect refusal, Core paid-capability binding, CORS, model quota and PDF review/approval require physical production smoke evidence.

This PR deliberately does **not** activate the app, issue any OAuth client, change user data, or deploy production.
