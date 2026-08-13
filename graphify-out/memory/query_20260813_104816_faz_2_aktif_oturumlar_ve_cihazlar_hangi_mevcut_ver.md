---
type: "query"
date: "2026-08-13T10:48:16.282563+00:00"
question: "Faz 2 aktif oturumlar ve cihazlar hangi mevcut veri yollarina baglanmali?"
contributor: "graphify"
outcome: "useful"
source_nodes: ["AppSession", "Session", "revokeUserSessions()", "session-revocation.ts", "refresh-token-family.ts"]
---

# Q: Faz 2 aktif oturumlar ve cihazlar hangi mevcut veri yollarina baglanmali?

## Answer

Expanded from original query via vocab: session sessions devices appsession revoke revocation authentication security account settings mobile desktop. AppSession analytics/socket lifecycle kaydidir; auth registry olarak kullanilmaz. Legacy Session modeli JWT auth akisi tarafindan yazilmaz. Mobile refresh family Redis sessionId, web JWT sessionStartedAt ve durable sessionsRevokedAfter kullanir. Tekil revoke icin ayri durable AuthSession registry gerekir.

## Outcome

- Signal: useful

## Source Nodes

- AppSession
- Session
- revokeUserSessions()
- session-revocation.ts
- refresh-token-family.ts