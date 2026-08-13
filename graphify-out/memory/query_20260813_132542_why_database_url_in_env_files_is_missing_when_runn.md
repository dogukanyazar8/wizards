---
type: "query"
date: "2026-08-13T13:25:42.844693+00:00"
question: "Why DATABASE_URL in env files is missing when running corepack pnpm --filter @wizards/web dev"
contributor: "graphify"
outcome: "useful"
source_nodes: ["apps/web/package.json", "apps/web/server.ts", "packages/db/src/pool-options.ts"]
---

# Q: Why DATABASE_URL in env files is missing when running corepack pnpm --filter @wizards/web dev

## Answer

The value existed consistently in ignored env files, but the dev script ran tsx watch server.ts. Static ESM imports initialize @wizards/db before server.ts calls process.loadEnvFile, so Prisma saw no DATABASE_URL. The dev script now launches Node with --env-file=.env before importing server.ts, preserving watch mode. A package contract test prevents regression.

## Outcome

- Signal: useful

## Source Nodes

- apps/web/package.json
- apps/web/server.ts
- packages/db/src/pool-options.ts