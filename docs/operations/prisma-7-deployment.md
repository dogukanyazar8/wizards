# Prisma 7 deployment

## Runtime model

`@wizards/db` uses the Prisma 7 `prisma-client` generator with output at
`packages/db/src/generated/prisma`. Runtime clients are created only through
the PostgreSQL `PrismaPg` adapter. `DATABASE_URL` must be a direct
`postgresql://` URL; pool limits are explicit: `DATABASE_POOL_MAX` (default
10), `DATABASE_CONNECTION_TIMEOUT_MS` (default 5000), and
`DATABASE_IDLE_TIMEOUT_MS` (default 300000).

`prisma.config.ts` is the single CLI configuration source. It owns the schema,
the active `prisma/rebaseline-migrations` directory, and the explicit
`tsx src/seed.ts` seed command. The older `prisma/migrations` directory is
historical evidence only and must not be restored as an active migration path.

## UAT rebaseline record

On 2026-07-25, UAT's verified 37 Prisma 6 migration metadata rows were
replaced in one transaction with:

```text
20260725000000_uat_schema_baseline
checksum: 2c2f7a362e52f38d7a4bb74844e3f84479b987717d0310677f9b40fa9a9b22f3
```

No UAT application table or application row was changed. Before the switch,
schema-only and `_prisma_migrations` data dumps were captured and checksummed.
The helper command `pnpm --filter @wizards/db db:rebaseline:uat` is
confirmation-gated, validates the target database plus every historical name
and checksum, and is idempotent once this baseline record exists. It is not a
normal deployment command.

## Normal UAT and production deployment

Run the migration step once, before starting the new web process. The Railway
pre-deploy contract already uses the DB command below.

```powershell
corepack pnpm --filter @wizards/db db:generate
corepack pnpm --filter @wizards/db db:migrate:status
corepack pnpm --filter @wizards/db db:migrate:deploy
corepack pnpm --filter @wizards/db db:migrate:status
```

Pass criteria: the final status reports that the database schema is up to date
and the application `/ready` check is healthy. `db:migrate:deploy` may write
only declared migrations; it does not seed data.

Never run `db:migrate:reset`, `prisma db push`, the disposable verifier, or a
seed command against UAT or production as part of deployment.

## Explicit seed

Prisma 7 does not run seed automatically during migrate or reset. A demo seed
is intentionally separate and requires a non-empty password:

```powershell
$env:SEED_DEMO_PASSWORD = node -e "process.stdout.write(require('node:crypto').randomBytes(24).toString('base64url'))"
corepack pnpm --filter @wizards/db db:seed
```

Production seed is refused unless `ALLOW_PRODUCTION_SEED=true` is set for a
separately approved, audited operation. Do not set that variable in a normal
deployment.

## Rollback

Application rollback and schema rollback are separate decisions. Reverting the
application is safe only when the already-applied schema remains compatible.
For a schema rollback, first restore the verified pre-deployment logical dump
to a new database, validate `db:migrate:status` and application smoke tests,
then switch traffic through the approved platform procedure. Do not edit or
delete `_prisma_migrations` manually outside the rebaseline helper and its
captured recovery artifacts.

## Disposable regression verification

Only a loopback database whose name ends in `_prisma7_verify` is accepted:

```powershell
$env:PRISMA7_VERIFY_DATABASE_URL = "postgresql://wizards:wizards@127.0.0.1:5432/wizards_prisma7_verify"
$env:PRISMA7_VERIFY_CONFIRM = "run-disposable-prisma7-verification"
$env:SEED_DEMO_PASSWORD = node -e "process.stdout.write(require('node:crypto').randomBytes(24).toString('base64url'))"
corepack pnpm --filter @wizards/db db:verify:prisma7-disposable
```

It creates a disposable database, runs generate, migrate, explicit seed,
real-query smoke, reset, a second seed/smoke, and final migration status. It
drops the disposable database unless `PRISMA7_VERIFY_KEEP_DATABASE=true`.
