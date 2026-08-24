# Faz 3 raporu — Veri katmanı, migration ve uçlar

Tarih: 2026-08-19 · Branch: `uat` · Commit: yok (izin bekliyor)

Ekran yok. Çıktı: iki migration, dokuz uç, tipli bir veri sözleşmesi, istemci katmanı ve
realtime köprüsü. Faz 2'nin açık bıraktığı `/mentions` ve `/events` rota kararı **zaten
kapanmıştı** (03 raporu §8: "Gerçek rotaya bağlandı"), o yüzden sorulmadı.

---

## 1. Yapıldı

### A. Migration — odak modu + bahsedilme sırası

**İki migration**, ikisi de `packages/db/prisma/rebaseline-migrations/` altında (§3.10 tuzağı):

1. `20260819120000_home_focus_mode/migration.sql` — `User` üzerine üç kolon:
   `statusExpiresAt DateTime?`, `statusRestoreTo UserStatus?`, `statusFocusMinutes Int?` +
   `@@index([statusExpiresAt])`. Üçü de nullable, varsayılansız: mevcut her hesap ilk anda
   "odak kapalı" okur, tek satır bile yeniden yazılmaz.
2. `20260819120500_mention_created_at/migration.sql` — `MessageMention.createdAt` denormalize +
   `@@index([userId, createdAt])`. **Ölçüm sonucu seçildi**, §4.3'te tablo.

`statusFocusMinutes` promptun iki kolonluk listesinde yoktu; halkanın toplam süresini
`statusExpiresAt`'ten türetmek matematiksel olarak imkânsız olduğu için soruldu ve kullanıcı
kararıyla eklendi (§8).

**Geri alınabilirlik.** İkisi de `DROP COLUMN` ile geri alınır, SQL'in başında yorum olarak yazılı:

```sql
-- odak modu
DROP INDEX IF EXISTS "User_statusExpiresAt_idx";
ALTER TABLE "User" DROP COLUMN IF EXISTS "statusFocusMinutes",
                   DROP COLUMN IF EXISTS "statusRestoreTo",
                   DROP COLUMN IF EXISTS "statusExpiresAt";
-- bahsedilme sırası
DROP INDEX IF EXISTS "MessageMention_userId_createdAt_idx";
ALTER TABLE "MessageMention" DROP COLUMN "createdAt";
```

Veri kaybı yalnız o an açık olan odak oturumlarıdır (geri alınınca "odak kapalı" okurlar).
`MessageMention.createdAt` düşerse bahsedilmeler yine `Message` üzerinden sıralanabilir, yalnız
yavaşlar.

