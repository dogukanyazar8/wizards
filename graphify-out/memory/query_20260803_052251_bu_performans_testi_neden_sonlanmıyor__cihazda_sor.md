---
type: "query"
date: "2026-08-03T05:22:51.717962+00:00"
question: "Bu performans testi neden sonlanmıyor; cihazda sorun var mı?"
contributor: "graphify"
outcome: "useful"
source_nodes: ["WhisprPerformanceDevice.psm1", "mobile-dm-chat-screen", "open-dm.yml"]
---

# Q: Bu performans testi neden sonlanmıyor; cihazda sorun var mı?

## Answer

Expanded from graph vocab: [performance, device, scenario, export, timeout, bridge, cold, start, wait, report, android]. Live process 7932 started 08:17 and repeatedly invokes open-dm.yml. Each Maestro run fails after about 16 seconds: mobile-dm-chat-screen is not visible. Screenshot shows the server list, not the requested DM. The PowerShell cold-start loop proceeds to its next repetition instead of failing fast, so Repetitions 30 becomes roughly 18 minutes of invalid attempts. The prior Repetitions 1 artifact at 08:14 also failed; it was not a valid benchmark. Device is online, app is foreground, version 0.8.15. Maestro heartbeat file-lock messages are secondary noise.

## Outcome

- Signal: useful

## Source Nodes

- WhisprPerformanceDevice.psm1
- mobile-dm-chat-screen
- open-dm.yml