---
type: "query"
date: "2026-08-26T10:14:54.961776+00:00"
question: "Bu değişikliği sen yapar mısın."
contributor: "graphify"
outcome: "useful"
source_nodes: ["turbo", "package.json", "playwright.config.ts", "workflow"]
---

# Q: Bu değişikliği sen yapar mısın.

## Answer

Expanded from original request via graph vocab: [turbo, turborepo, package, script, playwright, environment, test, workflow, contract]. Root package.json e2e, e2e:api, e2e:realtime ve e2e:smoke scriptleri Turbo yerine pnpm --filter @wizards/web ile doğrudan çağrılacak şekilde değiştirildi. RED: dummy local E2E env ile eski pnpm e2e Turbo child içinde preflightta env eksikliğiyle durdu. GREEN: yeni root entrypointler preflightı geçti; listelenen testler full 497/35 dosya, API 43/5, realtime 24/2, smoke 16/5. Prettier package.json ve test:toolchain 77/77 geçti. Tam Playwright senaryoları çalıştırılmadı.

## Outcome

- Signal: useful

## Source Nodes

- turbo
- package.json
- playwright.config.ts
- workflow