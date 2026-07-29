---
type: "query"
date: "2026-07-28T17:24:29.000113+00:00"
question: "Mobil uygulama maksimum performans planinin repo kanitli degerlendirmesi"
contributor: "graphify"
outcome: "useful"
source_nodes: ["MobileStartupPerformanceMarker,MobileRealtimeProvider,createMobileMessageStore,authorizeMobileApiRequest,buildServerUnreadTotalsQuery"]
---

# Q: Mobil uygulama maksimum performans planinin repo kanitli degerlendirmesi

## Answer

Olcum sozlesmesi once duzeltilmeli; mevcut WIP cold-start cache purge, plaintext DM preview, SQLCipher lifecycle ve inactive realtime cache tutarliligi nedeniyle merge-ready degil. Backend yeniden yazimi yerine auth/bootstrap/unread/payload yollarinda olcumlu, kademeli optimizasyon gerekir.

## Outcome

- Signal: useful

## Source Nodes

- MobileStartupPerformanceMarker,MobileRealtimeProvider,createMobileMessageStore,authorizeMobileApiRequest,buildServerUnreadTotalsQuery