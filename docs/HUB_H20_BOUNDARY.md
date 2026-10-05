# H20 native boundary repair

Hosted probes under `SET LOCAL ROLE authenticated` confirmed that managed JWTs
could call the native Account inventory and read Notes attachment metadata.
The pre-H20 raw Notes RLS restriction alone did not close these paths.

The migration moves 19 reviewed native Account/Notes management implementations
into `private`, revokes API-role execution, and preserves public signatures with
native-only wrappers. Public wrappers reject `client_id` before invoking native
code. Account tables with `user_id` gain restrictive managed-token denial.
Notes attachments gain a restrictive denial on the Notes bucket only. Other
products' native data and policies are not changed by this migration.

The hosted H20 test runs 28 rollback-only assertions with fictional identities,
including actual authenticated-role RLS/ACL checks, native owner compatibility,
all 19 wrapper denials, scoped capture success and deleted-session rejection.
H17's 14 and H18's 10 hosted assertions also pass after application.

These are database-role tests, not signed production OAuth issuance tests.
The shared project contains other native product surfaces requiring isolation
review before any managed Hub client is enabled. No OAuth client or allowlist
entry is created. Full activation is deliberately blocked.

Future native implementation updates must preserve the public OAuth-denying
wrapper and target the corresponding `private.h20_native_*` implementation.
Rerun all hosted Hub tests after any native boundary change. Do not revert the
security guard to roll back a UI release: disable the managed-client allowlist
first, then serve the last qualified public Hub artifact. Preserve notes, local
drafts and durable command receipts.
