---
type: "query"
date: "2026-08-13T06:18:05.281022+00:00"
question: "Local Auth.js MissingSecret error"
contributor: "graphify"
outcome: "useful"
source_nodes: ["auth", "env.ts", "auth.ts"]
---

# Q: Local Auth.js MissingSecret error

## Answer

Root cause confirmed without exposing values: AUTH_SECRET and NEXTAUTH_SECRET were both empty in all three ignored local env files. Generated one random 32-byte local-only base64url secret, set both names to the same value in root .env, apps/web/.env, and packages/db/.env, restarted the stale dev process, then verified health HTTP 200 and Auth.js session HTTP 200 with null unauthenticated body. Railway variables were untouched.

## Outcome

- Signal: useful

## Source Nodes

- auth
- env.ts
- auth.ts