**Dağıtım riski (yeni, rapora yazılıyor):** `mention_created_at` migration'ı `UPDATE
"MessageMention" … FROM "Message"` ile geri dolduruyor. Bu tablo büyükse tam tablo yazımıdır ve
kilitler. Yerelde tablo boş (0 satır) olduğu için maliyet ölçülemedi; UAT/prod'a giderken satır
sayısına bakılmalı. İndeks `IF NOT EXISTS` ile, kolonlar `IF NOT EXISTS` ile — migration
idempotent.

**Süre dolumu iki katmanlı** (§1.1):

- **Okuma anında (lazy):** `app/summary` kullanıcının kendi satırını okurken `resolveFocusState`
  süresi dolmuş pencereyi görürse `applyExpiredFocus` koşuluyor. Yazım **koşullu**
  (`where: { id, statusExpiresAt: { lte: now } }`), böylece aynı anda iki okuma yarışırsa yalnız
  biri yayın yapıyor (testli).
- **Süpürme (sweep):** `sweepExpiredFocus` outbox worker'a bağlandı. **Saatlik bakım bloğuna
  konmadı** — odak penceresi dakikalarla ölçülüyor, saatlik süpürme arkadaşın ekranında bir saate
  kadar yanlış "Rahatsız etmeyin" bırakırdı. Kendi cadence'i var: `FOCUS_SWEEP_INTERVAL_MS = 60_000`,
  `lastFocusSweepAt` ile takip ediliyor, hata bir sonraki tick'te yeniden deneniyor.
- Saf fonksiyon `resolveExpiredFocus(rows, now)` — zaman parametre. Testi "saat okumadığını"
  geçmiş bir `now` ile kanıtlıyor.

`scripts/schema-index-audit.test.mjs` iki yeni indeks setini (User, MessageMention) ve iki
migration'ın içeriğini denetliyor; `mention_created_at` için **sıra** de sabitlendi
(backfill → NOT NULL → CREATE INDEX), çünkü ters sıra dolu bir veritabanında migration'ı düşürür.

### B. Tipler — `apps/web/src/lib/home/types.ts` (315 satır)

Her DTO önce zod şeması, TypeScript tipi `z.infer` ile ondan türüyor. Elle yazılmış ikinci tip yok.
04 §2.1'in sekiz satırlık tablosu birebir karşılandı; alan adları tablodakiyle aynı.

- **Zaman alanları ISO string.** Sunucu "2 dk", "dün", "18 Ağustos Pazartesi" üretmiyor.
- `dateLabel` **ISO instant taşıyor** (tablo bu adı bağlıyor, §2.1 içeriği ISO diyor). İstemci
  `LocaleProvider` ile biçimlendirecek. Ad yanıltıcı ama sözleşme bağlayıcı — Faz 4'te tüketilirken
  bu not hatırlanmalı.
- `reason` alanı **veri taşıyor, arayüz metni değil**: bahsedilme/yanıt için mesaj özeti, arkadaşlık
  isteğinde boş dize. "Görüşünü istiyor" gibi cümleyi istemci `source`'tan üretir — aksi hâlde
  sunucu Türkçe yazıp i18n'i kırardı.

### C. Dokuz uç

Hepsi aynı iskelet: `requireApiUserId` → `enforceApiRateLimit` → zod parse → servis → `jsonError`,
yanıt `Cache-Control: private, no-store`. Sekiz okuma ucu ortak `runHomeRoute` üzerinden
(`lib/home/route-runner.ts`), yazma ucu **bilerek elle yazıldı** — §C.2'de nedeni.

| Uç                                | Rate limit anahtarı            | Bütçe | Ölçülen (kendi sorgusu / uçtan uca) |
| --------------------------------- | ------------------------------ | ----- | ----------------------------------- |
| `GET /api/v1/app/summary`         | `app:summary` 120/60sn         | ≤4    | **4** / 5                           |
| `GET /api/v1/app/recent`          | `app:recent` 120/60sn          | ≤5    | **5** / 5                           |
| `GET /api/v1/app/awaiting`        | `app:awaiting` 120/60sn        | ≤6    | **6** / 7                           |
| `GET /api/v1/voice/live`          | `voice:live:list` 60/60sn      | ≤4    | **4** / 4                           |
| `GET /api/v1/events/upcoming`     | `events:upcoming` 120/60sn     | ≤4    | **4** / 3                           |
| `GET /api/v1/events/calendar`     | `events:calendar` 60/60sn      | —     | **2** / 2                           |
| `GET /api/v1/mentions`            | `mentions:list` 120/60sn       | —     | **2** / 3                           |
| `GET /api/v1/search/command`      | `search:command` 60/60sn       | —     | **5** / 6                           |
| `PATCH /api/v1/users/me/presence` | `user:presence:update` 30/60sn | —     | **2** / 1–2                         |

Ayrıntı ve ölçüm yöntemi §4.1'de.

**C.1 — Kart kart notlar**

- **`app/recent`:** iki kaynak ayrı ayrı `take = limit` ile çekiliyor, bellekte birleşip `limit`e
  kesiliyor. Kanal tarafı `DISTINCT ON (m."channelId")` ile kanal başına tek indeks probu yapıyor
  (`Message(channelId, createdAt)`), okunmamış aritmetiği **yalnız kesimi geçen satırlar için**
  ikinci bir sorguda hesaplanıyor. "Önce hepsini çek sonra sırala" yok; test kanalı görünmeyen
  kullanıcıda sorgunun **hiç açılmadığını** doğruluyor.
- **`voice/live`:** `lastHeartbeat` eşiği `@/lib/voice/service.ts`'ten okunuyor. Sabit orada
  `getStaleVoiceHeartbeatCutoff(now)` olarak **export edildi** (eskiden modül içi); ikinci bir eşik
  tanımlanmadı. Test, sorgunun `gte` değerinin `VOICE_HEARTBEAT_TIMEOUT_MS` ile birebir aynı olduğunu
  sabitliyor. `participants` en fazla 4, `participantCount` gerçek toplam. `speaker` **her zaman
  `null`** — sunucu ses seviyesi saklamıyor, kart onu `voice:audio-level:update` ile dolduracak.
  İkinci kaynak (grup aramaları) `dm:call:*` Redis kaydından okunuyor, tek `MGET` ile.
- **`app/awaiting`:** dört kaynak, dördü de SQL'de kendi okuma imlecine göre filtreleniyor
  (`m."createdAt" > COALESCE(crs."lastReadAt", sm."joinedAt")`), yani okunmuş bir satır yanıta hiç
  girmiyor. Aksiyonlar yeni uç değil: `accept` mevcut `friends/request/[id]` ve davet uçlarına,
  `reply` gezinmeye bağlanacak.
- **`PATCH presence`:** `planPresenceUpdate` saf fonksiyonu tek karar noktası. Odak açılırken
  `statusRestoreTo = o anki status`, zaten açıksa **korunuyor**; aynı gövde ikinci kez gelirse
  `changed=false` dönüyor, ne yazım ne yayın oluyor (süre uzamıyor). `INVISIBLE` depoda `OFFLINE`.
  Odak açıkken durum çipine basmak pencereyi kırmıyor, **dönüş hedefini** değiştiriyor.

**C.2 — İskeletten iki bilinçli sapma**

1. `PATCH users/me/presence` `runHomeRoute` kullanmıyor. `route-contract.test.ts` her mutasyon
   ucunun gövdesini `parseJsonBody` ile okuduğunu **kanıtlamak** zorunda; parser paylaşılan bir
   runner'a closure ile verilince kanıtlanamıyor. Uç 12 satırlık kendi `try/catch`'ini taşıyor,
   sıra aynı: kimlik → bütçe → zod → servis.
2. Dokuz `route-logic.ts`'in her biri `authenticate: () => requireApiUserId()` yazıyor (paylaşılan
   `defaultHomeRouteContext` yayılımı yerine). Aynı sözleşme testi guard'ı **ucun kendi
   dosyasında** görmek istiyor; paylaşılan nesneden gelen guard, "kimlik doğrulaması olmayan uç"
   listesine sessizce girmek demekti.

### D. İstemci katmanı — `lib/home/client.ts`

`homeQueryKeys` (`dmQueryKeys` düzeninde), dokuz `fetchX`, `HomeClientError`. Her yanıt **ucun
doğruladığı şemayla** parse ediliyor. `HOME_STALE_TIME_MS`: summary 30sn, recent 20sn, awaiting
20sn, live 10sn, upcoming 60sn. **Polling yok** — dosyada tek `setInterval`/`refetchInterval` yok.

### E. Realtime köprüsü — `hooks/use-home-realtime.ts`

04 §6 tablosundaki olayların tamamı, **hiç yeni olay eklenmeden** (test, abone olunan her olayın
`socket/events.ts` içinde zaten var olduğunu doğruluyor).

| Olay                                              | Etki                                                     |
| ------------------------------------------------- | -------------------------------------------------------- |
| `presence:update`                                 | `summary` + `live` **hedefli yamalama** (invalidate yok) |
| `friends:updated`, `friends:voice:update`         | `live` invalidate (yapı değişiyor)                       |
| `voice:state:update`                              | `live` invalidate                                        |
| `voice:audio-level:update`                        | **yerel state**, kare başına en fazla bir güncelleme     |
| `notification:new`                                | `awaiting` + `summary` invalidate                        |
| `server:unread:update`, `dm:conversation:updated` | `recent` + `summary` invalidate                          |

`voice:audio-level:update` React Query'ye **yazılmıyor**; test bunu handler gövdesini tarayarak
sabitliyor (`queryClient`/`setQueriesData` geçmiyor, `requestAnimationFrame` geçiyor).

### F. Faz 1'den sızmış bir güvenlik gerilemesi kapatıldı

`e2e:api` kapısı `auth-regression.spec.ts` içindeki **"session revocation invalidates an already
issued Auth.js session"** testinde düşüyordu. Kök neden Faz 3 değil, **Faz 1**: `buildE2ESessionToken`
token'a `revocationCheckedAt = issuedAt` yazıyordu ve `validateAuthSessionToken` iptal anahtarını
`SESSION_REVOCATION_CHECK_INTERVAL_SECONDS = 60` boyunca yeniden okumuyor. Yani taze basılmış her
e2e oturumu iptale karşı **bir dakikalık bağışıklık** kazanıyordu. Alan kaldırıldı; ilk istek artık
kontrol ediyor. Faz 1'in kalan garantileri (`authSessionId` + `sessionStartedAt` zorunlu) duruyor,
`route-logic.test.ts` beklentisi tersine çevrildi. Bu uç üretimde 404 döner, ama davranış
`session-revocation` sözleşmesinin kendisiydi — düzeltilmeden kapı geçilemezdi.

---

## 2. Dokunulan dosyalar

| Dosya                                                                                      | Yeni / Değişti    | Neden                                                             |
| ------------------------------------------------------------------------------------------ | ----------------- | ----------------------------------------------------------------- |
| `packages/db/prisma/schema.prisma`                                                         | Değişti           | 3 odak kolonu + `MessageMention.createdAt` + 2 indeks             |
| `packages/db/prisma/rebaseline-migrations/20260819120000_home_focus_mode/migration.sql`    | Yeni (22)         | Odak modu                                                         |
| `packages/db/prisma/rebaseline-migrations/20260819120500_mention_created_at/migration.sql` | Yeni (34)         | Bahsedilme sırası, backfill'li                                    |
| `packages/db/scripts/schema-index-audit.test.mjs`                                          | Değişti (+50)     | İki indeks seti + iki migration içeriği + backfill sırası         |
| `apps/web/src/lib/home/types.ts`                                                           | Yeni (315)        | Dokuz DTO + sorgu şemaları, tek kaynak                            |
| `apps/web/src/lib/home/focus.ts`                                                           | Yeni (195)        | `resolveExpiredFocus`, `resolveFocusState`, `planPresenceUpdate`  |
| `apps/web/src/lib/home/focus.test.ts`                                                      | Yeni (246)        | 15 test — saf odak aritmetiği + idempotentlik                     |
| `apps/web/src/lib/home/href.ts`                                                            | Yeni (76)         | Göreli yol kapısı + bağlantı üreticileri                          |
| `apps/web/src/lib/home/href.test.ts`                                                       | Yeni (76)         | 5 test — açık yönlendirme koruması                                |
| `apps/web/src/lib/home/service.ts`                                                         | Yeni (178)        | Ortak: aktör select'i, presence redaksiyonu, görünür kanal çözümü |
| `apps/web/src/lib/home/summary-service.ts`                                                 | Yeni (133)        | `app/summary`                                                     |
| `apps/web/src/lib/home/recent-service.ts`                                                  | Yeni (278)        | `app/recent`                                                      |
| `apps/web/src/lib/home/awaiting-service.ts`                                                | Yeni (364)        | `app/awaiting` + paylaşılan sayaç                                 |
| `apps/web/src/lib/home/live-service.ts`                                                    | Yeni (196)        | `voice/live`                                                      |
| `apps/web/src/lib/home/events-service.ts`                                                  | Yeni (174)        | `events/upcoming` + `events/calendar`                             |
| `apps/web/src/lib/home/mentions-service.ts`                                                | Yeni (162)        | `mentions`, keyset sayfalama                                      |
| `apps/web/src/lib/home/command-search-service.ts`                                          | Yeni (198)        | `search/command`                                                  |
| `apps/web/src/lib/home/presence-service.ts`                                                | Yeni (168)        | Yazma ucu + lazy resolve + sweep                                  |
| `apps/web/src/lib/home/presence-service.test.ts`                                           | Yeni (120)        | 3 test — sweep + yarış koşulu                                     |
| `apps/web/src/lib/home/route-runner.ts`                                                    | Yeni (49)         | Sekiz okuma ucunun ortak iskeleti                                 |
| `apps/web/src/lib/home/client.ts`                                                          | Yeni (153)        | Query key'ler, fetch'ler, `HomeClientError`                       |
| `apps/web/src/lib/home/home-test-doubles.ts`                                               | Yeni (131)        | Sorgu sayan sahte veritabanı (yalnız testlerden import ediliyor)  |
| `apps/web/src/app/api/v1/app/{summary,recent,awaiting}/route{,-logic}.ts`                  | Yeni (6 dosya)    | Üç uç                                                             |
| `apps/web/src/app/api/v1/voice/live/route{,-logic}.ts`                                     | Yeni (2)          | Canlı odalar                                                      |
| `apps/web/src/app/api/v1/events/{upcoming,calendar}/route{,-logic}.ts`                     | Yeni (4)          | İki etkinlik ucu                                                  |
| `apps/web/src/app/api/v1/mentions/route{,-logic}.ts`                                       | Yeni (2)          | Bahsedilmeler                                                     |
| `apps/web/src/app/api/v1/search/command/route{,-logic}.ts`                                 | Yeni (2)          | ⌘K yüzeyleri                                                      |
| `apps/web/src/app/api/v1/users/me/presence/route{,-logic}.ts`                              | Yeni (2)          | Tek yazma ucu                                                     |
| `.../route-logic.test.ts` × 9                                                              | Yeni (1 719)      | Uç başına 6–8 test                                                |
| `apps/web/src/hooks/use-home-realtime.ts`                                                  | Yeni (162)        | Socket köprüsü                                                    |
| `apps/web/src/hooks/use-home-realtime.test.ts`                                             | Yeni (107)        | 5 test — yamalama + "yeni olay yok"                               |
| `apps/web/src/lib/api-rate-limit.ts`                                                       | Değişti (+13)     | Dokuz anahtar                                                     |
| `apps/web/src/lib/voice/service.ts`                                                        | Değişti (+5/−1)   | `getStaleVoiceHeartbeatCutoff` export + `now` parametresi         |
| `apps/web/src/lib/outbox/worker.ts`                                                        | Değişti (+20)     | Dakikalık odak süpürmesi                                          |
| `apps/web/src/lib/outbox/worker.test.ts`                                                   | Değişti (+10)     | Süpürme sırası sabitlendi                                         |
| `apps/web/src/app/api/e2e/auth/session/route-logic.ts`                                     | Değişti (−1/+7)   | §1.F — `revocationCheckedAt` kaldırıldı                           |
| `apps/web/src/app/api/e2e/auth/session/route-logic.test.ts`                                | Değişti           | Beklenti tersine çevrildi                                         |
| `apps/web/e2e/specs/api/home-endpoints.spec.ts`                                            | Yeni (137)        | 6 e2e testi — dokuz uç, gerçek sunucu                             |
| `apps/web/src/components/shell/app-nav-panel.tsx`                                          | Değişti (2 yorum) | Bayat `TODO(api)` işaretleri yeniden hedeflendi                   |
| `apps/web/src/hooks/use-unread-counters.ts`                                                | Değişti (1 yorum) | Aynı                                                              |
| `graphify-out/**`                                                                          | Değişti           | `graphify update .`                                               |

---

## 3. Kapı çıktıları

| Komut                                                  | Sonuç                                                                    |
| ------------------------------------------------------ | ------------------------------------------------------------------------ |
| `pnpm --filter @wizards/db test`                       | ✅ exit 0 — **31 test / 0 fail**                                         |
| `pnpm --filter @wizards/web test`                      | ✅ exit 0 — **2967 test / 657 suite, 0 fail**, 52,1 sn (Faz 2: 2874/641) |
| `pnpm typecheck`                                       | ✅ exit 0 — 5/5 paket                                                    |
| `pnpm lint`                                            | ✅ exit 0 — 5/5 paket                                                    |
| `pnpm --filter @wizards/web e2e:api`                   | ✅ **30 passed / 1 skipped / 0 failed**, 20,3 sn                         |
| `pnpm --filter @wizards/db exec prisma migrate status` | ✅ "Database schema is up to date!" (33 migration)                       |
| `node scripts/quality/count-arbitrary-px.mjs`          | ✅ `1190 değer / 120 dosya` (Faz 2 ile aynı — bu faz UI'ye dokunmadı)    |
| `graphify update .`                                    | ✅ 27209 düğüm, 63845 kenar, 1210 topluluk                               |

Yeni testler: 9 uç × (6–8) = **65** + focus 15 + href 5 + presence-service 3 + realtime 5 = **93**.
(2874 + 93 = 2967 ✓.) 04 §7'nin istediği taban 45'ti.

### Kapının nasıl koşulduğu — dürüst not

`e2e:api` **üretim derlemesiyle** koşuldu: dev sunucusu durduruldu (kullanıcı onayıyla, §8),
`pnpm build`, izole `wizards_e2e` veritabanına bağlı sunucu 3100'de, `PLAYWRIGHT_SKIP_WEB_SERVER=1`.
Koşu bitince sunucu kapatıldı ve **dev sunucusu 3000'de geri başlatıldı** (doğrulandı: `/api/v1/app/version` → 200).
`E2E_TEST_PASSWORD` ve `AUTH_SECRET` yalnız o koşunun ortam değişkenleri olarak verildi;
`apps/web/.env` **değiştirilmedi**.

İlk koşuda 3 test düşüyordu: ikisi benim eksik ortam değişkenimden (`AUTH_SECRET` playwright
sürecine geçmiyordu), biri gerçek bir gerileme (§1.F). Üçü de kapandı.

---

## 4. Ölçülen sayılar

### 4.1 Sorgu bütçeleri — ölçülen değerler

İki ayrı ölçüm var, ikisi de gerçek:

- **Kendi sorgusu:** ucun servisinin doğrudan açtığı Prisma çağrısı. Testlerde sahte veritabanı her
  çağrıyı kaydediyor, sayı **testte sabitlenmiş** — `limit` büyüyünce artmadığı da ayrı bir iddia.
- **Uçtan uca:** izole `wizards_e2e` veritabanına karşı, `pg.Client.prototype.query` yamalanarak
  sayılan **gerçek SQL ifadesi** sayısı (BEGIN/COMMIT gibi gürültü elenmiş). Bu sayı izin servisinin
  ve görünürlük politikasının maliyetini de içerir.

| Uç                            | Bütçe | Kendi sorgusu (testte sabit) | Uçtan uca soğuk | Uçtan uca ısınmış | Durum         |
| ----------------------------- | ----- | ---------------------------- | --------------- | ----------------- | ------------- |
| `app/summary`                 | ≤4    | **4** (limit yok)            | 10              | **5**             | ✅            |
| `app/recent` limit=4          | ≤5    | **5**                        | 5               | **5**             | ✅            |
| `app/recent` limit=10         | ≤5    | **5**                        | 5               | **5**             | ✅            |
| `app/awaiting` limit=6        | ≤6    | **6**                        | 7               | **7**             | ✅            |
| `app/awaiting` limit=20       | ≤6    | **6**                        | 7               | **7**             | ✅            |
| `voice/live` limit=4          | ≤4    | **4**                        | 9               | **4**             | ✅            |
| `events/upcoming` limit=3     | ≤4    | **4**                        | 3               | **3**             | ✅            |
| `events/upcoming` limit=10    | ≤4    | **4**                        | 3               | **3**             | ✅            |
| `events/calendar` 31 gün      | —     | **2**                        | 2               | **2**             | ✅            |
| `mentions` limit=20           | —     | **2**                        | 3               | **3**             | ✅            |
| `mentions` limit=50           | —     | **2**                        | 3               | **3**             | ✅            |
| `search/command` q=""         | —     | **5**                        | 4               | **4**             | ✅            |
| `search/command` q="gen"      | —     | **5**                        | 6               | **6**             | ✅            |
| `PATCH presence` (odak aç)    | —     | **2**                        | 2               | **1**             | ✅            |
| `PATCH presence` (aynı gövde) | —     | **1**                        | 1               | **1**             | ✅ idempotent |
| Odak süpürmesi                | —     | 1 + n                        | 2               | **1**             | ✅            |

Okuma notları:

- Uçtan uca sayı bazen kendi sorgusundan **düşük**: fikstür verisi boş olduğunda dallar açılmıyor
  (ör. `app/recent`'ta kanal satırı yoksa okunmamış sorgusu hiç koşmuyor). Testteki sayı **dolu**
  veri için sabitlenmiş üst sınır.
- `app/summary` soğuk 10 / ısınmış 5: aradaki 5, izin servisinin Redis cache'i boşken ödediği
  yetkilendirme okumaları. Aynı fark `voice/live`'da 9 → 4.
- **Hiçbir uç `limit` ile büyümüyor** — her satırın ikinci sütunu iki farklı `limit` için aynı.

### 4.2 `events/upcoming` — EXPLAIN

2M mesaj / 60k etkinlik taşıyan sentetik bir veritabanında (20 sunucu üyeliği, `IN` sorgusu):

```
### events/upcoming (multi-server IN), LIMIT 6
Limit (actual rows=6 loops=1)
  ->  Incremental Sort  Presorted Key: "scheduledStartAt"
        ->  Index Scan using "ScheduledEvent_scheduledStartAt_idx"
              Index Cond: ("scheduledStartAt" >= now())
              Filter: (status = 'SCHEDULED' AND "serverId" = ANY (...20 id...))
Buffers: shared hit=4 read=5 · Execution Time: 0.064 ms
```

**Bulgu:** sıralı + `LIMIT`'li okumada planlayıcı bileşik
`@@index([serverId, status, scheduledStartAt])`'i **seçmiyor**; tek kolonlu
`ScheduledEvent_scheduledStartAt_idx` üzerinden erken çıkış yapıyor ve bu **daha ucuz**
(9 buffer, 0,064 ms). Bileşik indeks `totalCount` sorgusunda kullanılıyor:

```
### events/upcoming totalCount
Aggregate → Bitmap Heap Scan
  ->  Bitmap Index Scan on "ScheduledEvent_serverId_status_scheduledStartAt_idx"
        Index Searches: 20   (sunucu başına bir arama)
Buffers: shared hit=40 read=591 · Execution Time: 2.567 ms
```

Yani bileşik indeks boşuna durmuyor ama **sıralı okumanın** sahibi değil. Pahalı olan
`totalCount` (15 428 satır sayıyor, 631 buffer); tasarımın "6 etkinlik" rozeti için bu, üye olunan
sunucu sayısı büyüdükçe tek kayda değer maliyet. Kart bir üst sınıra razı olursa (`LEAST(count, 99)`)
bu da sabitlenebilir — **Faz 4'ün kararı**, bugün gerçek sayı dönüyor.

### 4.3 `mentions` — üç plan, ölçüm

Aynı sentetik veritabanı: 2M mesaj, 400k bahsedilme, izleyicinin **4 000** bahsedilmesi geçmişe
yayılmış, 250 görünür kanal, `LIMIT 20`.

| Plan                                                                        | Buffers    | Süre         | Ölçek davranışı                    |
| --------------------------------------------------------------------------- | ---------- | ------------ | ---------------------------------- |
| (b) `MessageMention` sürülü, yalnız `@@index([userId])`                     | **21 454** | **22,6 ms**  | O(kullanıcının tüm bahsedilmeleri) |
| (c) `Message` sürülü, `EXISTS` yarı-birleşim                                | **18 971** | **9,9 ms**   | O(görünür kanallardaki mesajlar)   |
| (a) `MessageMention.createdAt` denormalize + `@@index([userId, createdAt])` | **213**    | **0,145 ms** | **O(sayfa)**                       |

Seçilen: **(a)**. Fark 100× buffer, 65–150× süre ve en önemlisi **karmaşıklık sınıfı**: (b) ve (c)
kullanıcı eskidikçe yavaşlıyor, (a) sayfa boyutuna bağlı kalıyor. Plan (a)'nın kanıtı:

```
Limit → Incremental Sort (Presorted Key: mm."createdAt")
  ->  Nested Loop
        ->  Index Scan Backward using "MessageMention_userId_createdAt_idx"
              Index Cond: ("userId" = 'usr-target')   rows=42
        ->  Index Scan using "Message_pkey"           loops=42
Buffers: shared hit=213 · Execution Time: 0.145 ms
```

Bedeli iki tane: (1) `MessageMention` satır başına 8 bayt + ikinci indeks, (2) yeni satırların
`createdAt`'i **outbox worker'ın yazma anı**, mesajın kendi anı değil — ikisi drain gecikmesi kadar
(saniyeler) ayrışıyor. Yazma yoluna dokunulmadı (tek yazan `message-notification-service.ts`,
kolon `@default(now())` alıyor); geçmiş satırlar migration'da `Message.createdAt`'ten dolduruldu.
DTO'nun `occurredAt`'i **mm.createdAt** — sıralama ile ekrandaki zaman aynı değeri okuyor.

Ölçüm sentetik bir `wizards_explain` veritabanında yapıldı ve veritabanı **silindi**; geliştirme ve
e2e veritabanlarına dokunulmadı.

### 4.4 Diğer sayılar

| Ölçüm                                   | Değer                             | Bütçe / beklenen | Durum     |
| --------------------------------------- | --------------------------------- | ---------------- | --------- |
| Yeni test                               | 93                                | ≥ 45 + 3 ek      | ✅        |
| Toplam web testi                        | 2967 / 0 fail                     | —                | ✅        |
| `pnpm --filter @wizards/db test`        | 31 / 0 fail                       | —                | ✅        |
| `e2e:api`                               | 30 passed / 0 failed              | —                | ✅        |
| Yeni rate limit anahtarı                | 9                                 | 9                | ✅        |
| `API_RATE_LIMITS` kaydı olmayan yeni uç | 0                                 | 0                | ✅        |
| Yeni socket olayı                       | **0**                             | 0                | ✅        |
| `TODO(api):` kalan                      | **0**                             | 0                | ✅ (§6.1) |
| Migration dizini                        | `rebaseline-migrations` (2 dosya) | doğru dizin      | ✅        |
| `db:migrate:status`                     | temiz                             | temiz            | ✅        |
| Kod satırı (yeni, test hariç)           | 2 279                             | —                | ℹ         |
| Kod satırı (yeni test)                  | 2 273                             | —                | ℹ         |

Kalan arbitrary px: **1190 değer / 120 dosya** (Faz 0 tabanı: 1208 / 120). Bu faz UI'ye dokunmadı,
sayı Faz 2 ile aynı.

---

## 5. Güvenlik kontrol listesi

`00-ortak-baglam.md` §5.1 maddeleri — bu fazda **hepsi** dokuz uç için tek tek işaretlendi:

- [x] **1. Kimlik.** Dokuz ucun dokuzu da `requireApiUserId()` ile başlıyor; sözleşme testi
      (`route-contract.test.ts`) guard'ı ucun kendi dosyasında görüyor. Oturumsuz istek 401:
      dokuz uç için ayrı birim testi + `e2e:api`'de gerçek sunucuya karşı 9/9 doğrulandı.
- [x] **2. Yetki zorlaması.** Kanal görünürlüğü **sorgu filtresi**, sonradan eleme değil: her liste
      `listVisibleChannelIds` → mevcut izin servisinden geçiyor. Testler yetkisiz durumda ilgili
      sorgunun **hiç açılmadığını** doğruluyor (`app/recent`, `mentions`, `voice/live`,
      `search/command`, `events/*`). Sunucudan atılmış kullanıcı boş liste alıyor.
- [x] **3. Görünürlük redaksiyonu.** Presence taşıyan her yanıt tek kapıdan geçiyor:
      `readHomePresence` → `redactPresenceCollectionForViewer`. Görünmez kullanıcı `OFFLINE`
      okunuyor (`voice/live`, `app/awaiting`, `events/upcoming`, `search/command` testli).
      **Home DTO'larında `lastSeenAt` alanı hiç yok** — last-seen sızıntısı yapı gereği imkânsız.
      `app/summary` kendi satırını okurken de `INVISIBLE` → `OFFLINE` çeviriyor.
- [x] **4. Rate limit kaydı.** Dokuz anahtar `API_RATE_LIMITS` içinde; her uç için ayrı test hem
      anahtarın **tablodaki değerini** hem de servisten **önce** ödendiğini doğruluyor.
- [x] **5. Zod girdi doğrulama.** Query/body zod ile parse ediliyor; hatalı girdi 400 ve gövdede
      iç ayrıntı yok (testler `ZodError`, `prisma`, kolon adı sızmadığını denetliyor).
- [x] **6. Dar DTO.** Her sorgu `select` ile sınırlı; `include` ile tam satır dökülmüyor.
      `Notification` okuması `metadata` alanını **hiç seçmiyor** (testli).
- [x] **7. Metadata / `actionUrl` doğrulama.** `Notification.metadata` okunmuyor bile;
      `actionUrl` `toRelativeAppHref` kapısından geçiyor, geçemezse satır `/inbox`'a düşüyor.
      Kapı 14 düşmanca girdiye karşı testli (`https://`, `//host`, `/\host`, `javascript:`,
      `data:`, tab/newline enjeksiyonu, baştaki boşluk…). Ayrıca **her uçta** üretilen tüm `href`'ler
      hem birim hem e2e testinde kendi kapılarından geçiriliyor.
- [x] **8. ⌘K komut yetkisi.** Komut listesi **sunucudan gelmiyor** (§3.8): uç yalnız
      kullanıcının görebildiği yüzeyleri döndürüyor — görünmeyen kanal sonuçta yok, kişiler
      `profileVisibilityWhereForViewer` üzerinden süzülüyor (testli). Statik komutların yetki
      kontrolü Faz 5'te paleti yazarken, hedef rotanın kendi guard'ıyla.

Ek olarak §1.F'deki oturum-iptali gerilemesi kapatıldı.

Koşu sırasında yalnız izole `wizards_e2e` veritabanına ve tek kullanımlık `wizards_explain`
veritabanına (silindi) dokunuldu. Geliştirme veritabanına iki additive migration uygulandı
(`wizards` ve `wizards_e2e`); `apps/web/.env` **değiştirilmedi**.

---

## 6. Açık kalan / devreden

1. **`TODO(api)` kalmadı, üç işaret yeniden hedeflendi.** Faz 2'nin bıraktığı üç marker "Faz 3'te
   gelir" diyordu; ikisi artık yanlıştı:
   - `app-nav-panel.tsx:290` "Etkinlikler" satırındaki saat → `TODO(faz4)`; uç (`events/upcoming`)
     **hazır**, bağlamak Faz 4'ün işi (kabuk bugün hiçbir ana sayfa sorgusu açmıyor).
   - `use-unread-counters.ts` bahsedilme sayacı → `TODO(faz4)`; `app/summary.unreadMentions`
     **hazır**, aynı gerekçe.
   - `app-nav-panel.tsx:357` sunucu satırındaki çevrimiçi sayısı → `TODO(sunucular)`; bu alan
     **hiçbir Faz 3 ucunda yok** ve 04 §2.1 tablosunda da yok. Sunucular paketine ait.
     → **Faz 4** (ilk ikisi), **Sunucular paketi** (üçüncüsü).
2. **`app/awaiting.newCount` yaklaşık.** "2 yeni" pill'i için "gelen kutusu son görülme" damgası
   yok; her satır zaten okunmamış olduğu için "yeni" ayrımı ancak yeni bir kolonla kesinleşir.
   Bugünkü tanım: **son 24 saat** (`HOME_AWAITING_NEW_WINDOW_HOURS`). → **Faz 6** (Gelen kutusu
   ekranı bu damganın sahibi).
3. **`Message.replyToId` indekssiz.** "Mesajıma yanıt" kaynağı bu yüzden mesaj tarafından sürülüyor
   ve 30 günlük pencere + `LIMIT` ile sınırlanıyor. Yoğun bir hesapta plan doğrulanmadı (yerelde
   veri yok). → **ölçüm borcu**, Faz 8 ya da performans paketi.
4. **`events/upcoming.totalCount` sınırsız.** §4.2'deki tek pahalı sorgu. → **Faz 4** kararı.
5. **`caption` alanı kanal konusunu taşıyor.** Tasarımın alt yazısı ("3 kişi konuşuyor" gibi)
   istemcide üretilecek; sunucu yalnız `channel.topic` gönderiyor, grup aramasında boş.
   → **Faz 4**.
6. **Sunucu daveti satırının "aktörü" bildirimin kendi başlığı.** `Notification` satırı daveti kimin
   yolladığını kaydetmiyor; metadata'ya güvenilmediği için (§5.1.7) `title`/`body` kullanılıyor.
   Gerçek davetçiyi göstermek isterseniz `invite-service.ts` metadata'sına `senderId` eklemek +
   bir kullanıcı okuması gerekir. → **karar bekliyor**, sunucular/bildirim paketi.
7. **`mention_created_at` backfill'inin UAT maliyeti ölçülmedi** (§1.A). → **dağıtım öncesi**.
8. Faz 1/2'den devreden ve bu fazda kapanmayan: linux görsel baseline'lar bayat (Faz 8 / CI),
   parity matrisinin `test.skip`'i (Faz 8), `home-command-center` testid'i (Faz 4), admin'de ölçek
   (admin paketi).

---

## 7. Kullanıcı doğrulaması gereken maddeler

1. `pnpm --filter @wizards/web test` → **2967 test / 0 fail** (Faz 2: 2874).
2. `pnpm --filter @wizards/db test` → **31 / 0 fail**; içinde iki yeni migration denetimi var.
3. `pnpm --filter @wizards/db exec prisma migrate status` → "Database schema is up to date!".
   Migration'lar `packages/db/prisma/rebaseline-migrations/` altında — `prisma/migrations` dizini
   **yok** (Prisma'nın çıktısında geçen o ad sabit metin, `prisma.config.ts` gerçek dizini
   gösteriyor).
4. Uygulamayı aç ve tarayıcı konsolundan sırayla dene (oturum açıkken):
   ```js
   await (await fetch("/api/v1/app/summary")).json();
   await (await fetch("/api/v1/app/recent?limit=6")).json();
   await (await fetch("/api/v1/voice/live?limit=4")).json();
   ```
   Her biri 200 ve `Cache-Control: private, no-store` döner; `dateLabel` ISO damgadır, göreli metin
   yoktur.
5. Odak modunu uçtan dene:
   ```js
   await (
     await fetch("/api/v1/users/me/presence", {
       method: "PATCH",
       headers: { "Content-Type": "application/json" },
       body: JSON.stringify({ focus: { enabled: true, minutes: 25 } }),
     })
   ).json();
   ```
   → `{presence:"DND", focus:{active:true, minutesLeft:25, totalMinutes:25}}`. **Aynı isteği
   tekrar gönder**: `minutesLeft` artmaz, azalır. `{focus:{enabled:false}}` ile kapat: `focus:null`
   ve durum odak öncesine döner.
6. Kasten bozma denemeleri (rapor sırasında **gerçekten koşuldu** ve geri alındı):
   - `href.ts`'te `value.startsWith("//")` kontrolünü sil →
     `node --import tsx --test src/lib/home/href.test.ts` kırmızı.
   - `live-service.ts`'te `lastHeartbeat` filtresini kaldır → `voice/live` testi
     "filters on the cleanup's own heartbeat cutoff" ile kırmızı.
   - `awaiting-service.ts`'te `notification.findMany` select'ine `metadata: true` ekle →
     "never reads Notification.metadata into the payload" kırmızı.
   - Bir `route-logic.ts`'ten `authenticate` satırını sil →
     `route-contract.test.ts` "unauthenticated route allowlist" kırmızı.
7. §1.F'yi doğrula: `apps/web/src/app/api/e2e/auth/session/route-logic.ts` içine
   `revocationCheckedAt: issuedAtSeconds` satırını geri koy → `e2e:api` içindeki
   "session revocation invalidates an already issued Auth.js session" testi tekrar düşer.
8. Dev sunucun **geri başlatıldı** (`pnpm dev`, port 3000, doğrulandı). Kapı için geçici olarak
   durdurulmuş, üretim derlemesi 3100'de koşulup kapatılmıştı. `apps/web/.next` bir üretim
   derlemesi taşıyordu; dev sunucusu kendi artefaktını yeniden üretiyor.
9. `graphify-out/` güncel: 27209 düğüm / 63845 kenar.

---

## 8. Sorulan / sorulacak kararlar

| Konu                                                        | Durum                            | Cevap / gerekçe                                                                                                                                                                                                                                     |
| ----------------------------------------------------------- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Odak halkasının `totalMinutes`'ı                            | **Soruldu, cevap alındı**        | "Üçüncü kolon: `statusFocusMinutes`". İki kolondan toplam süre türetilemiyor; sayfa yenilenince halka yalan söylerdi. Kolon nullable, eski satırlar kalan süreye düşüyor.                                                                           |
| `e2e:api` için dev sunucusunun durdurulması                 | **Soruldu, cevap alındı**        | "Faz 2 düzeni: durdur, koş, geri başlat". Yapıldı ve doğrulandı (§7.8).                                                                                                                                                                             |
| `MessageMention` sıralaması (04 §3.7)                       | **Karar verildi, ölçümle**       | Plan (a) — denormalize `createdAt` + `@@index([userId, createdAt])`. Üç plan `EXPLAIN (ANALYZE, BUFFERS)` ile karşılaştırıldı; 213 vs 18 971 vs 21 454 buffer (§4.3). Sorulmadı çünkü ölçüm tek yönlü: fark 100×.                                   |
| `events/upcoming` bileşik indeksi                           | **Karar verildi, ölçümle**       | Sıralı+LIMIT okuma `scheduledStartAt` indeksini seçiyor ve daha ucuz; bileşik indeks `totalCount`'ta kullanılıyor. İndeks **kaldırılmadı**, plan raporlandı (§4.2).                                                                                 |
| `PATCH presence` iskeletten sapıyor                         | Karar verildi                    | `route-contract.test.ts` gövde parse'ını ucun kendi dosyasında görmek zorunda; paylaşılan runner'a closure ile verilen parser kanıtlanamıyor (§C.2).                                                                                                |
| Dokuz uçta `authenticate` tekrarı                           | Karar verildi                    | Aynı sözleşme testi guard'ı ucun dosyasında istiyor. Paylaşılan nesneden gelen guard "kimliksiz uç" listesine sessizce girmek olurdu.                                                                                                               |
| Odak süpürmesi saatlik bakım bloğunda değil                 | Karar verildi                    | Odak dakikalarla ölçülüyor; saatlik süpürme arkadaşın ekranında bir saate kadar yanlış DND bırakırdı. Kendi 60 sn'lik cadence'i var.                                                                                                                |
| `reason` alanı UI metni taşımıyor                           | Karar verildi                    | Sunucu Türkçe cümle yazsa i18n kırılırdı (§00 "metin birebir" + Faz 7). Alan veri taşıyor, cümleyi istemci `source`'tan kuruyor.                                                                                                                    |
| `newCount` = son 24 saat                                    | **Karar verildi, onay bekliyor** | Doğru işaretleyici bir "gelen kutusu görüldü" kolonu; o kolon Faz 6'nın (Gelen kutusu) işi. Bugünkü tanım pencereye dayanıyor ve testli. **Faz 6'da kesinleştirmek istersen söyle.**                                                                |
| Sunucu daveti satırının aktörü                              | **Karar verildi, onay bekliyor** | `Notification` daveti kimin yolladığını kaydetmiyor; metadata güvenilmez (§5.1.7). Satır bildirimin `title`/`body`'sini gösteriyor. Gerçek davetçi isteniyorsa `invite-service.ts` metadata'sına `senderId` + bir kullanıcı okuması gerekir (§6.6). |
| Faz 1 kaynaklı oturum-iptali gerilemesi bu fazda düzeltildi | Karar verildi                    | Kapı (`e2e:api`) o test olmadan geçmiyordu ve bulgu gerçek bir güvenlik davranışıydı: taze e2e oturumu iptale bir dakika bağışıklıydı (§1.F).                                                                                                       |
| `dateLabel` ISO taşıyor                                     | Karar verildi                    | 04 §2.1 tablosu adı bağlıyor, aynı §'nin metni "sunucu yalnız ISO tarih gönderir" diyor. Ad yanıltıcı; Faz 4 tüketirken bu not geçerli.                                                                                                             |
| Sorgu bütçesi iki sayı olarak raporlandı                    | Karar verildi                    | "Kendi sorgusu" testte sabitlenebilir ve `limit`'ten bağımsız; "uçtan uca" paylaşılan servislerin (izin, görünürlük) maliyetini de içeriyor ve cache durumuna göre değişiyor. İkisini tek sayıya indirmek yanıltıcı olurdu (§4.1).                  |
