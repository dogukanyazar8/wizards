# Faz 4 raporu — Ana Sayfa ızgarası ve altı kart

Tarih: 2026-08-19 · Branch: `uat` · Commit: yok (izin bekliyor)

Ekranın kendisi. `/home` rotası, üst çubuk, dört kolonlu bento ızgara ve altı kart; her kartın
dolu / yükleniyor / boş / hata hâli. Etkileşim mantığı yok (Faz 5) — satırlar gerçek bağlantı,
butonlar odaklanabilir ama yazma yolları `TODO(faz5)` ile işaretli.

Faz 3 raporunun Faz 4'e devrettiği dört madde başlamadan soruldu; cevaplar §8'de.

---

## 1. Yapıldı

### A. Rota

- `app/(main)/home/page.tsx` — sunucu bileşeni, `HomeCommandCenter` render eder. `(main)` grubu
  oturumu ve ban kontrolünü zaten yapıyor (§6.8), **ikinci `requireAuth` yok**; `auth()` yalnız
  görüntüleyenin kimliğini soket köprüsüne vermek için okunuyor.
- `app/page.tsx`: `redirect(session ? "/home" : "/login")` — kök artık `/channels`'a değil Ana
  Sayfa'ya gidiyor.
- `app/(main)/home/loading.tsx`: **yalnız ızgara çerçevesi**. Kart iskeletleri kartların kendi
  içinde; rota seviyesinde tek bir tam ekran iskelet çizmek altı sorgunun bağımsızlığını görünmez
  kılardı.

### B. Üst çubuk

Padding `24 30 14`, iki uca yaslı, `gap:24`, `align-items:flex-start` — hepsi `HOME_METRICS.topBar`.

- Selamlama saf fonksiyondan: `getGreetingKey(hour)` → `morning|afternoon|evening|night`. Dört
  dilim yirmi dört saati boşluksuz bölüyor (gece 23–04 · sabah 05–11 · öğle 12–17 · akşam 18–22);
  sınırlar, aralık dışı saat ve `NaN` testli.
- Odak pill'i **yalnız odak açıkken**: `--warning/0.14` zemin, 600/11.5, 6px nokta, `Odak · <n> dk`.
- Alt satır 13.5 muted. **Sayı 0 ise o cümle parçası düşüyor**: "0 yanıt" hiç üretilmiyor, ikisi de
  sıfırsa yalnız tarih kalıyor. Kalın kısımlar `--text-secondary` 600. Tarih `formatHeaderDate` ile
  `LocaleProvider`ın yerelinde biçimleniyor; sunucudan yalnız ISO damga geliyor.
- Arama alanı: 280 genişlik, radius 13, `--surface-card`, hover kenar `--primary/0.6`, geçiş
  `0.18s`. **Gerçek `button`**, `disabled` değil, `aria-keyshortcuts="Meta+K Control+K"` taşıyor,
  bu fazda tıklayınca hiçbir şey yapmıyor. Kısayol çipi platforma göre (`⌘K` / `Ctrl K`) —
  `useSyncExternalStore` ile, sunucu anlık görüntüsü `Ctrl K`: hidrasyon uyuşmazlığı yok.
- Bildirim butonu 40×40 radius 13. **Mevcut `NotificationBell` yeniden yazılmadı**; iki katkı
  eklendi: `style` prop'u ve `badgeVariant="dot"` (tasarımın 7px `--danger` noktası). Varsayılan
  sayı balonu davranışı ve popover/sorgu/soket mantığı olduğu gibi duruyor.

### C. Bento ızgara

`repeat(4, minmax(0,1fr))` × `auto auto auto`, gap 13, padding `8 30 18`. Kart temeli radius 20,
`--surface-card`, `hairline()` kenar `--border/0.5`, gölge `0 1px 2px --shadow-color/0.1`.

**Ortak `HomeCard`**: başlık satırı (bölüm etiketi + soldaki ek + sağdaki aksesuar), gövde, isteğe
bağlı ayak. Kart kabuğu altı kez yazılmadı. `headerAlign="baseline"` yalnız Arkadaşlar şeridinde.

Alanlar birebir: Kaldığın yer `span 2` (16 16 12) · Şu an canlı `span 2` (16 16 14) · Yanıt
bekliyor `span 2` (20) · Durumun 1 (16) · Sıradaki 1 (16) · Arkadaşlar `span 4` (12 16 13).

### D. Altı kart

**Kaldığın yer.** Satırın tamamı tek `Link`; içinde hiç `button`/`a` yok (test bunu satır gövdesini
tarayarak sabitliyor). İkon karesinin tint'i **kanal kimliğinden** türüyor (`getIconSquareAccent`,
FNV-1a; havuz primary/0.12 · success/0.14 · warning/0.14) — tasarımdaki sıra örnek veriydi. Sağ
kolonda zaman + rozet; **`unreadCount` 0 ise rozet hiç çizilmiyor**, bahsedilme varsa `danger`.

