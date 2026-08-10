# Faz 1 raporu — Veri katmanı (DB + API + tipler + web paritesi)

Branch `uat`. Commit yok, her şey uncommitted.

---

## 1. Ne yapıldı

### Yeni dosyalar

| Dosya                                                                                                       | Satır         |
| ----------------------------------------------------------------------------------------------------------- | ------------- |
| `packages/db/prisma/rebaseline-migrations/20260810120000_server_tags_starred_and_events/migration.sql`      | 47            |
| `apps/web/src/lib/workspace/scheduled-event-service.ts`                                                     | 402           |
| `apps/web/src/lib/workspace/scheduled-event-service.test.ts`                                                | 215           |
| `apps/web/src/lib/workspace/server-user-settings-service.ts`                                                | 155           |
| `apps/web/src/lib/workspace/server-user-settings-service.test.ts`                                           | 73            |
| `apps/web/src/lib/servers/server-weekly-message-count.ts`                                                   | 105           |
| `apps/web/src/app/api/v1/mobile/servers/[serverId]/events/{route,route-logic}.ts` + test                    | 16 + 80 + 170 |
| `apps/web/src/app/api/v1/mobile/servers/[serverId]/events/[eventId]/{route,route-logic}.ts` + test          | 16 + 75 + 142 |
| `apps/web/src/app/api/v1/mobile/servers/[serverId]/events/[eventId]/interest/{route,route-logic}.ts` + test | 11 + 55 + 123 |
| `apps/web/src/app/api/v1/mobile/servers/[serverId]/settings/{route,route-logic}.ts` + test                  | 11 + 51 + 120 |
| `apps/web/src/app/api/v1/servers/[serverId]/events/route.ts`                                                | 43            |
| `apps/web/src/app/api/v1/servers/[serverId]/events/[eventId]/route.ts`                                      | 48            |
| `apps/web/src/app/api/v1/servers/[serverId]/events/[eventId]/interest/route.ts`                             | 31            |
| `apps/web/src/components/servers/server-tags-editor.tsx`                                                    | 115           |
| `apps/web/src/components/servers/server-events-panel.tsx`                                                   | 309           |

### Değişen dosyalar (`git diff --stat`, 34 dosya, **+1956 / −182**)

| Dosya                                                             | Δ            | Ne                                                                                                                           |
| ----------------------------------------------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `packages/db/prisma/schema.prisma`                                | +43/−6       | `Server.tags`, GIN index, `UserServerSettings.starred`, `ScheduledEventInterest`, `[serverId,status,scheduledStartAt]` index |
| `packages/db/src/index.ts`                                        | +3           | `MessageNotification`, `ScheduledEventStatus`, `ScheduledEventEntityType` tip export'u                                       |
| `packages/types/src/workspace.ts`                                 | +230         | B2 profil genişletmesi, B3 etkinlik şemaları, B4 tag şemaları, B5 kullanıcı ayarları                                         |
| `packages/types/src/workspace.test.ts`                            | +285/−25     | 15 yeni coverage fixture + 8 davranış testi                                                                                  |
| `packages/types/src/server-profile-presentation.ts`               | +34          | `resolveServerScheduledEventAction` (15 dk eşiği, saf)                                                                       |
| `packages/types/src/mobile.ts`                                    | +14/−55      | Davet önizleme = `ServerPublicProfileSchema + slug`; ölü alt şemalar silindi                                                 |
| `packages/types/src/mobile-workspace-management.ts`               | +52          | Etkinlik/ayar rota şemaları + `MobileServerEventParamsSchema`                                                                |
| `apps/web/src/lib/servers/server-public-profile-service.ts`       | +323/−45     | B6: 14 yeni alan, kategori/son etkinlik/katılımcı, yönetici listesi, sorgu bütçesi                                           |
| `apps/web/src/lib/servers/server-discovery-service.ts`            | +26/−7       | Etiket araması (iki dalda da), `tags` kart alanı                                                                             |
| `apps/web/src/lib/workspace/server-service.ts`                    | +43/−4       | `tags` yazımı, `starred` okuması, `sortWorkspaceServerSummaries`                                                             |
| `apps/web/src/lib/invites/mobile-invite-preview-service.ts`       | +5/−16       | Profil + slug döner                                                                                                          |
| `apps/web/src/lib/api-rate-limit.ts`                              | +23          | 6 mobil + 5 web action                                                                                                       |
| `apps/web/src/app/api/v1/route-contract.test.ts`                  | +64/−2       | 11 yeni satır + 2 bodyless kayıt + sayaç 31→37                                                                               |
| `apps/web/src/components/shell/server-settings-overlay.tsx`       | +21/−1       | Etiket kartı + "Etkinlikler" sekmesi                                                                                         |
| `apps/web/src/components/servers/server-profile-card.tsx`         | +13          | Etiket çipleri                                                                                                               |
| `apps/web/src/lib/locale/messages/{tr,en}.ts`                     | +28 her biri | 28 yeni anahtar                                                                                                              |
| `apps/web/src/lib/workspace/{client,server-query-helpers}.ts`     | +51 / +3     | Etkinlik istemci yardımcıları, `starred` alanı                                                                               |
| `apps/web/src/lib/workspace/service.test.ts`                      | +12          | Karakterizasyon fixture'larına `tags`/`userServerSettings`                                                                   |
| `apps/mobile/component-tests/mobile-about-community-2g.test.tsx`  | +47/−5       | Fixture profil şekline çevrildi                                                                                              |
| `apps/mobile/component-tests/mobile-server-profile-join.test.tsx` | +30/−1       | Aynı                                                                                                                         |

