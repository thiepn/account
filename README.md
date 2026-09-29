# THIEPN Account

User-facing control center for the THIEPN ecosystem.

This repository is intentionally separate from [THIEPN Core](https://github.com/thiepn/core):

- **Account** manages identity, profile, security, sessions/devices, connected apps, permissions, cloud-data visibility, backups and privacy/lifecycle controls.
- **Core** is shared application infrastructure and the trusted application-facing data boundary.
- **Hub** remains the discovery/launcher surface for THIEPN applications.

## Current implementation stage

The repository was initialized on 2026-09-29 after an audit of the existing THIEPN Account Supabase project and `thiepn/core`.

The first implementation slice establishes the P0-P3 frontend architecture:

- React + TypeScript + Vite
- React Router
- Tailwind CSS semantic-token foundation
- TanStack Query
- typed `AccountService`
- `MockAccountService` with deterministic scenarios
- responsive Account shell
- seven canonical navigation areas
- mock Overview and domain placeholders
- production/mock boundary designed for later `ApiAccountService`

The existing Supabase Account backend is **not** discarded. Later phases will integrate it method-by-method behind the same service contracts.

See:

- `docs/IMPLEMENTATION_STATUS.md`
- `docs/INTEGRATION_GAP_MATRIX.md`
- `docs/ARCHITECTURE.md`

## Product boundary

Primary navigation:

1. Overview
2. Profile
3. Security
4. Devices
5. Apps
6. Data & Backup
7. Privacy

Account is not the THIEPN Hub and is not a generic database admin UI.

## Development

```bash
pnpm install
pnpm dev
```

Use `?scenario=default`, `?scenario=security-warning`, `?scenario=offline`, or another documented mock scenario during development.

Production builds must not silently fall back to mock account data.
