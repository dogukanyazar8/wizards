---
type: "query"
date: "2026-08-12T18:45:05.146859+00:00"
question: "Mesaj dökümü sanallaştırılmıyor. Yan bulgu: link önizleme sorgu patlaması. Bu bulgudaki sorun nedir tam olarak"
contributor: "graphify"
outcome: "useful"
source_nodes: ["use-messages.ts", "message-list.tsx", "link-preview-card.tsx"]
---

# Q: Mesaj dökümü sanallaştırılmıyor. Yan bulgu: link önizleme sorgu patlaması. Bu bulgudaki sorun nedir tam olarak

## Answer

Expanded from original query via graph vocab: [message, infinite, pages, cache, scroll, preview]. useMessages retains every fetched page; message-list flattens and renders every retained message, including offscreen rows. Each mounted message also mounts LinkPreviewCard; unique URLs start independent /api/v1/link-preview queries. Long histories therefore grow DOM and memory without a bound and can create bursts of third-party preview work.

## Outcome

- Signal: useful

## Source Nodes

- use-messages.ts
- message-list.tsx
- link-preview-card.tsx