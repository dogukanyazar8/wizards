# Prisma Migration History Rebaseline

## Established facts

- UAT has exactly the 37 migration records currently committed under
  `packages/db/prisma/migrations`.
- The first committed migration (`20260422000000_add_fulltext_search_indexes`)
  alters pre-existing tables, so the committed chain cannot initialize an
  empty database.
- No pre-20260422 baseline migration or matching schema snapshot is reachable
  from repository history, local worktrees, or Git reflog objects.
- UAT is therefore not missing a currently committed migration. It is missing
  the historical migration source that originally created the pre-existing
  schema.

## Decision

Adopt one immutable current-state baseline at
`packages/db/prisma/rebaseline-migrations/20260725000000_uat_schema_baseline`.
Prisma CLI operations will use that directory as their migration source;
`packages/db/prisma/migrations` remains read-only historical evidence and is
not replayed.

The baseline must be generated from the current Prisma schema plus the raw
PostgreSQL objects Prisma cannot represent, including the generated `tsvector`
columns and partial/GIN indexes introduced by the historical full-text
migration. A disposable PostgreSQL database must prove both clean replay and a
schema comparison before the baseline is accepted.

## UAT procedure

The UAT operation changes only Prisma metadata after the baseline has passed
the disposable checks. It must first capture a schema-only dump and the
existing `_prisma_migrations` rows. The guarded command then verifies the
expected UAT service/database identity and the exact 37 historical migration
records, clears only `_prisma_migrations`, and resolves the single baseline as
applied. It does not run `migrate deploy`, `migrate reset`, `db push`, seed, or
DDL against UAT.

The metadata operation is intentionally not automatic in a normal deployment.
It requires a dedicated UAT confirmation token and a secure database execution
path. Production remains unchanged until UAT has passed a canary deploy and a
fresh schema comparison.

## Rollback boundary

The captured metadata rows can be reinserted if the metadata switch must be
reversed before any deployment consumes the new baseline. Schema and
application data are not modified by the switch. Once a new migration is
applied on top of the baseline, restoring the old migration history would be
invalid; stop and use the verified schema/data recovery procedure instead.
