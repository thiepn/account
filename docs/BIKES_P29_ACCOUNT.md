# Bike Atlas P29 Account registration

Bike Atlas is a guest-first THIEPN product at:

- https://thiepn.dev/bikes/

P29 adds optional Account-backed cross-device sync only for the explicit saved Build Portfolio.

## Account capabilities

- shared canonical identity
- isolated app-owned data
- offline/local-first operation
- revision-safe portfolio sync
- cloud save/recovery
- explicit P28 export remains available

The app remains fully usable signed out.

## OAuth client

Bike Atlas must be registered in THIEPN Account Auth as a **public OAuth client**.

Exact production redirect:

https://thiepn.dev/bikes/auth/callback/

Required scopes:

- openid
- email
- profile
- offline_access

After Supabase creates the public client UUID, bind it in public.account_first_party_oauth_clients using the existing first-party registry contract.

Do not write directly to auth.oauth_clients from SQL migrations.
