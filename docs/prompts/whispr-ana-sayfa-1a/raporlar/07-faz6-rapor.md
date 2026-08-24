# Faz 6 raporu — Yan ekranlar: Bahsedilmeler, Etkinlikler, Gelen kutusu

Tarih: 2026-08-19 · Branch: `uat` · Commit: yok (izin bekliyor)

Üç ekran yazıldı ve **Ana Sayfa'daki yedi hedefin yedisi de gerçek bir ekrana varıyor** — tur
e2e'de tıklanarak koşuldu. Ön koşul kontrolü: Faz 3'ün `GET /mentions`, `/events/upcoming`,
`/events/calendar`, `/app/awaiting` uçları **çalışıyor**; `MessageMention` sıralaması ölçümle
plan (a)'ya bağlanmış (denormalize `createdAt` + `@@index([userId, createdAt])`, 213 vs 21 454
buffer). Faz 2'nin "gerçek rotaya bağla, kısa süre 404 kabul" kararı bu fazda kapandı.

Yedi karar kod yazılmadan soruldu; cevapları §8'de. Bunlardan ikisi paketin sözleşmesini
genişletti (DM bahsedilme tablosu, `GET /events/list`), o yüzden bu faz beklenenden ağır.

---

## 1. Yapıldı

### A. Ortak kabuk (07 §1)

- Üç rota da `(main)` altında (`/mentions`, `/events`, `/inbox`). `selectSecondaryColumn` bu üç
  yolu zaten "nav" dalına düşürüyordu (karar #8); kabukta **tek satır bile** değişmedi.
- Üst çubuk **tek bileşen** oldu: `components/screens/app-screen-top-bar.tsx`. Ana Sayfa
  selamlamayı, üç yan ekran kendi adını veriyor; arama alanı, kısayol çipi, bildirim butonu ve
  odak pill'i ortak. `HomeTopBar` artık yalnız selamlama + alt satırın sayıları (85 satır, önce
  257). Kopyalanmış ikinci bir çubuk yok.
- Odak pill'i **dört yüzeyde** de görünüyor (kullanıcı kararı §8). Faz 5'in modül seviyesi motoru
  zaten paylaşımlı; dördüncü okuyucu dördüncü timer açmıyor.
- İçerik `HomeCard` kabuğunu yeniden kullanıyor. **Bölüm etiketi ekran adını tekrar etmiyor**,
  seçili kırılımı söylüyor (`OKUNMAMIŞ`, `TAKVİM`, `ARKADAŞLIK İSTEKLERİ`) — kullanıcı kararı.
- Üçünde de kaydırma serbest (`AppScreen` içerik alanı `overflow-y-auto`). Ana Sayfa'nın
  "kaydırma yok" kuralına dokunulmadı.

### B. `/mentions` — Bahsedilmeler (07 §2)

- Cursor tabanlı sonsuz liste, sayfa boyutu **25**, `IntersectionObserver` ile alt sınır,
  sanallaştırma yok.
- Filtre çipleri `Tümü · Okunmamış · Sunucular · Mesajlar` — **dördü de çalışıyor** (§C).
  Çip kutusu `Durumun` kartındaki çiple birebir aynı (`8 10` dolgu, 11 yarıçap); yeni çip tipi
  tanımlanmadı. Seçim URL'de (`?filter=`), istek **sunucuya** gidiyor (§F).
- Satır Ana Sayfa'nın "Yanıt bekliyor" satırı — **aynı dosya** (§E).
- Okunmamış satırın solunda 3px `--primary` şerit; `inset` gölge olarak, ayrı bir öğe eklemeden
  yarıçapı takip ediyor ve okundu olunca satırın genişliğini oynatmıyor.
- Satıra tıklamak **o bildirimi** okundu işaretliyor (`PATCH /notifications/[id]/read`), rozet
  yerel olarak hemen düşüyor. İkinci bir okuma yolu yazılmadı; mevcut uç sayaçları da serbest
  bırakıyor (`notifications/service.ts: markRead`).
- Sağ üstte `Tümünü okundu işaretle` → mevcut `PATCH /notifications/read-all`.

### C. DM bahsedilmesi artık bir satır (kullanıcı kararı)

Bulgu: `MessageMention` **yalnız sunucu kanalı mesajları** için yazılıyordu
(`message-notification-service.ts:216`); DM bahsedilmesi sadece `DMParticipant.mentionCount`'u
artırıyordu — bir sayı, arkasında satır yok. Dört çipten `Mesajlar` her zaman boş dönerdi ve
`Sunucular` `Tümü` ile birebir aynı olurdu. Kullanıcı kararı: **uçtan uca yaz**.

- Yeni tablo `DMMessageMention` (`messageId`, `userId`, denormalize `createdAt`,
  `@@unique([messageId, userId])`, `@@index([userId, createdAt])`). Kanal ikizinin ölçülmüş
  gerekçesi burada da geçerli: keyset sayfası O(sayfa) olmalı, O(kullanıcının tüm bahsedilmeleri)
  değil.
- Yazıcı: `createRealtimeDMMessage`'ın **aynı transaction'ı**. Rozet ile satır birlikte commit
  ediyor; `createdAt` mesajdan kopyalanıyor, ikinci bir saatten değil.
- **Backfill mesaj metninden değil, bildirim satırından**: `createDMMessageNotifications` zaten
  `metadata.mentioned = true` yazıyor, yani geçmiş birebir kayıtlı. `@username`'i
  `DMMessage.content` ile eşleştirmek hem tam tablo taraması olurdu hem de adını değiştirmiş her
  kullanıcı için yanlış.
