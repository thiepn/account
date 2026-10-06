# Languages tokenless Account entry

THIEPN Languages uses the same canonical Account identity authority as the other THIEPN products, but keeps its browser session isolated from Account.

## Entry

Public route:

- `/languages/entry?request=<authorization URL>`

The route accepts only a Google S256 PKCE authorization request issued by the existing THIEPN Account Supabase project. The request must return to:

- `https://languages.thiepn.dev/auth/callback/?flow=<64 hex characters>`

Unknown or duplicate request parameters, alternate origins/paths, implicit-token fields, fragments, credentials, non-S256 PKCE and malformed flow identifiers fail closed.

## Session boundary

The PKCE verifier remains in the Languages browser origin. Account receives no Languages access token, refresh token or verifier. After Google/Supabase redirects back to Languages, Languages exchanges the one-use code and verifies the returned user through Supabase Auth before using the session bearer token with THIEPN Core.

Account and Languages local sign-out remain independent browser-session actions. Both sessions resolve to the same canonical Account `auth.users.id`.

No new Account database schema, grant or app-data permission is introduced by this entry route.
