# Ş4 — Kanal kenar çubuğu 252 (Dalga 2)

> Kaynak: `docs/prompts/whispr-sunucu/05-dalga2-s4-kanal-kenar-cubugu.md`.
> Otorite: `design_handoff/design_handoff_sunucu/design/Sunucu-referans.html` inline `style` >
> `SPEC-SUNUCU.md` §2 > `PROMPT.md`. Bağımlılık: Ş0 (sözlük + `channel-visibility`).
> Dal: `uat`. Tarih: 2026-08-25.

---

## 1. Ne yapıldı

### 1.1 Yeni dosyalar

| Dosya                                                            | Satır | İş                                                                       |
| ---------------------------------------------------------------- | ----- | ------------------------------------------------------------------------ |
| `apps/web/src/components/shell/server-menu.tsx`                  | 272   | §2.2 — beş satırlık sunucu menüsü + yetki kapısı (`buildServerMenuRows`) |
| `apps/web/src/components/shell/channel-search-popover.tsx`       | 335   | §2.3 — `Kanal ara` tetikleyicisi + `top:114` popover'ı                   |
| `apps/web/src/components/shell/connected-voice-strip.tsx`        | 163   | §2.5 — bağlı ses şeridi + `ConnectedVoiceStripLive`                      |
| `apps/web/src/components/shell/voice-activity.tsx`               | 66    | Canlı oda aboneliğini yalnız ses satırına bağlayan ara katman            |
| `apps/web/src/components/shell/server-sidebar-parts.test.tsx`    | 507   | 26 test — menü · arama · şerit · kanal satırı                            |
| `apps/web/src/components/shell/channel-sidebar-collapse.test.ts` | 122   | 10 test — daraltma kuralı + sınır sözleşmesi                             |

**Toplam yeni: 1465 satır.**

### 1.2 Düzenlenen dosyalar

