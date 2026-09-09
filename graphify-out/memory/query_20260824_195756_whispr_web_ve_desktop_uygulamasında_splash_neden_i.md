---
type: "route-audit"
date: "2026-08-24T19:57:56.984939+00:00"
question: "Whispr web ve desktop uygulamasında splash neden ilk açılış dışındaki route geçişlerinde görünüyor?"
contributor: "graphify"
outcome: "useful"
source_nodes: ["apps/web/src/app/(main)/loading.tsx", "apps/web/src/lib/app-startup/session.ts", "apps/web/src/components/shell/wizards-shell.tsx", "apps/desktop/src-tauri/src/lib.rs", "apps/web/src/components/desktop/desktop-experience.tsx"]
---

# Q: Whispr web ve desktop uygulamasında splash neden ilk açılış dışındaki route geçişlerinde görünüyor?

## Answer

Kök nedenler: (main)/loading.tsx 11 normal ana rota için AppStartupScreen fallback'i; Tauri deep-link dispatch window.location.assign ile SPA router'ı atlayıp runtime'ı yeniliyor. Module-scoped seen flag aynı document içinde doğru, reload sonrası sıfırlanıyor. /home ve /messages/friends yerel fallback ile güvenli.

## Outcome

- Signal: useful

## Source Nodes

- apps/web/src/app/(main)/loading.tsx
- apps/web/src/lib/app-startup/session.ts
- apps/web/src/components/shell/wizards-shell.tsx
- apps/desktop/src-tauri/src/lib.rs
- apps/web/src/components/desktop/desktop-experience.tsx