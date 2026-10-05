# H17 — Notes reminder Inbox ownership

The canonical Notes/Account project owns the `thiepn_hub_notes_inbox` RPC. Native synced reminders already exist; H17 projects only explicit active reminders that are due and have an available, non-trashed parent note. Future reminders, malformed timestamps, missing/deleted notes and records containing privacy/lock markers are excluded. Metadata is bounded to ten rows and 32 KiB. Note bodies and attachments are never projected.

Notes sharing now offers independent `notes.hub.inbox.read` and `notes.hub.inbox.attention.write` purposes. Write consent requires read consent. Existing choices are unchanged; all new choices start unchecked. Read requests and actions recheck the current owner, managed client allowlist, active Auth session, account lifecycle, Notes entitlement, app connection, read grant and exact consent revision. Native sessions cannot invoke this managed projection. Existing Home/search authorization responses retain their original three-purpose allowlist for Core compatibility.

Mark read and dismiss update only private Inbox attention state. They never change the native reminder status, due date, completion or notification state. Dismissal returns an explicit tombstone; subsequent reads exclude it. A changed due date or creation timestamp represents a new chosen occurrence and becomes unread. Titles and last-notified changes do not reset attention.

Actions serialize with consent changes, lock the native source rows, compare the displayed update timestamp and use a UUID request ID as an idempotency key. Reusing a key with changed parameters or a changed source occurrence fails. Replay checks current authorization and source eligibility; no stale response is replayed after revocation. Receipt storage is capped at 4096 per owner, with a 24-hour replay window. Calls share the existing 60-per-minute Notes projection budget. No automatic retries are required.

Tables remain in the private schema with RLS and no anon/authenticated table grants. The exposed RPC is intentionally SECURITY DEFINER to perform this narrow projection; its guard derives the owner from the verified JWT and accepts no caller-selected owner. Anonymous execution is revoked. The security advisor's default-deny RLS information and intentional guarded definer warning do not warrant public table grants.

Hosted migrations:
- `20261005123203_hub_h17_notes_inbox.sql`
- `20261005123732_hub_h17_notes_legacy_projection_permissions.sql`

`supabase/tests/hub_h17_notes_inbox.sql` exercises actual hosted authorization/projection/action functions using fictional identities, sessions, client and reminders inside one rolled-back transaction. Thirteen assertions pass, including body exclusion, independent write authorization, stale/reused commands, rescheduling, privacy markers, legacy Core compatibility, revocation and cross-owner denial. Anonymous RPC and direct private table access are denied. No managed clients are enabled.

Account's existing staged managed OAuth authorization UI now accepts the exact `/inbox/` callback in addition to `/home/`, for its configured first-party Hub client. Other callback paths remain rejected. Production OAuth issuance and Hub private activation remain H20; no client registration, redirect configuration or flag activation is performed here.
