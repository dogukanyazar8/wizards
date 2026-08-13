---
type: "query"
date: "2026-08-13T13:31:59.595064+00:00"
question: "Local web outbox P2021 AuthSession table does not exist"
contributor: "graphify"
outcome: "useful"
source_nodes: ["apps/web/src/lib/outbox/worker.ts", "packages/db/prisma/rebaseline-migrations/20260813110000_auth_sessions/migration.sql", "packages/db/prisma.config.ts"]
---

# Q: Local web outbox P2021 AuthSession table does not exist

## Answer

Local PostgreSQL wizards database was two migrations behind. Prisma status showed 20260813100000_user_account_preferences and 20260813110000_auth_sessions pending. Applied them with prisma migrate deploy only after confirming DATABASE_URL targets localhost, not Railway. Migration status is now up to date; AuthSession exists and delete path succeeds in a rolled-back transaction; web health is 200.

## Outcome

- Signal: useful

## Source Nodes

- apps/web/src/lib/outbox/worker.ts
- packages/db/prisma/rebaseline-migrations/20260813110000_auth_sessions/migration.sql
- packages/db/prisma.config.ts