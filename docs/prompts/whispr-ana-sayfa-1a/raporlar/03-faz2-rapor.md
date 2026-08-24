# Faz 2 raporu — Ortak kabuk ve navigasyon paneli

Tarih: 2026-08-19 · Branch: `uat` · Commit: yok (izin bekliyor)

## 1. Yapıldı

### A. Sunucu rayı 74'e hizalandı

- **Sabit yeniden adlandırıldı.** `COMPACT_SERVER_RAIL_WIDTH = 68` → `SERVER_RAIL_WIDTH`
  (`lib/appearance.ts`). "compact" bir varyant değil, tek ray genişliği. Değer artık
  `HOME_METRICS.rail.width`'ten okunuyor — ikinci bir kaynak yok. Aynı yerde
  `COMPACT_SERVER_RAIL_ICON_SIZE` (36) ve `COMPACT_SERVER_RAIL_TOUCH_SIZE` (44)
  `SERVER_RAIL_ICON_SIZE` / `SERVER_RAIL_TOUCH_SIZE`'a dönüştü ve ikisi de 44 oldu: tasarımda ikon
  kutusu **tıklama hedefinin kendisidir**, çevresine pay eklenmiyor. Tüm tüketiciler tarandı
  (`server-rail.tsx`, `server-icon.tsx`, `wizards-shell.tsx`); dördüncü bir tüketici yok.
- **§1 tablosunun 12 satırı:** kolon `gap:4` + padding `14 0 12` (üst/alt güvenli alan `max()` ile
  korundu), marka 44×44 kutuda 40×40 `BrandLogo`, ayırıcı 22×1 `--border/0.9` margin 9, sunucu
  ikonu 44×44 radius 15 baş harf 600/15 display, aktif ikon dolu `--primary` +
  `0 8px 18px -10px`, aktif seçim çubuğu 4.5×34 radius `0 5px 5px 0` (satır sarmalayıcısında,
  dikeyde ortalı), okunmamış badge min-w17 h17 radius 6 `2px --surface-rail` kenar `top:1 right:12`,
  hover `translateY(-2px)` (aktif hariç), "+" 44×44 `--primary/0.16` + `1.5px --primary/0.45`
  ikon 19 stroke 2.4.
- **Ray artık `nav`,** `aria-label` = "Sunucular". Zemin `--surface-rail`, sağ kenar
  `hairline()` `--border/0.4`. Eski `app-rail` sınıfı bırakıldı: `.whispr-channel-shell .app-rail`
  kuralı zemini degradeye çeviriyordu, tasarım düz `--surface-rail` istiyor.
- **Tint sunucu kimliğinden türüyor.** `lib/home/server-identity.ts`: FNV-1a hash → dört token'lık
  havuz (`warning`, `success`, `danger`, `tertiary`). `--primary` havuzda **yok** — dolu primary
  zemin aktif sunucunun işareti, pasif satır onu taşımamalı. Ray ve panel aynı fonksiyonu farklı
  opaklıkla (`rail` 0.14–0.16, `panel` 0.16–0.18) çağırıyor. Sabit renk ataması yazılmadı.
- **Baş harf tek karakter** (`getServerInitial`), ray ve panel aynı fonksiyondan okuyor.

### B. `components/shell/app-nav-panel.tsx` — 272 global navigasyon paneli

- Başlık `16 16 14`, "Whispr" 700/22 display `-0.02em`. **i18n'e taşınmadı** (§2.1).
- 5 nav satırı: padding `10 12`, radius 13, ikon 18 stroke 1.8, `gap:12`, gerçek `Link`.
  Aktif `--primary/0.13` + `--primary` 600; pasif `--text-secondary` 500, hover `--surface-soft` +
  `--foreground`. Ana Sayfa aktifken 6px primary nokta.
- Sayaç 0 ise rozet **hiç render edilmiyor** (testli). Rozetler `aria-label` taşıyor
  ("3 okunmamış mesaj" / "2 okunmamış bahsedilme").
