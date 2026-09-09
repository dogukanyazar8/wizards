---
type: "query"
date: "2026-08-24T15:13:39.428787+00:00"
question: "Whispr web desktop home links and search overlay navigation splash bug"
contributor: "graphify"
outcome: "useful"
source_nodes: ["home-continue-card.tsx", "home-awaiting-card.tsx", "command-palette.ts", "wizards-shell.tsx"]
---

# Q: Whispr web desktop home links and search overlay navigation splash bug

## Answer

Expanded from original query via graph vocab: [home, continue, awaiting, inbox, friends, mentions, messages, search, command, overlay, navigation, router, splash]. Graph located HomeHeader-related cards, command palette, route helpers, and shell. Source corroboration found HomeHeaderLink renders a raw anchor; its three consumers use /channels, /inbox, and /messages. Raw document navigation remounts the main shell and exposes splash readiness. Canonical requested destinations are /mentions and /messages/friends. Existing command palette already provides secure in-app href filtering, one global shortcut, lazy loading, listbox keyboard navigation, and portal behavior; retain these while matching reference markup.

## Outcome

- Signal: useful

## Source Nodes

- home-continue-card.tsx
- home-awaiting-card.tsx
- command-palette.ts
- wizards-shell.tsx