---
type: "query"
date: "2026-08-18T10:03:07.051248+00:00"
question: "MessageList içinde flushSync lifecycle console hatasını yan etkisiz düzelt"
contributor: "graphify"
outcome: "useful"
source_nodes: ["message-list.tsx", "MESSAGE_VIRTUALIZER_OPTIONS"]
---

# Q: MessageList içinde flushSync lifecycle console hatasını yan etkisiz düzelt

## Answer

Expanded from original query via graph vocab: [message, virtualizer, scroll, layout, effect, measure, react, chat, content]. Root cause: @tanstack/react-virtual defaults useFlushSync to true; measureElement ref can notify during React commit. Fix: MESSAGE_VIRTUALIZER_OPTIONS sets useFlushSync false. Regression test, ESLint, web typecheck, authenticated browser channel acceptance passed.

## Outcome

- Signal: useful

## Source Nodes

- message-list.tsx
- MESSAGE_VIRTUALIZER_OPTIONS