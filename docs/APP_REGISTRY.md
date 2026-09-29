# THIEPN app registry authority

There are two registries because they answer different questions.

## Account registry — user-connectable products

Authoritative store: THIEPN Account Supabase

- `account_apps`
- `account_app_manifests`
- `account_app_permissions`

It answers:

- Which products may appear as connected apps?
- What Account capabilities does a product advertise?
- Which permissions can a user review or change?
- What product metadata should the Account control surface display?

## Core registry — backend namespaces

Authoritative store: `thiepn/core/registry/apps.json`

It answers:

- Which backend namespace belongs to which Core app?
- What backend level/ownership model is configured?
- Is a Core namespace enabled?

Account does not mirror Core backend levels, namespaces or infrastructure ownership.

## Link

`account_app_manifests.core_app_id` is optional. When populated it links an Account product to the matching Core registry ID.

Current explicit links:

- Diet Copilot -> `diet`
- TMS60 -> `tms60`

Apps such as Notes, WORDSTRIKE and Word to the Nations can exist in the Account registry without a Core namespace.

Likewise, Core entries can exist without being Account-connectable products.

## Security boundary

`account_app_connections` and `account_app_grants` are **control-plane records**. They do not by themselves prove which application code is making a backend request.

Actual Core/app data authorization must enforce app identity and granted scope at the trusted data boundary. That remains a later integration requirement; P15 must not claim the control-plane table alone provides it.
