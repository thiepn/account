# Security invariants


## Account deletion invariants

- No authenticated caller can invoke the legacy immediate Auth-user deletion RPCs.
- A deletion request requires a fresh server plan and exact `DELETE` confirmation.
- Plans expire after ten minutes.
- Requests remain cancellable until their server-defined grace deadline.
- Only the owner-only finalizer can irreversibly delete the Auth user.
- The finalizer rechecks non-database storage blockers before deletion.
- External Google identity is never deleted by THIEPN Account.