- Ayırıcı `hairline()` `--border/0.5` margin `14 16 12`; "SUNUCULARIM" bölüm etiketi
  (600/10.5 display, `0.15em`, uppercase, muted) + 15px "+" gerçek buton, `aria-label`, mevcut
  `openServerModal({mode:"create"})` akışını açıyor.
- Sunucu listesi `ul`/`li`, her satır `a`: padding `8 10`, radius 12, `gap:11`, 28×28 radius 9
  baş harf ikonu, ad 13.5 (okunmamışı olan 600 + `--foreground`, diğeri 500 + `--text-secondary`),
  son ziyaret edilen satır `--surface-soft/0.6`, hover `--surface-soft/0.7`.
- **"Ya / ya" kuralı saf fonksiyonda:** `selectServerRowTrailing({onlineCount, unreadCount})` →
  `badge` | `online` | `null`. JSX yalnız sonucu çiziyor, iki gösterge aynı satıra asla giremiyor.
- Kullanıcı ayağı `margin-top:auto`, padding `14 10`, üst kenar `hairline()` `--border`, zemin
  `--surface-card`, `gap:9`; **kaydırma alanının dışında** (uzun listede yukarı kaçmıyor).
- `React.memo` + `AppNavPanel.displayName`. Ölçülerin tamamı `HOME_METRICS.panel`'den; JSX'te
  çıplak sayı yok (test bunu `style` niteliklerini tarayarak sabitliyor).

### C. Rota başına 2. sütun

- `lib/home/secondary-column.ts` — saf `selectSecondaryColumn(pathname)`:
  `/home`,`/mentions`,`/events`,`/inbox`,`/discover` (+ alt yolları ve tanınmayan her yol) → `nav`;
  `/channels`, `/channels/@me/*` → `dm`; `/channels/[serverId]/*` **ve** `/servers/[serverId]/*` →
  `channels`. Yüzde kodlu `%40me` ve sondaki `/` testli.
- `WizardsShell` içinde **tek dallanma**: `NavigationPanel`'in 2. sütununda `AppNavPanel` ya da
  `ChannelSidebar`. Mobil drawer, overlay ve modal yollarına dokunulmadı.
- Panel genişliği `pxToRem(HOME_METRICS.panel.width)` = `17rem`, ray `pxToRem(74)` = `4.625rem`.
- `navigate` / `prefetch` / `openSettings` / `openCreateServer` / `onOpenServerContextMenu`
  `useCallback`'e alındı — bunlar olmadan `React.memo` her render'da boşa düşüyordu.

### D. Tek kaynaklı sayaçlar

- `lib/dm/unread.ts` → `sumDMUnreadCount(conversations, viewerId)`; `hooks/use-unread-counters.ts`
  → `useUnreadCounters({conversations, currentUserId})` = `{dm, mentions}`.
- Kabuk (`wizards-shell.tsx:983`) ve DM listesi (`friends-sidebar.tsx:214`) **aynı toplamı ayrı
  ayrı katlıyordu**; ikisi de artık hook'u çağırıyor. Kalıcı cırcır: `unread.test.ts`
  `apps/web/src` altındaki her dosyayı tarayıp `unreadCount` içeren ikinci bir `reduce` bulursa
  kırmızıya dönüyor.
- Sunucu okunmamışı bilerek hook'a **kopyalanmadı**: `server:unread:update` olayının yazdığı
  `workspaceQueryKeys.servers` query verisi zaten tek kaynak (`applyServerUnreadCount`); ikinci bir
  yapı tam da bu §'nin yasakladığı ikinci kaynağı yaratırdı. Ray ve panel `unreadCount` alanını
  doğrudan okuyor.
- Bahsedilme sayacı `TODO(api)` ile 0 → Faz 3 `app/summary`.

### E. Erişilebilirlik

- Panel `nav` + `aria-label="Ana navigasyon"`; ray ayrı `nav` + `aria-label="Sunucular"`.
- Aktif satır `aria-current="page"` (testli, rota değişince taşınıyor).
- Sunucu listesi `ul`/`li` + `aria-labelledby="app-nav-server-section"`, her satır `a`.
- Ayaktaki üç ikon butonu `aria-label` + toggle olanlar `aria-pressed`; ayarlar butonu
  `aria-expanded`.
