# THIEPN Account

User-facing account control center for the THIEPN ecosystem.

**Release track:** `1.0.0-rc.2`

**Production target:** `https://account.thiepn.dev`

THIEPN Account is intentionally separate from THIEPN Core and THIEPN Hub:

- **Account** manages identity, profile, security/session visibility, connected apps, permission choices, cloud-data inventory, supported recovery workflows, exports and account lifecycle.
- **Core** remains the trusted shared application/data infrastructure boundary.
- **Hub** remains the application discovery and launch surface.

## Architecture

```text
Pages / components
        ↓
TanStack Query domain hooks
        ↓
AccountService
   ├── MockAccountService   development only
   └── ApiAccountService    production
        ↓
Supabase Auth + owner-scoped Account RPC/RLS boundaries
```

Production pages do not call Supabase directly. CI enforces that boundary.

## Current production integration

Implemented real slices include:

- Google OAuth / PKCE and canonical Auth UUID identity
- Account profile provisioning and preferences
- MFA-factor status and real Supabase session listing
- supported “sign out all other sessions”
- connected-app control plane and optional permissions
- cloud-data metadata inventory for Notes, Diet Copilot, TMS60, WORDSTRIKE and WTTN
- verified Diet recovery inventory
- hashed TMS60 backups and safety-snapshot restore
- expiring Account metadata exports
- server-planned WTTN cloud deletion with stale-client tombstone protection
- seven-day cancellable full Account deletion lifecycle
- server-authoritative recent-authentication guards for sensitive actions

Unsupported backend capabilities fail closed rather than falling back to mock state.

## Development

```bash
pnpm install
pnpm dev
```

Development defaults to the deterministic mock runtime. To exercise the real adapter locally, provide the variables documented in `.env.example` and set:

```text
VITE_ACCOUNT_SERVICE_MODE=real
```

## Verification

```bash
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
```

GitHub Actions additionally verifies:

- no direct backend access outside the Account adapter;
- no mock/scenario/dev-runtime strings in the production bundle;
- desktop/mobile lifecycle smoke tests;
- production release artifacts are built in real-service mode;
- each artifact contains `release.json` and `SHA256SUMS`;
- after deployment, the workflow verifies the live release commit matches the green CI SHA.

## Deployment

`.github/workflows/deploy.yml` deploys the exact commit from a successful `Account CI` run to GitHub Pages. The production build uses the browser-safe Supabase publishable key and creates a `404.html` SPA fallback for deep links such as `/auth/callback`.

GitHub repository Pages settings must use **GitHub Actions** as the publishing source. The custom domain must be configured as `account.thiepn.dev` in repository Pages settings and DNS before final v1.0 certification.

## Status

See:

- `docs/IMPLEMENTATION_STATUS.md`
- `docs/PRODUCTION_READINESS.md`
- `docs/FRONTEND_QA_MATRIX.md`
- `docs/ACCOUNT_API_CONTRACT.md`
- `docs/SECURITY_INVARIANTS.md`
- `docs/DATA_LIFECYCLE.md`

Hub tokenless entry and return contract: [docs/HUB_ENTRY.md](docs/HUB_ENTRY.md).
