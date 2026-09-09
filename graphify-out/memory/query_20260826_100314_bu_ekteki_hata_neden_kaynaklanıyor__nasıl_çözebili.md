---
type: "query"
date: "2026-08-26T10:03:14.736626+00:00"
question: "Bu ekteki hata neden kaynaklanıyor, nasıl çözebiliriz"
contributor: "graphify"
outcome: "useful"
source_nodes: ["turbo", "playwright.config.ts", "environment"]
---

# Q: Bu ekteki hata neden kaynaklanıyor, nasıl çözebiliriz

## Answer

Kök neden: root e2e scripti Turbo strict env modundan geçiyor; e2e tasklarında env/passThroughEnv tanımlı olmadığı için PowerShell oturumunda var olan E2E_TEST_MODE, E2E_DATABASE_URL/DATABASE_URL, E2E_TEST_PASSWORD ve REDIS_URL child tasktan filtreleniyor. Doğrudan web package preflight ve seed geçtiği için değerler ile DB sağlıklı. Hemen çözüm: pnpm --filter @wizards/web e2e. Kalıcı tercih: root e2e scriptlerini CI ile aynı doğrudan pnpm filter komutlarına çevir; Turbo korunacaksa eksiksiz env/passThroughEnv allowlist ekle. Tek seferlik --env-mode=loose mümkün ama daha zayıf.

## Outcome

- Signal: useful

## Source Nodes

- turbo
- playwright.config.ts
- environment