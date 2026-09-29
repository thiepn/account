# Integration decisions

## ID-001 — Account frontend stays service-driven

Pages and components never call Supabase directly. Supabase is isolated behind `ApiAccountService`.

## ID-002 — Real integration is capability-gated

Unsupported real domains return `CAPABILITY_UNAVAILABLE`; mock state is never mixed into a real Account session.

## ID-003 — OAuth uses PKCE

The browser adapter uses an explicit PKCE callback route and a validated internal return target.

## ID-004 — Sign out means current session

Normal Account sign-out uses Supabase `scope: "local"`. Global/other-session revocation remains P14.

## ID-005 — Missing profile fails explicitly

The frontend does not provision `account_profiles` opportunistically. P13 must add/verify a server-authoritative provisioning path.

## ID-006 — Account ID decision is provisional through P12

The current adapter maps the authenticated Supabase Auth UUID to frontend `AccountId` because existing Account rows use that UUID. P13 must certify this as the permanent canonical identity before app authorization expands.
