# 00 — Ortak bağlam (Etkinlikler · 4B Takvim şeridi)

**Bu dosya uygulanmaz, okunur.** Her şerit işe başlamadan önce buradaki gerçekleri, kararları ve
tuzakları bilir. Şeritler arası her çelişki burada çözülür.

---

## 1. Kapsam sınırı

Uygulanacak: **akış başlığı** + **hafta şeridi** + **etkinlik ızgarası** + **sağ ajanda rayı
(300)** + **etkinlik detay paneli (326)** + **oluştur modalı (560)** + **filtre şeridi** +
**RSVP onay şeridi** + **boş/hata durumu**, ve bunları besleyen **veri katmanı**.

Dokunulmayacak: sunucu rayı (74), gezinme paneli (228), sol alttaki kullanıcı barı. Bunlar
`WizardsShell` içinde hazır. Bu ekranın onlara değen **tek** noktası:

- Gezinme panelindeki `Etkinlikler` satırı bu rotada aktif (zaten `app-nav-panel.tsx` yapıyor).
- Aynı satırın sağındaki **saat ipucu** bir sonraki etkinliğin saatini gösterir; o an canlı
  etkinlik varsa solunda 6 px `--danger` nokta çıkar; **hata durumunda ipucu render edilmez**.
  Bu değer ekrandaki etkinlik verisiyle **aynı kaynaktan** okunur (Ş4).

Diff bu iki noktanın dışında sol tarafa dokunuyorsa şerit hatalıdır.

**4B'de sol filtre kolonu YOKTUR.** Zaman filtresi hafta şeridinden, diğer filtreler başlık
sekmelerinden ve filtre şeridinden yönetilir. `selectThirdColumn("/events")` bugün `null`
dönüyor ve **öyle kalır** — 300 px ajanda rayı kabuğun sütunu değil, sayfanın kendi sağ sütunudur.

---

## 2. Doğrulanmış gerçekler (kodda okundu, tahmin değil)

### 2.1 Kabuk ve rota

- `apps/web/src/app/(main)/events/page.tsx` → `EventsScreen` (`components/screens/events-screen.tsx`,
  242 satır). Bu **Ana Sayfa Faz 6'nın** liste + ay takvimi ekranıdır; `?view=calendar` ile
  takvime geçer, `EventListRow` satırlarını çizer, `useHomeActions().remind` ile "Hatırlat"
  yazar. Bu paketle **silinir** (Ş10), değiştirilmez.
- `apps/web/src/lib/home/third-column.ts` → `selectThirdColumn("/events")` = `null`. Doğru,
  dokunulmaz.
- `apps/web/src/components/shell/app-nav-panel.tsx:56` — `{ href: "/events", icon: Calendar,
id: "events", labelKey: "shell.appNav.events" }`. `:252` saat ipucunu çiziyor,
  `useNextEventClock()`'tan okuyor.
