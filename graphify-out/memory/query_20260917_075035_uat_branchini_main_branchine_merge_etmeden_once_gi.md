---
type: "query"
date: "2026-09-17T07:50:35.380048+00:00"
question: "UAT branchini main branchine merge etmeden once GitHub ve Railway PROD farklari, riskleri ve gerekli durum nedir?"
contributor: "graphify"
outcome: "useful"
source_nodes: ["deployment", "railway-contract.test.ts", "outbox/service.ts", "worker.ts", "prisma"]
---

# Q: UAT branchini main branchine merge etmeden once GitHub ve Railway PROD farklari, riskleri ve gerekli durum nedir?

## Answer

Expanded graph vocab: railway, deployment, production, branch, github, workflow, prisma, migrations, database, redis, outbox, worker. Graph navigation identified railway deployment contracts, Prisma migrations, outbox worker, and CI workflows. Source and live verification found three merge conflicts; production migration history incompatible with the UAT rebaseline path; production missing required TOTP key variables; production missing dedicated outbox worker; UAT ClamAV service has no active deployment. Current UAT CI and Railway web/worker deploy are green, but merge is unsafe until blockers are remediated and tested on a production clone.

## Outcome

- Signal: useful

## Source Nodes

- deployment
- railway-contract.test.ts
- outbox/service.ts
- worker.ts
- prisma