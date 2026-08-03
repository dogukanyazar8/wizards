---
type: "query"
date: "2026-07-31T13:36:43.679323+00:00"
question: "Yapmam gereken cihaz testlerini sırasıyla talimatlarınla paylaşır mısın?"
contributor: "graphify"
outcome: "useful"
source_nodes: ["Device E2E decision", "android:uat:local:apk:phone:release", "MobilePerformanceDiagnosticsScreen()", "mobile-chat-transition.ts"]
---

# Q: Yapmam gereken cihaz testlerini sırasıyla talimatlarınla paylaşır mısın?

## Answer

Expanded from graph vocab: mobile performance device android release diagnostics build apk test navigation startup message. Device validation order: clean committed SHA, release phone APK, clean install, build identity verification, navigation smoke, reset diagnostics, cold startup and warm resume repetitions, cached DM and channel cohorts, controlled network cohorts, send echo and ACK repetitions, deep-link push profile regressions, diagnostics export and budget evaluation. Official evidence requires fixed SHA, stable device and network, at least 30 samples per cohort; transition comparison needs 30 per slide fade none. Current dirty tree must not be treated as fixed-SHA evidence.

## Outcome

- Signal: useful

## Source Nodes

- Device E2E decision
- android:uat:local:apk:phone:release
- MobilePerformanceDiagnosticsScreen()
- mobile-chat-transition.ts