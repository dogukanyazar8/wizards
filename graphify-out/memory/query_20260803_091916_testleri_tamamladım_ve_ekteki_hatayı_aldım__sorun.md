---
type: "query"
date: "2026-08-03T09:19:16.876057+00:00"
question: "testleri tamamladım ve ekteki hatayı aldım, sorun nedir inceler misin?"
contributor: "graphify"
outcome: "useful"
source_nodes: ["WhisprPerformanceDevice.psm1", "mobile-performance-automation-provider.tsx", "createMobileEventLoopLagMonitor"]
---

# Q: testleri tamamladım ve ekteki hatayı aldım, sorun nedir inceler misin?

## Answer

Expanded from original query via vocab: [performance, device, event, loop, monitor, reset, export, state, active, samples, maestro]. Tests 12 and 13 passed. Test 14 smoke passed. Test 14 official completed 30 workloads, then validation failed because event-loop lag n=0. Report startup n=1 after reset proves an app process restart during the official run. Event-loop samples and runActiveRef are memory-only; provider recreation leaves monitoring disabled, so export sees zero lag samples.

## Outcome

- Signal: useful

## Source Nodes

- WhisprPerformanceDevice.psm1
- mobile-performance-automation-provider.tsx
- createMobileEventLoopLagMonitor