---
type: "query"
date: "2026-08-13T06:54:41.703649+00:00"
question: "Fix local login ThemeToggle hydration mismatch and Turnstile dummy verification failure"
contributor: "graphify"
outcome: "useful"
source_nodes: ["apps/web/src/hooks/use-login-theme.ts", "apps/web/src/components/auth/theme-toggle.tsx", "apps/web/src/lib/auth/turnstile.ts", "apps/web/src/lib/auth/actions.ts"]
---

# Q: Fix local login ThemeToggle hydration mismatch and Turnstile dummy verification failure

## Answer

Hydration mismatch came from reading localStorage in useState initializer: server dark and client light. useSyncExternalStore now supplies a stable dark server snapshot and reads stored preference after hydration. Cloudflare official always-pass dummy validation returns example.com, so strict local hostname validation rejected it. Hostname bypass is now limited to the official test secret outside production; production explicitly rejects that secret. Regression tests, focused lint, web typecheck, browser console, login flow, and health passed.

## Outcome

- Signal: useful

## Source Nodes

- apps/web/src/hooks/use-login-theme.ts
- apps/web/src/components/auth/theme-toggle.tsx
- apps/web/src/lib/auth/turnstile.ts
- apps/web/src/lib/auth/actions.ts