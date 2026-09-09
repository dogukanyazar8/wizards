---
type: "query"
date: "2026-08-26T10:09:18.745382+00:00"
question: "Kalıcı önerini nasıl uygulayabilirim?"
contributor: "graphify"
outcome: "useful"
source_nodes: ["turbo", "package.json", "playwright.config.ts", "workflow"]
---

# Q: Kalıcı önerini nasıl uygulayabilirim?

## Answer

Expanded from original query via graph vocab: [turbo, turborepo, package, script, playwright, environment, test, workflow]. Root package.json içindeki e2e, e2e:api, e2e:realtime ve e2e:smoke scriptlerini turbo çağrılarından pnpm --filter @wizards/web <script> biçimine çevir. e2e:seed zaten bu kalıbı kullanıyor; CI de web paketini doğrudan çağırıyor. turbo.json değişikliği gerekmiyor. Sonra e2e:check-env, e2e:smoke ve gerekirse tam e2e çalıştır.

## Outcome

- Signal: useful

## Source Nodes

- turbo
- package.json
- playwright.config.ts
- workflow