**Şu an canlı.** Başlıktaki sayı `rooms.length` değil **sunucudan gelen `totalCount`** (bu alan Faz
3 sözleşmesinde yoktu, §1.E'de eklendi). Konuşan `selectRoomSpeaker` ile `voice:audio-level:update`
olaylarından türüyor; eşiğin (0.08) altında konuşan yok sayılıyor ve **konuşan satırı ile dalga
formu gizlenip yerine katılımcı özeti çıkıyor**. Oda kartı `div`, tek tıklanabilir öğe `Katıl`
bağlantısı — kartı da bağlantı yapmak iç içe tıklanabilir öğe üretirdi. Kart altında 28px avatar
yığını + `+n` çipi (`participantCount`'tan, listedeki dörtten değil).

**Yanıt bekliyor.** Erişilebilirlik kararı 05 §4.3'ün tercih ettiği biçimde: **satır `a`, aksiyon
butonu kardeş öğe**; ikisi de ayrı ayrı odaklanabiliyor, iç içe buton yok (test satır gövdesinde
`<button` aramıyor olduğunu doğruluyor). `newCount` 0 ise "yeni" pill'i çizilmiyor.

**Durumun.** 2×2 çip ızgarası, her çip `button` + `aria-pressed`; aktif çip `summary.presence`'ı
izliyor. Toggle gerçek `button role="switch"` + `aria-checked`. İlerleme çubuğu `role="progressbar"`

- `aria-valuenow/min/max`. **Odak kapalıyken çubuk ve alt açıklama gizleniyor ama yerlerine tam
  aynı yükseklikte boşluk bırakılıyor** (34,5 + 16,8 tasarım pikseli) — kart kısalsaydı ızgara satırı
  kayardı. Test bu boşluğun yüksekliğini birebir sabitliyor.

**Sıradaki.** Kalan süre istemcide (`getMinutesUntil`, geçmiş etkinlikte 0'a sıkışıyor), gün
etiketi saf fonksiyondan (`bugün` / `yarın` / kısa gün adı, takvim gününden — 26 saat önce her
zaman "dün", gece yarısını geçen 3 saat "3 sa"). Ayakta iki eşit buton: `Hatırlat` (primary) ve
`Takvim` (`bg-amber-400 text-slate-900`, token denetiminin izin listesinde).

**Arkadaşlar.** Durum metni `deriveFriendStatusText`; öncelik **sesli oda > DND > boşta süresi >
customStatus > presence etiketi** ve sıra `selectFriendStatusSource` üzerinden tek tek testli.
Sesli oda adı artık `GET /api/v1/friends` yanıtından geliyor (§1.E). Kartlar çevrimiçi olanlarla
sınırlı, kararlı sıralı (ONLINE → IDLE → DND, sonra ada göre) ve ölçek adımının sayısına kesiliyor.

### E. Faz 3 sözleşmesine üç ekleme

Üçü de ekranın çizemediği ya da yalan söyleyeceği bir alanı kapattığı için yapıldı:

1. **`VoiceLiveResponse.totalCount`** — 05 §9 "başlıktaki sayı `rooms.length` olmasın" diyor ama
   yanıtta toplam yoktu. `live-service` `limit` kesiminden **önceki** sayıyı döndürüyor; test
   "1 oda render, başlık 3 diyor" hâlini sabitliyor.
2. **`FriendDto.voiceRoom`** — kullanıcı kararı (§8). `listFriends` (queries.ts) canlı `VoiceState`
   satırlarını okuyor, eşiği **cleanup'ın kendi eşiği** (`getStaleVoiceHeartbeatCutoff`, artık
   `voice/types.ts`'te, `voice/service.ts` onu yeniden export ediyor — friends ucu ses servisinin
   tamamını bundle'a çekmesin diye). Redaksiyon presence ile **aynı** kümeden geliyor: görünmez ya
   da presence'ı kapalı bir arkadaşın odası `null`. Zod alanı `.default(null)` — eski yanıtlar
   parse olmaya devam ediyor. `friends/service.ts`'teki ikinci `listFriends` (davet sayfası) bu
   okumayı **yapmıyor**, `voiceRoom: null` gönderiyor: o yüzey odayı göstermiyor.
3. **`HomeRecentItem.avatarUrl` + `presence`** — DM satırı 36px avatar + presence noktası
   istiyor, DTO ikisini de taşımıyordu. Avatar konuşmanın **karşı tarafından** geliyor (son mesajın
   yazarından değil; o çoğu zaman izleyicinin kendisi olur). Presence `readHomePresence` ile
   okunuyor, yani redaksiyondan geçiyor — sabit "ONLINE" çizmek §5.1.3'ün ihlali olurdu. Kanal ve
   grup DM satırında alan `null`, nokta hiç çizilmiyor. Redis okuması SQL değil: ucun 5 sorgulu
   bütçesi değişmedi (test hâlâ 5 sabitliyor). `readPresence` bağımlılığı **zorunlu** yapıldı;
   varsayılan bırakılsaydı bir test yanlışlıkla gerçek Redis'e gider ve hata "takılma" gibi
   görünürdü (yazarken bir kez oldu).

### F. Kabuğun iki `TODO(faz4)` işareti kapandı

Kullanıcı kararıyla (§8) bağlandı:

- `use-unread-counters.ts` bahsedilme sayacı → `GET /api/v1/app/summary.unreadMentions`.
- `app-nav-panel.tsx` "Etkinlikler" satırının saati → `GET /api/v1/events/upcoming.next`
  (`useNextEventClock`).

İkisi de **Ana Sayfa'nın kullandığı sorgu anahtarının aynısını** kullanıyor: `summary` anahtarı
sabit, `upcoming` anahtarı aynı yoğunluk tablosundan türeyen `limit`'i taşıyor. Sonuç: kabuk her
rotada bu iki sorgunun abonesi, ama `/home` açıkken **ikinci istek çıkmıyor** (React Query
tekilleştiriyor).

Aynı turda nav panelinin yerel `CountBadge`'i `HomeCountBadge` olarak `components/home`'a taşındı
(referans HTML'de `.w-badge` tek sınıf; iki kopya tutmak §2'nin yasakladığı kopyala-yapıştır olurdu).
`HOME_METRICS.badge` grubu bunun için eklendi, `panel.badge*` beşlisi kaldırıldı.

### G. Yükleme / boş / hata

- **Altı ayrı `useQuery`**, `Promise.all` yok, tek `Suspense` sınırı yok, ekranı düşüren error
  boundary yok. Elle doğrulandı (§7.4): `app/recent` 500 dönerken diğer beş kart normal çiziliyor,
  hiçbiri yükleme hâlinde takılı kalmıyor.
- İskelet satır yükseklikleri gerçek satırdan **hesaplanıyor** (`HOME_METRICS` + tip ölçeği), sabit
  sayı yazılmadı; test "Kaldığın yer" iskeletinin dört satırının da 58 tasarım pikseli olduğunu
  sabitliyor.
- Boş durum metinleri 05 §5'ten birebir. Her metnin i18n anahtarı **yorumda yazılı**
  (`home.continue.empty`, `home.live.empty`, …); sözlüğe taşımak Faz 7.
- Hata: kart içinde tek satır (`Bu kart yüklenemedi`) + `Tekrar dene`.

### H. Performans

- Altı kartın hepsi `React.memo`.
- **Tek saat**: `useMinuteClock` dakikada bir tikliyor, `visibilitychange` ile sekme gizliyken
  duruyor ve görünür olunca hemen eşitleniyor. Kart başına timer yok; "40 dk kaldı", "2 dk",
  "12 dk boşta" ve tarih satırı aynı `Date`'i okuyor.
- Dalga formu mevcut `VoiceLevelWaveform` (compact) — kendi timer'ı yok, ses seviyesiyle çiziliyor;
  seviyeler `use-home-realtime`'ın tek `requestAnimationFrame` döngüsünden geliyor ve React
  Query'ye yazılmıyor.
- `prefers-reduced-motion`: nabız CSS medya sorgusuyla duruyor (`.home-pulse-dot`), dalga formu
  `reducedMotion` prop'uyla düz kalıyor. İkisi de doğrulandı (§7.3, birim testi + elle).
- Avatarlar sabit boyutlu (inline rem), CLS yok.
- Ölçek adımı okuyucusu (`useUiScaleStep`) `resize`'ı rAF ile daraltıyor ve state'i **yalnız adım
  gerçekten değişince** yazıyor.

---

## 2. Dokunulan dosyalar

| Dosya                                                          | Yeni / Değişti    | Neden                                                          |
| -------------------------------------------------------------- | ----------------- | -------------------------------------------------------------- |
| `apps/web/src/app/(main)/home/page.tsx`                        | Yeni (15)         | Rota                                                           |
| `apps/web/src/app/(main)/home/loading.tsx`                     | Yeni (24)         | Yalnız ızgara çerçevesi                                        |
| `apps/web/src/app/page.tsx`                                    | Değişti           | `/` → `/home`                                                  |
| `apps/web/src/components/home/home-command-center.tsx`         | Yeni (79)         | Altı sorgu + saat + soket köprüsü                              |
| `apps/web/src/components/home/home-card.tsx`                   | Yeni (167)        | Ortak kabuk, iskelet, boş/hata satırı                          |
| `apps/web/src/components/home/home-primitives.tsx`             | Yeni (301)        | Rozet, presence noktası, avatar, yığın, etiket, buton stili    |
| `apps/web/src/components/home/home-top-bar.tsx`                | Yeni (249)        | SPEC §2.3                                                      |
| `apps/web/src/components/home/home-continue-card.tsx`          | Yeni (247)        | SPEC §3.1                                                      |
| `apps/web/src/components/home/home-live-card.tsx`              | Yeni (285)        | SPEC §3.2                                                      |
| `apps/web/src/components/home/home-awaiting-card.tsx`          | Yeni (208)        | SPEC §3.3                                                      |
| `apps/web/src/components/home/home-presence-card.tsx`          | Yeni (264)        | SPEC §3.4                                                      |
| `apps/web/src/components/home/home-up-next-card.tsx`           | Yeni (322)        | SPEC §3.5                                                      |
| `apps/web/src/components/home/home-friends-strip.tsx`          | Yeni (222)        | SPEC §3.6                                                      |
| `apps/web/src/components/home/home-cards.test.tsx`             | Yeni (605)        | 30 test — altı kartın dört hâli                                |
| `apps/web/src/lib/home/density.ts`                             | Yeni (36)         | `HOME_DENSITY_BY_SCALE`, tek kaynak                            |
| `apps/web/src/lib/home/density.test.ts`                        | Yeni (81)         | 5 test — SPEC §8.3 tablosu + uç aralıkları                     |
| `apps/web/src/lib/home/presentation.ts`                        | Yeni (390)        | Dokuz saf fonksiyon                                            |
| `apps/web/src/lib/home/presentation.test.ts`                   | Yeni (376)        | 33 test                                                        |
| `apps/web/src/hooks/use-home-queries.ts`                       | Yeni (132)        | Altı sorgu + `HomeCardState`                                   |
| `apps/web/src/hooks/use-minute-clock.ts`                       | Yeni (55)         | Ekranın tek saati                                              |
| `apps/web/src/hooks/use-prefers-reduced-motion.ts`             | Yeni (35)         | JS'in sürdüğü hareket için                                     |
| `apps/web/src/hooks/use-ui-scale-step.ts`                      | Yeni (55)         | Ölçek adımı **okuyucusu**                                      |
| `apps/web/src/hooks/use-next-event-clock.ts`                   | Yeni (30)         | Nav panelindeki saat                                           |
| `apps/web/src/hooks/use-ui-scale.ts`                           | Değişti (−0/+0)   | Okuyucu buradan ayrıldı (Faz 1 sözleşmesi: "state yok")        |
| `apps/web/src/hooks/use-unread-counters.ts`                    | Değişti           | `TODO(faz4)` kapandı — bahsedilme sayacı                       |
| `apps/web/src/hooks/use-home-realtime.ts`                      | Değişti           | `applyFriendVoiceRoom`; `totalCount` korunuyor                 |
| `apps/web/src/hooks/use-home-realtime.test.ts`                 | Değişti (+3 test) | Arkadaş sesli oda yamalaması                                   |
| `apps/web/src/components/shell/app-nav-panel.tsx`              | Değişti           | `HomeCountBadge`; "Etkinlikler" saati                          |
| `apps/web/src/components/shell/app-nav-panel.test.tsx`         | Değişti           | Yeni prop                                                      |
| `apps/web/src/components/shell/wizards-shell.tsx`              | Değişti           | `nextEventClock` bağlandı                                      |
| `apps/web/src/components/shared/notification-bell.tsx`         | Değişti           | `badgeVariant="dot"` + `style`                                 |
| `apps/web/src/components/ui/skeleton.tsx`                      | Değişti           | `style` prop (rem yükseklik)                                   |
| `apps/web/src/components/voice/room/voice-room-primitives.tsx` | Değişti (1 satır) | Klasik JSX transform için `import React`                       |
| `apps/web/src/lib/home/metrics.ts`                             | Değişti           | Paylaşılan `badge` grubu; `panel.badge*` kaldırıldı            |
| `apps/web/src/lib/home/metrics.test.ts`                        | Değişti           | Yeni grup + değerleri                                          |
| `apps/web/src/lib/home/server-identity.ts`                     | Değişti           | `hashIdentityId` export (ikinci tint havuzu)                   |
| `apps/web/src/lib/home/types.ts`                               | Değişti           | `voice/live.totalCount`, `recent.avatarUrl`, `recent.presence` |
| `apps/web/src/lib/home/live-service.ts`                        | Değişti           | `totalCount`                                                   |
| `apps/web/src/lib/home/recent-service.ts`                      | Değişti           | Karşı tarafın avatarı + redakte presence                       |
| `apps/web/src/app/api/v1/app/recent/route-logic.ts`            | Değişti           | `readPresence` bağlandı                                        |
| `apps/web/src/app/api/v1/app/recent/route-logic.test.ts`       | Değişti           | Presence beklentisi + sahte okuyucu                            |
| `apps/web/src/app/api/v1/voice/live/route-logic.test.ts`       | Değişti (+1 test) | `totalCount`                                                   |
| `apps/web/src/lib/friends/types.ts`                            | Değişti           | `FriendVoiceRoomDto`                                           |
| `apps/web/src/lib/friends/queries.ts`                          | Değişti           | `toFriendVoiceRoomMap` + sesli oda okuması                     |
| `apps/web/src/lib/friends/queries.test.ts`                     | Değişti (+4 test) | Eşleme, redaksiyon, heartbeat eşiği                            |
| `apps/web/src/lib/friends/service.ts`                          | Değişti (1 alan)  | İkinci `listFriends` `voiceRoom: null`                         |
| `apps/web/src/lib/voice/types.ts`                              | Değişti           | `getStaleVoiceHeartbeatCutoff` buraya taşındı                  |
| `apps/web/src/lib/voice/service.ts`                            | Değişti           | Aynı fonksiyonu yeniden export ediyor                          |
| `apps/web/src/app/api/v1/mobile/friends/route-logic.test.ts`   | Değişti (1 alan)  | Fikstür                                                        |
| `apps/web/src/app/globals.css`                                 | Değişti (+24)     | `@keyframes home-pulse` + reduced-motion                       |
| `apps/web/e2e/specs/design/home-parity.spec.ts`                | Değişti           | 1360×920 açık, 11'i `test.skip`                                |
| `graphify-out/**`                                              | Değişti           | `graphify update .`                                            |

---

## 3. Kapı çıktıları

| Komut                                                              | Sonuç                                                                              |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| `pnpm --filter @wizards/web test`                                  | ✅ exit 0 — **3043 test / 676 suite, 0 fail**, 48,5 sn (Faz 3: 2967/657)           |
| `pnpm typecheck`                                                   | ✅ exit 0 — 5/5 paket                                                              |
| `pnpm lint`                                                        | ✅ exit 0 — 5/5 paket, 0 hata 0 uyarı                                              |
| `pnpm --filter @wizards/web exec playwright test e2e/specs/design` | ✅ **5 passed / 11 skipped / 0 failed**, 8,4 sn                                    |
| `pnpm --filter @wizards/db test`                                   | ✅ exit 0 — 31 test / 0 fail                                                       |
| `node scripts/quality/count-arbitrary-px.mjs`                      | ✅ `1190 değer / 120 dosya` (Faz 0 tabanı 1208/120; **yeni yüzeylerin katkısı 0**) |
| `graphify update .`                                                | ✅ 27371 düğüm, 64422 kenar, 1192 topluluk                                         |

Yeni testler: kartlar 30 + presentation 33 + density 5 + friends 4 + realtime 3 + voice/live 1 =
**76**. (2967 + 76 = 3043 ✓.)

### Kapının nasıl koşulduğu — dürüst not

`e2e/specs/design` **üretim derlemesiyle** koşuldu ve bu Faz 3'ten daha zahmetliydi; nedenleri
raporlanmaya değer:

1. `pnpm dev` betiği `tsx watch --env-file=.env` çalıştırıyor ve `--env-file` süreç ortamını
   **eziyor**. `.env` içinde `E2E_TEST_MODE=false` ve `APP_URL=http://localhost:3000` yazılı, yani
   dev sunucusu hiçbir ortam değişkeniyle e2e moduna alınamıyor.
2. `NODE_ENV=production` altında e2e yardımcı uçları `E2E_ALLOW_PRODUCTION_BUILD=true`
   istiyor (`lib/e2e/route-guard.ts`). Playwright config bunu **yalnız CI'da** veriyor.
3. CSRF kapısı (`proxy.ts`) izinli origin listesini `APP_URL`/`AUTH_URL`/`NEXTAUTH_URL`'den
   kuruyor ve middleware bu değerleri **derleme anında** gömüyor. `.env` localhost yazdığı için
   `E2E_BASE_URL`'i de `http://localhost:3000` yapmak gerekti (playwright'ın 127.0.0.1
   varsayılanıyla 403 dönüyordu).

Koşu düzeni: `pnpm build` (e2e ortamıyla) → `pnpm start` 3000'de → `PLAYWRIGHT_SKIP_WEB_SERVER=1`
ile playwright. `E2E_TEST_PASSWORD` `.env`'de **boş**; koşu için yerel rastgele bir değer üretildi
ve yalnız o sürecin ortam değişkeni olarak verildi. `apps/web/.env` **değiştirilmedi**.

Koşu bitince: sunucu kapatıldı, `.next`/`dist` **e2e bayrakları olmadan yeniden derlendi** (aksi
hâlde depoda e2e yardımcı uçları açık bir üretim derlemesi kalırdı), `next-env.d.ts`'in derleme
sırasında değişen iki satırı `git checkout` ile geri alındı. Başlangıçta çalışan bir dev sunucusu
yoktu, o yüzden geri başlatılacak bir şey de yok.

Ara bulgu: `loginAs` yardımcısının 403'ü ilk anda CSRF sanılıp `api-auth.ts`'e
`Sec-Fetch-Site: same-origin` eklendi; ölçüm bunun neden olmadığını gösterince **geri alındı**
(`git checkout`). Depoda o değişiklik yok.

---

## 4. Ölçülen sayılar

| Ölçüm                                    | Değer                                                      | Bütçe      | Durum                              |
| ---------------------------------------- | ---------------------------------------------------------- | ---------- | ---------------------------------- |
| Ana Sayfa'nın açtığı paralel istek       | **6** (summary, recent, live, awaiting, upcoming, friends) | ≤ 6        | ✅                                 |
| `app/recent` SQL sorgusu (limit 4 ve 10) | **5**                                                      | ≤ 5        | ✅ (presence Redis'ten, SQL değil) |
| `voice/live` SQL sorgusu                 | **4**                                                      | ≤ 4        | ✅                                 |
| Kart bileşeni                            | 6/6 `React.memo`                                           | 6          | ✅                                 |
| Geri sayım tiki                          | dakikada 1, sekme gizliyken 0                              | dakikada 1 | ✅                                 |
| Kart başına timer                        | **0** (tek `useMinuteClock` + tek rAF)                     | 0          | ✅                                 |
| Yeni renk / hex / token                  | **0** (amber butonu izin listesinde)                       | 0          | ✅                                 |
| Yeni yüzeylerde arbitrary px             | **0**                                                      | 0          | ✅                                 |
| 1360×920'de dikey kaydırma               | yok                                                        | yok        | ✅                                 |

Kalan arbitrary px: **1190 değer / 120 dosya** (Faz 0 tabanı: 1208 / 120). Bu faz sayıyı
artırmadı; `components/home` ve `app/(main)/home` eslint kuralı altında ve tek bir `[…px]` içermiyor.

### 4.1 Yoğunluk tablosu

`HOME_DENSITY_BY_SCALE` SPEC §8.3 ile birebir ve test iki yönlü denetliyor: tablo SPEC'ten kopyası
ile karşılaştırılıyor, ayrıca her satırın ilgili ucun zod aralığında kaldığı (ör. `recent` min 4 —
`limit=3` istense uç 400 dönerdi) sabitleniyor.

| Kart           | ×1  | ×1.15 | ×1.5 | ×2  |
| -------------- | --- | ----- | ---- | --- |
| Kaldığın yer   | 4   | 5     | 6    | 7   |
| Şu an canlı    | 2   | 2     | 3    | 3   |
| Yanıt bekliyor | 4   | 5     | 6    | 7   |
| Sıradaki       | 3   | 3     | 4    | 5   |
| Arkadaşlar     | 6   | 7     | 8    | 10  |

---

## 5. Güvenlik kontrol listesi

`00-ortak-baglam.md` §5.1 maddeleri. Bu faz **yeni uç yazmadı**; üç mevcut ucun DTO'sunu genişletti,
kontrol listesi o üç değişiklik için işletildi:

- [x] 1. **Kimlik.** Değişen üç uç (`app/recent`, `voice/live`, `friends`) kendi
      `requireApiUserId()` guard'ını koruyor; `route-contract.test.ts` yeşil.
- [x] 2. **Yetki.** `friends.voiceRoom` yalnız kabul edilmiş arkadaşlar için okunuyor (sorgu
      `friendUserIds` ile sınırlı); `recent` görünürlük çözümü değişmedi.
- [x] 3. **Görünürlük redaksiyonu.** `voiceRoom` ve `recent.presence` **aynı** `hiddenUserIds`
      kümesinden geçiyor (invisible ya da presence'ı kapalı → `null` / `OFFLINE`). Testli.
- [x] 4. **Rate limit.** Yeni anahtar yok; üç uç mevcut kayıtlarını kullanıyor.
- [x] 5. **Zod.** Üç yeni alan da şemada; `default(null)` yalnız `friends.voiceRoom`'da (eski
      yanıt uyumluluğu).
- [x] 6. **Dar DTO.** `friendVoiceStateSelect` yalnız dört alan seçiyor; `VoiceState` satırı DTO'ya
      dökülmüyor. `recent` presence yalnız `status` taşıyor, last-seen taşımıyor.
- [x] 7. **Metadata / `actionUrl`.** Değişmedi; `href` alanları hâlâ `toRelativeAppHref` kapısından
      geçiyor ve ekran onları `Link`'e veriyor.
- [ ] 8. **Komut yetki kontrolü.** Uygulanmadı — komut paleti Faz 5'in konusu. Bu fazda arama
      butonu tıklanınca hiçbir şey yapmıyor, hiçbir komut listelenmiyor.

Ek not: dalga formu ve nabız hiçbir kullanıcı verisi taşımıyor; `voice:audio-level:update` yerel
state'te kalıyor ve React Query'ye yazılmıyor (Faz 3'ün testi hâlâ bunu sabitliyor).

---

## 6. Açık kalan / devreden

1. **Parity matrisinin tema ekseni bugünkü hâliyle çalışmıyor.** Kanıt toplarken ölçüldü:
   `applyParityTheme` `localStorage` + kök sınıfı yazıyor ama oturum açık kullanıcıda
   `ThemeSessionSync` hesabın kayıtlı temasını uygulayıp bunu **eziyor** — `theme-light` isteyip
   `theme-dark` alıyorsunuz. 12 kombinasyonun 6'sı (açık tema) bu hâliyle yanlış temayı ölçer.
   → **Faz 8**: ya fikstür kullanıcısının tema tercihi ayarlanmalı ya da yardımcı
   `ThemeSessionSync`'i beklemeli.
2. **44px tıklama hedefi ↔ tasarım çelişkisi.** SPEC §8.2.5 "hiçbir adımda 44px altına düşmez"
   diyor; tasarımın kendi ölçüleri düşüyor: arkadaş kartı 42 (28 avatar + 2×7), durum çipi ~30,
   toggle 42×23, `Tümünü gör` bağlantısı ~12. Açık kombinasyonda `expectMinTapTarget` bilerek
   koşmuyor; kontrol kapalı kombinasyonların gövdesinde duruyor. → **Faz 8 kararı** (ölçüleri mi
   büyüteceğiz, spec maddesini mi daraltacağız).
3. **`e2e/specs/design` yerel olarak yalnız üretim derlemesiyle koşuyor** (§3'teki üç neden).
   Dev sunucusuyla koşabilmek için `pnpm dev`'in `--env-file=.env` sabitinin gevşetilmesi ya da
   ayrı bir `dev:e2e` betiği gerekir. → **CI / araç borcu**, Faz 8.
4. **Arkadaşlar şeridi 100 arkadaşta doyuyor.** `GET /api/v1/friends` `limit` üst sınırı 100;
   başlıktaki "<m> kişiden" 100'den fazla arkadaşı olan hesapta 100 der. Presence'a göre sıralama
   da istemcide. Kullanıcı kararı (§8) bu maliyeti kabul etti. → **Faz 6 / arkadaşlar paketi**.
5. **`events/upcoming.totalCount` hâlâ sınırsız `count`.** Kart bu sayıyı gösterdiği için
   kaldırılmadı; Faz 3'ün §4.2 ölçüm borcu duruyor. → **performans paketi**.
6. **`kind: 'game'` ürüne hiç çıkmıyor.** 05 §4.2 oyun kolu ikonundan söz ediyor ama Faz 3
   sözleşmesi `voice | call` taşıyor. İkon haritası mevcut iki türü tam kapsıyor. → **karar
   bekliyor**: `game` gerçekten gerekiyorsa bir uç onu üretmeli.
7. **Arkadaş durum metninde ek uyumu yok.** `<oda>'da` sabit; "gece-lobisi'nde" olması gerekirdi.
   SPEC'in kendi örneği (`live-room'da`) böyle yazıyor. → **Faz 7** (sözlük ek kurallarının sahibi).
8. **Oda açıklaması arkadaş sayısını değil toplam katılımcıyı sayıyor.** Tasarımın "Selin ve 3
   arkadaşın burada" cümlesi arkadaşlık bilgisini gerektiriyor; DTO taşımıyor, cümle
   "Selin ve 11 kişi burada" oluyor. → **karar bekliyor**, gerekiyorsa DTO'ya arkadaşlık bayrağı.
9. Faz 1/2/3'ten devreden ve bu fazda kapanmayan: linux görsel baseline'ları bayat (Faz 8 / CI),
   `Message.replyToId` indeks borcu (Faz 8), `awaiting.newCount` 24 saatlik yaklaşımı (Faz 6),
   sunucu daveti satırının aktörü (sunucular paketi), admin'de ölçek motoru (admin paketi),
   `app-nav-panel.tsx` sunucu satırındaki çevrimiçi sayısı (`TODO(sunucular)`).

---

## 7. Kullanıcı doğrulaması gereken maddeler

1. `pnpm --filter @wizards/web test` → **3043 test / 0 fail** (Faz 3: 2967).
2. `pnpm typecheck`, `pnpm lint` → 5/5 paket yeşil, uyarı yok.
3. **`prefers-reduced-motion` (elle doğrulandı).** İşletim sisteminde "hareketi azalt"ı aç, `/home`
   aç: "Şu an canlı" başlığındaki yeşil nokta nabız atmıyor, dalga formu düz kalıyor ama
   "<ad> konuşuyor" satırı **kayboluyor değil** — susturulan hareket, gizlenen bilgi değil.
   Ölçülen değer: `.home-pulse-dot`'un `animationName` değeri `home-pulse` → `none`.
   Kanıt: `raporlar/kanit/faz4-reduced-motion-1360.png`.
4. **Bir kart hata verince diğer beşi (elle doğrulandı).** DevTools'ta `/api/v1/app/recent` isteğini
   500'e zorla: yalnız "Kaldığın yer" kartı `Bu kart yüklenemedi` + `Tekrar dene` gösteriyor;
   diğer beş kart normal çiziliyor ve hiçbiri yükleme iskeletinde takılı kalmıyor. Ölçülen:
   altı kartın altısı görünür, biri hata, beşi hatasız, sıfırı yüklemede.
   Kanıt: `raporlar/kanit/faz4-tek-kart-hatasi-1360.png`.
5. `/` adresine git: oturum açıkken `/home`'a, kapalıyken `/login`'e yönlendiriyor.
6. Nav panelinde "Bahsedilmeler" satırının rozeti ve "Etkinlikler" satırının saati artık gerçek
   veriden geliyor. Ağ sekmesinde `/api/v1/app/summary` ve `/api/v1/events/upcoming` **birer kez**
   çağrılıyor — `/home` açıkken bile ikinci istek yok.
7. Ekran görüntüsü: `raporlar/kanit/faz4-anasayfa-theme-dark-1360.png` (1360×920, e2e fikstür
   hesabı — verisi az olduğu için kartların çoğu boş hâlinde). Açık tema kanıtı **alınamadı**,
   nedeni §6.1.
8. `graphify-out/` güncel: 27371 düğüm / 64422 kenar.
9. Depo hijyeni: `apps/web/.next` ve `apps/web/dist` e2e koşusundan sonra **temiz ortamla yeniden
   derlendi**; `next-env.d.ts` geri alındı. `git status`'ta bu fazın dışında bir değişiklik yok.

### Kasten bozma denemeleri (koşuldu ve geri alındı)

- `home-live-card.tsx`'te başlık sayısını `state.data.rooms.length` yap →
  "başlık sayısı sunucudan gelen toplamdır" testi kırmızı.
- `presentation.ts`'te `selectFriendStatusSource`'un DND dalını customStatus'un **altına** al →
  "DND, boşta süresinin ve customStatus'un önündedir" kırmızı.
- `home-presence-card.tsx`'te odak kapalıyken boşluk `div`'ini sil →
  "çubuk gizlenir ama yerine aynı yükseklikte boşluk kalır" kırmızı.
- `queries.ts`'te `toFriendVoiceRoomMap`'in `hiddenUserIds` kontrolünü sil →
  "görünmeyen arkadaşın odasını düşürür" kırmızı.

---

## 8. Sorulan / sorulacak kararlar

| Konu                                                            | Durum                            | Cevap / gerekçe                                                                                                                                                                                                    |
| --------------------------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Faz 3'ün iki `TODO(faz4)` işareti (nav sayacı + etkinlik saati) | **Soruldu, cevap alındı**        | "Bağla (kabuk her rotada sorgu açar)". Bağlandı; ikisi de Ana Sayfa'nın sorgu anahtarını paylaşıyor, `/home` açıkken ek istek çıkmıyor.                                                                            |
| Arkadaş kartındaki sesli oda adı ilk boyada nereden okunsun     | **Soruldu, cevap alındı**        | "Arkadaş ucuna `voiceRoom` alanı ekle". `listFriends` (queries.ts) canlı `VoiceState` okuyor, redaksiyon presence ile aynı kümeden; `friends/service.ts` kopyası bu maliyeti ödemiyor.                             |
| "Şu an canlı" oda açıklaması                                    | **Soruldu, cevap alındı**        | "İstemcide türet, `caption` yedek". `deriveRoomCaption` katılımcılardan cümleyi kuruyor; `caption` (kanal konusu) yalnız katılımcı yokken çiziliyor.                                                               |
| Arkadaşlar şeridinin limiti                                     | **Soruldu, cevap alındı**        | "Mevcut ucu kullan, istemcide filtrele+kes". Sonuçları §6.4'te yazılı.                                                                                                                                             |
| `VoiceLiveResponse.totalCount` eklendi                          | Karar verildi                    | 05 §9 "başlık `rooms.length` olmasın" diyor ama Faz 3 sözleşmesinde toplam yoktu; alan olmadan madde uygulanamıyordu.                                                                                              |
| `HomeRecentItem.presence` eklendi                               | Karar verildi                    | DM satırının presence noktası için sabit "ONLINE" çizmek §5.1.3'ün (görünürlük redaksiyonu) ihlali olurdu. Alan redakte edilmiş presence taşıyor, kanal satırında `null`.                                          |
| `HomeRecentItem.avatarUrl` eklendi                              | Karar verildi                    | DM satırının avatarı **karşı taraf**; son mesajın yazarını kullanmak izleyicinin kendi avatarını DM satırına koyardı (bilinen tuzak). Ek sorgu yok, karşı taraf zaten `name` için çözülüyor.                       |
| `getStaleVoiceHeartbeatCutoff` `voice/types.ts`'e taşındı       | Karar verildi                    | `friends/queries.ts` eşiği okumak zorunda ama `voice/service.ts` livekit + socket runtime çekiyor. Tek tanım korundu, `service.ts` yeniden export ediyor.                                                          |
| Oda kartı bağlantı değil, `Katıl` bağlantı                      | Karar verildi                    | Kartın tamamını bağlantı yapmak `Katıl` butonunu iç içe tıklanabilir öğe hâline getirirdi (§9 tuzağı). Oda başına tek odaklanabilir öğe, `aria-label` oda adını taşıyor.                                           |
| Ölçek adımı okuyucusu ayrı dosyada                              | Karar verildi                    | `use-ui-scale.test.ts` yazıcının **React state tutmadığını** sözleşme olarak sabitliyor; okuyucu state tutmak zorunda. Aynı dosyaya koymak Faz 1'in garantisini bozardı.                                           |
| Açık kombinasyonda 44px kontrolü kapalı                         | **Karar verildi, onay bekliyor** | Tasarımın kendi ölçüleri SPEC §8.2.5'in altında (§6.2). Kontrolü açık bırakmak ekranı ilk günden kırmızıya boyardı; kapatmak yerine **kapsam dışı** bırakıldı ve Faz 8'e taşındı. **Farklı karar verirsen söyle.** |
| `kind: 'game'` ikonu yazılmadı                                  | **Karar verildi, onay bekliyor** | Sözleşme `voice                                                                                                                                                                                                    | call` taşıyor; olmayan bir tür için ölü dal yazmak yerine haritayı mevcut ikiliyle tam tuttum (§6.6). |
