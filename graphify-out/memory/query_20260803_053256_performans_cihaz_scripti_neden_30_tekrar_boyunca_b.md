---
type: "query"
date: "2026-08-03T05:32:56.671809+00:00"
question: "Performans cihaz scripti neden 30 tekrar boyunca bitmiyor, DM deep-link nasıl düzeltilir ve ilerleme nasıl gösterilir?"
contributor: "graphify"
outcome: "useful"
source_nodes: ["WhisprPerformanceDevice.psm1", "Maestro flows", "mobile-dm-chat-screen"]
---

# Q: Performans cihaz scripti neden 30 tekrar boyunca bitmiyor, DM deep-link nasıl düzeltilir ve ilerleme nasıl gösterilir?

## Answer

Expanded from graph vocab: [performance, device, maestro, deep, link, mobile, progress, route]. Maestro launchApp sonrası React Navigation hazır olmadan openLink gönderildiğinde UAT cihazı servers screen gösterdi; direct cold and ready foreground adb deep links reached mobile-dm-chat-screen. Every performance Maestro flow now waits for mobile-app-shell before openLink. Invoke-WhisprExternal scopes MAESTRO_EXIT_CONSOLE=1 for Maestro so test failures return a nonzero process result, and every scenario loop prints PERF|scenario|iteration=N/total. Focused and related tests plus mobile typecheck passed; physical rerun remains required.

## Outcome

- Signal: useful

## Source Nodes

- WhisprPerformanceDevice.psm1
- Maestro flows
- mobile-dm-chat-screen