- Panel içine ok tuşu gezinmesi **eklenmedi**.

### F. Faz 1'in Faz 2'ye devrettiği iki madde

- **§6.3 (durum etiketi ×1.15'te kırpılıyordu):** kullanıcı ayağından `@kullanıcıadı` satırı
  kalktı (tasarımda yok) ve durum satırı tam genişliği alıyor; ayak artık 272'lik panelin içinde,
  dar kanal kenar çubuğunda değil.
- **§6.5 (durum butonu 44px altında):** buton görsel olarak tasarımın boyutunda kalıyor, `after`
  sözde öğesi işaretçi hedefini 44px'e çıkarıyor (Faz 1'de eklenmişti, korundu).

---

## 2. Dokunulan dosyalar

| Dosya                                                  | Yeni / Değişti       | Neden                                                                           |
| ------------------------------------------------------ | -------------------- | ------------------------------------------------------------------------------- |
| `apps/web/src/components/shell/app-nav-panel.tsx`      | Yeni (450)           | 272 global navigasyon paneli (§2)                                               |
| `apps/web/src/components/shell/app-nav-panel.test.tsx` | Yeni (251)           | 19 test — landmark, rozet, a11y, ölçü kaynağı, ayak yeri                        |
| `apps/web/src/lib/home/secondary-column.ts`            | Yeni (49)            | Rota → 2. sütun seçicisi (§3)                                                   |
| `apps/web/src/lib/home/secondary-column.test.ts`       | Yeni (55)            | 8 test — 5 rota kalıbı + kodlama/eğik çizgi/bilinmeyen yol                      |
| `apps/web/src/lib/home/server-identity.ts`             | Yeni (76)            | Kimlikten türeyen tint + baş harf (§1)                                          |
| `apps/web/src/lib/home/server-identity.test.ts`        | Yeni (101)           | 12 test — determinizm, dağılım, token dışı renk yok                             |
| `apps/web/src/lib/dm/unread.ts`                        | Yeni (21)            | DM okunmamış toplamı, tek uygulama (§4)                                         |
| `apps/web/src/lib/dm/unread.test.ts`                   | Yeni (110)           | 5 test — katlama + repo geneli "ikinci hesap yok" cırcırı                       |
| `apps/web/src/hooks/use-unread-counters.ts`            | Yeni (41)            | `{dm, mentions}` — Ana Sayfa ve Mesajlar aynı sayıyı okur                       |
| `apps/web/src/components/shell/server-rail.tsx`        | Değişti (+70/−162)   | 74 hizalaması, `nav`, DM/Keşfet butonları kaldırıldı                            |
| `apps/web/src/components/shell/server-icon.tsx`        | Değişti (+124/−64)   | 44 kutu, radius 15, kimlik tinti, tasarım rozeti, seçim çubuğu                  |
| `apps/web/src/components/shell/channel-sidebar.tsx`    | Değişti (+128/−71)   | Kullanıcı ayağı görsel hizalaması, zil kaldırıldı, ayak sütun içi               |
| `apps/web/src/components/shell/wizards-shell.tsx`      | Değişti (+108/−89)   | Tek dallanma, rem genişlikler, `useCallback`, paylaşımlı ayak satırı kaldırıldı |
| `apps/web/src/components/friends/friends-sidebar.tsx`  | Değişti (+2/−4)      | İkinci DM toplamı hesabı kaldırıldı                                             |
| `apps/web/src/lib/appearance.ts`                       | Değişti (+11/−3)     | `SERVER_RAIL_WIDTH` + ikon/tıklama boyutu, ölçü sözlüğünden                     |
| `apps/web/src/lib/home/metrics.ts`                     | Değişti (+8/−3)      | `pxToEm(px, basePx)`, `panelLogotype.tracking`                                  |
| `apps/web/src/lib/home/metrics.test.ts`                | Değişti (+8)         | `pxToEm` taban parametresi + logotype tracking testi                            |
| `apps/web/src/lib/locale/messages/{tr,en}.ts`          | Değişti (+8/+8)      | `shell.appNav.*` — 8 anahtar                                                    |
| `apps/web/e2e/helpers/navigation.ts`                   | Değişti (−22)        | `clickServerRailDmAndWait` emekli (raydaki DM butonu kalktı)                    |
| `apps/web/e2e/specs/voice/voice.spec.ts`               | Değişti (+3/−2)      | DM yüzeyine rota üzerinden gidiliyor                                            |
| `apps/web/e2e/specs/mobile/mobile-responsive.spec.ts`  | Değişti (+3/−1)      | Zile bağlı iki test `test.skip` (Faz 4'te geri açılacak)                        |
| `apps/web/e2e/specs/attachments/attachments.spec.ts`   | Değişti (+8/−4)      | Zil doğrulaması yorumda park edildi, testin kalanı koşuyor                      |
| `docs/prompts/whispr-ana-sayfa-1a/raporlar/kanit/*`    | Yeni (6 PNG, 663 KB) | Panel açık/koyu, sunucu rotası, mobil drawer ×2, mobil overlay                  |
| `graphify-out/**`                                      | Değişti              | `graphify update .` çıktısı                                                     |

**Satır sonu notu:** `channel-sidebar.tsx`, `server-icon.tsx`, `server-rail.tsx` ve
`wizards-shell.tsx` düzenleme sırasında CRLF'ten LF'e düşmüştü; dördü de CRLF'e geri çevrildi, diff
yalnız gerçek değişikliği gösteriyor.

---

## 3. Kapı çıktıları

| Komut                                         | Sonuç                                                                    |
| --------------------------------------------- | ------------------------------------------------------------------------ |
| `pnpm --filter @wizards/web test`             | ✅ exit 0 — **2874 test / 641 suite, 0 fail**, 33,4 sn (Faz 1: 2824/631) |
| `pnpm typecheck`                              | ✅ exit 0 — 5/5 paket                                                    |
| `pnpm lint`                                   | ✅ exit 0 — 5/5 paket; eslint config testleri 10/10                      |
| `playwright test e2e/specs/design`            | ✅ **4 passed / 12 skipped** (12'si Faz 8'e kadar `test.skip`)           |
| `pnpm --filter @wizards/web e2e:smoke`        | ✅ **16/16 passed**, 51,4 sn                                             |
| `node scripts/quality/count-arbitrary-px.mjs` | ✅ `1190 değer / 120 dosya` (taban 1208/120 → **−18**)                   |
| `graphify update .`                           | ✅ 26865 düğüm, 62810 kenar, 1176 topluluk                               |

Yeni testler: app-nav-panel 19 + server-identity 12 + secondary-column 8 + dm/unread 5 +
metrics 2 = **46**; kalan 4 test Faz 1'den kalan `layout-fonts` genişlemesiyle birlikte sayıldı
(2824 + 50 = 2874 ✓).

### Kapı koşullarının nasıl koşulduğu — dürüst not

`e2e:smoke` **üretim derlemesiyle** koşuldu (`pnpm run build` + `pnpm start`, izole
`wizards_e2e` veritabanı, port 3100) — CI'ın yaptığı şey. Yerelde `playwright.config.ts`
`pnpm dev` başlatıyor ve dev modunda iki engel çıktı, ikisi de **ürün hatası değil**:

1. `nextjs-portal` (Next dev overlay rozeti) ray "+" butonunun üzerine oturup tıklamayı
   yutuyor. Üretim derlemesinde o overlay yok.
2. Dev derleyici worker'ları ("Jest worker encountered 2 child process exceptions") çöküp
   `/channels/@me`'yi 500'e düşürüyor.

Ayrıca `e2e/specs/design` **dev modunda** koşuldu: `/design/whispr-chat` sayfası üretim
derlemesinde bilerek kapalı (`page.tsx:6`, `NEXT_PUBLIC_WHISPR_CHAT_PREVIEW` olmadan 404).
İkisi de fazın kodundan bağımsız, mevcut davranış.

### Kapı dışı ölçümler (gerçek tarayıcı, üretim derlemesi, izole DB)

| Görünüm alanı | `data-ui-scale` | Kök font | Ray genişliği | Panel genişliği | Beklenen ray/panel   |
| ------------- | --------------- | -------- | ------------- | --------------- | -------------------- |
| 1360×920      | `1`             | 16px     | **74,0 px**   | **272,0 px**    | 74 / 272             | ✅  |
| 1920×1080     | `1.15`          | 18px     | 83,3 px       | 306,0 px        | 74×1.125 / 272×1.125 | ✅  |
| 2560×1440     | `1.5`           | 24px     | 111,0 px      | 408,0 px        | 74×1.5 / 272×1.5     | ✅  |

2. sütun dallanması (aynı koşu):

| Rota                               | Panel  | Kanal kenar çubuğu | Kullanıcı ayağı        |
| ---------------------------------- | ------ | ------------------ | ---------------------- |
| `/discover`                        | ✅ var | yok                | panelin içinde         |
| `/channels/@me`                    | yok    | ✅ var             | kenar çubuğunun içinde |
| `/channels/<serverId>/<channelId>` | yok    | ✅ var             | kenar çubuğunun içinde |

Mobil (390×812, gerçek dokunmatik bağlam):

| Yol                                         | Sonuç                                           |
| ------------------------------------------- | ----------------------------------------------- |
| Drawer açılıyor (`mobile-workspace-drawer`) | ✅ ray + kenar çubuğu + kullanıcı ayağı görünür |
| Drawer'da yatay taşma                       | **0 px**                                        |
| `/discover` üzerindeyken drawer             | ✅ nav paneli çiziliyor, taşma 0 px             |
| Ayaktaki ayarlar butonu → hızlı menü        | ✅ açılıyor                                     |
| Hızlı menü → görünüm ayarları overlay'i     | ✅ açılıyor                                     |
| `Esc`                                       | ✅ overlay kapanıyor                            |

Kanıt: `raporlar/kanit/faz2-nav-paneli-theme-{dark,light}-1360.png`,
`faz2-sunucu-kanal-1360.png`, `faz2-mobil-drawer-390.png`, `faz2-mobil-drawer-nav-390.png`,
`faz2-mobil-ayarlar-overlay-390.png`.

### `AppNavPanel` yeniden render kanıtı (React `Profiler`)

Üretim modülleri esbuild ile paketlenip gerçek chromium'da koşturuldu; `useI18n` sayaç
takıldığı için ölçülen şey **bileşen gövdesinin kaç kez koştuğu** (Profiler'ın `onRender`'ı memo
bail-out'unda da tetiklendiği için tek başına kanıt değil).

| Ölçüm                                        | Değer                               |
| -------------------------------------------- | ----------------------------------- |
| Ebeveyn render sayısı                        | **27**                              |
| `Profiler` commit sayısı                     | 27                                  |
| `AppNavPanel` gövdesinin koştuğu sayı        | **2** (mount + `pathname` değişimi) |
| 25 alakasız ebeveyn render'ında gövde koşumu | **0**                               |
| `pathname` değişince `aria-current`          | `/discover` satırına taşındı ✅     |

---

## 4. Ölçülen sayılar

| Ölçüm                                  | Değer         | Bütçe / beklenen | Durum |
| -------------------------------------- | ------------- | ---------------- | ----- |
| Ray genişliği (×1)                     | 74,0 px       | 74               | ✅    |
| Panel genişliği (×1)                   | 272,0 px      | 272              | ✅    |
| Ölçek adımı başına ray/panel           | 3/3 doğru     | 3                | ✅    |
| `selectSecondaryColumn` rota kalıbı    | 8 test        | 5 kalıp          | ✅    |
| 2. sütun dallanması (gerçek tarayıcı)  | 3/3           | 3                | ✅    |
| `AppNavPanel` gövde koşumu / 27 render | 2             | 2                | ✅    |
| Mobil drawer yatay taşma               | 0 px          | 0                | ✅    |
| `e2e:smoke`                            | 16/16         | 16               | ✅    |
| Yeni test                              | 46            | —                | ✅    |
| Toplam web testi                       | 2874 / 0 fail | —                | ✅    |

Kalan arbitrary px: **1190 değer / 120 dosya** (Faz 0 tabanı: 1208 / 120 — **−18**).

---

## 5. Güvenlik kontrol listesi

`00-ortak-baglam.md` §5.1 maddeleri:

- [ ] 1. Kimlik (`requireApiUserId`)
- [ ] 2. Yetki zorlaması
- [ ] 3. Görünürlük redaksiyonu
- [ ] 4. Rate limit kaydı
- [ ] 5. Zod girdi doğrulama
- [ ] 6. Dar DTO (`select`)
- [ ] 7. Metadata / `actionUrl` doğrulama
- [ ] 8. Komut yetki kontrolü

**Uygulanmayan madde varsa nedeni:** Faz 2 uç yazmıyor, sunucudan veri okumuyor, kullanıcı girdisi
almıyor. Eklenen kod ya saf fonksiyon (`selectSecondaryColumn`, `selectServerAccent`,
`getServerInitial`, `sumDMUnreadCount`, `selectServerRowTrailing`) ya sunum bileşeni. Panel yalnız
kabuğun **zaten çektiği** çalışma alanı ve DM verisini gösteriyor; yeni bir alan yüzeye çıkmıyor.
§5.1'in tamamı Faz 3'te (9 yeni uç) tek tek işaretlenecek.

Koşu sırasında yalnız izole `wizards_e2e` veritabanına dokunuldu. Geliştirme veritabanı ve
`apps/web/.env` **değiştirilmedi**.

---

## 6. Açık kalan / devreden

1. **Sunucu satırındaki çevrimiçi sayısı yok.** `WorkspaceServerSummary` böyle bir alan taşımıyor;
   `selectServerRowTrailing` dalı hazır, `onlineCount: null` geçiliyor (`TODO(api)`). → **Faz 3**.
2. **Bahsedilme sayacı 0.** `useUnreadCounters().mentions` sabit 0 (`TODO(api)`). → **Faz 3**.
3. **"Etkinlikler" satırının sağındaki saat çizilmiyor.** Veri yok, uydurulmadı (`TODO(api)`).
   → **Faz 3**.
4. **Odak modu halkası yok.** Ayak halkası presence renginden türüyor; warning halkası
   sabitlenmedi (§7 tuzağı). → **Faz 3**.
5. **Rayın alt "katıl / içe aktar" butonu çizilmedi.** Uygulamada davetle katılma akışı yok
   (`/invite/[code]` rotasının giriş noktası yok); hedefi olmayan buton ölü tıklama olurdu.
   Kullanıcı kararı. → **Sunucular paketi**.
6. **Raydan DM ve Keşfet butonları kalktı** (kullanıcı kararı, tasarım rayında yoklar). Sonucu:
   `/channels/[serverId]/*` üzerindeyken DM'e tek tıkla gidilemiyor — kalan yollar rayın sağ tık
   menüsündeki "Direkt Mesajlar" ve doğrudan rota. Panel satırı ancak nav rotalarında görünüyor.
   → **Mesajlar paketi** (2. sütun DM'e döndüğünde kapanır).
7. **Bildirim zili kullanıcı ayağından kaldırıldı** (kullanıcı kararı). Faz 4 üst çubuğu gelene
   kadar bildirim penceresine erişim yok. Bedeli: `mobile-responsive.spec.ts` içindeki iki test
   `test.skip`, `attachments.spec.ts` içindeki üç satırlık bildirim doğrulaması yorumda park edildi
   (testin kalanı koşuyor). Üçü de `TODO(faz4)` ile işaretli. → **Faz 4**.
8. **`Badge` bileşeni sayaç rozetlerinde kullanılmadı.** `@/components/ui/badge` büyük harfli,
   `0.2em` aralıklı, `rounded-full` bir etiket; tasarımın rozeti min-w 22 / h 20 / radius 7 sayı
   kutusu. Geometrinin tamamını `className` ile ezmek yerine panel içinde `CountBadge` yazıldı.
   Aynı kutu Faz 4'te kartlarda da lazım olacak — ikinci çağıran çıkınca paylaşımlı bileşene
   taşınmalı. → **Faz 4**.
9. **Ray rozeti bahsedilme için de aynı geometriyi kullanıyor** (`@n` metniyle). Tasarım yalnız
   okunmamış rozetini gösteriyor; bahsedilme rozeti mevcut davranıştı, korundu.
10. **`e2e:smoke` yerelde dev modunda koşmuyor** (§3'teki iki dev-modu engeli). CI üretim
    derlemesiyle koştuğu için etkilenmiyor; yerelde koşacaksan üretim derlemesi gerekiyor.
    → **kayıt amaçlı**.
11. **`test.skip` → `test` (12 parity kombinasyonu)** ve `home-command-center` testid'i hâlâ açık.
    → **Faz 4 / Faz 8**.

Faz 1'den devreden ve bu fazda **kapanmayan** maddeler: admin konsolunda ölçek yok (admin paketi),
DM filtre çipi şeridi kesik (Mesajlar paketi), beş vendor fontunda Türkçe eksik (kendi paketi),
görsel baseline'lar bayat (Faz 8 / CI).

---

## 7. Kullanıcı doğrulaması gereken maddeler

1. `pnpm --filter @wizards/web test` çıktısında **2874 test / 0 fail** gör.
2. `node scripts/quality/count-arbitrary-px.mjs` çıktısında `1190 değer / 120 dosya` gör
   (taban 1208 → −18).
3. `raporlar/kanit/faz2-nav-paneli-theme-dark-1360.png` ve `...-theme-light-1360.png` dosyalarını
   aç: ray 74, panel 272, "Whispr" logotype, 5 nav satırı, "SUNUCULARIM" + "+", sunucu listesi,
   alt kullanıcı ayağı (avatar halkası presence renginde, üç ikon butonu).
4. `raporlar/kanit/faz2-mobil-drawer-390.png` ve `faz2-mobil-drawer-nav-390.png`: drawer'ın
   içinde ray + sütun + kullanıcı ayağı; `/discover` üzerindeyken nav paneli.
5. Uygulamayı aç, `/discover` ile `/channels/@me` arasında gidip gel: 2. sütunun panel ↔ DM listesi
   arasında değiştiğini, kullanıcı ayağının **sütunun içinde** kaldığını gör.
6. Pencereyi 1360 → 1920 → 2560 arasında büyüt: rayın 74 → 83 → 111 px, panelin 272 → 306 → 408 px
   büyüdüğünü denetçiden gör.
7. Kasten bozma denemesi (rapor sırasında **gerçekten koşuldu** ve geri alındı):
   `friends-sidebar.tsx` içine ikinci bir `reduce((total, item) => total + item.unreadCount, 0)`
   yaz → `node --import tsx --test src/lib/dm/unread.test.ts` `pass 4 / fail 1` ("is the only place
   that folds unread counts into a total"); geri alınca `pass 5 / fail 0`.
   `app-nav-panel.tsx` içine `w-[272px]` içeren bir literal yaz →
   `npx eslint src/components/shell/app-nav-panel.tsx` **exit 1**, tek sapma "Arbitrary px does not
   scale with the root font size"; geri alınca exit 0.
8. §6.6'yı oku: raydan DM/Keşfet butonlarının kalkması sunucu rotasındayken DM'e tek tıklık yolu
   kapatıyor. Mesajlar paketine bırakmak yerine daha erken kapatmak istersen söyle.
9. Dev sunucun **geri başlatıldı** (`pnpm dev`, port 3000). Kapı koşusu için geçici olarak
   durdurulmuş, izole sunucu 3100'de koşulmuş ve kapatılmıştı. `apps/web/.next` artık bir üretim
   derlemesi taşıyor; dev sunucusu kendi artefaktını yeniden üretiyor, elle temizlik gerekmiyor.

---

## 8. Sorulan / sorulacak kararlar

| Konu                                                      | Durum                     | Cevap / gerekçe                                                                                                                                                                                                                                      |
| --------------------------------------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Kullanıcı ayağının yeri                                   | **Soruldu, cevap alındı** | "Sütunun içine taşı (tüm rotalarda)". `ChannelSidebar` zaten `showUserFooter` destekliyordu ve ayağı kaydırma alanının dışında tutuyor; `true` yapıldı, kabuktaki paylaşımlı ayak satırı kaldırıldı. Ray artık her rotada tam boy.                   |
| Rayın alt katıl butonu                                    | **Soruldu, cevap alındı** | "Bu fazda çizme, borç yaz" — davet akışı yok, hedefi olmayan buton ölü tıklama olurdu (§6.5).                                                                                                                                                        |
| Ayaktaki bildirim zili                                    | **Soruldu, cevap alındı** | "Şimdi kaldır, Faz 4'e kadar zil yok". Bedeli iki e2e testinin `test.skip`'i ve bir doğrulamanın park edilmesi (§6.7).                                                                                                                               |
| Raydaki DM + Keşfet butonları                             | **Soruldu, cevap alındı** | "Kaldır, sadece panelde kalsın". `ServerRail`'in `dmUnreadCount` prop'u tek tüketicisi kalmadığı için kaldırıldı; `clickServerRailDmAndWait` yardımcısı emekli oldu, `voice.spec.ts` rota üzerinden gidiyor (§6.6).                                  |
| Dev sunucusunun durdurulması                              | **Soruldu, cevap alındı** | "Durdur, sonra geri başlat" — kapı koşuldu, sunucu geri başlatıldı.                                                                                                                                                                                  |
| `/mentions` ve `/events` hedefi                           | **Karar verildi**         | **Gerçek rotaya bağlandı** (§2.2'nin birinci seçeneği). En yakın yüzeye bağlamak iki satırı aynı rotaya götürür, `aria-current` yalan söyler ve `isNavRowActive` iki satırı birden aktif gösterirdi; Faz 6 aynı pakette, kısa süre 404 kabul edildi. |
| Sayaç rozeti için `Badge` kullanılmadı                    | Karar verildi             | Geometri uyuşmuyor (§6.8). Faz 4'te ikinci çağıran çıkınca paylaşımlı bileşene taşınmalı.                                                                                                                                                            |
| Rozet metni `--primary-foreground`                        | Karar verildi             | Tasarım `#fff` diyor, hex yasak (§token denetimi). `--primary-foreground` iki temada da `0 0% 100%` — birebir aynı renk, token üzerinden.                                                                                                            |
| `pxToEm` taban parametresi aldı                           | Karar verildi             | SPEC §8.2.3 ikonları `em` istiyor ama 14,5px'lik nav satırında `1.125em` 16,3px çizerdi. `pxToEm(18, 14.5)` tasarım pikselini korur ve ikon satırın metniyle birlikte büyür (arayüz metin boyutu ayarı da dahil).                                    |
| Sunucu tinti dört token'lık havuzdan                      | Karar verildi             | Tasarımın W/O/P/T/G renkleri örnek veri; havuz `warning/success/danger/tertiary`, `--primary` bilerek dışarıda (aktif ikonun işareti). Hash FNV-1a — bağımlılıksız, deterministik, testli.                                                           |
| i18n anahtarları Faz 7'ye bırakılmadı                     | Karar verildi             | §2.1 yalnız "Whispr"ı i18n dışında tutuyor; kalan beş satır ve bölüm etiketi sabit Türkçe yazılsaydı İngilizce yerelde regresyon olurdu. 8 anahtar `tr` + `en`'e eklendi, Türkçe metinler birebir.                                                   |
| Ayaktan `@kullanıcıadı` satırı ve durum ok işareti kalktı | Karar verildi             | Tasarımın ayağı iki satır (ad + durum). Davranış korundu: durum satırı hâlâ menüyü açan gerçek buton (`aria-haspopup`, `aria-expanded`). Faz 1 §6.3'ün kırpma sapmasını da bu kapattı.                                                               |
| Ray listesi `flex: 0 1 auto`                              | Karar verildi             | `flex-1` verilince "+" butonu tasarımdaki yerinden rayın en altına düşüyordu (ve dev overlay'iyle çakışıyordu). Şimdi liste doğal yükseklikte duruyor, yer kalmayınca küçülüp kaydırıyor.                                                            |
