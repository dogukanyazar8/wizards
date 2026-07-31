---
type: "query"
date: "2026-07-31T05:24:41.285277+00:00"
question: "Hakkında ekranı neden eski yayın notunu gösteriyor?"
contributor: "graphify"
outcome: "useful"
source_nodes: ["getMobileAboutReleaseQueryOptions", "MobileAboutSettingsScreen"]
---

# Q: Hakkında ekranı neden eski yayın notunu gösteriyor?

## Answer

Expanded from original query via vocab: [mobile, about, release, update, query, cache, invalidation, admin]. getMobileAboutReleaseQueryOptions bundled initialData inherited the 15-second query staleTime; MobileAboutSettingsScreen Denetle refetched only aboutUpdate. The fix marks the fallback stale and refetches the active release.

## Outcome

- Signal: useful

## Source Nodes

- getMobileAboutReleaseQueryOptions
- MobileAboutSettingsScreen