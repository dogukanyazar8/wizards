# Faz 1 raporu — Veri katmanı ve yetki omurgası

Branch `uat`, **commit edilmedi**. Migration **koşulmadı** (kullanıcı koşacak, §Kapı).
Bu fazda hiçbir mobil ekran dosyası değişmedi.

## Yapılanlar

### B1 — Migration + şema

- `packages/db/prisma/rebaseline-migrations/20260811120000_group_dm_v2/migration.sql` **(yeni)**: 4 enum (`DMParticipantRole`, `DMNotifyLevel`, `GroupPermissionLevel`, `GroupHistoryVisibility`), `DMConversation`'a 10 kolon, `DMParticipant`'a 6 kolon, 3 backfill, `nameColor SET NOT NULL`, 3 indeks, `pinnedMessageId` FK (`ON DELETE SET NULL`). `muted` **silinmedi** (§4.2).
- `packages/db/prisma/schema.prisma`: aynı alanlar + `DMMessage.pinnedInConversations` karşı ilişkisi. `prisma validate` ve `prisma generate` temiz.
- `nameColor` **varsayılansız NOT NULL**: böylece kolonu atlayan her yeni katılımcı yazma yolu çalışma zamanında 500 vermek yerine **derlemede** patlar. Bu tercihin doğrudan sonucu: `service.ts` (1:1 DM) ve `e2e-database.ts` da renk yazmak zorunda kaldı, ikisi de düzeltildi.

### B2 — Tip katmanı

- `packages/types/src/group-dm-settings.ts` **(yeni, 0 bağımlılık)**: iki palet, `GROUP_DM_DESCRIPTION_MAX_LENGTH`, `GROUP_PINNED_EXCERPT_MAX_LENGTH`, 5 Zod enum'u, `GroupPermissionsSchema`, `GroupDMSettingsUpdateRequestSchema`, `GroupMemberRoleUpdateRequestSchema`, `ConversationNotifyRequestSchema`, `ConversationPinRequestSchema`, `GroupPinMessageRequestSchema`/`GroupPinDismissRequestSchema`; saf fonksiyonlar `pickNextMemberNameColor`, `canMemberDo`, `resolveHistoryFloor`, `isGroupNameWithinLimit`, `toGroupAvatarInitials`, `buildGroupAvatarPair`.
- `GROUP_DM_NAME_MAX_LENGTH` **32** (V1) ve bu dosyaya **taşındı**. Sebep: `socket.ts` bu modülün şemalarını, `group-dm.ts` de sabitlerini istiyor; sabit `group-dm.ts`'te kalsaydı `socket → group-dm-settings → group-dm → socket` döngüsü kurulup Zod nesnelerinden biri modül değerlendirme anında `undefined` kalırdı (§4 TDZ tuzağı).
- `group-dm.ts`: create şeması `avatarColor`, `description`, `historyVisibility`, `permAddMembers` kabul ediyor.

### B3 — DTO

- `packages/types/src/socket.ts`: `DMConversationDTO` + `role`, `notifyLevel`, `pinnedAt`, `description`, `avatarColor`, `permissions`, `historyVisibility`, `pinnedMessage`, `memberCount`, `onlineCount`, `avatarPair`, `overflowCount`. `DMParticipantDTO` + `role`, `nameColor`, `joinedAt`. `DMMessagePayload` + `readReceipt`. Hepsi opsiyonel — aynı şema 1:1 DM'leri de taşıyor.
- `apps/web/src/lib/dm/service.ts`: `dmConversationInclude` katılımcı seçimini genişletti + `pinnedMessage` ilişkisini (dar select) ekledi; `mapDMConversationDTOWithPresence` yeni alanları dolduruyor.

### B4 — Yetki modülü

- `apps/web/src/lib/dm/group-permissions.ts` **(yeni)**: `groupAuthSelect`, `loadGroupAuthContext` (**tek sorgu** — katılımcı satırı aynı okumada filtrelenmiş ilişki olarak gelir), saf `toGroupAuthContext`, `assertGroupPermission`, `assertGroupAdmin`, `assertGroupOwner`, `assertGroupConversation`, `countGroupAdmins`.
- 1:1 DM'de `assertGroupPermission` daima geçer; katılımcı olmayan **fail-closed** 403.

### B5 — Servis

`apps/web/src/lib/dm/group-service.ts`:

