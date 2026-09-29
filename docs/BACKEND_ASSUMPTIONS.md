# Backend assumptions requiring later resolution

These are not facts and must not be treated as implemented behavior.

1. RESOLVED: Supabase Auth `auth.users.id` is the canonical THIEPN Account ID for the existing platform.
2. `account_user_apps` may be migrated or replaced by a true connection/grant model; current rows only prove historical usage.
3. Core's Git registry and Account's database registry need one canonical ownership model before P15.
4. Current session listing can be adapted into P14, but stable device identity is not yet proven.
5. General Sync Protocol v1 in `thiepn/core/protocol` is a specification until Core implements it.
6. App-specific backup/recovery features must not be treated as the general P17 Account recovery plane.
7. The existing immediate `delete_thiepn_account()` RPC is not considered the target deletion architecture.
8. Backup retention after app-data/account deletion remains unresolved until P17/P18.

9. RESOLVED: New Auth users now receive an Account Profile through the private `account_provision_profile_from_auth_user` trigger; frontend provisioning is not required.
