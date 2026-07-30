---
type: "debug"
date: "2026-07-30T06:02:07.763992+00:00"
question: "Why does MobileAboutWhatsNewScreen show release notes only once and fail on re-entry?"
contributor: "graphify"
outcome: "useful"
source_nodes: ["apps/mobile/src/app/screens/about/about-whats-new-screen.tsx", "apps/mobile/src/about/mobile-about-queries.ts", "apps/mobile/src/query/mobile-query-client.ts"]
---

# Q: Why does MobileAboutWhatsNewScreen show release notes only once and fail on re-entry?

## Answer

The screen treated background query errors as fatal even when React Query retained usable cached list and detail data. Fix: gate fatal loading/error UI on absence of usable data; keep stale content visible during failed revalidation.

## Outcome

- Signal: useful

## Source Nodes

- apps/mobile/src/app/screens/about/about-whats-new-screen.tsx
- apps/mobile/src/about/mobile-about-queries.ts
- apps/mobile/src/query/mobile-query-client.ts