---
type: "root-cause"
date: "2026-07-27T05:30:44.981515+00:00"
question: "Mobil geri bildirim görsel yükleme hatası"
contributor: "graphify"
outcome: "useful"
source_nodes: ["packages/db/prisma/rebaseline-migrations/20260725000000_uat_schema_baseline/migration.sql", "packages/db/prisma/rebaseline-migrations/20260726120000_add_product_feedback/migration.sql", "packages/db/prisma/rebaseline-migrations/20260727130000_allow_feedback_attachment_uploads/migration.sql", "apps/mobile/src/feedback/use-mobile-feedback-attachment-upload.ts", "apps/web/src/lib/mobile/mobile-media-upload-service.ts"]
---

# Q: Mobil geri bildirim görsel yükleme hatası

## Answer

Kök neden: FEEDBACK_ATTACHMENT enumu eklendi ancak MobileMediaUpload amac-hedef CHECK kısıtı güncellenmedi; callback kaydı PostgreSQL 23514 ile reddediliyordu. Canlı Prisma migration yoluna yeni kısıt migrationu ve regresyon testi eklendi.

## Outcome

- Signal: useful

## Source Nodes

- packages/db/prisma/rebaseline-migrations/20260725000000_uat_schema_baseline/migration.sql
- packages/db/prisma/rebaseline-migrations/20260726120000_add_product_feedback/migration.sql
- packages/db/prisma/rebaseline-migrations/20260727130000_allow_feedback_attachment_uploads/migration.sql
- apps/mobile/src/feedback/use-mobile-feedback-attachment-upload.ts
- apps/web/src/lib/mobile/mobile-media-upload-service.ts