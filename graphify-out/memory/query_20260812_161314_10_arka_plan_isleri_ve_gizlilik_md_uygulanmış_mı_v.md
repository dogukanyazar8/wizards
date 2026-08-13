---
type: "query"
date: "2026-08-12T16:13:14.198032+00:00"
question: "10-arka-plan-isleri-ve-gizlilik.md uygulanmış mı ve uygulanabilir mi?"
contributor: "graphify"
outcome: "useful"
source_nodes: ["worker.ts", "rollUpClientHealthEvents()", "privacy-service.ts", "bug-report-service.ts", "sweepBadges()", "notification-campaigns.ts"]
---

# Q: 10-arka-plan-isleri-ve-gizlilik.md uygulanmış mı ve uygulanabilir mi?

## Answer

Expanded from original query via vocab: [telemetry, client, health, rollup, privacy, account, badge, sweep, campaign, outbox, bug, report]. Live source confirms prompt 10 is not implemented. worker.ts still runs hourly maintenance in one sequential promise chain and stamps lastCleanupAt before tasks, so prompt 08 prerequisite is absent. client-health-rollup overwrites count and deletes by cutoff; privacy-service deletes media before transaction and omits mobilePushToken; bug report purge is unscheduled; badge sweep scans counts/all actioned cases and uses findMany length; campaign count materializes IDs, SENDING is not sendable, delivery remains per-user serial. Product code unchanged pending authority to apply prerequisite 08 first.

## Outcome

- Signal: useful

## Source Nodes

- worker.ts
- rollUpClientHealthEvents()
- privacy-service.ts
- bug-report-service.ts
- sweepBadges()
- notification-campaigns.ts