---

## 2. Bağlayıcı kararlar (sonraki fazları kısıtlar)

1. **`ServerPublicProfileSchema` tek okuma modelidir.** 6c/6d/6e'nin her alanı üzerinde. Faz 5 ikinci bir profil şeması tanımlayamaz. `workspace.test.ts` "keeps the profile the single read model rather than a second schema" testi bunu kilitler.
2. **Davet önizlemesi = profil + `slug`.** `MobileInvitePreviewResponseSchema` artık `ServerPublicProfileSchema.extend({ slug })`. Faz 5 tek gövdeyi iki rotaya bağlayabilir. Eski dar alt şemalar (`MobileInvitePreviewChannelSchema`, `…MutualFriendSchema`, `…ChannelTypeSchema`) silindi.
3. **Kullanıcı-sunucu tercihleri tek uçtan yazılır:** `PATCH /api/v1/mobile/servers/[serverId]/settings`, action `mobile:server:user-settings:update`. Faz 4 `starred`/`muted`/`notificationLevel` için ayrı uç açamaz.
4. **Etiket doğrulaması `packages/types` içindedir** (`ServerTagSchema`, `ServerTagsSchema`, `SERVER_TAG_LIMIT = 5`). Küçük harfe çevirme + tekilleştirme şemada olur; istemci kendi kuralını yazamaz. Yazma yolu mevcut `server:update` / `mobile:server:update` action'ı, yeni rota yok.
5. **"Katıl vs Hatırlat" 15 dk eşiği saf fonksiyondur:** `resolveServerScheduledEventAction(event, nowMs)` (`packages/types/src/server-profile-presentation.ts`), `SERVER_SCHEDULED_EVENT_JOIN_WINDOW_MS` sabiti ile. İptal/tamamlanmış etkinlikte `null` döner — buton gizlenir, devre dışı buton yok.
6. **Sıralama kuralı `starred desc` → mevcut sıralama.** `sortWorkspaceServerSummaries` (`server-service.ts`) tek uygulamadır; Faz 4 rail sıralamasını bundan türetir.
7. **Etkinlik iptali satırı silmez** (`status = CANCELLED`), ve iptal yanıtı etkinliği geri döner. `ScheduledEventStatus` DB'de **çift L** (`CANCELLED`).
8. **İlgi (`interest`) uçları arzu edilen durumu alır**, toggle değil: gövde `{ interested: boolean }`. İki eşzamanlı dokunuş birbirini iptal etmez.
9. **Etkinlik yönetimi izni = `MANAGE_SERVER`** (kod tabanındaki gerçek izin adı). İlgi bildirmek yalnızca üyelik ister.

