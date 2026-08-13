---
type: "query"
date: "2026-08-13T15:48:32.582049+00:00"
question: "Projedeki kullanıcıların kazanabileceği tüm rozetleri listeler misin?"
contributor: "graphify"
outcome: "useful"
source_nodes: ["BADGE_CATALOG", "BADGE_IDS", "deriveBadges", "onAppSessionEnded", "onMessageCreated", "onMediaSessionEnded", "onInviteRedeemed"]
---

# Q: Projedeki kullanıcıların kazanabileceği tüm rozetleri listeler misin?

## Answer

Grafik sorgusu badge, badges, achievement, awarded, milestone, user, profile terimlerine genişletildi. Kanonik katalogda 16 rozet var: staff Ekip; verified Doğrulanmış; earlyMember Erken üye; veteran Kıdemli; inviter Davetçi; founder Kurucu; ideaShipped Fikir sahibi; bugHunter Hata avcısı; contributor Katkıcı; streak Seri; regular Müdavim; voice Sesli sohbetçi; broadcaster Yayıncı; supporter Destekçi; betaTester Beta testçisi; event Etkinlik. Koşullar packages/types/src/badges.ts ve docs/prompts/rozet-sistemi/00-ortak-baglam.md içinde doğrulandı.

## Outcome

- Signal: useful

## Source Nodes

- BADGE_CATALOG
- BADGE_IDS
- deriveBadges
- onAppSessionEnded
- onMessageCreated
- onMediaSessionEnded
- onInviteRedeemed