| Fonksiyon                                            | Değişiklik                                                                                                                       |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `loadConversation`                                   | Artık konuşma ayarları + tam roster'ı **tek** sorguda döner; yetki bağlamı bu satırdan türetilir, gate için ikinci sorgu atılmaz |
| `createGroupConversation`                            | Kurucu `OWNER`, diğerleri `MEMBER`; her üyeye `nameColor`; `avatarColor`/`description`/`historyVisibility`/`permAddMembers`      |
| `addGroupMembers`                                    | `assertGroupPermission(..., "addMembers")`; yeni satırlara `nameColor` + `historyFromAt`                                         |
| `updateGroupConversation`                            | `requireGroupOwner` → `editInfo` izni                                                                                            |
| `removeGroupMember`                                  | `assertGroupAdmin`; `OWNER` çıkarılamaz, `ADMIN`'i yalnız `OWNER` çıkarır                                                        |
| `leaveGroupConversation`                             | Son yönetici → `409 OWNER_TRANSFER_REQUIRED`; açık `transferOwnershipTo` doğrulanır                                              |
| `resolveNextGroupOwner`                              | Önce `ADMIN`/`OWNER`, sonra en eski üye                                                                                          |
| **yeni** `updateGroupSettings`                       | 4 izin + geçmiş + açıklama + renk; sistem mesajı yazmaz, `lastMessageAt` bump'lamaz                                              |
| **yeni** `updateMemberRole`                          | Yalnız `OWNER`; devir tek transaction'da (hedef `OWNER`, eski sahip `ADMIN`, `ownerId`)                                          |
| **yeni** `setPinnedMessage`                          | `pinMessage` izni + mesaj bu konuşmaya mı ait; tüm `pinnedStripDismissedId` sıfırlanır                                           |
| **yeni** `setNotifyLevel`                            | `notifyLevel` **ve** `muted` **tek** `update` (§4.2 değişmezi)                                                                   |
| **yeni** `setConversationPin` / `dismissPinnedStrip` | Kişiye özel; üyelik `where` cümlesi, 0 satır = 403                                                                               |

### B6 — Geçmiş penceresi

