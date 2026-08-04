---
type: "debugging"
date: "2026-08-04T09:07:05.544396+00:00"
question: "son testte hata aldım, sorunu inceleyip çözer misin? tap-dm Report contains fewer than 15 samples"
contributor: "graphify"
outcome: "useful"
source_nodes: ["WhisprPerformanceDevice.psm1", "Maestro flows", "mobile-performance-device-scripts.test.ts", "15-tap-dm.ps1"]
---

# Q: son testte hata aldım, sorunu inceleyip çözer misin? tap-dm Report contains fewer than 15 samples

## Answer

Expanded from original query via vocab: [tap, direct, message, inbox, maestro, navigation, span, sample, performance, flow, screen, transition]. Artifact tap-dm showed tap n=0 and active ChannelChat; Maestro matched inactive native-stack test IDs, so separate return flow passed without activating DM inbox. Fix: tap-dm.yml now deep-links to whispr://channels/@me before each real row tap; scenario removes separate open/back flows. Export validates scenario cohort before generic total. Device checks passed at 1 and 3 repetitions; 3-run report tap n=3, DirectMessage-cached n=3, spans 0/0. Full mobile tests 1534/1534 passed.

## Outcome

- Signal: useful

## Source Nodes

- WhisprPerformanceDevice.psm1
- Maestro flows
- mobile-performance-device-scripts.test.ts
- 15-tap-dm.ps1