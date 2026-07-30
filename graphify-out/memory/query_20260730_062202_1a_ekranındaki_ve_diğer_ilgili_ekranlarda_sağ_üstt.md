---
type: "query"
date: "2026-07-30T06:22:02.958555+00:00"
question: "1A ekranındaki ve diğer ilgili ekranlarda sağ üstteki Bildir butonunun ikon tasarımını HTML 1a/ilgili About handoff tasarımıyla eşleştir"
contributor: "graphify"
outcome: "useful"
source_nodes: ["AboutClipboardIcon()", "AboutBellIcon()", "AboutScreenHeader()", "MobileAboutWhatsNewScreen()"]
---

# Q: 1A ekranındaki ve diğer ilgili ekranlarda sağ üstteki Bildir butonunun ikon tasarımını HTML 1a/ilgili About handoff tasarımıyla eşleştir

## Answer

AboutWhatsNewScreen tek Bildir kullanımını AboutBellIcon üzerinden render ediyor. 1c screenshot ve HTML, 14px strokeWidth 2 sabit outline zil gösteriyor; mevcut kod kapalı durumda strike, açık durumda fill ekliyordu. İkon sabit outline yapıldı, toggle davranışı korundu.

## Outcome

- Signal: useful

## Source Nodes

- AboutClipboardIcon()
- AboutBellIcon()
- AboutScreenHeader()
- MobileAboutWhatsNewScreen()