- `/mentions` artık iki kaynağın **tek sıralı sayfası** (`UNION ALL` + `(createdAt, id)` keyset).
  İki id de uuid olduğu için sıra iki tablo üzerinde toplam bir sıra.

### D. Okunmuş/okunmamış — çelişkinin kapatılması (kullanıcı kararı)

Bulgu: mevcut read-all `Notification.read`'i ve `ChannelReadState.mentionCount`'u temizliyor ama
**`lastReadAt`'e dokunmuyor**. Satırın `read` alanı `lastReadAt`ten türetilseydi "Tümünü okundu
işaretle" sayıyı sıfırlar, şeritler ekranda kalırdı.

Karar: **şerit de aynı aileden okusun.** `read` artık alıcının **kendi bildirim satırından**
geliyor — `LEFT JOIN Notification ON dedupeKey = 'channel-mention:<messageId>:<userId>'`
(DM tarafında `'dm-message:…'`). `Notification.dedupeKey` zaten `@@unique`, yani ek indeks yok,
sayfa başına O(sayfa) prob.

Bildirim satırı olmayan bir bahsedilme (o an susturulmuş, ya da satır var olmadan önce yazılmış)
**okunmuş** sayılıyor: hiç bekleyen olmadı ve hiçbir şey onu temizleyemez. Kalıcı, silinemeyen bir
şerit yalan olurdu.

### E. `/inbox` — Gelen kutusu (07 §4)

- `GET /app/awaiting`, `limit=100` (tavan 20 → 100). Ana Sayfa kartı hâlâ 6 istiyor.
- Kaynak filtresi çipleri `Tümü · Bahsedilmeler · Yanıtlar · Arkadaşlık istekleri ·
Sunucu davetleri`; **sunucuda** uygulanıyor ve sorulmayan kaynak hiç okunmuyor (dört sorgudan
  ilgisiz olanı hiç açılmıyor). Başlıktaki toplam **filtresiz** kalıyor: filtreli bir görünüm de
  "kaç şey bekliyor" der, "kaçı bu çipe uyuyor" demez.
- Satır: Ana Sayfa'nın satırı, `variant="full"`. **İkinci bir satır bileşeni yazılmadı.**
- Aksiyonlar Faz 5'in iyimser mantığı (`useHomeActions`); `awaitingSource` eklendi, yoksa iyimser
  yazım Ana Sayfa'nın altı satırlık cache'ini yamalar ve bu ekran hiç değişmezdi.
- Toplu işlem yok (kapsam dışı).

### F. `/events` — Etkinlikler (07 §3)

- Segment `Liste · Takvim`, `role="tablist"`/`role="tab"` + `aria-selected`, seçim URL'de
  (`?view=calendar`). Bilinmeyen `?view=` **listeye düşüyor**, hata vermiyor (testli).
- **Liste**: gün başlıklarıyla gruplu (`bugün` / `yarın` / `19 Ağustos Çarşamba`). Gruplama
  **okurun saat diliminde**: +03'te 00:30'da başlayan bir etkinlik o güne düşüyor, bir öncekine
  değil (testli). Satır 38px saat kolonu + dikey ayırıcı + 14.5 başlık + 12 bağlam + katılımcı
  şeridi (3 + gerçek toplam) + `Hatırlat`. Ölçülerin tamamı `upNextCard.event*`ten.
- **`Hatırlat` tek hook**: `createEventInterestMutation` artık iki cache'i birden yamalıyor
  (Ana Sayfa'nın `upcoming`'i + listenin sayfaları) ve hata yolunda **ikisini de** geri alıyor.
  Aynı etkinlik iki yüzeyde birden ekrandayken biri diğerinin tersini söylemiyor.
- **Takvim**: 7 kolon ay ızgarası, `role="grid"` / `role="gridcell"`, ok tuşlarıyla gezinme
  (kenarda **durur**, sarmaz), `PageUp`/`PageDown` ay değiştirir, `Bugün` butonu geri getirir.
  Gün hücresi: gün numarası + en fazla 3 etkinlik çipi + `+n`. Bugünün hücresi `--primary/0.13`.
- Veri aralığı görünen aya göre (`from`–`to`); ızgara en fazla 6 hafta = 42 gün, zod'un 62 gün
  sınırına hiç yaklaşmıyor (12 ay için testli). `keepPreviousData` ile ay değişiminde ekran boşa
  düşmüyor. Takvim `dynamic()` ile bölündü — liste görünümü kullanıcısı ızgara kodunu indirmiyor.
- **Gün paneli sağda** (kullanıcı kararı). Panel hiç boş açılmıyor: ay bugünü içeriyorsa bugün,
  içermiyorsa etkinliği olan ilk gün, o da yoksa ayın biri seçili gelir. Seçim **türetiliyor**,
  efektte senkronize edilmiyor — ay değişince eski seçim kendiliğinden düşüyor.
- Panel satırı da **aynı** etkinlik satırı. `events/calendar` DTO'su ilgi bayrağı taşımadığı için
  satır `Hatırlat`ı hiç çizmiyor: yalan bir buton yerine buton yok.

### G. `GET /api/v1/events/list` — yeni uç (kullanıcı kararı)

`events/upcoming` yalnız `next` alanını zengin döndürüyordu; `upcoming[]` satırları çıplaktı
(`serverId` yok, `interested` yok, katılımcı yok) ve limit tavanı 10'du. Kullanıcı kararı: **ayrı
liste ucu**, Ana Sayfa kartının ucuna dokunma.

