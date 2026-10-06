# Languages tokenless Account entry

THIEPN Languages uses the same canonical Account identity authority as the other THIEPN products, but keeps its browser session isolated from Account.

## Entry

Public route:

- `/languages/entry?request=<authorization URL>`

The route accepts only a Google S256 PKCE authorization request issued by the existing THIEPN Account Supabase project. The request must return to the exact production callback:

- `https://languages.thiepn.dev/auth/callback/`

Unknown or duplicate request parameters, alternate origins/paths, callback query parameters, fragments, credentials, non-S256 PKCE and malformed requests fail closed.

## Session boundary

The PKCE verifier remains in the Languages browser origin. Account receives no Languages access token, refresh token or verifier. After Google/Supabase redirects back to Languages, Languages exchanges the one-use code with the locally stored PKCE verifier and verifies the returned user through Supabase Auth before using the session bearer token with THIEPN Core.

A short-lived pending-login marker remains in tab-local session storage so a callback is accepted only after Languages initiated a sign-in in that tab. The OAuth authorization code is still cryptographically bound to the browser-held PKCE verifier; no wildcard redirect URL or extra callback nonce is required.

Account and Languages local sign-out remain independent browser-session actions. Both sessions resolve to the same canonical Account `auth.users.id`.

No new Account database schema, grant or app-data permission is introduced by this entry route.