- `apps/web/src/hooks/use-next-event-clock.ts` — bugün `homeQueryKeys.upcoming(limit)`
  anahtarını **Ana Sayfa "Sıradaki" kartıyla paylaşıyor** ki kabuk ikinci istek çıkarmasın.
  Ş4 bunu yeni sayaç ucuna taşırken bu paylaşımın karşılığını korumak zorunda (tuzak #8).
- Küçük ekran: `RESPONSIVE_BREAKPOINTS` (`apps/web/src/lib/responsive.ts`) —
  `mobileMax: 767`, `tablet: 768`, `desktop: 1024`, `commandCenter: 960`,
  `supportPanel: 1280`, `commandCenterWide: 1360`.

### 2.2 Ölçü ve tema

- `apps/web/src/lib/home/metrics.ts` → `pxToRem`, `pxToEm`, `hairline` **mevcut**;
  `lib/messages/metrics.ts` ve `lib/mentions/metrics.ts` bunları yeniden ihraç ediyor.
  Etkinlikler sözlüğü aynı deseni izler.
- Ölçek motoru hazır: `hooks/use-ui-scale.ts` + `lib/home/scale.ts`. Tek çağrı noktası
  `AuthenticatedAppProviders`; ekran kendi adımını **yazmaz**, `useUiScaleStep()` ile okur.
- Yoğunluk deseni hazır: `lib/home/density.ts` → `selectHomeDensity(step)`. Etkinlikler kendi
  `lib/events/density.ts` dosyasını aynı dilde yazar.
- Tema `<html>` üzerindeki `theme-light` / `theme-dark` sınıflarıyla gelir (`ThemeProvider`).
- Tipografi token'ları `--font-display` (Outfit) / `--font-sans` (Figtree).
- **`--info` token'ı ZATEN VAR** — `apps/web/src/app/globals.css:37` `--info: 199 89% 48%`,
  yanında `--info-foreground`, `--info-soft`, `--info-readable`. PROMPT §1'in "token karşılığı
  yoksa token olarak tanımla" istisnası **karşılanmış durumda**; yeni token üretilmez.

### 2.3 Veri — bugün var olan

- `ScheduledEvent { id, serverId, channelId?, creatorId, name, description?, imageUrl?,
scheduledStartAt, scheduledEndAt?, status, entityType, externalLocation?, interestedCount,
createdAt }`. İndeksler: `[serverId]`, `[scheduledStartAt]`, `[serverId, status, scheduledStartAt]`.
- `ScheduledEventStatus = SCHEDULED | ACTIVE | COMPLETED | CANCELLED`.
  **`ACTIVE`'i bugün kimse yazmıyor** — canlı geçişi Ş3'te ses odası yaşam döngüsüne bağlanır.
- `ScheduledEventEntityType = STAGE | VOICE | EXTERNAL`.
- `ScheduledEventInterest { id, eventId, userId, createdAt }` — `@@unique([eventId, userId])`,
  `@@index([userId])`. Şema yorumu şunu söylüyor: `interestedCount` tek başına idempotent
  olamaz, sayacı bu satırın tekilliği taşır.
- `apps/web/src/lib/workspace/scheduled-event-service.ts` (407 satır) — modelin **bütün** okuma
  ve yazma yüzeyi. `SERVER_SCHEDULED_EVENT_SELECT`, `buildServerScheduledEvent`,
  `listServerScheduledEvents`, `createServerScheduledEvent`, `setServerScheduledEventInterest`.
  Yazma yolları `ensureServerPermission(access, PermissionBits.MANAGE_SERVER)` istiyor
  (`:219`, `:303`, `:337`).
  `attendeeCount` bugün **bağlı sesli kanalın canlı `voiceStates` sayısı**; harici etkinlikte 0.
- `apps/web/src/lib/home/events-service.ts` (322 satır) — Ana Sayfa'nın okuması:
  `getHomeUpcomingEvents`, liste ve takvim. Kapsam: **izleyicinin üye olduğu sunucuların**
  etkinlikleri (`listViewerServerIds` sorgunun kendi süzgeci).
- `interestedCount` üç yerden okunuyor: `home/events-service.ts`,
  `servers/server-public-profile-service.ts`, `api/v1/mobile/servers/[serverId]/events/*`.
- `UserNotificationSettings` — `desktopNotifications`, `mobileNotifications`,
  `emailNotifications`, `notificationSound`, `notificationSoundFile`, `suppressEveryoneMentions`,
  `suppressRoleMentions`, `mutedUntil`, `mentionSelf`, `mentionThreadReplies`,
  `desktopMentionMode`, `quietHours*`. **Etkinlik anahtarı yok.**
- Outbox: `OutboxJob { idempotencyKey @unique, type, status, payload, attempts, maxAttempts,
availableAt, lockedAt, lockedBy, lastError }`; `OUTBOX_JOB_TYPES`
  (`apps/web/src/lib/outbox/service.ts:34`) 9 tip taşıyor, etkinlik tipi yok.
- Socket: `apps/web/src/lib/socket/events.ts` (458 satır) — **etkinlik olayı yok**.
  `scheduled-event-service.ts` yalnız `server:settings:updated` yayıyor (`:179`).
- Yetki: `apps/web/src/lib/workspace/permissions.ts` — en yüksek kullanılan bit **23**
  (`MENTION_EVERYONE: 1n << 23n`). `MANAGE_EVENTS` bu yüzden `1n << 24n`.
- Saat dilimi: `packages/types/src/account-date-time.ts:106` → `resolveAccountTimeZone(...)`.

### 2.4 Mevcut API

| Uç                                                          | Durum                                                                    |
| ----------------------------------------------------------- | ------------------------------------------------------------------------ |
| `GET /api/v1/events/list`                                   | Ana Sayfa Faz 6 listesi (yalnız `cursor` + `limit`). **Ş10'da silinir.** |
| `GET /api/v1/events/calendar`                               | Ay ızgarası. **Ş10'da silinir.**                                         |
| `GET /api/v1/events/upcoming`                               | Ana Sayfa "Sıradaki" kartı. **Kalır.**                                   |
| `GET/POST /api/v1/servers/[serverId]/events`                | Sunucu içi CRUD. **Kalır**, `MANAGE_EVENTS`'e geçer.                     |
| `POST /api/v1/servers/[serverId]/events/[eventId]/interest` | İkili ilgi. **Kalır**, `status` alır (K1).                               |
| `/api/v1/mobile/servers/[serverId]/events/*`                | Mobil ikizleri. **Sözleşmesi kırılmaz** (K12).                           |

### 2.5 Mevcut bileşenler

`components/ui/`: `avatar`, `badge`, `context-menu`, `input`, `modal`, `segmented-control`,
`skeleton`, `textarea`, `toast` (**Bahsedilmeler Ş8'de yazıldı, hazır**), `toggle-switch`.
`components/providers/`: `toast-provider` (`useToast` → `show({ message, action })`).
`components/shell/`: `channel-sidebar`, `channel-item` (ray satır dili), `server-icon`,
`app-nav-panel`.
`components/shared/`: `notification-bell`, `user-profile-popover`.
`components/home/`: `home-card`, `home-primitives` — **Ana Sayfa'ya aittir, bu ekranda
kullanılmaz** (bugünkü `events-screen.tsx` kullanıyor, o siliniyor).

Referans desen dosyaları (okunur, kopyalanmaz): `components/mentions/mentions-page.tsx`
(URL durum sahibi + slot yerleşimi), `lib/mentions/metrics.ts` + `parity.test.ts`
(ölçü sözlüğü + parity kapısı), `lib/mentions/routes.ts` (URL ayrıştırıcı),
`lib/mentions/realtime.ts` (socket yaması).

---

## 3. Alınmış kararlar (bağlayıcı — tartışılmaz, uygulanır)

| #       | Karar                                                                                                                                                                                                                                                                                                     | Gerekçe                                                                                                                                                                          |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **K1**  | **RSVP mevcut satıra `status` enum olarak eklenir.** `ScheduledEventInterest.status: GOING \| MAYBE`; mevcut satırlar `GOING`. `interestedCount` **anlamı `going`** olur, yanına `maybeCount` gelir. `viewerInterested` = `status != null` olarak korunur.                                                | Tek tablo, tek unique key. İkinci tablo iki sayaç ve kaçınılmaz ayrışma demekti. Mevcut satırlar zaten "gideceğim" niyetiyle yazıldı; `GOING` doğru varsayılan.                  |
| **K2**  | **Yeni `ScheduledEventKind` enum kolonu** (`VOICE / MEETING / GAME / LIVE / COMMUNITY / WORKSHOP`). `entityType` teknik bağlamayı (sahne / sesli / harici) tutmaya devam eder. Backfill: `VOICE→VOICE`, `STAGE→LIVE`, `EXTERNAL→MEETING`.                                                                 | 6 sunum türünü 3 teknik türe sıkıştırmak "Oyun gecesi sesli mi harici mi" sorusunu cevapsız bırakır ve `Yayına katıl` CTA'sının gideceği yer belirsizleşir.                      |
| **K3**  | **Herkese açık etkinlik = `isPublic` bayrağı; `serverId` zorunlu kalır.** Tasarımdaki "Topluluk" kaynağı, izleyicinin **üye olmadığı** sunucunun `isPublic` etkinliğidir; kaynak tile'ı `TK` dilinde çizilir. Modaldaki `Topluluk keşfetinde listele` anahtarı bu bayrağı yazar.                          | Nullable FK her okuma yolunda ikinci bir dal ve ayrı bir sahiplik kuralı açardı.                                                                                                 |
| **K4**  | **Yeni `MANAGE_EVENTS` yetki biti** (`1n << 24n`). Sunucu sahibi ve `MANAGE_SERVER` taşıyan rol varsayılan olarak geçer; rol ayarlarından ayrıca dağıtılabilir. Yetkisi olmayanda `Oluştur` girişlerinin **üçü de** (başlık, ajanda rayı altı, boş durum) gizlenir.                                       | Her üyeye açmak sunucu geneli bildirim spam'i; `MANAGE_SERVER`'da bırakmak tasarımdaki üç girişi çoğu kullanıcı için ölü yapardı.                                                |
| **K5**  | **Hatırlatma tam uçtan uca.** `ScheduledEventReminder { eventId, userId, minutesBefore, enabled }` + `OutboxJob` (`availableAt = startsAt − minutesBefore`). Seçenekler **5 / 10 / 15 / 30 / 60 dk**, varsayılan **10**. Etkinlik saati değişince iş yeniden zamanlanır; RSVP geri alınınca iptal edilir. | Tasarımın iki ayrı yerinde ("başlamadan 10 dk önce hatırlatma gönderilecek", "Hatırlatma açık · Değiştir") söz veriliyor; saklanıp gönderilmeyen bir tercih o metni yalan yapar. |
| **K6**  | **Tekrar: `recurrenceRule` (RRULE metni) kolonu + etiketin kuraldan i18n ile türetilmesi. Örnek üreten iş ve kurma UI'ı bu pakette YOK** — `TODO(api): recurrence generator`.                                                                                                                             | Oluştur modalının kendi alt metni "Tekrar eden etkinlikler oluşturulduktan sonra ayarlanır" diyor; tasarımda tekrar alanı yok.                                                   |
| **K7**  | **Zil = hesap seviyesinde etkinlik bildirim tercihi** (`UserNotificationSettings.eventNotifications`); başlık alt satırındaki `takvim bağlı / bağlı değil` metnini bu sürer. **`Takvime ekle` = tek etkinlik `.ics` indirmesi.**                                                                          | Harici takvim OAuth'u bu paketin çok dışında; `.ics` Google/Apple/Outlook'un üçünde de açılır ve harici servise veri gitmez.                                                     |
| **K8**  | **Arama kutusu eklenmez.** `q` yalnız URL'den (`?q=`) okunur; giriş noktası mevcut global komut paleti. Filtre çipi ve `Tümünü temizle` çalışır.                                                                                                                                                          | 4B tasarımında arama kutusu yok; başlık `nowrap` ve ana kolon panelle 432 px'e düşüyor — kutuya yer yok.                                                                         |
| **K9**  | **Hafta şeridi okları hafta adımlar.** Etiket görünen haftanın ayını yazar; hafta iki ayı bölüyorsa `Ağu – Eyl 2026`.                                                                                                                                                                                     | HTML'deki `title="Önceki hafta"` / `title="Sonraki hafta"` otoritedir. PROMPT'un "ay ileri/geri" kriteriyle çelişkisi `SPEC_DEVIATIONS`'a kayda geçer.                           |
| **K10** | **Yer seçici türe göre süzülür.** Sunucu listesi = `MANAGE_EVENTS` taşıdığın sunucular. Kanal listesi: `VOICE`/`GAME` → sesli kanallar, `LIVE`/`COMMUNITY` → sahne kanalları, `MEETING`/`WORKSHOP` → metin + sesli. Ayrıca `Harici bağlantı` seçeneği (`externalLocation`).                               | `Yayına katıl` CTA'sının gideceği yer garanti altına alınır; metin kanalına konmuş bir canlı yayın o butonu anlamsızlaştırır.                                                    |
| **K11** | **Kart boyutu `?size=large` (paylaşılabilir) + `localStorage` (cihaz tercihi). Zil sunucuda** (hesap tercihi).                                                                                                                                                                                            | Kart boyutu ekran genişliğine bağlı bir tercih (4K masaüstü ile dizüstü aynı olmak zorunda değil); bildirim davranışı cihazlar arası aynı olmalı.                                |
| **K12** | **Mobil sözleşmesi kırılmaz.** `/api/v1/mobile/...` uçları yeni alanları (`kind`, `rsvpStatus`, `isPublic`, `maybeCount`) **opsiyonel** döner; `interested` boolean türetilmiş alan olarak kalır. Mobil Etkinlikler ekranı ayrı pakette.                                                                  | Eski mobil sürüm kırılmaz, yeni sürüm türü öğrenir.                                                                                                                              |

### 3.1 Sözleşme kuralı — taslaktan bilinçli sapma

`SPEC-ETKINLIKLER.md` §8 taslağı `durationLabel: '45 dk'`, `dayBucket: 'Bugün'`,
`startsInLabel: 'Başlamasına 12 dk'`, `recurrenceLabel: 'Her çarşamba'` gibi **görüntülenecek
Türkçe metinler** istiyor.

**Ürün karşılığında sunucu metin göndermez; sayı ve enum gönderir, metni istemci i18n ile kurar.**

| Taslak                    | Ürün                                                   |
| ------------------------- | ------------------------------------------------------ |
| `durationLabel: string`   | `durationMinutes: number \| null`                      |
| `dayBucket: 'Bugün' \| …` | `dayBucket: 'today' \| 'tomorrow' \| 'week' \| 'past'` |
| `startsInLabel: string`   | `startsInMinutes: number \| null`                      |
| `recurrenceLabel: string` | `recurrenceRule: string \| null`                       |

Aksi hâlde `en` sözlüğü hiçbir zaman doğru olamaz ve K12'deki mobil uyumu Türkçeye çivilenir.
Bu sapma `packages/types/src/events-screen.ts` başında yorumla kayda geçer.

### 3.2 Kayda geçen SPEC ↔ HTML sapmaları

`lib/events/metrics.ts` içindeki `SPEC_DEVIATIONS` dizisi bu beş kaydı taşır:

1. **Hafta oklarının adımı** — HTML `title` "hafta", PROMPT kabul kriteri "ay". → **hafta** (K9).
2. **Tür pili `letter-spacing`** — SPEC ve HTML ikisi de sessiz → sözlükte `null`.
3. **Sağ ray başlığı** — SPEC §4 "Katılacağım"; `.dc.html` sol filtre kolonunda "Katılımım"
   geçiyor ama o **4A yönüne** ait ve 4B'de çizilmiyor → **"Katılacağım"**.
4. **Başlık metni dalları** — SPEC §3.1 yalnız sekme ve arama dallarını sayıyor; HTML
   `feedTitle` ayrıca kaynak filtresi seçiliyken **kaynak adını**, `time === 'today'` iken
   **`Bugün`** yazıyor → HTML davranışı alınır.
5. **`dayBucket` sayısı** — SPEC §8 dört değer sayıyor (`Bugün/Yarın/Bu hafta/Geçmiş`); HTML
   grup sırası üçünü çiziyor, `Geçmiş` süzülüp atılıyor → tip dörtte kalır, ızgara üçünü çizer.

---

## 4. Tuzaklar

1. **Prisma migration yolu:** `packages/db/prisma/rebaseline-migrations` okunur
   (`prisma/migrations` değil). Yanlış klasöre yazılan migration hiç koşmaz.
2. **`interestedCount` anlam kayması.** K1 sayacın adını değiştirmiyor ama anlamını daraltıyor
   (`ilgili` → `going`). Üç tüketici var (§2.3); her biri Ş3'te tek tek doğrulanır ve sözleşme
   testiyle kilitlenir. Aksi hâlde sunucu profil kartı `maybe` verenleri sayıdan düşürür.
3. **Sekme sayaçları filtresizdir.** HTML sekme pillerini `EVENTS.length` üzerinden sayıyor,
   ızgarayı filtreliyor. Sayaç ucu `time/source/mine/q` **uygulamaz** — aksi hâlde filtre
   açıkken bütün sekmeler "0" görünür ve tıklanamaz sanılır.
4. **`useNextEventClock` çift sorgu.** Hook bugün Ana Sayfa'nın `homeQueryKeys.upcoming(limit)`
   anahtarını paylaşıyor ki kabuk ikinci istek çıkarmasın. Yeni sayaç ucuna geçerken ya Ana
   Sayfa "Sıradaki" kartı da aynı anahtara taşınır ya da paylaşım korunur; ikisi de olmazsa
   kabuk **her rotada** fazladan bir istek çıkarır.
5. **`auto-fill minmax` ile klavye gezinme.** Kolon sayısı CSS'ten geliyor; JS bilmiyor.
   `↑/↓` için kolon sayısı `ResizeObserver` + ilk iki kartın `offsetTop` karşılaştırmasıyla
   **ölçülür**, tahmin edilmez.
6. **`isPublic` + üyelik birleşimi çift satır üretir.** Üye olduğun sunucunun herkese açık
   etkinliği iki dala birden düşer. `UNION` (`UNION ALL` değil) veya `DISTINCT ON (id)` şart.
7. **Saat dilimi tek yerde.** Gün grupları ve hafta şeridi **izleyicinin** saat diliminde
   hesaplanır (`resolveAccountTimeZone`). Sunucu UTC ISO gönderir; kova hesabı ya istemcide ya
   sunucuda ama **tek yerde** yapılır. İkisi de yaparsa gece yarısına yakın etkinlikler iki
   kovaya birden düşer.
8. **Geçmişte kalan hatırlatma kuyruğa yazılmaz.** Etkinlik 5 dk sonraysa ve tercih 10 dk ise
   `availableAt` geçmişte kalır; worker onu **hemen** gönderir ve kullanıcı "başlamasına 10 dk"
   diyen bir bildirimi etkinlik başladıktan sonra alır. `availableAt <= now` ise iş yazılmaz.
9. **`zoom` üretimde kullanılmaz.** Referans HTML ölçeği `zoom` ile taklit eder; üretimde
   rem + kök font boyutu adımları geçerlidir (SPEC-ANA-SAYFA §8.2).
10. **Arbitrary px sınıfı yasak.** `w-[300px]`, `text-[13px]` yazılmaz; ölçü sözlüğünden
    `pxToRem(...)` ile gelir. Hairline `hairline()` (`max(1px, 0.0625rem)`), ikon `pxToEm()`.
11. **Kırılım CSS'te seçilir, JavaScript'te değil.** `useSyncExternalStore` SSR anlık görüntüsü
    1280'dir; ilk boya yanlış kırılımda çıkar ve hidrasyon uyuşmazlığı doğar (`lib/home/layout.ts`).
12. **Sonsuz sayfalamada bağımlılıklar ilkel olmalı.** `useInfiniteQuery` her render'da yeni
    nesne döndürür; `[listQuery]` yazmak `IntersectionObserver` efektini her render'da söküp
    kurar ve **her render bir sayfa daha çeker** (`mentions-page.tsx` bu tuzağı yorumla taşıyor).

---

## 5. Kalite çıtası (her şerit için)

- **Test önce.** Yeni davranışın testi önce yazılır, kırmızı görülür, sonra yeşile çevrilir.
- **Token dışı renk yok.** `#`, `rgb(`, `rgba(` araması bileşen dosyalarında temiz olmalı;
  tek istisna tasarımda `#fff` olarak verilen ters metin (primary zemin üstündeki beyaz).
- **Sabit font adı yok.** `Outfit` / `Figtree` yalnız token tanımında geçer.
- **Ton token adıdır, renk değil.** `EVENT_KIND_TONE.game = "--warning"` yazılır,
  `"hsl(39 90% 56%)"` yazılmaz.
- **Renk tek başına anlam taşımaz.** Her tür pili metnini de taşır; canlı pili hem noktayı hem
  `Canlı` metnini taşır.
- **i18n.** Her metin `events.*` anahtarından gelir; TR karşılığı SPEC'teki metnin **birebir
  aynısı**. Sunucu/kanal adı, sayı ve saat gibi dinamik parça interpolasyonla.
- **Erişilebilirlik.** Kart `article`, her eylem gerçek `button`, ikon-only butonlarda
  `aria-label`, sayaçlar metin karşılığı taşır, `Esc` kapatır (modal → panel merdiveni),
  focus tuzağı ve focus dönüşü çalışır, focus stili `ring-ring` token'ından.
- **Uydurma endpoint yok.** Karşılığı olmayan alan için tipli adapter + `TODO(api):` notu.
- **Aynı anda tek panel, tek modal.** Biri açılırken diğeri kapanır; merdiven tek yerde
  tanımlanır (`eventsUiReducer`), çağrı yerlerinde tekrarlanmaz.
- **Kapı komutları** (şerit sonunda, ilgili olanlar):
  ```
  pnpm --filter @wizards/web typecheck
  pnpm --filter @wizards/web lint
  pnpm --filter @wizards/web test
  pnpm --filter @wizards/db db:generate
  ```
- **Rapor:** `docs/prompts/whispr-etkinlikler/raporlar/<no>-rapor.md` — ne yapıldı, hangi sapma
  kayda geçti, hangi `TODO(api):` bırakıldı, kapı çıktısı.
- **Commit yok.** Kullanıcı açıkça isteyene kadar hiçbir şerit commit atmaz.
