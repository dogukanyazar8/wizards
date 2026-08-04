---
type: "query"
date: "2026-08-04T05:26:55.565277+00:00"
question: "06-cold-start 15 iterasyonda startup 15 fakat DirectMessage-cached 14 olduğunda neden partial oluyor?"
contributor: "graphify"
outcome: "useful"
source_nodes: ["WhisprPerformanceDevice.psm1", "mobile-performance-device-scripts.test.ts", "mobile-release-contract.ts"]
---

# Q: 06-cold-start 15 iterasyonda startup 15 fakat DirectMessage-cached 14 olduğunda neden partial oluyor?

## Answer

Expanded via graph vocab: cold, start, performance, device, cached, cohort, direct, message, navigation, sample, launch, startup. Root cause: cold-start scenario incorrectly gated both its primary startup cohort and secondary DirectMessage-cached cohort. Release contract defines cold authenticated launch metric as startup; cached DM has its own test 08. Fixed cold-start cohort to startup only. Regression test, 18/18 device-script contracts, existing real partial report validation, PowerShell parse, and 15-repeat dry-run passed.

## Outcome

- Signal: useful

## Source Nodes

- WhisprPerformanceDevice.psm1
- mobile-performance-device-scripts.test.ts
- mobile-release-contract.ts