- `requireDMParticipant` artık `{ historyFromAt, type }` döner ve hâlâ **tek** sorgu (katılımcı, konuşmanın filtreli ilişkisi olarak).
- `toHistoryWindowFilter` (yeni, saf): taban ile cursor'ı **tek** `createdAt` nesnesinde birleştirir — iki ayrı anahtar birbirini sessizce eziyordu.
- Uygulandığı yerler: `listDMMessages`, `listDMThreadMessages` (**hem ana mesaj hem yanıtlar** — thread deep-link'i pencerenin etrafından dolaşacaktı), `searchDMMessages` (bağlı parametreli SQL). İki HTTP aynası bu üç fonksiyonu çağırıyor; testle sabitlendi.
- Mevcut `@@index([conversationId, createdAt])` yetiyor, yeni indeks yok.

### B7 — Okundu bilgisi

- `group-presentation.ts` → `buildGroupReadReceipt`. Yazar hariç, `lastReadAt >= createdAt`; `everyone` yalnız başka üye varsa doğru olabilir.
- `listDMMessages` bunu **yalnız** grup + **cursor'suz sayfa**da, **yalnız** en yeni giden mesaja takar. Sistem satırı ve silinmiş mesaj atlanır. 1:1'de ve eski sayfalarda katılımcı okuma sorgusu **hiç** atılmaz.

### B8 — Uçlar (web + mobil ayna, aynı fazda)

| Metot + yol                                          | Mobil ayna                             |
| ---------------------------------------------------- | -------------------------------------- |
| `PATCH /dm/groups/[id]/settings`                     | ✓                                      |
| `PATCH /dm/groups/[id]/members/[userId]` (rol/devir) | ✓                                      |
| `PUT` + `DELETE /dm/groups/[id]/pin`                 | ✓                                      |
| `POST /dm/groups/[id]/pin/dismiss`                   | ✓                                      |
| `PATCH /dm/[id]/notify`                              | ✓                                      |
| `PATCH /dm/[id]/pin`                                 | ✓                                      |
| `DELETE /dm/groups/[id]/members/[userId]`            | gövdeye `transferOwnershipTo?` eklendi |

- Grup uçları `dm/groups/route-logic.ts`'e, konuşma-kapsamlı ikisi yeni `dm/[conversationId]/participant-route-logic.ts`'e; ikisinin de mobil aynası ve DI'lı testi var.
- `PATCH /dm/[id]/mute` **silinmedi**.
- `route-contract.test.ts` gövdesiz-rota listesi güncellendi.

### B9 — Realtime

`group-realtime.ts`: `dm:group:settings`, `dm:group:role`, `dm:group:pin` (tüm katılımcılara), `dm:conversation:notify`, `dm:conversation:pin` (yalnız `user:<id>`). Yayınlanan sabitleme kaydında `dismissed` **zorla false** — tek gövde herkese gidiyor.

### B10 — Web temeli

- `group-create-dialog.tsx` ve `dm-group-details-panel.tsx` sayacı zaten sabitten okuyor; V1 kendiliğinden düştü (dosyalara dokunulmadı).
- Web grup okumaları yeni DTO ile derleniyor; web `group-permissions.ts` dışında ikinci yetki yolu açmıyor.
- **Faz 5'e devredilen web ekran listesi:** grup ayarları paneli (2f karşılığı: bildirim kademesi, 4 izin satırı, gizlilik), üye rol menüsü (yönetici yap/al, sahiplik devri, gruptan çıkar), sabitlenmiş mesaj şeridi + "tüm sabitlenenler", grup bilgisi düzenleme (açıklama + renk), sohbeti sabitleme kontrolü, ayrılırken devir diyaloğu.

## Bağlayıcı kararlar

1. **Yetki tek kapıdan:** `group-permissions.ts`. Faz 2 ve 5 kendi kontrolünü yazmaz.
2. **`notifyLevel` otorite, `muted` türev ayna** — hep aynı `update` çağrısında.
3. **Üye adı rengi veritabanında** (`nameColor`), istemci türetmez, okur. Kolon varsayılansız NOT NULL: yeni bir katılımcı yazma yolu rengi unutursa **derleme** kırılır.
4. **Liste DTO'su üye dizisi taşımaz** — `avatarPair` + `overflowCount` + `memberCount`. `avatarPair` sunucuda `buildGroupAvatarPair` ile üretilir, istemci yeniden türetmez.
5. **Okundu bilgisi yalnız son giden mesajda ve yalnız ilk sayfada.**
6. **Geçmiş penceresi üç servis fonksiyonunda** (`listDMMessages`, `listDMThreadMessages` ×2 sorgu, `searchDMMessages`); beş HTTP yolu bu üçünü çağırıyor ve başka DM mesaj sorgusu atmıyor (testle sabit).
7. Grup adı üst sınırı **32** (V1) ve sabit artık `group-dm-settings.ts`'te.
8. `leaveGroupConversation` / `removeGroupMember` imzalarında **`options` en sona** eklendi (`(actorId, conversationId, [targetUserId,] dependencies, options)`), mevcut çağıranlar bozulmadı.

## Sapmalar

| #   | Sapma                                                                                                                                            | Gerekçe                                                                                                                                                       | Kullanıcıya soruldu                          |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| S1  | B3'teki ayrı `members[]` dizisi **yazılmadı**; `role`/`nameColor`/`joinedAt` mevcut `participants[]` girdilerine eklendi                         | İkinci dizi `presence` + `lastSeenAt`'i aynı gövdede iki kez taşırdı; Faz 3-5 tek kaynaktan okur                                                              | **Evet** — "participants'ı genişlet" seçildi |
| S2  | `GroupDMCreateRequestSchema`'ya `permAddMembers` eklendi (B5 listesinde yoktu)                                                                   | 2c §7 kurma formunda "Üye ekleyebilir" kontrolü var; yoksa 2c kurulumdan sonra ikinci PATCH atmak zorunda kalırdı                                             | **Evet** — "Ekle" seçildi                    |
| S3  | `description`/`avatarColor`'ı **yalnız** `updateGroupSettings` yazar; `updateGroupConversation` (ad/ikon) yazmaz                                 | B5 ikisini de listeliyordu; aynı iki kolona iki yazıcı, iki ayrı davranış demekti. B2'deki settings şeması bu iki alanı zaten taşıyor, uç davranışı eksilmedi | Hayır — kolon davranışı değişmediği için     |
| S4  | Yeni uçlara **yeni rate-limit anahtarı açılmadı**: settings/rol/pin → `dm:group:update`, notify/pin → `dm:mute` (mobilde `mobile:` karşılıkları) | Hepsi aynı sınıf yazma; 10 yeni kova davranışa bir şey katmadan `route-contract` yüzeyini büyütürdü                                                           | Hayır                                        |
| S5  | `sendDirectMessage` iki okuması için **dar bir DI** eklendi (`loadAuthConversation`, `loadNotificationParticipants`)                             | Web testinde DB yok; "izin yok → yazma yok" ancak böyle **davranışsal** olarak kanıtlanabiliyordu. Gate'ten sonraki yollar kasıtla enjekte edilmedi           | Hayır                                        |
| S6  | `onlineCount` **görüntüleyen dâhil** tüm çevrimiçi üyeleri sayar                                                                                 | `memberCount` de görüntüleyeni sayıyor; ikisi 2d §1'de yan yana okunuyor ("6 üye · 3 çevrimiçi")                                                              | Hayır — tasarımda karşıtı yazmıyor           |

## Kapı sonucu

| Komut                                     | Sonuç                             |
| ----------------------------------------- | --------------------------------- |
| `pnpm --filter @wizards/types test`       | ✅ 269/269                        |
| `pnpm --filter @wizards/web test`         | ✅ 2269/2269 (öncesi 2250)        |
| `pnpm --filter @wizards/web typecheck`    | ✅ temiz                          |
| `pnpm --filter @wizards/mobile typecheck` | ✅ temiz                          |
| `pnpm --filter @wizards/web lint`         | ✅ temiz (kapıda yok, ek kontrol) |
| `prisma validate` / `prisma generate`     | ✅ temiz                          |
| `graphify update .`                       | ✅ 24199 düğüm, 56986 kenar       |

### §E ek kontrol listesi

- [x] Migration `rebaseline-migrations/` altında — `20260811120000_group_dm_v2`
- [ ] `prisma migrate dev` temiz koştu — **kullanıcıya bırakıldı** (bkz. UAT notu)
- [ ] `nameColor` hiçbir satırda NULL değil — migration üç adımı içeriyor (nullable ekle → backfill → `SET NOT NULL`); doğrulama migration koştuktan sonra
- [ ] `notifyLevel` backfill'i `muted` ile tutarlı — SQL `muted = true → NONE`; rastgele satır kontrolü migration sonrası
- [x] Dört yazma yolunun her biri için "izin yok → 403" testi var — `addMembers`, `editInfo` (hem metadata hem settings), `pinMessage`, `sendMessage`
- [x] Socket üzerinden mesaj gönderimi `sendMessage` izninde takılıyor — `message-send-service.test.ts`: guard servis içinde, hiçbir yazmaya varmadan 403; ayrıca socket handler'ın `sendDirectMessage` dışında yazma yolu olmadığı sabitlendi
- [x] Beş okuma yolunda `historyFromAt` filtresi var — `history-window.test.ts` (3 servis fonksiyonu + 5 HTTP yolunun delegasyonu)
- [x] `buildGroupReadReceipt` yazarı saymıyor, `everyone` doğru — 7 test + takma davranışı için 5 test

## Cihaz test listesi (kullanıcı koşacak)

**Bu fazda cihaz testi yok** — arayüz değişmedi, mobil ekran dosyalarına dokunulmadı.

### Migration'ın UAT'ye uygulanması

Migration dosyası `rebaseline-migrations/` altında olduğu için UAT deploy'unda mevcut Prisma akışıyla kendiliğinden koşar; ayrı bir el işlemi gerekmez — yalnızca deploy'un `SUCCESS` olduğu doğrulanır (`railway deployment list` + `x-railway-fallback` başlığı). Yerelde önce `pnpm --filter @wizards/db exec prisma migrate dev --name group_dm_v2` koşulmalı; yerel DB `db push` yönetimli olduğu için Prisma drift görüp reset önerebilir.

## Bilinen boşluklar

- **Faz 2'ye ait ve kasıtla yapılmadı:** davet bağlantısı, kaybolan mesajlar, grup çağrısı.
- `readReceipt` yalnız HTTP mesaj listesinde dolu; **realtime `dm:message:new` payload'ında yok**. Canlı "n kişi okudu" güncellemesi Faz 5'in işi (`dm:conversation:read` olayı zaten yayınlanıyor, istemci sayıyı ondan tazeleyebilir).
- `avatarPair` yalnız sunucu tarafında üretiliyor; mobil/web bunu okuyacak kod Faz 3+.
- 2c §7'deki "Davet bağlantısı" anahtarı kurma formunda görünüyor ama karşılığı Faz 2'de (`GroupDMCreateRequestSchema` bugün bu alanı kabul etmiyor).
- `pinnedMessage` paylaşılan `dmConversationInclude`'da: sohbet listesi sayfası için **bir** ek deyim (to-one ilişki, satır başına değil). Ölçüm migration sonrası UAT'de tekrar bakılmalı; sorun çıkarsa detay okumasına özel bir include'a ayrılır.
- Mevcut uzun grup adları (>32) okunmaya devam ediyor; yalnız yeni yazmalar kısıtlı (V1 gereği).
