---
type: "query"
date: "2026-07-29T16:28:46.419405+00:00"
question: "Hakkında ekranında yenilikler özeti ve tüm yenilikler ekranı neden görünmüyor?"
contributor: "graphify"
outcome: "useful"
source_nodes: ["MobileAboutSettingsScreen()", "navigate()", "about-whats-new-screen.tsx"]
---

# Q: Hakkında ekranında yenilikler özeti ve tüm yenilikler ekranı neden görünmüyor?

## Answer

Expanded from original query via vocab: [about, whats, release, settings, screen, navigator, query, card, render, navigate]. mobile-about-settings-screen.tsx used the formatted bootstrap version in the release-detail path and conditionally removed both AboutGroupHeading and AboutWhatsNewCard when detail data was absent. The fix normalizes the installed version before querying and keeps the AboutWhatsNew navigation heading rendered independently of detail success.

## Outcome

- Signal: useful

## Source Nodes

- MobileAboutSettingsScreen()
- navigate()
- about-whats-new-screen.tsx