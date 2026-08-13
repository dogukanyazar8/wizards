---
type: "query"
date: "2026-08-13T14:14:41.036067+00:00"
question: "Local registration fails because Resend configuration appears deleted"
contributor: "graphify"
outcome: "useful"
source_nodes: ["apps/web/src/lib/auth/email-verification.ts", "apps/web/src/lib/auth/actions.ts", ".env.example"]
---

# Q: Local registration fails because Resend configuration appears deleted

## Answer

RESEND_API_KEY, RESEND_FROM_EMAIL, and RESEND_FROM are empty in root, web, and db env files. No recoverable value exists in checkout env candidates, Windows process/user/machine env, or PowerShell history. Registration requires real Resend delivery and rolls back an unverified user if delivery fails. Configure a newly created Resend API key locally and either onboarding@resend.dev for the Resend account email only or a sender at a verified custom domain for other recipients. Never paste the key into chat or copy Railway secrets locally.

## Outcome

- Signal: useful

## Source Nodes

- apps/web/src/lib/auth/email-verification.ts
- apps/web/src/lib/auth/actions.ts
- .env.example