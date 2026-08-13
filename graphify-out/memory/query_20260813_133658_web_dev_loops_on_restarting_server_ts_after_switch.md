---
type: "query"
date: "2026-08-13T13:36:58.730208+00:00"
question: "Web dev loops on Restarting server.ts after switching to node --watch"
contributor: "graphify"
outcome: "useful"
source_nodes: ["apps/web/package.json", "apps/web/server.ts", "apps/web/scripts/dev-env-contract.test.mjs"]
---

# Q: Web dev loops on Restarting server.ts after switching to node --watch

## Answer

Node native watch observed Next development generated-file changes and entered a restart loop. Replaced the dev command with tsx watch --env-file=.env server.ts: TSX loads the local env before server imports while retaining its watch filtering. Exact command produced one startup, zero restart messages, health 200, no DATABASE_URL or AuthSession errors, and remained stable during observation. Verification process was stopped; port 3000 is free.

## Outcome

- Signal: useful

## Source Nodes

- apps/web/package.json
- apps/web/server.ts
- apps/web/scripts/dev-env-contract.test.mjs