# Security invariants


## Account deletion invariants

- No authenticated caller can invoke the legacy immediate Auth-user deletion RPCs.
- A deletion request requires a fresh server plan and exact `DELETE` confirmation.
- Plans expire after ten minutes.
- Requests remain cancellable until their server-defined grace deadline.
- Only the owner-only finalizer can irreversibly delete the Auth user.
- The finalizer rechecks non-database storage blockers before deletion.
- External Google identity is never deleted by THIEPN Account.


## P19 recent-authentication invariants

- Sensitive authorization is not based on a browser timestamp.
- The database checks the current JWT `session_id` against `auth.sessions`.
- Sensitive actions require that session to have been created within the last ten minutes.
- Google reauthentication uses OAuth with `prompt=login`.
- The pre-reauth Account ID is stored only in session storage and is compared with the post-callback Account ID.
- If a different Google Account returns, the new local session is signed out and the sensitive action is not executed.
- `backup.include` permission changes require recent auth.
- TMS60 restore requires recent auth.
- WTTN cloud deletion requires recent auth.
- Scheduling full Account deletion requires recent auth.
- A pending/deleting Account blocks Profile edits and Account connection/grant mutations at the database layer.

## Advisor disposition

- Account tables are not present in the RLS-without-policy advisor finding.
- Authenticated-callable Account `SECURITY DEFINER` RPCs are intentional narrow boundaries and must each remain `auth.uid()` scoped.
- The finalizer and private guard functions are owner-only.
- Supabase leaked-password protection remains a P20 hosted Auth configuration requirement.
