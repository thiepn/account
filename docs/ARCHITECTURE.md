# THIEPN Account frontend architecture

## Boundary

THIEPN Account is the user-facing control plane. It must not become THIEPN Hub or a generic database administration UI.

Pages call domain hooks. Domain hooks call the typed `AccountService`. Pages never call Supabase, PostgREST, Edge Functions or `fetch` directly.

```text
Pages
  ↓
domain hooks / TanStack Query
  ↓
AccountService
  ├─ MockAccountService
  └─ ApiAccountService (later)
```

## Current mode

P0-P3 use `MockAccountService` so the product shell and state matrix can mature independently from backend migrations.

Production integration will be introduced method-by-method. Production must never catch an API failure and silently return mock account data.

## Canonical navigation

1. Overview
2. Profile
3. Security
4. Devices
5. Apps
6. Data & Backup
7. Privacy

## Backend relationship

The existing **THIEPN Account** Supabase project remains the identity provider and already contains partial Account platform tables/RPCs.

`thiepn/core` remains separate shared infrastructure. Its current Gateway verifies THIEPN Account bearer sessions for the private Health path but its own documentation explicitly states that general SSO/scopes, broad sync, encryption and backup are not implemented.

Later phases must adapt the existing systems behind `ApiAccountService` rather than coupling UI pages to physical schemas.

## Non-negotiable integration rules

- Browser UI is not an authorization boundary.
- Account ID remains the canonical identity; email is not an ownership key.
- Devices, sessions and sync clients remain distinct concepts.
- Connected apps and app permissions are distinct from app discovery.
- Sync, live cloud data and backups remain distinct.
- Destructive workflows are server-authoritative and fail closed.