| Dosya                                                      | Ne değişti                                                                                                                                                                     |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/web/src/components/shell/channel-sidebar.tsx` (2256) | Sunucu başlığı (§2.1) · menü/arama katman durumu (K11) · liste boşlukları (§2.4) · daraltma filtresi · bağlı ses şeridi · eski inline `input` ve üç düğmelik ızgara kaldırıldı |
| `apps/web/src/components/shell/channel-item.tsx` (419)     | Satır ve katılımcı satırı SPEC ölçüleriyle yeniden çizildi; ölçü tamamı `SERVER_METRICS.sidebar`'dan                                                                           |
| `apps/web/src/components/shell/wizards-shell.tsx`          | `onLeaveServer` bağlandı (`requestLeaveActiveServer` → mevcut onay penceresi + `leaveServerRequest`)                                                                           |
| `apps/web/src/lib/appearance.ts`                           | `DEFAULT/MIN/MAX_CHANNEL_SIDEBAR_WIDTH` 244 → `SERVER_METRICS.layout.sidebarWidth` (252)                                                                                       |
| `apps/web/src/lib/locale/messages/{tr,en}.ts`              | 15 yeni anahtar (`server.menu.label`, `server.sidebar.*`, `voice.sidebar.*`), iki dilde eşit                                                                                   |
| `apps/web/e2e/specs/smoke/server.spec.ts`                  | Kanal oluşturma iki hızlı düğmeden **sunucu menüsü + tür çipi** yoluna alındı                                                                                                  |
| `apps/web/e2e/specs/design/server-parity.spec.ts`          | Ş4 satırı `test.fixme`'den çıkarıldı: 4 çözünürlük × 2 tema + iki davranış testi                                                                                               |

### 1.3 Korunan kablolama (şeridin sınırı)

`channel-sidebar-collapse.test.ts`'in son bloğu bunları **kilitliyor**:

- dnd-kit: `DndContext` · `SortableContext` · `useSortable` · `ChannelDropZone` ·
  `reorderChannelsRequest` · `reorderCategoriesRequest` — hiçbiri değişmedi.
- `collapsedCategories` store'u ve `toggleCategoryCollapse` — okuma/yazma aynı.
- `UserProfileFooter` gövdesine dokunulmadı; yalnız üstüne ses şeridi eklendi.
- `useVoiceStates(serverId)` aynı sorgu, aynı soket kablolaması.

---

## 2. SPEC'ten sapmalar

### 2.1 Satırda korunan tek ürün gerçeği

SPEC §2.4'ün kanal satırı **yalnız** kilit · okunmamış · katılımcı sayacı çiziyor. Geriye tek
ekleme kaldı:

- **Salt-okunur göstergesi** (`Eye`, kilit ikonuyla aynı 12 px). SPEC'te yok, ama "bu kanala
  yazamazsın" bilgisini üründe başka hiçbir yüzey taşımıyor.

> İlk turda satırda duran **kalem/çöp kaplaması** ve **sürükleme tutamağı** §6'daki sadakat
> turunda kaldırıldı; referansın satırında ikisi de yok.

### 2.2 Katılımcı listesi her ses kanalının altında

Referans yalnız bağlı olunan kanalın altını dolduruyor (`users: isVoice && s.view === 'voice'`),
çünkü tek bir ekran durumu gösteriyor. Ürün bunu **canlı veriyle** her ses kanalı için çiziyor ve
`e2e/specs/voice/voice.spec.ts` `voice-sidebar-participant-*` satırlarına bağlı. Davranış korundu.

### 2.3 `isSpeaking` / `isMuted` yalnız bağlı odada gerçek

`VoiceChannelStateDTO` **konuşma ve mikrofon durumu taşımıyor** — yalnız `isDeafened` ve
`isScreenSharing` var. Konuşma halkası ve susturulmuş ikonu bu yüzden LiveKit odasından
(`useVoiceParticipants`) geliyor ve **yalnız kullanıcının bağlı olduğu kanalda** doğru. Diğer
kanallarda satır `isDeafened`'a düşüyor (sağır olan aynı zamanda susturulmuştur) ve halka
çizilmiyor. Sunucu genelinde konuşma göstergesi istenirse `voice:state:update` yükü genişlemeli
(TODO(api) #2).

### 2.4 `SEN` çipi yerine renk

Referans kendi satırını ayrı bir çiple değil `nameFg: H('primary')` ile ayırıyor
(`A('Berk Eren', 'BE', 'success', { nameFg: H('primary') })`). Uygulandı; eski
`voice.sidebar.you` anahtarı sözlükte **kullanılmadan kaldı** — Ş14'ün i18n denetimi silmeli.

### 2.5 `z-index`: sözlük mü, katman yığını mı

Menü `30`, arama popover'ı `28` — ikisi de `SERVER_METRICS.sidebar`'dan, yani referans HTML'den.
K11'in `60/70/80` merdiveni **kabuk düzeyindeki** kaplamalar için; kenar çubuğunun iki açılırı
`aside`'ın kendi yığınlama bağlamında yaşıyor (`position: relative`). `useLayerStack` yine de
kullanılıyor ama `z-index` için değil: **`Esc` sırası** ve "aynı anda tek açılır" kuralı için.
İkinci kural bir yan etki değil, tanım gereği: menü ve popover **tek** bir state paylaşıyor
(`sidebarOverlay: "menu" | "search" | null`).

### 2.6 Kenar çubuğu genişliği 244 → 252

`lib/appearance.ts` üç sabiti de 244'te tutuyordu (`MIN === MAX`, yani ayarlanabilir bir alan
değil, sabit kolon). Üçü de `SERVER_METRICS.layout.sidebarWidth`'e bağlandı. `appearance-settings-bridge`
testi değeri geçirgen okuduğu için etkilenmedi.

### 2.7 Daraltılmış kategoride sürükleme kapalı

Sıralama yükü listenin **tamamından** türetiliyor (`buildReorderPayload`); süzülmüş üç satırdan
üretilen bir yük geri kalan kanalların `position` değerini sıfırlardı. Daraltılmış hâl bir
görünüm kısayolu, düzenleme kipi değil — satırlar `SortableChannelRow` yerine düz satır olarak
çiziliyor. Kural `channel-sidebar-collapse.test.ts` ile kilitli.

### 2.8 `Sunucu profili` satırının yeri

Eski başlık menüsündeydi; SPEC'in beş satırında yok. `/servers/[serverId]/about` rotası
kaybolmasın diye boş alanın sağ tık menüsüne taşındı.

### 2.9 Gizli kanal filtresi yazılmadı — sunucu zaten süzüyor

00 §6 "gizli kanal normal üyeye hiç render edilmez" diyor. `withVisibleChannelAccess`
(`lib/workspace/server-query-helpers.ts:322`) `VIEW_CHANNEL` yoksa kanalı **`null` döndürüyor**;
kanal istemciye hiç ulaşmıyor. `canAccess: false` yalnız **ses** kanalında ve yalnız
`CONNECT_VOICE` reddinde doğuyor — SPEC'in kilit ikonu tam olarak o durum. İkinci bir istemci
filtresi yazmak, sunucunun kapısını istemcide tekrar etmek olurdu.

---

## 3. `⌘K` çakışması (şeridin zorunlu bulgusu)

**Çip yalnız görsel. Hiçbir `keydown` bağlanmadı.**

Kısayol üründe **iki** yerde dolu:

| Tüketici      | Dosya                                                                                                               | Koşul                                                  |
| ------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Komut paleti  | `components/command/command-palette-provider.tsx:72` → `lib/home/command-palette.ts:360` `isCommandPaletteShortcut` | `(meta \|\| ctrl) + k`, global `keydown`               |
| Mesaj araması | `components/chat/chat-area.tsx:592`                                                                                 | `(ctrl \|\| meta) && (k \|\| f)`, metin kanalı açıkken |

Şerit sözleşmesi §3 "mevcut komut paleti kısayolunu ezmez" diyor. Metin kanalındayken `⌘K`
bugün **iki** dinleyiciye birden gidiyor (palet + mesaj araması); üçüncü bir dinleyici eklemek
kullanıcıya üç farklı yüzey açardı. Bu yüzden:

- `channel-search-popover.tsx` içinde `metaKey`/`ctrlKey` **geçmiyor** — test bunu kilitliyor
  (`channel-sidebar-collapse.test.ts` → "`⌘K` gerçek bir kısayola bağlanmadı").
- Popover yalnız tetikleyici düğmeye tıklayarak (ya da klavyeyle odaklanıp `Enter`) açılıyor.

**Karar bekleyen madde:** kanal aramasına gerçek bir kısayol isteniyorsa üç seçenek var —
(a) palet ve mesaj araması ayrıştırılıp `⌘K` yalnız palete bırakılır, kanal aramasına
`⌘/` gibi boş bir tuş verilir; (b) sunucu rotasında `⌘K` kanal aramasına devredilir ve palet
`⌘⇧K`'ye taşınır; (c) çip görsel kalır. Ş14'ün a11y/kısayol denetimi karar vermeli.

---

## 4. TODO(api)

| #   | Ne eksik                                                                                                                                                                                                                                                                                    | Kimde                   |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| 1   | **Gecikme (`32 ms`) yok.** LiveKit odasının RTT'sini okuyan hiçbir yüzey yazılmamış (`getStats` / `roundTripTime` deposun hiçbir yerinde geçmiyor). `ConnectedVoiceStrip` `latencyMs={null}` alıyor ve alt satır yalnız sunucu adını yazıyor. Sözleşme hazır: değer gelince tek prop dolar. | Ş7 (ses yüzeyi)         |
| 2   | **Sunucu genelinde konuşma/susturulma durumu yok.** `VoiceChannelStateDTO` yalnız `isDeafened` + `isScreenSharing` taşıyor; bağlı olunmayan kanalda konuşma halkası çizilemiyor (§2.3).                                                                                                     | Ş7 / soket sözleşmesi   |
| 3   | **Çevrimiçi sayısı sayfalı listeden türüyor.** `6 çevrimiçi · 24 üye` satırının ilk yarısı `detail.members` içinde **yüklenmiş** üyelerden sayılıyor; `memberPage.nextCursor` doluyken eksik kalır. `WorkspaceServerSummary` bir `onlineCount` taşımıyor.                                   | Ş5 / Ş2 (üye sayaçları) |
| 4   | `shell.channelSidebar.searchLabel` ve `shell.channelSidebar.searchPlaceholder` inline kutuyla birlikte **kullanımsız** kaldı; `voice.sidebar.you` de öyle.                                                                                                                                  | Ş14 i18n denetimi       |

---

## 5. Doğrulama çıktısı

| Komut                                                                                     | Sonuç                                                   |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `pnpm --filter @wizards/web typecheck`                                                    | ✅ temiz                                                |
| `pnpm --filter @wizards/web lint`                                                         | ✅ 10 config testi + `eslint .` temiz                   |
| `node --import tsx --test src/components/shell/server-sidebar-parts.test.tsx`             | ✅ **26/26**                                            |
| `node --import tsx --test src/components/shell/channel-sidebar-collapse.test.ts`          | ✅ **10/10**                                            |
| `node --import tsx --test src/lib/servers/parity.test.ts src/lib/locale/messages.test.ts` | ✅ 47/47                                                |
| `pnpm --filter @wizards/web test`                                                         | ✅ **7019 test**, 0 fail, 3 skip (sadakat turu sonrası) |

### 5.1 Tam suite

```
ℹ tests 7019
ℹ suites 1637
ℹ pass 7016
ℹ fail 0
ℹ cancelled 0
ℹ skipped 3
```

Ş0'ın raporundaki iki "Ş0 dışı kırık" (`settings-a11y.test.tsx`, `functional-coverage.test.ts`)
bu koşuda **yeşil** — Ayarlar paketinin sahibi aradaki zamanda kapatmış. Ş4 hiçbir yeni kırık
açmadı.

> Tek başına koşturulduğunda `src/components/shell/app-nav-panel.test.tsx`
> `DATABASE_URL is required for the PostgreSQL Prisma adapter.` ile düşüyor; ortam değişkenini
> yükleyen `scripts/run-node-tests.mjs` altında geçiyor. Ş4 ile ilgisi yok, kapı komutu yeşil.

### 5.2 Koşulamayanlar

- **E2E.** `e2e/specs/design/server-parity.spec.ts` (Ş4 satırı) ve güncellenen
  `e2e/specs/smoke/server.spec.ts` bu ortamda koşturulamadı: Playwright çalışan bir web sunucusu,
  tohumlanmış e2e veritabanı ve oturum gerektiriyor. İki dosya da mevcut yardımcıları
  (`getE2EServerRoute`, `gotoAppRoute`, `applyParityTheme`, `expectNoOverflow`) kullanıyor;
  ilk yeşil koşu Ş14'ün kapanış adımında doğrulanmalı.
- **Tarayıcı önizlemesi.** Yüzey `/channels/[serverId]/[channelId]` altında ve oturum istiyor;
  görsel doğrulama parity matrisinin ekran görüntülerine bırakıldı
  (`test-results/parity/server-sidebar-*.png`).

---

## 6. Sonraki şerit için notlar

1. **`channel-item.tsx` artık yalnız kenar çubuğunun dosyası.** Tek tüketicisi
   `channel-sidebar.tsx`; başka bir yüzey kullanacaksa `speakingUserIds`/`mutedUserIds`
   sözleşmesini de taşımak zorunda (kümeler dışarıdan gelir, bileşen odaya abone olmaz).
2. **Ses seviyesi aboneliği `voice-activity.tsx`'te izole.** `useVoiceParticipants` her ≈100 ms'de
   render tetikliyor; kancayı kenar çubuğunun gövdesinde çağıran bir şerit bütün kanal listesini
   saniyede on kez yeniden çizer. Kümeler **imzadan** (sıralı kimlik listesi) üretiliyor ki
   `React.memo` sarılı satır anlamsızlaşmasın.
3. **Kenar çubuğunun iki hızlı düğmesi kalktı** (`create-text-channel-button`,
   `create-voice-channel-button`). Kanal oluşturmayı süren her test artık
   `server-header-button` → `server-menu-createChannel` → `channel-kind-{text|voice}` yolunu
   izlemeli; `server.spec.ts` bunun için tek yardımcı (`openCreateChannelWizard`) taşıyor.
4. **`sidebarOverlay` tek durum.** Kenar çubuğuna üçüncü bir açılır ekleyecek şerit onu bu
   birleşime eklemeli; ayrı bir boolean K11'in "tek açılır" kuralını sessizce kırar.
5. **`onLeaveServer` opsiyonel prop.** Kenar çubuğu kendi onayını açmıyor; kabuk aynı
   `leaveServerCandidate` state'ini doldurup rayın sağ tık menüsüyle **aynı** pencereyi açıyor.
   İkinci bir ayrılma yolu iki ayrı onay metni demekti.
6. **Sunucu menüsünün kapısı `isAdmin` değil, yetki bitleri.** `resolveViewerPermissions` +
   `viewerCan("MANAGE_CHANNELS" | "MANAGE_SERVER")`. `canManage` (`detail.server.isAdmin`) hâlâ
   dnd/kategori eylemleri için kullanılıyor — iki kapı iki farklı soru soruyor.
7. **`Davet bağlantısı` ipucu Ş9'un varsayılanından okunuyor** (`SERVER_INVITE_DEFAULT_DURATION_ID`
   → `server.modal.invite.duration.7d`). Ş9 varsayılanı değiştirirse ipucu kendiliğinden takip
   eder; menüde ikinci bir "7 gün" yazılmadı.

---

## 6. Sadakat turu — referansla birebir karşılaştırma

İlk tur SPEC §2'nin **ölçülerini** yerine oturttu ama referans HTML'in **kabuğunu** değil: kolon
kendi zeminini çizmiyordu, satırlarda referansta olmayan üç kontrol duruyordu. Referansın
kenar çubuğu tamamı (`Sunucu-referans.html`, 105 satırlık blok) satır satır çıkarılıp
uygulamayla karşılaştırıldı; bulunan yedi fark kapatıldı.

| #   | Referans                                                | Önceki hâl                                              | Şimdi                                                    |
| --- | ------------------------------------------------------- | ------------------------------------------------------- | -------------------------------------------------------- |
| 1   | Kolon `background:hsl(var(--surface-panel))`            | `aside` degrade (`surface-card/.96 → surface-soft/.32`) | `SIDEBAR_SURFACE_STYLE` → düz `surface-panel`            |
| 2   | Kolon `border-right:1px solid hsl(var(--border)/.4)`    | Kenarı **kabuk sütunu** çiziyordu (`/0.48`)             | `aside` çiziyor, sözlükten (`layout.sidebarBorderAlpha`) |
| 3   | —                                                       | Kabuk sütunu ayrıca **ikinci** bir degrade boyuyordu    | Sütun şeffaf; yüzeyin tek sahibi `aside`                 |
| 4   | Kategori başlığında yalnız caret · ad · `N gizli` · `+` | Ek olarak tutamak · ok çifti · `···`                    | Üçü de kaldırıldı                                        |
| 5   | `+` ikonu `stroke-width:2.4`                            | lucide varsayılanı (2)                                  | `sidebar.categoryAddIconStrokeWidth`                     |
| 6   | Kanal satırında yönetici düğmesi yok                    | Hover'da kalem · çöp kaplaması                          | Sağ tık menüsü (`channel-context-edit` / `-delete`)      |
| 7   | Kanal satırında tutamak yok                             | Sol kenarda hover tutamağı                              | Satırın **kendisi** sürükleniyor (`dragHandleProps`)     |

### 6.1 Sürükleme nereye taşındı

dnd-kit kablolaması **değişmedi**; yalnız `attributes`/`listeners`'ın bağlandığı düğüm değişti:

- Kanal satırı: `SortableChannelRow` demeti `ChannelItem`'ın `dragHandleProps`'una veriyor,
  o da satırın kendi `button`'una yayıyor.
- Kategori başlığı: demet `categoryDragProps` ile başlığın toggle düğmesine gidiyor.

`PointerSensor` zaten 4 px eşiğinde (`activationConstraint.distance: 4`), bu yüzden tıklama ile
sürükleme birbirine karışmıyor: 4 px'in altındaki hareket tıklamadır, üstü sürüklemedir.

### 6.2 Klavye alternatifi nerede

Kenar çubuğundan kalkan ok çifti bir a11y gerilemesi **değil**: sıralamanın klavye yolu
`lib/servers/channel-ordering.ts`'in kendi başlığında yazdığı gibi sunucu ayarlarının
**Kanallar ve Kategoriler** bölümünde (Ş12) yaşıyor ve aynı uçlara aynı yükü yazıyor.
Kenar çubuğundaki kopya, referansta olmayan ikinci bir yoldu.

`showCategoryMoveControls` tercihi ve onu açan "Sidebar kontrolleri" paneli tek tüketicisi
kalmayınca `lib/store.ts`'ten de **silindi** (alan · aksiyon · sanitizer · persist kaydı).
Ölü kalmış bir tercih, ilk okuyanın "bu ne işe yarıyor" diye aradığı borçtur.

### 6.3 Ölçüm — gerçek DOM, tahmin değil

Kimlik doğrulaması gereken `/channels/...` rotası bu ortamda açılamıyor (E2E kipi kapalı,
gerçek kullanıcı parolası yok — ve parola girmek bu oturumun işi değil). Bunun yerine gerçek
`ChannelSidebar` ağacı sahte veriyle statik HTML'e render edilip tarayıcıda
`getComputedStyle` ile ölçüldü:

| Ölçü                           | Beklenen (referans)                    | Ölçülen                                   |
| ------------------------------ | -------------------------------------- | ----------------------------------------- |
| Kolon zemini                   | `hsl(220 29% 96%)`                     | `rgb(242, 244, 248)` ✅                   |
| Kolon sağ kenarı               | `border/.4`                            | `rgba(206, 211, 222, 0.4)` ✅             |
| Başlık                         | `14px 13px`, `gap 10`, alt kenar `.45` | `14px 13px` · `10px` · `.45` ✅           |
| Arama tetikleyici              | `8px 10px`, `r12`, kap `10px 9px 8px`  | birebir ✅                                |
| Liste                          | `padding 0 9px 8px`, `min-height 0`    | birebir ✅                                |
| Kategori kabı                  | `margin-top 9`                         | `9px` ✅                                  |
| Kategori başlığı               | `5px 5px 5px 4px`, `gap 5`             | birebir ✅                                |
| Kategori adı                   | `600 10.5px .13em uppercase`           | `10.5px` · `600` · `1.365px` (= .13em) ✅ |
| `+` düğmesi                    | `20×20 r6`                             | birebir ✅                                |
| Kanal satırı                   | `7px 9px`, `r11`, `gap 8`              | birebir ✅                                |
| Kanal adı                      | `500 13.5px`                           | birebir ✅                                |
| Aktif satır                    | `primary/.14`                          | `rgba(89, 102, 243, 0.14)` ✅             |
| Aktif şerit                    | `left:-9px`, `3.5×18`, primary         | birebir ✅                                |
| Okunmamış rozeti               | `min-width 19`, `h 18`, `r6`, danger   | birebir ✅                                |
| Tutamak · `···` · kalem sayısı | 0 · 0 · 0                              | 0 · 0 · 0 ✅                              |

Tek bilinçli fark: başlık ikonunun rengi. Referans `hsl(var(--primary))` yazıyor çünkü o
sunucunun kısa adı primary'ye düşüyor; üründe renk `Server.iconColor`'dan, yoksa kısa addan
**deterministik** türüyor (K2, `Sunucu.dc.html:2205`'in aynı formülü). Ölçümdeki `MT` kısa adı
`accent-2`'ye düşüyor — formül doğru çalıştığı için.

### 6.4 Bu turun testleri

`channel-sidebar-collapse.test.ts` altı yeni kapı taşıyor: kolonun zemini, kabuk sütununun
zemin çizmediği, kategori başlığında tutamak/ok/`···` bulunmadığı, `+` kalınlığı, satırda
kaplama olmadığı, sürükleme demetinin satıra geçtiği. `server-sidebar-parts.test.tsx` iki yeni
test aldı (kaplama yok · tutamak yok, demet satıra geçiyor).

**Toplam: 44 test** (önce 36), tam suite **7019 test 0 fail**.
