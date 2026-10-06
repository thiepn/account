# First-party SSO

THIEPN Account is the only upstream interactive login surface for first-party THIEPN applications.

First-party browser applications are registered as public OAuth 2.1 clients in Supabase Auth. They use Authorization Code + PKCE and receive app-scoped access/refresh tokens containing a `client_id`. They do not invoke Google directly.

The Account database separately binds each Supabase OAuth client UUID to one `account_apps.slug`, an exact callback URI, presentation metadata, and an automatic-basic-identity-consent flag. Authorization trusts the client UUID plus exact callback; a client website URI is not treated as an authorization credential. The registry is not directly readable or writable by browser roles.

When a registered first-party authorization request reaches `/oauth/consent`:

1. Account verifies the current native Account session.
2. Supabase returns the pending authorization details.
3. Account resolves the exact client UUID + callback + standard scopes against `account_first_party_oauth_clients`; the client website URI is presentation metadata only.
4. A never-before-seen app connection is created with only required/basic grants.
5. Official guest-first apps first use the `/sso/probe` boundary, which exposes only signed-in/eligibility bits to the registered app origin. A deliberately disconnected app is ineligible for silent authorization.
6. If the user explicitly starts a new OAuth connection after disconnecting, Account reconnects that app and restores only its required/basic grants.
7. Account approves the authorization automatically when `automatic_identity_consent=true`.
8. Supabase returns a one-time authorization code to the exact registered app callback.
9. The app exchanges the code with its PKCE verifier and retains its own app-local refresh token.

Sensitive optional grants remain separate. Automatic SSO never enables Google Drive, personal-file cloud, cross-app private data, or other sensitive capabilities.

Native Account dashboard sessions have no OAuth `client_id`. First-party app tokens do. Control-plane RLS allows an OAuth client to see only the connection, grants, and permission definitions for the app bound to its own client ID. Unknown/delegated clients see none of that state. Disconnecting an app denies its grants and deletes only that app's OAuth Auth sessions; their refresh tokens cascade away, while the native Account dashboard session remains signed in.
