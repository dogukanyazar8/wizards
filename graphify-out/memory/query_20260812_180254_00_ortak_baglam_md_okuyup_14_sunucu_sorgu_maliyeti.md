---
type: "query"
date: "2026-08-12T18:02:54.221215+00:00"
question: "00-ortak-baglam.md okuyup 14-sunucu-sorgu-maliyeti.md uygula; zaten uygulanmışsa bildir"
contributor: "graphify"
outcome: "useful"
source_nodes: ["notification-campaigns.ts", "disappearing-worker.ts", "permission-service.ts", "outbox/service.ts", "analytics/service.ts"]
---

# Q: 00-ortak-baglam.md okuyup 14-sunucu-sorgu-maliyeti.md uygula; zaten uygulanmışsa bildir

## Answer

Expanded from original query via vocab: [overview, campaign, badge, management, scheduled, bootstrap, notification, livekit, permission, outbox, analytics, disappearing]. Prompt 14 was partially present. Existing WIP already had campaign recipient count, expired badge count, and some cache batching. Remaining bounded reads, parallel query waves, SQL mutual-friend intersection, batch disappearing fan-out, room-array profile fan-out, and slim outbox payload were implemented and verified with focused tests.

## Outcome

- Signal: useful

## Source Nodes

- notification-campaigns.ts
- disappearing-worker.ts
- permission-service.ts
- outbox/service.ts
- analytics/service.ts