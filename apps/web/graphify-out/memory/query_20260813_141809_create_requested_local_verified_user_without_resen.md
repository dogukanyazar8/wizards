---
type: "query"
date: "2026-08-13T14:18:09.053853+00:00"
question: "Create requested local verified user without Resend"
contributor: "graphify"
outcome: "useful"
source_nodes: ["apps/web/src/lib/auth/actions.ts", "packages/db/prisma/schema.prisma"]
---

# Q: Create requested local verified user without Resend

## Answer

Confirmed DATABASE_URL targets localhost PostgreSQL and no email or username collision existed. Created a verified local user with display name Dogukan Yazar, email dogukanyazar@gmail.com, inferred username dogukanyazar, bcrypt cost 12 password hash, default user settings, and notification settings. Verified exact Unicode display name, active account state, email verification, and password hash match. No UAT or production mutation.

## Outcome

- Signal: useful

## Source Nodes

- apps/web/src/lib/auth/actions.ts
- packages/db/prisma/schema.prisma