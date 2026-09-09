---
type: "query"
date: "2026-08-27T13:48:43.641085+00:00"
question: "Whispr desktop yayin ve durum ayarlari kod karsiligi, gereklilik ve entegrasyon mimarisi"
contributor: "graphify"
outcome: "useful"
source_nodes: ["resolveDesktopStreamerMode()", "desktop-settings-bridge.ts", "DesktopActivityStatus", "SocketPresenceActivityPayloadSchema"]
---

# Q: Whispr desktop yayin ve durum ayarlari kod karsiligi, gereklilik ve entegrasyon mimarisi

## Answer

w4 yayin modu gercek tuketicilere bagli; w5 yalniz Windows foreground process whitelist ve gercek yayin algilamiyor; w6-w7 yalniz yerel pencere basligi/tepsi etkinligi, arkadaslara veya Discord'a yayin yok. Once Voice Mini gizlilik acigi ve yaniltici metin duzeltilmeli; sonra OBS WebSocket, mevcut Whispr presenceVisibility tabani ve istege bagli Discord adapteri.

## Outcome

- Signal: useful

## Source Nodes

- resolveDesktopStreamerMode()
- desktop-settings-bridge.ts
- DesktopActivityStatus
- SocketPresenceActivityPayloadSchema