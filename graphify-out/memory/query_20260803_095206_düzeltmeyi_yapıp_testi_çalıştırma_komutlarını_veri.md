---
type: "query"
date: "2026-08-03T09:52:06.860876+00:00"
question: "Düzeltmeyi yapıp testi çalıştırma komutlarını verir misin?"
contributor: "graphify"
outcome: "useful"
source_nodes: ["WhisprPerformanceDevice.psm1", "mobile-performance-automation-provider.tsx", "mobile-event-loop-lag.ts"]
---

# Q: Düzeltmeyi yapıp testi çalıştırma komutlarını verir misin?

## Answer

Expanded via graph vocab: [event, loop, monitor, provider, restart, active, uat, state, performance, device]. Added createMobileEventLoopLagRunLifecycle. Fresh UAT provider instances start armed after Android process recreation, synchronize with AppState, stop after export, and production stays inactive. Provider reset begins and reconciles lifecycle. Focused tests 43/43, mobile typecheck, Prettier, git diff check, and graphify update passed. Rebuild release APK, update-install preserving app data, rerun only 14 event-loop smoke then 30.

## Outcome

- Signal: useful

## Source Nodes

- WhisprPerformanceDevice.psm1
- mobile-performance-automation-provider.tsx
- mobile-event-loop-lag.ts