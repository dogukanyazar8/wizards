---
type: "query"
date: "2026-08-24T20:32:37.669537+00:00"
question: "Whispr route transitions replay startup splash; implement safe first-launch-only behavior across web and Tauri"
contributor: "graphify"
outcome: "useful"
source_nodes: ["apps/web/src/app/(main)/loading.tsx", "apps/web/src/lib/app-startup/session.ts", "apps/web/src/hooks/use-shell-readiness.ts", "apps/web/src/components/desktop/desktop-navigation-bridge.tsx", "apps/web/src/components/providers/authenticated-app-providers.tsx", "apps/desktop/src-tauri/src/lib.rs", "apps/web/src/components/settings/blocks/profile-hero-card.tsx"]
---

# Q: Whispr route transitions replay startup splash; implement safe first-launch-only behavior across web and Tauri

## Answer

Root causes were the global main loading fallback, document-only splash state, Tauri hard navigation, a voice-conditional desktop listener, and a raw profile anchor. Implemented neutral route loading, session-scoped StrictMode-stable splash state, an unconditional validated SPA navigation bridge with cold fallback, aligned 768-byte native boundary, and existing profile popover navigation.

## Outcome

- Signal: useful

## Source Nodes

- apps/web/src/app/(main)/loading.tsx
- apps/web/src/lib/app-startup/session.ts
- apps/web/src/hooks/use-shell-readiness.ts
- apps/web/src/components/desktop/desktop-navigation-bridge.tsx
- apps/web/src/components/providers/authenticated-app-providers.tsx
- apps/desktop/src-tauri/src/lib.rs
- apps/web/src/components/settings/blocks/profile-hero-card.tsx