- Cursor tabanlı (`(scheduledStartAt, id)` keyset, `skip` yok), sayfa 25, tavan 50.
- Satır şekli `HomeNextEvent`'in **aynısı** — ikinci bir etkinlik tipi tanımlanmadı.
- Katılımcı şeridi **tek toplu sorgu**: `ROW_NUMBER() OVER (PARTITION BY eventId …) <= 3`.
  Popüler bir etkinliğin bütün ilgi satırlarını çekip JavaScript'te `slice(0, 3)` yapmak sayfanın
  maliyetini etkinliklerin popülerliğine bağlardı.
- Sorgu bütçesi **3**, sayfa boyutundan bağımsız (testli). Rate limit `events:list` 120/60sn.

### H. Bağlantıların kapatılması (07 §5)

| Kaynak                   | Hedef                                | Durum                                |
| ------------------------ | ------------------------------------ | ------------------------------------ |
| Nav `Bahsedilmeler`      | `/mentions`                          | Faz 2'de bağlıydı, artık 404 değil   |
| Nav `Etkinlikler`        | `/events`                            | aynı                                 |
| Kart `Gelen kutusu`      | `/inbox`                             | aynı                                 |
| Kart `Takvim`            | `/events?view=calendar`              | **bu fazda değişti** (`/events` idi) |
| Kart `Tümünü gör`        | `/channels`                          | zaten gerçek                         |
| Kart `Tümü` (Arkadaşlar) | `/channels/@me`                      | zaten gerçek                         |
| Palet komutları          | `/mentions`, `/inbox`, **`/events`** | `Etkinliklere git` bu fazda eklendi  |

Yedisi de e2e'de **tıklanarak** doğrulandı (§3).

---

## 2. Dokunulan dosyalar

