# H14 — staged Hub OAuth authorization UI

The protected `/oauth/consent` route is available only when `VITE_HUB_OAUTH_ENABLED=staged-v1` and a qualified client UUID is configured. Defaults remain empty. This phase does not register a client or change hosted OAuth configuration.

The Account API adapter uses Supabase SDK `getAuthorizationDetails`, `approveAuthorization` and `denyAuthorization` with browser redirection disabled. It verifies the current owner before and after SDK work, checks the configured client UUID and first-party client URI, exact `https://thiepn.dev/home/` redirect and `email` scope, and validates the returned code/state or denial/state URL before navigation. The UI renders a fixed THIEPN Hub identity, offers explicit Connect Hub and Decline, and discards late results after an identity change.

OAuth authorization is separate from Notes sharing. Existing H12 sharing choices still determine permitted Notes operations and H13 rechecks their current revision and native Notes sync access. No note body or attachment permission is added.

Parser unit tests cover owner/client/redirect/scope rejection and unsafe callback URLs. Hub's paired H14 browser workflow exercises these actual Account source files against fictional SDK endpoints in three engines. Staged builds are test artifacts only. Production activation and managed client issuance await hosted runtime and project-wide access-boundary qualification.
