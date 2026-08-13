---
type: "query"
date: "2026-08-13T06:00:21.481748+00:00"
question: "Railway UAT ve production ortamlarında son güncellemeler ve local WIP sonrası hangi değişkenler eksik?"
contributor: "graphify"
outcome: "useful"
source_nodes: ["TRUSTED_PROXY_HOPS", "env.ts", "railway-contract.test.ts", "worker.ts"]
---

# Q: Railway UAT ve production ortamlarında son güncellemeler ve local WIP sonrası hangi değişkenler eksik?

## Answer

Live read-only audit on project outstanding-serenity. UAT whispr-web at e9508d9c: core web contract present, auth pair consistent, TOTP keyring valid; TRUSTED_PROXY_HOPS absent. UAT whispr-outbox-worker: DATABASE_URL and REDIS_URL present; web-only TOTP variables correctly absent. Production whispr-web at older a5e15028: its deployed contract is complete, but promotion of current UAT code requires TOTP_SECRET_ENCRYPTION_KEYS and TOTP_SECRET_ENCRYPTION_ACTIVE_KEY_VERSION. Do not copy the UAT keyring. Local WIP adds only optional TRUSTED_PROXY_HOPS, but current implementation consumes X-Forwarded-For while current Railway docs guarantee X-Real-IP; do not configure until trust-boundary code is corrected or safely proven. Production also lacks a dedicated outbox-worker service while current railway.toml disables the embedded web worker, so promotion has a non-variable blocker. Sentry production rollout remains optional and gated by the documented 48-hour UAT observation window.

## Outcome

- Signal: useful

## Source Nodes

- TRUSTED_PROXY_HOPS
- env.ts
- railway-contract.test.ts
- worker.ts