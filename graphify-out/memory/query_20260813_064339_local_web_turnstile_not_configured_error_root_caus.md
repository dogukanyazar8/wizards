---
type: "query"
date: "2026-08-13T06:43:39.029502+00:00"
question: "Local web Turnstile not configured error root cause and fix"
contributor: "graphify"
outcome: "useful"
source_nodes: ["apps/web/src/components/auth/turnstile-widget.tsx", "apps/web/src/lib/auth/turnstile.ts", "apps/web/src/app/(auth)/login/login-client.tsx"]
---

# Q: Local web Turnstile not configured error root cause and fix

## Answer

Both NEXT_PUBLIC_TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY were empty in ignored local env files. Configure Cloudflare official always-pass testing credentials locally, restart web because NEXT_PUBLIC env is bundled, then verify login rendering and Siteverify. Never use dummy keys in UAT or production.

## Outcome

- Signal: useful

## Source Nodes

- apps/web/src/components/auth/turnstile-widget.tsx
- apps/web/src/lib/auth/turnstile.ts
- apps/web/src/app/(auth)/login/login-client.tsx