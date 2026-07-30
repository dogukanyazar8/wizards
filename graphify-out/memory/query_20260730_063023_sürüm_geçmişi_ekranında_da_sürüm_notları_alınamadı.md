---
type: "query"
date: "2026-07-30T06:30:23.849264+00:00"
question: "sürüm geçmişi ekranında da sürüm notları alınamadı hatasını alıyorum, bunu da çözer misin en güvenli en hızlı şekilde."
contributor: "graphify"
outcome: "useful"
source_nodes: ["useMobileAboutReleasesQuery()", "MobileAboutWhatsNewScreen()"]
---

# Q: sürüm geçmişi ekranında da sürüm notları alınamadı hatasını alıyorum, bunu da çözer misin en güvenli en hızlı şekilde.

## Answer

Expanded from original query via vocab: [about, release, releases, query, refetch, cache, version, history, mobileaboutwhatsnewscreen]. React Query re-entry refetch can fail while cached data remains. 2b incorrectly treated any isError as fatal and hid valid cached release history. Fix: render from cached list plus installed release when usable; show error only with no usable data. Regression test proves first success, unmount, failed re-entry refetch, cached rows and total remain visible.

## Outcome

- Signal: useful

## Source Nodes

- useMobileAboutReleasesQuery()
- MobileAboutWhatsNewScreen()