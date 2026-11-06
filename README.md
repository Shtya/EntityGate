# EntityGate

Operations hub for entity, sponsorship and workforce services in Saudi Arabia.
Next.js (App Router) with the backend in API routes, PostgreSQL and Prisma. See [docs/PLAN.md](docs/PLAN.md).

## Run locally

```bash
npm install
cp .env.example .env        # fill in DATABASE_URL, BETTER_AUTH_SECRET and SEED_USER_PASSWORD
npm run db:deploy           # apply migrations
npm run db:seed             # roles, reference data and demo users
npm run dev                 # http://localhost:3000
```

## Development admin

`npm run db:seed` creates an admin from `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` (`.env.example` uses `admin@gmail.com` / `123456`).

> ⚠️ **Development only. Change these before any deployment.** The seed refuses to run when `NODE_ENV=production`, and production always enforces 2FA for admins, whatever `AUTH_MFA_ENFORCED` says.

## Demo users

All use the password in `SEED_USER_PASSWORD` from your `.env`.

| Email | Role | 2FA |
|---|---|---|
| `admin@entitygate.test` | System Administrator | Required |
| `finance@entitygate.test` | Finance | Required |
| `head@entitygate.test` | Department Head | Optional |
| `am1@entitygate.test`, `am2@entitygate.test` | Account Manager | Optional |
| `hr@entitygate.test` | HR / Employee Operations | Optional |
| `ops@entitygate.test` | Operations Supervisor | Optional |
| `exec@entitygate.test` | Executive / Management | Optional |
| `auditor@entitygate.test` | Auditor / Compliance | Optional |

## Demo data

With the app running and `AUTH_MFA_ENFORCED=false`, this adds five clients with staff, three months of billing, payments, payroll and expenses, plus open cases, tasks and escalations:

```bash
npm run seed:demo
```

It goes through the real API, so the numbers follow the same rules as real use. It's development only and won't load twice.

## Going to production

Follow [docs/RUNBOOK.md](docs/RUNBOOK.md). Use `npm run db:bootstrap`, never `db:seed`. Day-to-day administration is in [docs/ADMIN_GUIDE.md](docs/ADMIN_GUIDE.md).

## Permissions

Pages and actions follow permissions, not role names. An administrator configures them in two places:

- **Roles & access:** what each role can open and do.
- **Users, then a person:** allow or block anything for that one person, on top of their roles.

Administrators always have everything. Changes apply on the next request and are written to the audit log, and re-running the seed doesn't overwrite them. New pages add a permission to `PAGE_PERMISSIONS` in `src/server/rbac/catalog.ts` and an entry in `src/components/shell/nav.ts`.

## Tests

```bash
npm test                                      # unit + database constraint tests
E2E_BASE_URL=http://localhost:3000 npm test   # adds live API checks (server must be running)
```

To run the live checks against a production build, start it with `AUTH_SIGNIN_RATE_LIMIT=1000`, because the
suite signs in more often than the default limit of 8 per minute allows. Never set this in a real deployment.

Database tests run in transactions that roll back. The live checks sign in as the demo users and
restore anything they change, but they add audit events, which are append-only by design. Run them
only against development or CI databases.

## Code layout

| Path | Contents |
|---|---|
| `src/app/(app)` | Authenticated pages |
| `src/app/api/v1` | REST API; every handler is wrapped in `apiRoute()` |
| `src/server/modules/<module>` | Business logic (`service.ts`) and validation (`schema.ts`) |
| `src/server/rbac` | Permission catalog, policy and the current actor |
| `src/lib/money.ts` | All money arithmetic: Decimal only, never `number` |
| `src/components/ui`, `patterns` | Design system primitives and composed patterns |
| `prisma/migrations` | Includes hand-written constraints Prisma can't express |
