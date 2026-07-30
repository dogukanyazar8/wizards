---
type: "query"
date: "2026-07-30T06:28:22.041210+00:00"
question: "Fix Android InteractionManager deprecation and expo-notifications cancelled fetch warnings safely"
contributor: "graphify"
outcome: "useful"
source_nodes: ["scheduleMobileIdleTask()", "MobileTabBarHost()", "installMobileTelemetryInstruments()", "useMobileRecentDMPrefetch()"]
---

# Q: Fix Android InteractionManager deprecation and expo-notifications cancelled fetch warnings safely

## Answer

Expanded from original query via graph vocab: [mobile, idle, task, request, cancel, schedule, notifications, token]. Replaced three app InteractionManager consumers with cancellable requestIdleCallback scheduling. Added pnpm patch so expo-notifications ignores only requests whose AbortSignal is already aborted while preserving warnings for real network failures. Focused tests and mobile typecheck passed.

## Outcome

- Signal: useful

## Source Nodes

- scheduleMobileIdleTask()
- MobileTabBarHost()
- installMobileTelemetryInstruments()
- useMobileRecentDMPrefetch()