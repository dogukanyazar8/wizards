---
type: "query"
date: "2026-08-04T06:18:17.410977+00:00"
question: "Test 10 SQLCipher 15 tekrarda neden sqlcipher 0 sample veriyor ve nasil duzeltilir?"
contributor: "graphify"
outcome: "useful"
source_nodes: ["WhisprPerformanceDevice.psm1", "useMobileDMRouteState()", "useMobileMessageStreamHydration()", "getMobileDMMessagesQueryOptions()"]
---

# Q: Test 10 SQLCipher 15 tekrarda neden sqlcipher 0 sample veriyor ve nasil duzeltilir?

## Answer

Expanded via graph vocab: sqlcipher persistence message store restore network query cache source hydrate encrypted page. The report proved SQLCipher 4.7.0 was open with two rows, but all 15 DM opens were network and zero were sqlcipher. Root cause: the direct-message query started during render while encrypted hydration began later in useEffect, so network won. Added a route-level restore barrier: DM network query stays disabled until the encrypted restore attempt settles; a restored, backdated page renders first and network then reconciles. Regression test failed before the fix and passed after it; focused component tests, 45 cache/device tests, mobile typecheck, hooks lint with no errors, Prettier, and diff check passed. Rebuild and reinstall the UAT release APK, then rerun test 10 before tests 11-15.

## Outcome

- Signal: useful

## Source Nodes

- WhisprPerformanceDevice.psm1
- useMobileDMRouteState()
- useMobileMessageStreamHydration()
- getMobileDMMessagesQueryOptions()