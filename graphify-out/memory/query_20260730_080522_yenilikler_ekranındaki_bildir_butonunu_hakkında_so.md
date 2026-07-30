---
type: "query"
date: "2026-07-30T08:05:22.845398+00:00"
question: "Yenilikler ekranındaki Bildir butonunu Hakkında sorun bildir sayfasına nasıl yönlendiririz?"
contributor: "graphify"
outcome: "useful"
source_nodes: ["MobileAboutWhatsNewScreen()", "AboutWhatsNewScreenContainer", "BugReportScreenContainer"]
---

# Q: Yenilikler ekranındaki Bildir butonunu Hakkında sorun bildir sayfasına nasıl yönlendiririz?

## Answer

Expanded from original query via vocab: [about, mobileaboutwhatsnewscreen, release, feedback, bug, report, navigate]. MobileAboutWhatsNewScreen header action currently toggles releaseNotify and persists whispr.settings.releaseNotify. AboutWhatsNewScreenContainer already owns navigation; target root route is BugReport, used by HelpCenterScreenContainer and MobileAboutSettingsScreen. Recommended seam: add onOpenBugReport prop, invoke it from header, container maps it to navigation.navigate('BugReport'), then remove obsolete toggle state/effects.

## Outcome

- Signal: useful

## Source Nodes

- MobileAboutWhatsNewScreen()
- AboutWhatsNewScreenContainer
- BugReportScreenContainer