---
type: "query"
date: "2026-07-25T08:48:17.083241+00:00"
question: "Mobil uygulamada navigation bar için hangi ikon paketini kullanıyoruz?"
contributor: "graphify"
outcome: "useful"
source_nodes: ["tabIcons", "MobileLineIcon"]
---

# Q: Mobil uygulamada navigation bar için hangi ikon paketini kullanıyoruz?

## Answer

Expanded from graph vocab: [mobile, navigation, icon, tab]. Bottom navigation maps tabs through tabIcons in apps/mobile/src/navigation/mobile-bottom-tab-bar.tsx and renders the in-repo MobileLineIcon component. MobileLineIcon renders SVG primitives from react-native-svg, so navigation does not use @expo/vector-icons.

## Outcome

- Signal: useful

## Source Nodes

- tabIcons
- MobileLineIcon