| Dosya                                                                                      | Yeni / Değişti                 | Neden                                                                     |
| ------------------------------------------------------------------------------------------ | ------------------------------ | ------------------------------------------------------------------------- |
| `packages/db/prisma/schema.prisma`                                                         | Değişti                        | `DMMessageMention` modeli + iki geri ilişki                               |
| `packages/db/prisma/rebaseline-migrations/20260819130000_dm_message_mention/migration.sql` | Yeni (57)                      | Tablo + unique + bildirimden backfill + keyset indeksi                    |
| `packages/db/scripts/schema-index-audit.test.mjs`                                          | Değişti (+30)                  | Yeni indeks seti + migration sırası                                       |
| `apps/web/src/lib/dm/realtime-service.ts`                                                  | Değişti (+15)                  | Bahsedilme satırı, sayaçla **aynı** transaction'da                        |
| `apps/web/src/lib/dm/realtime-service.test.ts`                                             | Değişti (+3 test)              | Kaynak sözleşmesi: satır ve sayaç birlikte commit eder                    |
| `apps/web/src/lib/home/mentions-service.ts`                                                | Değişti (yeniden yazıldı, 282) | İki kaynağın birleşimi, filtre, bildirim tabanlı `read`                   |
| `apps/web/src/lib/home/awaiting-service.ts`                                                | Değişti                        | Kaynak filtresi — sorulmayan kaynak hiç okunmuyor                         |
| `apps/web/src/lib/home/events-service.ts`                                                  | Değişti (+150)                 | `listHomeEvents` + keyset imleci + toplu katılımcı sorgusu                |
| `apps/web/src/lib/home/side-screens.ts`                                                    | Yeni (262)                     | URL durumu, ay ızgarası, klavye aritmetiği, gün gruplaması                |
| `apps/web/src/lib/home/side-screens.test.ts`                                               | Yeni (19 test)                 | Ay sınırları, 62 gün kuralı, ok tuşları, saat dilimi                      |
| `apps/web/src/lib/home/types.ts`                                                           | Değişti                        | Mentions filtre/kind/context/notificationId, awaiting source, events list |
| `apps/web/src/lib/home/client.ts`                                                          | Değişti                        | Filtreli fetch'ler + `fetchHomeEventsList` + anahtarlar                   |
| `apps/web/src/lib/home/optimistic.ts`                                                      | Değişti                        | `applyEventInterestToList` (aynı saf dönüşüm, sayfalı hâli)               |
| `apps/web/src/lib/home/mutations.ts`                                                       | Değişti                        | `Hatırlat` iki cache'i yamalar ve ikisini birden geri alır                |
| `apps/web/src/lib/home/mutations.test.ts`                                                  | Değişti (+3 test)              | İki cache: tek tıkla dön, hatada geri al, sayacı şişirme                  |
| `apps/web/src/lib/home/metrics.ts`                                                         | Değişti (+27)                  | `sideScreens` ölçü grubu (hepsi türetilmiş ya da 07'de yazılı)            |
| `apps/web/src/lib/home/metrics.test.ts`                                                    | Değişti (+2 test)              | Ölçülerin mevcut gruplardan türediği bağlandı                             |
| `apps/web/src/lib/home/presentation.ts`                                                    | Değişti                        | `parseInstant`, `toCalendarDayNumber`, gün sabitleri dışa açıldı          |
| `apps/web/src/lib/home/command-palette.ts`                                                 | Değişti                        | `Etkinliklere git` komutu                                                 |
| `apps/web/src/lib/home/href.ts`                                                            | Değişti                        | `HOME_EVENTS_CALENDAR_HREF`                                               |
| `apps/web/src/lib/api-rate-limit.ts`                                                       | Değişti                        | `events:list` 120/60sn                                                    |
| `apps/web/src/app/api/v1/events/list/route{,-logic}.ts`                                    | Yeni (8 + 50)                  | Liste ucu                                                                 |
| `apps/web/src/app/api/v1/events/list/route-logic.test.ts`                                  | Yeni (10 test)                 | Keyset, toplu katılımcı, sorgu bütçesi, yetki                             |
| `apps/web/src/app/api/v1/mentions/route-logic.ts`                                          | Değişti                        | `filter` parametresi                                                      |
| `apps/web/src/app/api/v1/mentions/route-logic.test.ts`                                     | Değişti (+6 test)              | Birleşim, çip SQL'de, bildirim tabanlı `read`                             |
| `apps/web/src/app/api/v1/app/awaiting/route-logic.ts`                                      | Değişti                        | `source` parametresi                                                      |
| `apps/web/src/app/api/v1/app/awaiting/route-logic.test.ts`                                 | Değişti (+3 test)              | Kaynak filtresi, yüksek limit tavanı                                      |
| `apps/web/src/components/home/home-list-row.tsx`                                           | Yeni (181)                     | **Tek** satır bileşeni — üç yüzeyin ortağı                                |
| `apps/web/src/components/home/home-awaiting-card.tsx`                                      | Değişti (−70)                  | Satır dışarı çıktı; `AwaitingRow` + aksiyon burada kaldı                  |
| `apps/web/src/components/home/home-top-bar.tsx`                                            | Değişti (257 → 85)             | Çubuk paylaşıma çıktı                                                     |
| `apps/web/src/components/home/home-up-next-card.tsx`                                       | Değişti                        | `Takvim` → `?view=calendar`                                               |
| `apps/web/src/components/screens/app-screen.tsx`                                           | Yeni (64)                      | Yan ekran kabuğu (kaydırma serbest)                                       |
| `apps/web/src/components/screens/app-screen-top-bar.tsx`                                   | Yeni (207)                     | Dört yüzeyin ortak üst çubuğu                                             |
| `apps/web/src/components/screens/screen-chips.tsx`                                         | Yeni (138)                     | Filtre çipleri (`aria-pressed`) + segment (`tablist`)                     |
| `apps/web/src/components/screens/screen-infinite-sentinel.tsx`                             | Yeni (72)                      | `IntersectionObserver` + `aria-live`                                      |
| `apps/web/src/components/screens/mentions-screen.tsx`                                      | Yeni (279)                     | `/mentions`                                                               |
| `apps/web/src/components/screens/inbox-screen.tsx`                                         | Yeni (170)                     | `/inbox`                                                                  |
| `apps/web/src/components/screens/events-screen.tsx`                                        | Yeni (235)                     | `/events` liste + segment + `dynamic()` takvim                            |
| `apps/web/src/components/screens/events-calendar-view.tsx`                                 | Yeni (408)                     | Ay ızgarası + gün paneli                                                  |
| `apps/web/src/components/screens/event-list-row.tsx`                                       | Yeni (159)                     | Etkinlik satırı (liste + gün paneli ortak)                                |
| `apps/web/src/components/screens/side-screens.test.tsx`                                    | Yeni (16 test)                 | Şerit, tek satır dosyası, çip rolleri, sonsuz liste                       |
| `apps/web/src/app/(main)/{mentions,events,inbox}/page.tsx`                                 | Yeni (3 × ~13)                 | Rotalar                                                                   |
| `apps/web/src/hooks/use-home-actions.ts`                                                   | Değişti                        | `awaitingSource`, `eventsListKey`                                         |
| `apps/web/e2e/specs/design/home-side-screens.spec.ts`                                      | Yeni (7 test)                  | Ölü link turu, filtre ağ kaydı, takvim klavyesi                           |
| `apps/web/e2e/specs/a11y/a11y.spec.ts`                                                     | Değişti (+4 tarama)            | Üç ekran + takvim görünümü                                                |
| `apps/web/e2e/helpers/db.ts`                                                               | Değişti (+45)                  | `ensureE2EUpcomingEvent` — `Takvim` butonunun koşulu                      |
| `apps/web/e2e/helpers/design-parity.ts`                                                    | Değişti (+6)                   | `sr-only` metni "kırpılmış" saymayı bıraktı (§3.1)                        |
| `apps/web/eslint.config.mjs`                                                               | Değişti                        | Arbitrary px kuralı `components/screens/**`'i de kapsıyor                 |
| `apps/web/scripts/eslint-config.test.mjs`                                                  | Değişti (+1 madde)             | Yeni yüzeyin kural kapsamı bağlandı                                       |
| `graphify-out/**`                                                                          | Değişti                        | `graphify update .`                                                       |

---

## 3. Kapı çıktıları

| Komut                                                              | Sonuç                                                                                           |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `pnpm --filter @wizards/web test`                                  | ✅ exit 0 — **3205 test / 716 suite, 0 fail**, 35,6 sn (Faz 5: 3144/703)                        |
| `pnpm typecheck`                                                   | ✅ exit 0 — 5/5 paket                                                                           |
| `pnpm lint`                                                        | ✅ exit 0 — 5/5 paket, 0 hata 0 uyarı                                                           |
| `pnpm --filter @wizards/web e2e:a11y`                              | ✅ **10 passed / 0 failed** (6 mevcut + 4 yeni)                                                 |
| `pnpm --filter @wizards/web exec playwright test e2e/specs/design` | ✅ **19 passed / 11 skipped / 0 failed** (12 mevcut + 7 yeni)                                   |
| `pnpm --filter @wizards/db test`                                   | ✅ 32 test / 0 fail (Faz 5: 31)                                                                 |
| `node scripts/quality/count-arbitrary-px.mjs`                      | ✅ `1190 değer / 120 dosya` (taban 1208/120; **yeni yüzeylerin katkısı 0**)                     |
| `prisma migrate deploy`                                            | ✅ `20260819130000_dm_message_mention` — geliştirme **ve** `wizards_e2e` veritabanına uygulandı |
| `graphify update .`                                                | ✅ 27700 düğüm, 65456 kenar, 1204 topluluk                                                      |

Yeni testler: side-screens saf 19 + yan ekran markup 16 + events/list ucu 10 + mentions ucu 6 +
awaiting ucu 3 + mutations 3 + DM satırı 3 + metrics 2 + eslint kapsamı 1 = **63**.
(3144 + 63 = 3207; ikisi mevcut testlerin yeniden adlandırılmasıyla birleşti → 3205 ✓.)
E2E tarafında +7 tasarım testi, +4 a11y taraması.

### 3.1 Kapının nasıl koşulduğu — dürüst not

Düzen Faz 4/5 ile aynı: dev sunucusu durduruldu → e2e ortamıyla `pnpm build` → **3100**'de
`pnpm start` → `PLAYWRIGHT_SKIP_WEB_SERVER=1 E2E_BASE_URL=http://127.0.0.1:3100` ile playwright →
sunucu kapatıldı → e2e bayrakları olmadan yeniden derlendi → `next-env.d.ts` `git checkout` ile
geri alındı → `pnpm dev` geri başlatıldı (3000'de doğrulandı, `/login` 200).

`apps/web/.env` **değiştirilmedi**. `E2E_TEST_PASSWORD` yerel rastgele bir değerdi, scratchpad'de
tutuldu ve koşu bitince dosyasıyla birlikte silindi. `E2E_ALLOW_PRODUCTION_BUILD` hem derlemede
hem **çalışma anında** gerekiyor — yalnız derlemede verilince e2e oturum ucu
`404 "E2E helper is unavailable in production"` dönüyor (bu koşuda bir kez yaşandı).

**Migration e2e veritabanına elle uygulandı.** `e2e/setup/global-setup.ts` yalnız reset + seed
yapıyor, migration koşmuyor; yeni tablo olmadan üç ekranın hiçbiri açılmazdı. → §6.

**Bir mevcut test kırmızıya döndü ve düzeltildi (ürün hatası değil, kontrol hatası).**
`home-parity` taban kombinasyonu "kırpılan metin" maddesinde düştü: `span[sr-only] 75>1 —
Çevrimdışı`. `expectNoClippedText` yaprak düğümlerde `overflow-x: hidden` + taşma arıyordu ve
`sr-only` deseni **tam olarak budur** (1×1 kutu, `nowrap`, `overflow:hidden`). Kontrol bu yüzden
kartlar boyanmadan ölçüldüğünde yeşil, boyandığında kırmızıydı — yani gerçek bir kırpmayı değil
zamanlamayı ölçüyordu. Yardımcıya tek kural eklendi: 1×1 kutular (görsel olarak gizlenmiş metin)
elenir. Gerçek kırpma kontrolü olduğu gibi duruyor; test tek başına da, sırayla da yeşil.

---

## 4. Ölçülen sayılar

| Ölçüm                                        | Değer                                 | Bütçe | Durum |
| -------------------------------------------- | ------------------------------------- | ----- | ----- |
| `GET /mentions` SQL sorgusu                  | **2** (limit 1 ve 50'de aynı)         | sabit | ✅    |
| `GET /events/list` SQL sorgusu               | **3** (limit 1 ve 50'de aynı)         | sabit | ✅    |
| `GET /app/awaiting` SQL sorgusu              | **6** (limit 1, 20, 100'de aynı)      | ≤6    | ✅    |
| Katılımcı şeridi için satır başına sorgu     | **0** (tek pencere fonksiyonu)        | 0     | ✅    |
| Bahsedilme sayfa boyutu                      | **25**                                | 25    | ✅    |
| Sayfalamada `OFFSET`/`skip`                  | **0** (üçü de keyset)                 | 0     | ✅    |
| Filtre değişiminde çıkan sunucu isteği       | **1** (ağ kaydıyla e2e'de doğrulandı) | ≥1    | ✅    |
| İstemcide uygulanan filtre                   | **0**                                 | 0     | ✅    |
| Takvimin istediği aralık                     | ≤ **42 gün** (12 ay için testli)      | ≤62   | ✅    |
| Ay değişiminde boş ekran                     | **yok** (`keepPreviousData`)          | yok   | ✅    |
| Liste görünümünde inen takvim kodu           | **0** (`dynamic()`)                   | 0     | ✅    |
| "Yanıt bekliyor" satırını çizen dosya sayısı | **1**                                 | 1     | ✅    |
| Üst çubuğu çizen dosya sayısı                | **1** (dört yüzey)                    | 1     | ✅    |
| Yeni token / hex                             | **0**                                 | 0     | ✅    |
| Yeni yüzeylerde arbitrary px                 | **0**                                 | 0     | ✅    |
| Üç ekranda ciddi WCAG AA ihlali              | **0** (önce 3)                        | 0     | ✅    |
| Yeni migration                               | **1** (idempotent, backfill dâhil)    | —     | —     |

Kalan arbitrary px: **1190 değer / 120 dosya** (Faz 0 tabanı: 1208 / 120). Bu faz sayıyı
artırmadı.

### 4.1 Ölçülen ve kapatılan üç kontrast ihlali

Yeni ekranların taraması **kırmızı geldi**: üçü de ciddi (serious) WCAG AA renk kontrastı. Üçü de
bu fazın kendi yüzeyi, hiçbiri bastırılmadı.

| Yüzey                   | Ön/arka                                 | Önce (koyu tema) | Sonra |
| ----------------------- | --------------------------------------- | ---------------- | ----- |
| Aktif filtre çipi       | `--primary-readable` / `--primary/0.14` | **3,70**         | 8,27  |
| Takvim gün çipi         | `--primary-readable` / `--primary/0.14` | **3,70**         | 8,27  |
| Komşu ayın gün numarası | `--text-secondary` @ `opacity-50`       | **2,39**         | 4,91  |
| Bugünün gün numarası    | `--text-secondary` / `--primary/0.13`   | **4,46**         | ≥ 7   |

Düzeltme **yeni renk eklemiyor**: Faz 5'in `--*-readable` ailesi burada yetmiyor (o token 60%
vurgu + 40% foreground; indigo `--primary` orta koyulukta bir kartta 11,5px metin olarak eşiği
geçmiyor), o yüzden metin temanın **kendi `--foreground`'una** çekildi. Dolgu ve kenar renkleri
hiç değişmedi. Komşu ayın karesi `opacity-50` yerine **dolgusuz** çiziliyor: ayrım artık kutunun
dolu/boş olmasında, metnin okunurluğunda değil.

---

## 5. Güvenlik kontrol listesi

`00-ortak-baglam.md` §5.1. Bu faz **bir** yeni uç yazdı (`GET /api/v1/events/list`) ve iki mevcut
ucun sorgu yüzeyini genişletti (`mentions`, `app/awaiting`); liste üçünün üzerinden işletildi.

- [x] 1. **Kimlik.** Yeni uç `requireApiUserId()` ile başlıyor; `route-contract.test.ts` guard'ı
      ucun **kendi dosyasında** görüyor. Oturumsuz istek 401 (testli).
- [x] 2. **Yetki.** `events/list` kapsamı `listViewerServerIds`'in kendisi — üye olunmayan
      sunucunun etkinliği sorgunun **filtresi**, sonucun kontrolü değil (üyeliksiz kullanıcı boş
      döner, testli). DM bahsedilmesi `DMParticipant` join'i üzerinden geliyor; çıkılan bir
      konuşma listeye giremiyor. Ayrıca `historyFromAt` uygulanıyor: geçmişi kırpılmış bir üyenin
      göremeyeceği mesajın bahsedilmesi de ona ait değil.
- [x] 3. **Görünürlük redaksiyonu.** Üç uç da presence'ı `readHomePresence` üzerinden okuyor;
      yeni bir presence yolu açılmadı.
- [x] 4. **Rate limit.** `events:list` 120/60sn — `events:upcoming` ile aynı tavan, aynı okuma
      profili. Kimlikten hemen sonra, sorgu okunmadan uygulanıyor (sıra testli).
- [x] 5. **Zod.** `EventsListQuerySchema`, `MentionsQuerySchema.filter`, `AppAwaitingQuerySchema.source`
      hepsi enum/sınırlı; bilinmeyen değer **400** (testli), iç hata sızmıyor. Tek istisna
      bilinçli: `?view=` bir görünüm tercihidir, tanınmayan değerde listeye düşer.
- [x] 6. **Dar DTO.** `events/list` mevcut `EVENT_SELECT`i kullanıyor; katılımcı sorgusu yalnız
      dört alan seçiyor. Mentions birleşimi `Notification`tan **yalnız** `read` ve `id` okuyor.
- [x] 7. **Metadata / `actionUrl`.** Bu faz `Notification.metadata`'yı ekrana taşımıyor.
      Backfill migration'ı `metadata.mentioned`'ı okuyor ama sonucu bir **satır kimliği**, ekrana
      giden bir metin değil. Gelen kutusunun davet satırı Faz 3/5'teki `toRelativeAppHref`
      kapısından geçmeye devam ediyor.
- [x] 8. **Komut yetki kontrolü.** Palete eklenen tek komut (`Etkinliklere git`) bir rotaya
      gidiyor ve o rota `(main)` guard'ının altında.

---

## 6. Açık kalan / devreden

1. **`e2e/setup/global-setup.ts` migration koşmuyor** — yalnız reset + seed. Bu faz yeni bir tablo
   ekledi ve e2e veritabanına elle `prisma migrate deploy` gerekti. → **CI / araç borcu**, Faz 8.
2. **Bahsedilmelerin ikinci sayfası e2e'de doğrulanmadı**: tohum veride 25'ten fazla bahsedilme
   yok. Keyset sözleşmesi birim testinde (`nextCursor` + iki dalın imleç filtresi) doğrulanıyor,
   ama uçtan uca "ikinci sayfa yüklendi" turu koşulmadı. → **elle doğrulama** (§7.6) ya da
   fikstür genişletmesi.
3. **`Mesajlar` çipi yerelde boş görünür**: `DMMessageMention` tablosu bugün yazılıyor, geçmiş ise
   yalnız `metadata.mentioned` taşıyan DM bildirimlerinden geliyor. Susturulmuş bir konuşmada
   yazılmış eski bir bahsedilmenin kaydı yok. → **kabul edilen sınır**, raporda yazılı.
4. **Gün panelinde `Hatırlat` yok**: `events/calendar` DTO'su ilgi bayrağı taşımıyor. İstenirse
   takvim ucunu `events/list` gibi zenginleştirmek ayrı bir iş. → **karar bekliyor**.
5. **`awaiting.newCount` hâlâ 24 saatlik yaklaşım** (Faz 3'ten devir). Gelen kutusu artık var ama
   "gelen kutusu son görülme" damgası yazılmadı — kapsam dışıydı. → **ayrı iş**.
6. **Parity matrisinin tema ekseni hâlâ kapalı** (11 kombinasyon `test.skip`) ve yan ekranların
   parity matrisi hiç yazılmadı. → **Faz 8**.
7. **44px tıklama hedefi ↔ tasarım çelişkisi** duruyor (Faz 4 §6.2). → **Faz 8 kararı**.
8. **i18n**: üç ekranın metinleri kaynakta ve `i18n:` yorumlarıyla işaretli, sözlüğe taşınmadı.
   → **Faz 7** (paketin planı böyle).
9. Faz 1–5'ten devreden ve bu fazda kapanmayan: linux görsel baseline'ları bayat,
   `Message.replyToId` indeks borcu, ayarlar ekranının uploadthing uyarısı AA'yı geçmiyor,
   `events/upcoming.totalCount` sınırsız `count`, `kind: 'game'` ürüne çıkmıyor, palet "son
   ziyaretler" sıralaması, odak süresinin sabit 25 dk oluşu, canlı aramaya katılmanın uçtan uca
   denenmemiş olması.

---

## 7. Kullanıcı doğrulaması gereken maddeler

1. `pnpm --filter @wizards/web test` → **3205 test / 0 fail** (Faz 5: 3144).
2. `pnpm typecheck`, `pnpm lint` → 5/5 paket yeşil, uyarı yok.
3. **Ölü link turu (otomatik).** `e2e/specs/design/home-side-screens.spec.ts` ilk testi yedi
   hedefin yedisini de tıklıyor ve varılan yolu doğruluyor. Elle bakmak istersen: `/home` aç,
   nav `Bahsedilmeler` ve `Etkinlikler`, kartlardaki `Gelen kutusu`, `Takvim`, `Tümünü gör`,
   `Tümü` — hiçbiri 404 vermemeli, `Takvim` **doğrudan takvim görünümünü** açmalı.
4. **Filtrelerin sunucuya gittiği (ağ kaydı).** `/mentions` aç, DevTools ağ sekmesinde
   `Okunmamış` çipine bas: yeni bir `GET /api/v1/mentions?...&filter=unread` isteği görünmeli ve
   adres çubuğu `?filter=unread` olmalı. Aynısını `/inbox`'ta `Arkadaşlık istekleri` ile dene
   (`source=friend_request`, `limit=100`).
5. **Takvim klavyesi (elle).** `/events?view=calendar` aç, `Tab` ile ızgaraya gir: ok tuşları gün
   ve hafta atlar, ilk karede `←`/`↑` yerinde kalır, `PageDown` ayı ilerletir, `Bugün` geri
   getirir. Gün hücresine tıkla → sağdaki panel o günü gösterir.
6. **Bahsedilmelerin ikinci sayfası (elle, §6.2).** 25'ten fazla bahsedilmesi olan bir hesapla
   `/mentions` aç ve aşağı kaydır: alt sınıra gelince `Daha fazla yükleniyor` satırı çıkmalı ve
   ikinci sayfa gelmeli. Ağ sekmesinde ikinci istekte `cursor=` parametresi olmalı.
7. **Okundu işaretleme (elle).** `/mentions`'ta okunmamış (sol şeritli) bir satıra tıkla: şerit
   kaybolur, üst satırdaki `<n> okunmamış` bir azalır. `Tümünü okundu işaretle`'ye bas: bütün
   şeritler gider ve sayı sıfırlanır — ikisi **aynı** kaynağı okuyor.
8. **DM bahsedilmesi (elle, ikinci hesap gerekir).** Bir grup DM'de karşı hesaptan `@kullanıcıadın`
   yaz. `/mentions`'ta `Mesajlar` çipinde o satır görünmeli ve tıklayınca doğru mesaja gitmeli.
9. **`Hatırlat` iki yüzeyde (elle).** `/home` ve `/events` aynı anda açıkken (iki sekme) listede
   `Hatırlat`a bas, Ana Sayfa'ya dön: "Sıradaki" kartı da `Hatırlatılacak` demeli.
10. Dev sunucun **geri başlatıldı** (`pnpm dev`, port 3000, `/login` 200 doğrulandı). `.next` ve
    `dist` e2e bayrakları olmadan yeniden derlendi; `next-env.d.ts` geri alındı.
11. **Migration** geliştirme veritabanına **ve** `wizards_e2e`'ye uygulandı (`prisma migrate
deploy`). Başka bir ortama uygulanmadı.
12. `graphify-out/` güncel: 27700 düğüm / 65456 kenar.

### Kasten bozma denemeleri (koşuldu ve geri alındı)

- `mentions-service.ts`'te DM dalının imleç filtresini sil → "keyset iki dalda da ısırır" kırmızı
  (ikinci sayfa bütün DM bahsedilmelerini tekrar gösterirdi).
- `mentions-service.ts`'te `read`'i `ChannelReadState.lastReadAt`ten türet → "read-all'ın
  temizlediği satırdan okur" kırmızı.
- `awaiting-service.ts`'te filtreyi sorgudan sonra `items.filter(...)` ile uygula →
  "sorulmayan kaynak hiç okunmaz" kırmızı.
- `events-service.ts`'te katılımcıları etkinlik başına ayrı sorguyla çek → "tek toplu sorgu"
  ve "sayfa boyutundan bağımsız 3 sorgu" kırmızı.
- `side-screens.ts`'te `moveCalendarFocus`'un kenar kontrolünü kaldır (sarmalı yap) →
  "kenarda durur, sarmaz" kırmızı.
- `home-list-row.tsx`'i kopyalayıp Gelen kutusuna ikinci bir satır yaz → "satır kutusunu yalnız
  bir dosya çiziyor" kırmızı.
- `home-up-next-card.tsx`'te `Takvim` href'ini `/events`'e geri al → "doğrudan takvim görünümüne
  gider" kırmızı ve e2e tıklama turu kırmızı.

---

## 8. Sorulan / sorulacak kararlar

| Konu                                             | Durum                      | Cevap / gerekçe                                                                                                                                                                                                                                          |
| ------------------------------------------------ | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Takvimde gün hücresine tıklayınca ne olsun       | **Soruldu, cevap alındı**  | "Sağda yan panel". Izgara sola daralır, panel `panel.width` (272) genişliğinde açılır ve o günün etkinliklerini **aynı** etkinlik satırıyla çizer. Panel hiç boş açılmaz (§1.F).                                                                         |
| `events/upcoming` liste satırlarını taşımıyor    | **Soruldu, cevap alındı**  | "Ayrı bir liste ucu yaz". `GET /api/v1/events/list` — cursor tabanlı, satır şekli `HomeNextEvent`'in aynısı, katılımcılar tek pencere sorgusuyla. Ana Sayfa kartının ucu hiç değişmedi (§1.G).                                                           |
| Read-all ↔ okunmamış şerit çelişkisi             | **Soruldu, cevap alındı**  | "Şerit de mentionCount ailesinden okusun". `read` artık alıcının kendi bildirim satırından; `dedupeKey` zaten `@@unique`, ek indeks yok. Sayı ve şerit aynı butonla birlikte temizleniyor (§1.D).                                                        |
| Yan ekranların içerik kabuğu                     | **Soruldu, cevap alındı**  | "Tek tam genişlik HomeCard, etiket = alt kırılım". Ekran adı üst çubukta, kartın bölüm etiketi seçili filtreyi/görünümü söylüyor. Yeni kart tipi doğmadı.                                                                                                |
| `Mesajlar` çipinin veri kaynağı yok              | **Soruldu, cevap alındı**  | "DM bahsedilmesini uçtan uca yaz". Yeni `DMMessageMention` tablosu, aynı transaction'da yazıcı, bildirim satırından backfill (§1.C). Dört çipin dördü de çalışıyor.                                                                                      |
| Takvim gün panelinin boş hâli                    | **Soruldu, cevap alındı**  | "Bugün otomatik seçili + `Bu günde etkinlik yok`". Tek yeni metin bu; §3.4'ün kalıbından türetildi ve onayı alındı.                                                                                                                                      |
| Odak pill'i yan ekranlarda                       | **Soruldu, cevap alındı**  | "Üç ekranda da görünsün". Faz 5'in tek motoru zaten paylaşımlı; dördüncü okuyucu dördüncü timer açmıyor.                                                                                                                                                 |
| Aktif çipin metin rengi `--foreground` oldu      | **Karar verildi, ölçümle** | `--primary-readable` koyu temada `--primary/0.14` üzerinde 3,70:1 (eşik 4,5). Faz 5'in düzeltme yönü aynen sürdürüldü: dolgu sabit, metin okunur hâle çekildi — bir adım daha, temanın kendi `--foreground`'una (§4.1). Sorulmadı çünkü ölçüm tek yönlü. |
| Komşu ayın karesi `opacity-50` yerine dolgusuz   | **Karar verildi, ölçümle** | `opacity-50` gün numarasını 2,39:1'e düşürüyordu. Ayrım artık kutunun dolu/boş olmasında.                                                                                                                                                                |
| Gelen kutusu başlığındaki sayı **filtresiz**     | Karar verildi              | Filtreli bir görünüm de "kaç şey bekliyor" der. Filtreye göre değişen bir toplam, çipe basınca sayının düşmesi gibi okunur ve yanlıştır.                                                                                                                 |
| `?filter=` / `?source=` URL'de                   | Karar verildi              | `?view=`'in gerekçesi (paylaşılabilir adres) diğer ikisi için de geçerli; ayrıca ayrıştırıcılar zaten saf ve testli.                                                                                                                                     |
| Gün paneli satırı `Hatırlat` çizmiyor            | Karar verildi              | `events/calendar` DTO'su `interested` taşımıyor. Her zaman "Hatırlat" diyen bir buton, ilgi zaten kuruluyken yalan söylerdi. → §6.4                                                                                                                      |
| `expectNoClippedText` yardımcısına kural eklendi | Karar verildi              | `sr-only` deseni tanımı gereği kırpılmıştır; kontrol onu sayınca gerçek kırpmayı değil zamanlamayı ölçüyordu (§3.1). Ürün kodu değişmedi.                                                                                                                |
