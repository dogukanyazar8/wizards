---
type: "query"
date: "2026-08-12T18:18:19.652933+00:00"
question: "11-moderasyon-ve-denetim-izi.md A seçeneğini uygula"
contributor: "graphify"
outcome: "useful"
source_nodes: ["kickWorkspaceMember()", "audit-log.ts", "moderation/cases/route.ts"]
---

# Q: 11-moderasyon-ve-denetim-izi.md A seçeneğini uygula

## Answer

Expanded from graph vocab: [kick, member, role, assign, transaction, audit, workspace, server, moderation, claim, appeal, pagination]. Graph navigation located kickWorkspaceMember(), moderation case actions/queries, and audit-log.ts. Source verification led to resolved-status guards, idempotent reporter createMany, bounded case-file pagination, and atomic workspace audit rows for kick and role updates.

## Outcome

- Signal: useful

## Source Nodes

- kickWorkspaceMember()
- audit-log.ts
- moderation/cases/route.ts