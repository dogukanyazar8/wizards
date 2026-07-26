---
type: "query"
date: "2026-07-26T16:33:22.483411+00:00"
question: "Mobil açılışında modern splash, yüklemeler ve performans kontrolleri nasıl tasarlanmalı?"
contributor: "graphify"
outcome: "useful"
source_nodes: ["MobileAuthProvider", "MobileBootstrapPayload", "mobile-query-cache-policy.ts"]
---

# Q: Mobil açılışında modern splash, yüklemeler ve performans kontrolleri nasıl tasarlanmalı?

## Answer

Expanded tokens: [mobile, expo, splash, startup, bootstrap, auth, session, cache, loading, navigation, sentry, profile, messages]. Native splash only covers first stable JS screen; session, font fallback, theme shell and cached bootstrap shape first paint. Bootstrap/realtime/push/integrity continue after interactive shell. Repo uses MobileAuthProvider, MobileBootstrapPayload and persisted mobile cache.

## Outcome

- Signal: useful

## Source Nodes

- MobileAuthProvider
- MobileBootstrapPayload
- mobile-query-cache-policy.ts