---

## 3. Tasarımdan sapmalar

| Sapma                                                                                                                                                            | Gerekçe                                                                                                                                                                                                                                                                 |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Etkinlik action adları `mobile:server:events:*` (spec `server:events:*` diyordu)                                                                                 | Kullanıcı kararı (bu oturum): kod tabanındaki her mobil rota `mobile:` önekli. `server:events:*` adları B7'nin web rotalarına verildi — iki istemci ayrı bütçe.                                                                                                         |
| `ScheduledEventStatus` = `CANCELLED` (spec `CANCELED` yazıyordu)                                                                                                 | DB enum'u `schema.prisma:317` çift L. Araya rename katmanı koymak yerine kolon takip edildi.                                                                                                                                                                            |
| `accessLevel: "approval"` hiç üretilmiyor                                                                                                                        | Şemada onay kapısı taşıyan kolon yok. Enum'da yeri var (6e üç durum render ediyor), servis bugün yalnız `public`/`invite` döndürüyor. Kolon geldiğinde servis değişikliği yeter, sözleşme değişmez.                                                                     |
| `participants[].shortName` / `admins[].shortName` görünen addan türetiliyor                                                                                      | `User` tablosunda `shortName` kolonu yok (yalnız `Server`'da var). Alan sözleşmede zorunlu; her istemcinin kendi baş harf kuralını yazması yerine `toProfileMemberShortName` tek yerde türetiyor.                                                                       |
| Yönetici `presence`'ı `AppSession.lastSeenAt` + 2 dk tazelik penceresinden geliyor                                                                               | Spec'in bağlayıcı kararı. **Risk:** aynı ekrandaki `onlineCount` Redis `server:<id>:online` kümesinden geliyor — iki kaynak ayrışabilir ("3 çevrimiçi" derken tüm yöneticiler çevrimdışı görünebilir). Redis'e geçmek tek satırlık değişiklik; kararı sana bırakıyorum. |
| Keşif aramasında etiket eşleşmesi **tam** (slug), ad eşleşmesi `ILIKE '%…%'`                                                                                     | 6d'de etikete dokunma etiketin kendi metnini gönderiyor. Kısmi etiket eşleşmesi GIN indeksini kullanamaz.                                                                                                                                                               |
| Web etkinlik yönetimi ekranı tasarımsız                                                                                                                          | 6a-6f handoff'u yalnız mobil. Mevcut sunucu ayarları formu kalıbına uyduruldu (`app-panel` kart + `Input`/`Textarea`/`Button`).                                                                                                                                         |
| **İki mobil dosyaya dokunuldu**, ikisi de fixture: `component-tests/mobile-about-community-2g.test.tsx` ve `component-tests/mobile-server-profile-join.test.tsx` | Ekran/bileşen/tema değil, **test fixture'ları**. Mobil istemciler yanıtı şemayla `parse` ediyor (`mobile-community-invite-client.ts`); dar fixture'lar genişletilmiş şemayı geçemeyip 11 testi kırdı. Fixture'lar profil şekline çevrildi, ekran kodu değişmedi.        |

---

## 4. Kapı çıktıları

```bash
pnpm --filter @wizards/types test
```

```
ℹ tests 212
ℹ pass 212
ℹ fail 0
```

```bash
pnpm --filter @wizards/web test
```

```
ℹ tests 2122
ℹ suites 478
ℹ pass 2122
ℹ fail 0
```

```bash
pnpm --filter @wizards/web typecheck
```

```
$ node ../../scripts/quality/typescript-project-runner.mjs --project=web --mode=check
(çıktı yok — temiz)
```

```bash
pnpm --filter @wizards/mobile typecheck
```

```
$ node ../../scripts/quality/typescript-project-runner.mjs --project=mobile --mode=check
(çıktı yok — temiz)
```

Kapı listesinde yok ama `packages/types` değiştiği için koşuldu:

```bash
pnpm --filter @wizards/mobile test
```

```
ℹ tests 1670
ℹ pass 1670
ℹ fail 0
```

```bash
cd apps/mobile && npx jest
```

```
Test Suites: 130 passed, 130 total
Tests:       1182 passed, 1182 total
```

> İlk koşuda 11 mobil jest testi kırmızıydı (`mobile-about-community-2g` 8, `mobile-server-profile-join` 3). Kök neden: mobil istemciler yanıtı şemayla `parse` ediyor, dar fixture'lar genişletilmiş `ServerPublicProfile`'ı geçemiyordu. İki fixture düzeltildi; ekran/bileşen/tema dosyası değişmedi.

### Migration

```bash
cd packages/db && pnpm exec prisma db execute --file prisma/rebaseline-migrations/20260810120000_server_tags_starred_and_events/migration.sql
```

```
Loaded Prisma config from prisma.config.ts.

Script executed successfully.
```

**Önemli:** `prisma migrate status` yerel DB'de **21 migration'ın hiçbirinin uygulanmadığını** söylüyor (`_prisma_migrations` boş; yerel şema `db push` ile yönetiliyor). Bu yüzden `migrate deploy` koşturulmadı — koşsaydı baseline'dan itibaren hepsini uygulamaya çalışırdı. Yalnızca **yeni migration'ın SQL'i** `prisma db execute` ile uygulandı, ardından `prisma generate` koştu. UAT/prod'da normal `migrate deploy` yolu geçerli.

```bash
cd packages/db && pnpm exec prisma generate
```

```
✔ Generated Prisma Client (7.9.1) to .\src\generated\prisma in 431ms
```

### route-contract

`route-contract.test.ts` yeşil (25/25). 11 yeni satır kayıtlı: 6 mobil (5 etkinlik + 1 ayar) ve 5 web etkinlik ucu. `EXPECTED_M1_RATE_LIMIT_MAPPINGS` sayacı 31 → 37 (6 mobil ekleme). `DELETE …/events/[eventId]` her iki istemci için `BODYLESS_MUTATING_METHOD_PATHS`'e girdi.

---

## 5. Cihaz test listesi (kullanıcı yapar)

Faz 1 backend-only; mobil ekran değişmedi. Doğrulanacaklar API/web yüzeyi:

| #   | Yüzey                                              | Adım                                                  | Beklenen                                                                                                                      |
| --- | -------------------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 1   | Web · Sunucu ayarları › Genel                      | "Etiketler" kartına `türkçe-sohbet` yaz, Ekle, Kaydet | Çip görünür, kayıt sonrası kalıcı                                                                                             |
| 2   | Web · aynı kart                                    | 6. etiketi eklemeyi dene                              | Giriş kapalı, "En fazla 5 etiket" uyarısı                                                                                     |
| 3   | Web · aynı kart                                    | `Büyük Harf!` yaz                                     | "Etiket yalnızca küçük harf, rakam ve tire" hatası                                                                            |
| 4   | Web · Keşfet                                       | Arama kutusuna `türkçe-sohbet` yaz                    | Etiketi taşıyan sunucu listede                                                                                                |
| 5   | Web · Sunucu ayarları › Etkinlikler                | Ad + başlangıç + sesli kanal seç, "Etkinlik oluştur"  | Etkinlik listede, "0 kişi ilgileniyor"                                                                                        |
| 6   | Web · aynı sekme                                   | Etkinliği Düzenle → adı değiştir → Kaydet             | Yeni ad listede                                                                                                               |
| 7   | Web · aynı sekme                                   | "İptal et"                                            | Satır "İptal edildi" rozetiyle kalır, silinmez                                                                                |
| 8   | Web · aynı sekme                                   | Bitişi başlangıçtan önce ver                          | 400, kayıt olmaz                                                                                                              |
| 9   | API · `PATCH /api/v1/mobile/servers/<id>/settings` | `{"starred":true}` gönder                             | `{settings:{starred:true,…}}`; `UserServerSettings` satırı yoksa oluşur                                                       |
| 10  | API · aynı uç                                      | `{}` gönder                                           | 400 `validation.form.atLeastOne`                                                                                              |
| 11  | API · aynı uç                                      | `{"notificationLevel":"mentions"}`                    | Yanıt `mentions`; DB'de `messageNotifications = MENTIONS`                                                                     |
| 12  | Web · sol sunucu rayı                              | Bir sunucuyu 9. adımda yıldızla, sayfayı yenile       | Yıldızlı sunucu rayın en üstünde                                                                                              |
| 13  | API · `POST …/events/<id>/interest`                | `{"interested":true}` iki kez gönder                  | `interestedCount` bir kez artar (idempotent)                                                                                  |
| 14  | API · aynı uç                                      | `{"interested":false}` iki kez                        | Sayaç bir kez azalır, negatife düşmez                                                                                         |
| 15  | API · `GET /api/v1/mobile/servers/<id>/profile`    | Üye olarak çağır                                      | `tags`, `admins`, `channelCount`, `voiceActiveCount`, `weeklyMessageCount`, `inviteAddress`, `joinedAt`, `upcomingEvent` dolu |
| 16  | API · aynı uç                                      | Üye olmayan hesapla çağır                             | `joinedAt: null`, `participants: []`, `starred/muted/notificationLevel` varsayılan                                            |
| 17  | API · `GET /api/v1/mobile/invites/<slug>/preview`  | Geçerli davet                                         | Profil ile **aynı** alan seti + `slug`                                                                                        |
| 18  | Web · Sunucu profil kartı                          | Etiketli sunucunun kartını aç                         | Açıklamanın altında etiket çipleri                                                                                            |

---

## 6. Devredilen borç

1. **Yönetici presence kaynağı.** §3'teki risk: `AppSession` tabanlı presence ile Redis tabanlı `onlineCount` ayrışabilir. Karar senin; değişiklik `loadServerProfileAdmins` içinde tek yerde.
2. **`ScheduledEvent.imageUrl` kullanılmıyor** (01 §D gereği). Alan duruyor, yükleme akışı yok.
3. **`accessLevel: "approval"`** üreten bir kolon yok; onay akışı istenirse ayrı iş.
4. **Mobil etkinlik formu Faz 5'te.** Web admin yüzeyi bu fazda geldi; mobil oluşturma/düzenleme ekranı gelmedi (01 §B7 böyle diyor).
5. **`apps/mobile/src/about/mobile-community-invite-client.ts`** artık genişletilmiş modeli parse ediyor; Faz 5 eski gövdeyi silerken bu istemcinin döndürdüğü fazla alanları tüketmeli.
6. **Etkinlik soket olayı yok.** Değişiklikler mevcut `server:settings:updated` yayınına biniyor; ayrı bir `server:events:updated` olayı tasarımda yok, eklenmedi.
7. **`graphify update .` koşamadı** — `[WinError 5] Erişim engellendi: graphify-out\.graph.tmp.json -> graphify-out\graph.json`. Arka planda bir `graphify watch` süreci dosyayı tutuyor. Watch kapatılıp tekrar koşulmalı.

---

## F. Ek — genişletilmiş `ServerPublicProfile` tam alan listesi

Faz 5 bu listeye göre yazacak. (`packages/types/src/workspace.ts`)

| Alan                 | Tip                                  | Kaynak                                             |
| -------------------- | ------------------------------------ | -------------------------------------------------- |
| `accessLevel`        | `"invite" \| "public" \| "approval"` | `Server.isPublic` (approval üretilmiyor)           |
| `admins`             | `ServerPublicProfileAdmin[]` (≤20)   | owner + `MANAGE_SERVER` rolü olan üyeler           |
| `bannerUrl`          | `string \| null`                     | `Server.bannerUrl`                                 |
| `canManageServer`    | `boolean`                            | üyelik + `MANAGE_SERVER`                           |
| `channelCount`       | `number`                             | görünür kanal sayısı                               |
| `channels`           | `ServerPublicProfileChannel[]`       | izin filtresinden geçmiş kanallar                  |
| `createdAt`          | `string` (ISO)                       | `Server.createdAt`                                 |
| `description`        | `string`                             | `Server.description ?? ""`                         |
| `discoverable`       | `boolean`                            | `Server.discoverable`                              |
| `iconUrl`            | `string \| null`                     | `Server.iconUrl`                                   |
| `inviteAddress`      | `string \| null`                     | `whispr.gg/{vanityUrlCode ?? inviteCode}`          |
| `isPublic`           | `boolean`                            | `Server.isPublic`                                  |
| `joined`             | `boolean`                            | üyelik satırı var mı                               |
| `joinedAt`           | `string \| null` (ISO)               | `ServerMember.joinedAt`, üye değilse `null`        |
| `memberCount`        | `number`                             | `Server.memberCount`                               |
| `muted`              | `boolean`                            | `UserServerSettings.muted` (satır yoksa `false`)   |
| `mutualFriendCount`  | `number`                             | `FriendRequest` sayımı                             |
| `mutualFriends`      | `ServerPublicProfileFriend[]` (≤8)   | aynı sorgu                                         |
| `name`               | `string`                             | `Server.name`                                      |
| `notificationLevel`  | `"all" \| "mentions" \| "none"`      | `UserServerSettings.messageNotifications` eşlemesi |
| `onlineCount`        | `number`                             | Redis `server:<id>:online`                         |
| `serverId`           | `string`                             | `Server.id`                                        |
| `shortName`          | `string \| null`                     | `Server.shortName`                                 |
| `starred`            | `boolean`                            | `UserServerSettings.starred`                       |
| `tags`               | `string[]` (≤5)                      | `Server.tags`                                      |
| `type`               | `ServerType`                         | `Server.type`                                      |
| `upcomingEvent`      | `ServerScheduledEvent \| null`       | sonraki `SCHEDULED` etkinlik                       |
| `verified`           | `boolean`                            | `features` içinde `VERIFIED`                       |
| `voiceActiveCount`   | `number`                             | görünür kanalların `liveCount` toplamı             |
| `weeklyMessageCount` | `number \| null`                     | 7 günlük mesaj sayımı, üretilemezse `null`         |

### `ServerPublicProfileChannel`

`categoryId`, `categoryName`, `id`, `isPrivate`, `lastActivityAt` (ISO \| null), `liveCount` (number \| null), `name`, `participants` (≤3), `readOnly`, `type` (`text` \| `voice`).

### `ServerPublicProfileAdmin`

`avatarUrl`, `displayName`, `id`, `lastSeenAt` (ISO \| null), `presence` (`online` \| `offline`), `role` (`owner` \| `admin`), `shortName`, `username`.

### `ServerPublicProfileParticipant`

`avatarUrl`, `displayName`, `id`, `shortName`.

---

## F.2 — Etkinlik rotaları: tam yol + action

| Metot  | Yol                                                           | Action                          | Limit    |
| ------ | ------------------------------------------------------------- | ------------------------------- | -------- |
| GET    | `/api/v1/mobile/servers/[serverId]/events`                    | `mobile:server:events:list`     | 60/60sn  |
| POST   | `/api/v1/mobile/servers/[serverId]/events`                    | `mobile:server:events:create`   | 12/60sn  |
| PATCH  | `/api/v1/mobile/servers/[serverId]/events/[eventId]`          | `mobile:server:events:update`   | 30/60sn  |
| DELETE | `/api/v1/mobile/servers/[serverId]/events/[eventId]`          | `mobile:server:events:cancel`   | 20/60sn  |
| POST   | `/api/v1/mobile/servers/[serverId]/events/[eventId]/interest` | `mobile:server:events:interest` | 60/60sn  |
| GET    | `/api/v1/servers/[serverId]/events`                           | `server:events:list`            | 120/60sn |
| POST   | `/api/v1/servers/[serverId]/events`                           | `server:events:create`          | 12/60sn  |
| PATCH  | `/api/v1/servers/[serverId]/events/[eventId]`                 | `server:events:update`          | 30/60sn  |
| DELETE | `/api/v1/servers/[serverId]/events/[eventId]`                 | `server:events:cancel`          | 20/60sn  |
| POST   | `/api/v1/servers/[serverId]/events/[eventId]/interest`        | `server:events:interest`        | 60/60sn  |

Ek uç (B5): `PATCH /api/v1/mobile/servers/[serverId]/settings` → `mobile:server:user-settings:update`, 60/60sn.

`GET events` sorgu parametresi: `includePast=true|false` (strict; başka parametre 400). `includePast` yokken yalnız `SCHEDULED`/`ACTIVE` döner.

---

## F.3 — Profil rotasının sorgu sayısı ve cache stratejisi

**Ölçüm:** `server-public-profile-service.test.ts` › "getVisibleServerPublicProfileWithDatabase query budget". Sahte veritabanı her çağrıyı loglar; test kanal sayısını **1 → 50** değiştirip listenin **aynı** kaldığını doğruluyor.

| Görüntüleyen         | Sorgu | Liste                                                                                                                                                  |
| -------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Anonim / üye olmayan | **5** | `server.findUnique`, `serverMember.findMany` (yöneticiler), `appSession.groupBy` (son görülme), `scheduledEvent.findFirst`, `message.count` (haftalık) |
| Oturumlu             | **7** | yukarıdakiler + `friendRequest.count`, `friendRequest.findMany`                                                                                        |

Artı **1 Redis** çağrısı (`server:<id>:online` üyelik sayımı) ve haftalık sayım için 1 Redis GET (+ ıska durumunda 1 SET).

**N+1 yok, kanıt:** kanal başına veri (kategori, son mesaj tarihi, ses katılımcıları, canlı sayaç) tek `findUnique` içinde iç içe `select` ile alınıyor; Prisma istemcisi `relationJoins` önizleme bayrağıyla üretildiği için bunlar **LATERAL join** olarak aynı ifadeye giriyor (`schema.prisma:12`'deki gerekçe). Yönetici listesi `take: 20` ile sınırlı ve rol kimlikleri zaten çekilmiş `Server.roles`'tan türetiliyor — ayrı rol sorgusu yok. Son görülme tüm yöneticiler için tek `groupBy`.

**`weeklyMessageCount` cache:**

- Anahtar `server:<id>:weekly-messages:v1`, Redis `SET … EX 300` (5 dk) — `badge-rarity.ts`'in kullandığı kalıp, yeni cache altyapısı yazılmadı.
- Sayım `Message` üzerinde `channel.serverId = <id> AND createdAt >= now-7g AND deletedAt IS NULL`. Mevcut `@@index([channelId, createdAt])` yeterli, **yeni indeks eklenmedi**.
- Redis ya da sayım hata verirse `null` döner ve loglanır; rota düşmez, 6d hücresi `—` gösterir.
- Test seam: `setServerWeeklyMessageCountCacheForTest` (yerel Redis'in test sırasını kirletmesini engeller).

---

## F.4 — Özel kanal adı üye olmayana sızıyor mu?

**Hayır — mevcut davranış korundu.**

`buildServerPublicProfile` kanalları **görüntüleyenin** `VIEW_CHANNEL` iznine göre filtreliyor (S2'den beri böyle). Üye olmayan yalnız `@everyone` rolünü taşır, dolayısıyla `@everyone`'a kapalı bir kanal listeye **hiç girmez** — adı da sızmaz.

`isPrivate` bayrağı bu filtreyi **değiştirmiyor**; anlamı: "bu kanalı görebiliyorsun ama `@everyone` göremiyor". Yani yönetici/rol sahibi bir üye kanalı `isPrivate: true` olarak görür; üye olmayan hiç görmez.

01 §B6.4 "özel kanallar `isPrivate: true` ile listelenir" cümlesi bu yüzden birebir uygulanmadı — aynı maddenin devamı ("mevcut izin filtresinin kararına uy — yeni bir gizlilik politikası icat etme") bağlayıcı kabul edildi. `participants` ayrıca üye olmayana **her zaman boş** döner.
