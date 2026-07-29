---
type: "query"
date: "2026-07-29T10:00:14.060696+00:00"
question: "Railway UAT ortamında workspace-performance metrikleri tanımlı, mobil için log tutuyor muyuz inceler misin?"
contributor: "graphify"
outcome: "useful"
source_nodes: ["performance-metrics.ts", "mobile-performance-metrics.ts", "mobile-health-reporter.ts", "Sentry"]
---

# Q: Railway UAT ortamında workspace-performance metrikleri tanımlı, mobil için log tutuyor muyuz inceler misin?

## Answer

Expanded from graph vocab: [workspace, performance, metrics, railway, mobile, logger, telemetry, sentry]. UAT has WORKSPACE_PERFORMANCE_METRICS=true and a 30000ms configured interval; 36 structured workspace_performance logs were found in 14 days. Mobile batches STARTUP and SCREEN_LOAD telemetry to client-health; 21 Android okhttp requests returned HTTP 200 in the last 14 days. The server persists client health events, retains raw data for 30 days, then rolls up p50/p95/p99. Mobile Sentry initialization has no call site, so Sentry crash and slow-request breadcrumbs are not active from this source snapshot.

## Outcome

- Signal: useful

## Source Nodes

- performance-metrics.ts
- mobile-performance-metrics.ts
- mobile-health-reporter.ts
- Sentry