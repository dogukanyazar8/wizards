---
type: "query"
date: "2026-07-30T07:58:01.590444+00:00"
question: "Adım 13 2h puanlama sheet'i nasıl uygulanır?"
contributor: "graphify"
outcome: "useful"
source_nodes: ["13-2h-puanlama.md", "mobile-rating-model.ts", "about-rating-sheet.tsx"]
---

# Q: Adım 13 2h puanlama sheet'i nasıl uygulanır?

## Answer

Hakkında topluluk puanlama satırı 2h bottom sheet'i açar. 1-5 yıldızlar 42px görsel ve 44px hedef kullanır; boş etiket satırı yer tutar. 1-4 yıldız mevcut product feedback API'sine konu çipleriyle gider. Yalnız 5 yıldız ve geçerli store kimliği Linking.openURL kullanır; eksik iOS kimliği feedback'e düşer. 90 gün erteleme ve sürüm başına gönderim tercihleri yazılır. Otomatik tetikleme karar fonksiyonu testlidir fakat çağrı noktası yorumla kapalıdır.

## Outcome

- Signal: useful

## Source Nodes

- 13-2h-puanlama.md
- mobile-rating-model.ts
- about-rating-sheet.tsx