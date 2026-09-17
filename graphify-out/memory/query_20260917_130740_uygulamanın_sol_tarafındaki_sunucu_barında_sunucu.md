---
type: "query"
date: "2026-09-17T13:07:40.132778+00:00"
question: "Uygulamanın sol tarafındaki sunucu barında sunucu oluştur butonunun üzerine geldiğimizde çıkan sunucu oluştur adı mesajını sol alttaki indirme ve bildirme butonları için de yapalım."
contributor: "graphify"
outcome: "useful"
source_nodes: ["ServerRailDownloadButton()", "ServerRailReportButton()", "server-rail-support-buttons.tsx", "server-rail.tsx"]
---

# Q: Uygulamanın sol tarafındaki sunucu barında sunucu oluştur butonunun üzerine geldiğimizde çıkan sunucu oluştur adı mesajını sol alttaki indirme ve bildirme butonları için de yapalım.

## Answer

Expanded via graph vocab: server, rail, create, tooltip, download, report, notification, button, sidebar. Implemented portal-backed app-tooltip for ServerRailDownloadButton and ServerRailReportButton using existing labels, right-side 12px offset, vertical centering, hover/focus show, blur/mouseleave hide. Removed native title to avoid duplicate tooltips. Added regression contract coverage. Focused tests 13/13, web typecheck, Prettier, and diff check passed.

## Outcome

- Signal: useful

## Source Nodes

- ServerRailDownloadButton()
- ServerRailReportButton()
- server-rail-support-buttons.tsx
- server-rail.tsx