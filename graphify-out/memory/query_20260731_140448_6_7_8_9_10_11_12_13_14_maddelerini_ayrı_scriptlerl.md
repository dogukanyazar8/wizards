---
type: "query"
date: "2026-07-31T14:04:48.165515+00:00"
question: "6 7 8 9 10 11 12 13 14 maddelerini ayrı scriptlerle otomatikleştirebilir miyiz; reset ve txt export istiyorum"
contributor: "graphify"
outcome: "useful"
source_nodes: ["MobilePerformanceDiagnosticsScreen()", "mobile-performance-metrics.ts", "Maestro testID compatibility", "DirectMessage"]
---

# Q: 6 7 8 9 10 11 12 13 14 maddelerini ayrı scriptlerle otomatikleştirebilir miyiz; reset ve txt export istiyorum

## Answer

Expanded from graph vocab: mobile performance diagnostics export reset deep link adb maestro script message cache. Device has one authorized CPH2735, Maestro 2.6.1, active non-debuggable Whispr 0.8.15. Existing deep links and composer testIDs support navigation and sends. Existing reset/export live only inside MobilePerformanceDiagnosticsScreen; export uses Share.share, so a host PowerShell script cannot reliably capture txt from the non-debuggable release. Recommended smallest reliable design: UAT-only command seam for reset, bounded sanitized report emission with run marker to logcat, and per-target cache purge; PowerShell orchestrators plus Maestro for UI/send/scroll. Network and prefetch cohorts require cache control. Send test creates 30 real UAT messages.

## Outcome

- Signal: useful

## Source Nodes

- MobilePerformanceDiagnosticsScreen()
- mobile-performance-metrics.ts
- Maestro testID compatibility
- DirectMessage