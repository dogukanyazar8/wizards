---
type: "debugging"
date: "2026-08-04T06:41:17.494239+00:00"
question: "SQLCipher smoke testi neden 0 sample raporluyor?"
contributor: "graphify"
outcome: "corrected"
correction: "Hydration bariyeri veri yolunu duzeltti; kalan hata erken kilitlenen telemetri kaynak siniflandirmasiydi."
source_nodes: ["useMobileDMRouteState", "refineMobileNavigationSpanStreamSource", "resolveMobileMessageStreamOpenSource", "hydrateMobileMessageStream"]
---

# Q: SQLCipher smoke testi neden 0 sample raporluyor?

## Answer

Rapor SQLCipher veritabaninin open ve 2 satir oldugunu, fakat DM messages HTTP istegi olmadan DirectMessage/network yazildigini gosterdi. Hydration bariyeri calisiyordu; navigator kaynak etiketini hydration tamamlanmadan network olarak kilitliyordu. Route query-data-ready aninda dogrulanmis sqlcipher veya prefetch kaynagi artik acik navigation spanine rafine ediliyor. Regresyon ve ilgili testler gecti.

## Outcome

- Signal: corrected
- Correction: Hydration bariyeri veri yolunu duzeltti; kalan hata erken kilitlenen telemetri kaynak siniflandirmasiydi.

## Source Nodes

- useMobileDMRouteState
- refineMobileNavigationSpanStreamSource
- resolveMobileMessageStreamOpenSource
- hydrateMobileMessageStream