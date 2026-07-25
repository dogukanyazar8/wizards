# Prisma 7 UAT Design

## Goal

Move the PostgreSQL data layer from Prisma 6 to Prisma 7 without changing the
public `@wizards/db` contract, while making client generation, connection
pooling, seeding, and migration operations explicit and testable.

## Scope and safety boundary

- Base: `origin/uat` at `09cb88fd5fe1607664ccb0c395fd29651af79db4`.
- The history contains Prisma 6 commit `a36568ae`; no separately named `P07`
  ref or merge was found, so this design treats that ancestor as the stated
  prerequisite unless corrected.
- All implementation happens in isolated worktree `codex/uat-prisma7`.
- No command in this change writes to UAT or production. Destructive validation
  accepts only an explicit loopback disposable database URL whose database name
  ends in `_prisma7_verify`.
- No migration SQL is rewritten. A clean migration replay failure is a release
  blocker, not something hidden by `db push`.

## Required Prisma 7 changes

1. Upgrade `prisma`, `@prisma/client`, and Prisma integration packages to a
   compatible Prisma 7 release; add `@prisma/adapter-pg`.
2. Retain package-level ESM for `@wizards/db`, generate the client with
   `provider = "prisma-client"`, and set a custom output under
   `packages/db/src/generated/prisma`.
3. Remove `datasource.url` from `schema.prisma`; add package-root
   `packages/db/prisma.config.ts` with schema path, migration path, explicit
   seed command, and `DATABASE_URL` for Prisma CLI operations.
4. Import generated Prisma symbols only in `packages/db/src`. Re-export the
   stable contract through `@wizards/db`, so application packages never depend
   on a generated relative path.
5. Replace the Prisma 6 runtime-repair script that modifies
   `node_modules/.prisma` with adapter-based initialization.
6. Run seeds only through explicit `prisma db seed`; Prisma 7 does not seed as
   a side effect of migration or reset.
7. Replace any `$use` middleware found in the source tree with ordered query
   extensions that preserve the same affected models, operations, arguments,
   result behavior, and error propagation.

## Client and pool lifecycle

`@prisma/adapter-pg` is the selected PostgreSQL adapter. `PrismaPg` owns the
native `pg` connection pool; the application does not create a second pool or
borrow individual connections.

`packages/db/src/index.ts` will expose a single `prisma` client. Development
hot reload reuses it through `globalThis`; production module evaluation creates
one client per process. The adapter receives a validated `DATABASE_URL` and
explicit pool options:

- `DATABASE_POOL_MAX`, default `10`, accepted range `1..20`.
- `DATABASE_CONNECTION_TIMEOUT_MS`, default `5_000`, accepted range
  `1_000..60_000`.
- `DATABASE_IDLE_TIMEOUT_MS`, default `300_000`, accepted range
  `10_000..600_000`.

Those defaults preserve Prisma 6's five-second connection behavior and
five-minute idle behavior while making Prisma 7's `pg` defaults deliberate.
The shared web process never disconnects after individual requests. Short-lived
scripts create a client through the same factory and always call
`$disconnect()` in `finally`; test process teardown follows the same rule.
Invalid pool environment values fail before the first database operation.

## Generator and import boundary

The generator output is `packages/db/src/generated/prisma`. The DB package
imports `./generated/prisma/client.js` and re-exports `PrismaClient`, `Prisma`,
models, and enums from `@wizards/db`. Generated files remain build artifacts:
every clean install, typecheck, web build, and Tauri-facing validation calls
`db:generate` before compiling consumers.

Existing ESM settings are preserved: `@wizards/db`, web, and desktop packages
already declare `type: module`; TypeScript uses `module: ESNext` and
`moduleResolution: Bundler`. The upgrade verifies Node test runner imports,
`tsx` seed and contributor scripts, Next server build, TS6 compiler-API
compatibility tooling, TS7 CLI checks, and Tauri wrapper scripts rather than
changing unrelated package module modes.

## Seed and deployment operations

`prisma.config.ts` owns `migrations.seed`, implemented with the workspace's
`tsx` runner. `db:seed` delegates to `prisma db seed`; `db:migrate:deploy` is
the only deployment mutation command. The general demo seed keeps its
production refusal and no longer falls back to or prints a static password;
operators supply `SEED_DEMO_PASSWORD` explicitly.

Documentation will distinguish:

- local/disposable: `migrate deploy`, explicit `db seed`, smoke, and reset;
- deployment: backup/restore validation, `migrate status`, `migrate deploy`,
  application health check, and no automatic seed;
- rollback: application rollback is separate from schema rollback. A failed
  forward migration stops rollout, restores a verified backup only when needed,
  and never attempts an invented automatic down migration.

## Verification

Focused tests are written first for pool configuration validation, singleton
lifecycle behavior, generated-client import boundary, seed safety, Prisma config
contract, and any middleware-to-extension conversion. A disposable PostgreSQL
run then proves: clean install, generate, clean migration replay, explicit seed,
real CRUD query, reset, second replay/seed, migration metadata, and teardown.

The final local gates are DB, web, and types tests/typechecks; TS main and
compatibility checks; toolchain contract tests; production web build; and the
desktop/Tauri script validation applicable on Windows. Results are reported as
PASS, FAIL, NOT RUN, or ENV BLOCKED. UAT/production migrations, remote CI, and
device acceptance remain separate evidence and are not claimed by local runs.
