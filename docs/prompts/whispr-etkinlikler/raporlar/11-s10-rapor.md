# Dalga 3 · Ş10 — Eski ekranın kaldırılması, parity kapısı, QA, kabul · rapor

**Tarih:** 2026-08-21 · **Dal:** `uat` · **Commit:** yok (kural gereği) · **Son şerit.**
**Kapsam:** `11-dalga3-s10-temizlik-parity-qa.md` §1–§6 ve iki kabul listesinin tamamı.

Bu şerit yeni bir yüzey çizmedi. Eski `/events` ekranını ve iki ucunu sildi, ekranı **çalışır
hâlde** ölçtü (11 durum, 6 çözünürlük × 2 tema, dokuz senaryoluk e2e turu) ve ölçüm sırasında
bulduğu dört gerçek kusuru düzeltti.

---

## 0. Ön koşulun gerçeği — **Ş9 koşmadı**

Ş10'un ön koşulu "Ş9 yeşil". Çalışma ağacında Ş9'un (`10-dalga3-s9-a11y-olcek-kirilim.md`)
sahiplendiği dosyaların **hiçbiri yok**:

```
apps/web/src/lib/events/keyboard.ts               yok
apps/web/src/hooks/use-event-grid-columns.ts      yok
apps/web/src/lib/events/token-audit.test.ts       yok
apps/web/src/lib/events/scale.test.ts             yok
```

`raporlar/` altında da Ş9 raporu yok (son rapor `09-s8-rapor.md`). Deponun **kökünde** duran
`raporlar/10-s9-rapor.md` Etkinlikler'in değil, **Keşfet** paketinin Ş9 raporu ve yanlış klasöre
yazılmış (bkz. §12.8).

Sonuç: Ş10 kendi işini eksiksiz yaptı, ama paketin **klavye gezinmesi (`←/→/↑/↓`, `Home/End`,
`K`), roving tabindex, focus dönüş merdiveni ve üç küçük-ekran kırılımı (`<1100` / `<960` /
`<720`) hâlâ yazılmadı.** Bunlar Ş10'un kabul listesinde yok (PROMPT'un kabul kriterleri arasında
klavye ızgara gezinmesi geçmiyor, "Uyulacak kurallar §5"te geçiyor) ama paketin tamamlanmış
sayılması için Ş9'un koşması gerekiyor. Ölçüm matrisi ≥1360 px'te koşuyor; üç kırılım eşiği o
matrisin altında kaldığı için bu rapor onlar hakkında bir şey iddia etmiyor.

---

## 1. Temizlik — silme sırası: rota → bileşen → uç → sözlük

Her adımdan sonra `pnpm --filter @wizards/web typecheck` koşuldu; ara adımlarda çıkan tek hata
`.next/types/validator.ts` içindeki **üretilmiş** rota doğrulayıcısıydı (silinen iki rotaya
`import` yazıyordu) ve o dosya `.gitignore` altında bir derleme artefaktı — iki blok elle
budandı, bir sonraki `next build` onu zaten yeniden üretti.

### 1.1 Rota

`app/(main)/events/page.tsx` Ş5'te zaten `EventsPage`'e bağlanmıştı; bu şerit rotaya
dokunmadı. Rotaya **giden** tek eski bağlantı düzeltildi:

| Dosya                                        | Değişiklik                                                        |
| -------------------------------------------- | ----------------------------------------------------------------- |
| `lib/home/href.ts`                           | `HOME_EVENTS_CALENDAR_HREF` (`/events?view=calendar`) **silindi** |
| `components/home/home-up-next-card.tsx`      | amber `Takvim` butonu `HOME_EVENTS_HREF` (`/events`)              |
| `components/home/home-interactions.test.tsx` | literal href beklentisi güncellendi                               |

### 1.2 Bileşenler — silindi

```
apps/web/src/components/screens/events-screen.tsx
apps/web/src/components/screens/event-list-row.tsx
apps/web/src/components/screens/events-calendar-view.tsx
```

`components/screens/side-screens.test.tsx` → `etkinlik satırı` süiti (3 test) ve
`EventListRow` içe aktarımı silindi. Aynı dosyadaki **ortak** `ScreenSegmented` testi durdu;
tek üretim tüketicisi silinen ekran olduğu için örnek etiketleri nötre çevrildi
(`Liste/Izgara`, `view-mode`) — ilkelin kendisi `screen-chips.tsx`'te ve `ScreenFilterChips`
gelen kutusunda hâlâ kullanılıyor.

### 1.3 Uçlar — silindi

```
apps/web/src/app/api/v1/events/list/{route.ts,route-logic.ts,route-logic.test.ts}
apps/web/src/app/api/v1/events/calendar/{route.ts,route-logic.ts,route-logic.test.ts}
```

Kalan `api/v1/events` ağacı: `route.ts` (GET akış + POST oluştur), `[eventId]/`,
`[eventId]/rsvp/`, `[eventId]/reminder/`, `[eventId]/calendar.ics/`, `upcoming/`.

Uçların iki tüketicisi de taşındı:

| Dosya                                  | Değişiklik                                                                                                          |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `lib/home/client.ts`                   | `fetchHomeEventsList`, `fetchHomeEventCalendar`, `homeQueryKeys.eventsList`, `homeQueryKeys.calendar` silindi       |
| `e2e/specs/api/home-endpoints.spec.ts` | `events/calendar` iki yerde `GET /api/v1/events` ile değişti (401 turu ve "ekranların hiç göndermediği sorgu" turu) |

### 1.4 Servis ve tip katmanı

| Dosya                        | Ne kaldı / ne gitti                                                                                                                                                                                                                                                                                              |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/home/events-service.ts` | **`getHomeUpcomingEvents` kaldı** (Ana Sayfa "Sıradaki" kartı). `listHomeEvents`, `getHomeEventCalendar`, `listTopAttendees`, `encodeEventCursor`/`decodeEventCursor` silindi. 332 → 142 satır.                                                                                                                  |
| `lib/home/side-screens.ts`   | **`parseInboxSource` kaldı.** `EVENTS_VIEW_PARAM`, `EventsView`, görünüm ayrıştırıcısı, ay ızgarası (`buildMonthGrid`/`monthRangeIso`/`shiftMonth`), takvim klavye gezinmesi, `selectInitialCalendarDay`, `toCalendarDate`, gün gruplayıcısı silindi. 259 → 22 satır.                                            |
| `lib/home/types.ts`          | `EventsListResponse(Schema)`, `EventsListQuery(Schema)`, `HomeCalendarEvent(Schema)`, `HomeCalendarDaySchema`, `EventsCalendarResponse(Schema)`, `EVENTS_CALENDAR_MAX_DAYS`, `EventsCalendarQuery(Schema)` silindi. **Aynı depoda iki farklı `EventsListResponse` kalmadı**; akışın tek şeması `@wizards/types`. |
| `lib/home/optimistic.ts`     | `applyEventInterestToList` silindi (tek çağrı yeri kalktı). `applyEventInterest` kaldı.                                                                                                                                                                                                                          |
| `lib/home/mutations.ts`      | `createEventInterestMutation` **tek önbellek** yamalıyor; `listKey` parametresi ve `EventsListPages` tipi silindi.                                                                                                                                                                                               |
| `hooks/use-home-actions.ts`  | `eventsListKey` girdisi ve `QueryKey` içe aktarımı kalktı; `remind` eylemi **kaldı**.                                                                                                                                                                                                                            |

### 1.5 Sözlük anahtarları — önce grep, sonra silme

Prompt'un uyarısı doğrulandı:

```
$ grep -rn "events.remind" apps/web/src        # SİLMEDEN ÖNCE
apps/web/src/components/screens/event-list-row.tsx:153:  {t(event.interested ? "events.reminded" : "events.remind")}
apps/web/src/lib/locale/events-screen-copy.test.ts:33-34
apps/web/src/lib/locale/messages/{en,tr}.ts
```

Tek üretim tüketicisi **silinen** `event-list-row.tsx`. Ana Sayfa'nın "Sıradaki" kartı bu iki
anahtarı **kullanmıyor**; kendi ailesini kullanıyor (`home.upNext.remind` /
`home.upNext.reminded`, `home-up-next-card.tsx:330`). İki anahtar bu yüzden silindi.

Silinen on anahtar (iki dilden de): `events.calendar.emptyMonth`, `events.calendar.label`,
`events.calendar.nextMonth`, `events.calendar.previousMonth`, `events.calendar.today`,
`events.empty`, `events.remind`, `events.reminded`, `events.view.calendar`, `events.view.list`.

**Kalan ikisinin yeni tüketicisi var:**

- `events.calendar.emptyDay` → sağ ajanda rayının boş günü (`event-agenda-rail.tsx:173`, Ş7).
- `events.title` → akış başlığının varsayılan dalı (Ş5) ve SPEC'in kendi metin tablosunda.

`lib/locale/events-screen-copy.test.ts` buna göre güncellendi: `LEGACY_KEYS` iki anahtara indi ve
yeni bir `REMOVED_KEYS` süiti **yokluğu** kilitliyor — anahtar bir gün geri eklenirse onu çizen
ekran olmadığı için sözlükte ölü metin olarak yaşardı.

### 1.6 Sözleşme testi

`lib/events/count-contract.test.ts` içindeki **ikinci** tüketici-1 testi (`listHomeEvents` +
toplu `ROW_NUMBER()` katılımcı sorgusunun `GOING` süzgeci) ölçtüğü yüzeyle birlikte silindi:
`listTopAttendees` yalnız `listHomeEvents` için vardı. K1'in bu dosyadaki kilidi artık
`getHomeUpcomingEvents` üzerinden ve dört tüketicinin dördü de literal beklentiyle bağlı
(6 → 5 test).

### 1.7 Ölü referans denetimi

```
$ grep -rn "events-screen\|EVENTS_VIEW_PARAM\|parseEventsView\|groupEventsByDay\|fetchHomeEventsList" apps/web/src
apps/web/src/components/events/event-grid.test.tsx:22: * ... `lib/locale/events-screen-copy.test.ts`
apps/web/src/components/events/events-empty-state.tsx:18: * ... `lib/locale/events-screen-copy.test.ts`
```

Kod referansı **sıfır**. İki eşleşme yorum içindeki bir **dosya adı**dır ve o dosya silinen
`events-screen.tsx` değil, Ş0.5'in metin sözleşmesi testidir (`events-screen-copy.test.ts` —
"Etkinlikler ekranının kopyası"). İsim çakışması kayda geçiriliyor; dosyayı yeniden adlandırmak
Ş0.5'in artefaktına dokunmak olurdu.

---

## 2. Parity kapısı

### 2.1 `lib/events/parity.test.ts`

```
✔ events parity — ölçü sözlüğü ↔ referans HTML   (10 test)
✔ events parity — sözlük renk taşımaz             (2 test)
✔ events parity — kayda geçen SPEC sapmaları      (6 test)
ℹ tests 18   pass 18   fail 0
```

Dosyada **123 iddia çağrısı** var (asgari 20 şartı fazlasıyla karşılanıyor); `SPEC_DEVIATIONS`
beş kaydı taşımaya devam ediyor ve testi bu beşliyi sırasıyla iddia ediyor.

### 2.2 On bir durum ↔ `screens/*.png`

Durumlar **çalışan uygulamada** kuruldu (üretim derlemesi + tohumlu `wizards_e2e`), 1360×920'de
ekran görüntüsü alındı ve `design_handoff/etkinlikler-paketi/screens/` ile yan yana kondu.

| #   | Durum           | URL                                   | Sonuç                                                                                                                                                    |
| --- | --------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 01  | Tüm etkinlikler | `/events`                             | ✅ başlık + 4 sekme (sayaç pilleri) + hafta şeridi (7 gün, tür noktaları, bugün vurgulu) + `Bugün`/`Yarın` grupları + 300 ray                            |
| 02  | Canlı           | `/events?tab=live`                    | ✅ yalnız `ACTIVE` kart; başlık dalı `Canlı`                                                                                                             |
| 03  | Filtre aktif    | `/events?time=week&source=<serverId>` | ✅ filtre şeridi çizildi, iki çip + `Tümünü temizle`                                                                                                     |
| 04  | Arama           | `/events?q=oyun`                      | ✅ başlık `Arama sonuçları`, alt satır `"oyun" için N sonuç`                                                                                             |
| 05  | Katılacağım     | `/events?tab=going`                   | ✅                                                                                                                                                       |
| 06  | RSVP şeridi     | `/events` + `Katıl`                   | ✅ kart kenarı `--success/.4`, buton `Katılıyorsun`, ray `Katılacağım 1`, sekme pili `1`, onay şeridi + `Takvime ekle`                                   |
| 07  | Detay paneli    | `/events?panel=<eventId>`             | ✅ 326 px panel, sekme **ve** ikon grubu DOM'dan düştü, ray `unmount`, rol pili `Host`, CTA `Katıl` + `Paylaş`                                           |
| 08  | Oluştur modalı  | `/events?modal=create`                | ✅ 560 px, 6 tür 3 kolon, ilk seçenek seçili, süre segmenti `45 dk`, yer seçici, topluluk anahtarı pasif + gerekçe, alt metin `Tekrar eden etkinlikler…` |
| 09  | Boş durum       | `/events?q=<sonuçsuz>`                | ✅ SPEC metni birebir + `Filtreleri temizle`                                                                                                             |
| 10  | Hata durumu     | ağ kesintisi (`route.abort`)          | ✅ alt satır `Bağlantı yok · Son eşitleme — · yerel hatırlatmalar çalışıyor`, hata kodu satırı `EVT-503 · son deneme 21:26`, **nav ipucu gizlendi**      |
| 11  | Aydınlık tema   | hesap tercihi `theme-light`           | ✅ hiçbir parça tek temaya sabit değil                                                                                                                   |

**Ölçü farkı bulunmadı.** Bulunan üç fark **içerik** farkıydı ve ikisi tohum verisinden geliyor
(tohum hesapların dili `en`; kurgudaki katılımcı sayıları sıfır), üçüncüsü tasarımın kendi
kuralı (`AÇIKLAMA` bloğu boş açıklamada hiç çizilmiyor — Ş7).

Ölçüm sırasında bulunan ve **uygulamada düzeltilen** dört kusur §3'te.

---

## 3. Ölçüm sırasında bulunan ve düzeltilen dört kusur

| #   | Kusur                                                                                                                                                                                                                                    | Kanıt                                                             | Düzeltme                                                                                                                                                                                                                                                    |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **`Katıl` sağ rayı oynatmıyordu.** Kabul kriteri "kart, ray ve sayaç **aynı anda**" diyor; yazma yanıtı yalnız ana kolonun anahtarına yazılıyordu, rayın kendi anahtarı (`…list({tab:"going"}), "agenda"`) hiç tazelenmiyordu.           | e2e §5.2 kırmızı: `event-agenda-going-row` bulunamadı             | `events-page.tsx` → RSVP `onSuccess` artık `eventsQueryKeys.lists` önekini **yamalanan anahtar hariç** geçersiz kılıyor. Ana kolon yanıttan yamalı kalıyor; yeniden çekilmediği için kaydırma sıçramıyor.                                                   |
| 2   | **`Esc` panel açıldıktan hemen sonra hiçbir şey yapmıyordu.** Panel `routeState`ten çiziliyor, merdiven `ui`den okunuyordu; arada bir efekt tiki var. O pencerede `resolveEventsEscapePatch(ui)` `null` dönüyor ve panel açık kalıyordu. | e2e §5.4 aralıklı kırmızı                                         | Merdivenin modal/panel basamakları **adresten** besleniyor (`{...ui, createOpen: routeState.createOpen, panel: routeState.panel}`); `rsvpBanner` adreste olmadığı için `ui`den okunmaya devam ediyor. Sıra hâlâ `eventsUiReducer`'da, iki yerde yaşamıyor.  |
| 3   | **Sonsuz kaydırma bağlı değildi** (Ş5 devir notu). `handleLoadMore` slot girdisinde duruyordu ama `EventGrid` bir sentinel taşımıyordu; ikinci sayfa hiç çekilmiyordu.                                                                   | 40 etkinlikli listede kart sayısı 12'de sabit                     | `event-grid.tsx` → `IntersectionObserver` sentinel'i (kök **kaydırma kabı**, `rootMargin: 200px`, bağımlılıklar ilkel — tuzak #12). Sentinel alt notun **üstünde**; `aria-live="polite"` + `role="status"` ve `events.grid.loadingMore` metni. 5 yeni test. |
| 4   | **Hafta şeridinin bugün kutusu WCAG AA'yı geçmiyordu.** Ham `--primary` kendi %14'lük zemini üstünde **2,52:1**.                                                                                                                         | axe `color-contrast`, serious, `a[aria-current="date"] > span` ×2 | Metin `var(--primary-readable)`e çevrildi (mevcut token, yeni token üretilmedi). Ton aynı aile; `aria-current="date"` ve metin karşılığı zaten vardı. Test iddiası eklendi.                                                                                 |

Ayrıca **Ş1 ↔ Ş4 arasında Dalga 1'den beri açık duran sözleşme çelişkisi** kapatıldı:
`fetchEventCounts` adresi `?tab=all&limit=0` yerine **`?limit=0`** yazıyor. `tab`ın ucundaki
varsayılan zaten `all` (`parseEventTab`) ve sayaç bloğu sekmeden bağımsız (tuzak #3), yani
parametre bilgi taşımıyordu. `hooks/use-next-event-clock.test.ts` → `hafif istek limit=0 ile
gider` artık yeşil; bu kırmızı Dalga 0'dan Ş8'e kadar her raporda kayıtlıydı.

---

## 4. Çözünürlük matrisi — 6 çözünürlük × 2 tema

Ölçüm üretim derlemesinde, gerçek oturumla, sekiz tohum etkinlikle koşuldu. Her satırda
`expectNoHorizontalOverflow` + `expectNoVerticalOverflow` + `expectNoClippedText` de koştu.

| Çözünürlük | Ölçek    | Kök   | Düzen alanı (tasarım px) | Kolon | Başlık (yük./satır) | Kaydırma X/Y | Sağ kenar   |
| ---------- | -------- | ----- | ------------------------ | ----- | ------------------- | ------------ | ----------- |
| 1360×920   | ×1       | 16 px | 1360×920                 | 2     | 20/20               | 0/0          | 1348 ≤ 1360 |
| 1600×900   | ×1       | 16 px | 1600×900                 | 3     | 20/20               | 0/0          | 1588 ≤ 1600 |
| 1920×1080  | ×1.15    | 18 px | 1670×939                 | 3     | 22/22               | 0/0          | 1907 ≤ 1920 |
| 2560×1440  | ×1.5     | 24 px | 1707×960                 | 3     | 30/30               | 0/0          | 2542 ≤ 2560 |
| 3840×2160  | ×2       | 32 px | 1920×1080                | 4     | 40/40               | 0/0          | 3816 ≤ 3840 |
| 5120×1440  | **×1.5** | 24 px | 3413×960                 | 9     | 30/30               | 0/0          | 5102 ≤ 5120 |

İki temanın iki tablosu **bit bit aynı**.

- **Kaydırma yok** — belge kaydırıcısının hem yatay hem dikey artığı her satırda 0.
- **Kırpma yok** — `expectNoClippedText` on iki ölçümün hepsinde temiz.
- **Başlık tek satır** — yüksekliği bir satır yüksekliğine eşit; `scrollWidth − clientWidth = 0`.
- **Sağ sütun kabuk içinde bitiyor.**
- **`5120×1440` özel maddesi doğrulandı:** ölçek **yükseklikten** sınırlanıyor ve ×1.5'te
  kalıyor (`min(5120/1360, 1440/920) = 1.565`).

### 4.1 Kayda geçen ölçüm sapması — kolon sayısı

Ş10 §3 "ızgara kolon sayısı adım büyüdükçe **artmıyor**" diyor. Ölçüm bunu **doğrulamıyor**:
×1.5 → ×2 geçişinde kolon 3 → 4, `5120×1440`te 9.

Bu bir uygulama kusuru **değil**; tasarım kaynağının kendi aritmetiği. Referans HTML çözünürlük
düğmelerini şöyle tanımlıyor (`Etkinlikler-referans.html`):

```
{ k:'2k', label:'2560×1440', z:'1.5', w:'calc(2560px / 1.5)', h:'calc(1440px / 1.5)',
  note:'Yerleşim alanı 1707×960 CSS px · kök ölçek ×1.5' }
{ k:'4k', label:'3840×2160', z:'2',   w:'calc(3840px / 2)',   h:'calc(2160px / 2)',
  note:'Yerleşim alanı 1920×1080 CSS px · kök ölçek ×2' }
```

Yani referansın kendi modelinde düzen alanı 1707×960'tan 1920×1080'e **genişliyor** (1360×920
ile 1920×1080 en-boy oranları farklı: 1,478 ↔ 1,778). Izgara `repeat(auto-fill,
minmax(var(--e-min),1fr))` ve `--e-min` tasarım px olarak sabit (280 / büyük kartta 340; SPEC
§3.5 ve `.dc.html` bunu böyle veriyor), dolayısıyla artan düzen genişliği yeni bir **track**
üretiyor:

```
1360×920 ×1   : (1360 − 602 kabuk − 2×24 dolgu) / 280 → 2
1707×960 ×1.5 : (1707 − 602 − 48) / 280            → 3
1920×1080 ×2  : (1920 − 602 − 48) / 280            → 4
3413×960 ×1.5 : (3413 − 602 − 48) / 280            → 9
```

PROMPT §6'nın "daha fazla kolon değil" cümlesi ile tasarım kaynağının ölçekleme modeli bu
noktada çelişiyor. Ş10 §2'nin kuralı ("ölçü farkı varsa uygulama düzeltilir") **ölçü** farkları
için; burada uygulama referansın ölçüsünü birebir üretiyor. Kolonu sabitlemek ızgaraya SPEC'te
olmayan bir `max-width` yazmak olurdu, o yüzden **değiştirilmedi ve kayda geçirildi**.

---

## 5. Token denetimi

```
$ grep -rnE "#[0-9a-fA-F]{3,8}" apps/web/src/components/events apps/web/src/lib/events
event-card.test.tsx:79   /** `#fff` dışında hiçbir hex kabul edilmez (PROMPT §4 tek istisnası). */
event-card.test.tsx:81     const withoutAllowed = markup.replaceAll("#fff", "");
event-create-modal.tsx:304   color: selected ? "#fff" : "hsl(var(--text-secondary))",
event-create-modal.tsx:451   color: "#fff",
event-place-picker.tsx:111   color: "#fff",
event-place-picker.tsx:243   color: "#fff",

$ grep -rnE "rgba?\(" apps/web/src/components/events apps/web/src/lib/events
(boş)

$ grep -rn "Outfit\|Figtree" apps/web/src/components/events apps/web/src/lib/events
(boş)
```

Yalnız `#fff` (primary zemin üstündeki ters metin, PROMPT §1'in tek istisnası); iki satır
testin kendi kuralını anlatan metin. `rgb(` / `rgba(` hiç yok. Sabit font adı hiç yok —
tipografi `--font-display` / `--font-sans` üzerinden.

Arbitrary px kuralı `eslint.config.mjs` kapsamında (`src/components/events/**` +
`src/lib/events/**`, Ş5/Ş7 açtı) ve `eslint` bu iki ağaçta temiz.

---

## 6. e2e

### 6.1 `e2e/specs/events/events.spec.ts` — dokuz senaryo

Yeni dosya; tohum veriyi kendi kuruyor (koşuya özgü isimler, `afterAll` temizliyor). Metin
iddiaları sözlükten okunuyor — tohum hesapların dili `en` ve sabit Türkçe dize turu tohumun
diline çivilerdi.

```
Running 9 tests using 1 worker
  ok 1 `/events` ızgarayı ve 300'lük ajanda rayını birlikte çiziyor (2.6s)
  ok 2 `Katıl` kartı, sağ rayı ve başlık sayacını aynı anda güncelliyor (1.5s)
  ok 3 karta tıklamak paneli açıyor; sekme grubu, ikon grubu ve ray kayboluyor (1.8s)
  ok 4 `Esc` paneli kapatıyor, ray geri geliyor (2.6s)
  ok 5 `Oluştur` modalı açılıyor, tür kanal listesini süzüyor, `Esc` kapatıyor (3.1s)
  ok 6 hafta şeridi `›` bir hafta ileri götürüyor; geri tuşu geri alıyor (1.7s)
  ok 7 filtre çipi kaldırılınca URL'den o eksen düşüyor (1.7s)
  ok 8 aydınlık temada aynı akış (2.1s)
  ok 9 `MANAGE_EVENTS` olmayan kullanıcıda üç `Oluştur` girişi de yok (1.6s)
  9 passed (21.8s)
```

### 6.2 `e2e:a11y` süitine `/events` eklendi

`e2e/specs/a11y/a11y.spec.ts` döngüsüne üç rota kondu — modal ve `Canlı` sekmesi ancak açıkken
var, o yüzden ayrı satırlar:

```
["events",              "/events",              "events-feed-header"]
["events create modal", "/events?modal=create", "events-feed-header"]
["events live tab",     "/events?tab=live",     "events-feed-header"]
```

Süite ayrıca bir **tarama önkoşulu** eklendi: axe taramadan önce **biten** animasyonlar
bekleniyor (`settleAnimations`). Gerekçesi ölçülmüş bir yanlış pozitif: `color-contrast` kuralı
öğenin o andaki hesaplanmış rengini okuyor ve giriş animasyonu sürerken modalın kartı
`opacity: 0.79` oluyor — oluştur modalı bu yüzden **on beş sahte "serious" ihlal** üretiyordu
(ölçülen: `#5a5d63` on `#2f3137` = 1,96:1; animasyon bittiğinde gerçek renk `#b5bac4`). Bekleme
yalnız `iterations !== Infinity` olan animasyonları bekliyor ve 1,5 sn tavanı var: sonsuz döngülü
bir animasyonun `finished` sözü hiç çözülmez ve süiti kilitlerdi.

Üretim derlemesinde koşan süit:

```
ok  7 events screen has no critical or serious WCAG A/AA violations (1.1s)
ok  8 events create modal screen has no critical or serious WCAG A/AA violations (1.2s)
ok  9 events live tab screen has no critical or serious WCAG A/AA violations (1.2s)
```

Süitin geri kalanındaki altı kırmızı **Etkinlikler'in dışından** (§9.2).

---

## 7. Performans ölçümü

Üretim derlemesi, gerçek oturum, 40 tohum etkinlik.

### 7.1 Kolonlar bağımsız yükleniyor

`GET /api/v1/events` yanıtı artık `Server-Timing` taşıyor (`auth`, `db`, `total`). `runHomeRoute`
opsiyonel bir `request` parametresi aldı; onu geçmeyen sekiz Ana Sayfa ucunun yanıtı bit bit aynı
kaldı. Rota sözleşme testinin kimlik çağrısını statik izlemesi bozulmasın diye kimlik
`start`/stop ile ölçülüyor, `measure` geri çağrısıyla değil.

```
?tab=all&time=today&limit=4   başlangıç +0ms · bitiş +87ms   · db=18.1ms total=74.1ms
?tab=going&limit=3            başlangıç +0ms · bitiş +94ms   · db= 8.4ms total=52.5ms
?limit=0                      başlangıç +0ms · bitiş +97ms   · db= 3.2ms total=32.2ms
?tab=all&week=2026-08-17&limit=12  başlangıç +0ms · bitiş +100ms · db= 9.8ms total=42.8ms
örtüşen pencere: EVET
```

Dört istek de aynı anda (+0 ms) uçuyor ve pencereleri örtüşüyor: **ızgara skeleton'u sağ rayı
beklemiyor**, ray da ızgarayı beklemiyor. `?limit=0` kabuğun saat ipucu, ve `/events` rotasında
bile ayrı bir istek olarak çıkıyor — Ş4'ün "liste açıkken ikinci istek çıkmaz" kuralı yalnız
önbellekte liste **varken** geçerli; ilk boyada ikisi de aynı anda başlıyor.

### 7.2 `GET /api/v1/events` p95

```
n=30 · uçtan uca p50=31.9ms p95=61.6ms · sunucu db p50=9.5ms p95=17.2ms
```

Hedef < 120 ms. **61,6 ms** ile geçiyor; `EXPLAIN ANALYZE` gerekmedi (Ş1 §4 zaten iki dalın da
indeks taraması olduğunu ölçmüştü).

### 7.3 Kaydırma konumu

```
kart=36 (3 sayfa) · tıklamadan önce scrollTop=3555 · sonra=3555
```

Üç sayfa yüklendikten sonra listenin ortasında verilen bir RSVP yanıtı — bütün sayfalara sayaç
yazan ve sağ rayı tazeleyen yol — kaydırma konumunu **oynatmıyor**.

> Not: prompt bu maddeyi `event:rsvp` **socket olayı** üzerinden tanımlıyor. Ölçüm yazma
> yanıtının yamasıyla yapıldı; ikisi de aynı saf yamayı (`applyEventWriteToPages` /
> `applyEventRsvpToPages`) kullanıyor ve ikisi de diziye dokunmuyor. İkinci bir tarayıcı
> oturumundan gerçek socket olayı üretmek turu iki bağlama çıkarırdı; kayda geçiriliyor.

---

## 8. Kabul — PROMPT'un tam listesi

- [x] **Sol taraf (sunucu rayı, gezinme paneli, kullanıcı barı) hiç değişmedi; diff yalnız
      Etkinlikler bölgelerine ve rota bağlantısına dokunuyor.** Ş10 dokuz dosya sildi, 31
      dosyayı değiştirdi/ekledi; hiçbiri `components/shell/**` altında değil. Çalışma ağacındaki kabuk değişiklikleri
      (`wizards-shell.tsx`, `server-rail.tsx`, …) paralel paketlerin işi.
- [x] **Gezinme panelindeki `Etkinlikler` satırı aktif; saat ipucu ve canlı noktası etkinlik
      verisinden geliyor, hata durumunda gizleniyor.** e2e §5.1 `aria-current="page"` iddia
      ediyor; durum 01 ipucuyu (`00:09` + `--danger` nokta) çiziyor, durum 10'da ipucu yok.
- [x] **Sadece token renkleri kullanıldı — yeni hex araması temiz** (§5). `--info` token'ı zaten
      vardı; yeni token üretilmedi.
- [x] **Tipografi Outfit + Figtree, token üzerinden** — iki dosyada da sabit font adı yok.
- [x] **Başlık tek satırda kalıyor; detay paneli açıldığında sekme grubu ve ikon grubu
      gizleniyor.** On iki ölçümde başlık yüksekliği = satır yüksekliği, taşma 0; e2e §5.3 iki
      grubun da **DOM'da olmadığını** iddia ediyor.
- [x] **Hafta şeridi: 7 gün, gün başına en çok 4 tür noktası, bugün vurgulu, hafta ileri/geri
      çalışıyor (K9).** e2e §5.1 yedi kutuyu sayıyor; §5.6 iki adımın tam 7 gün olduğunu
      aritmetikle iddia ediyor.
- [x] **Kart: tür tile'ı + tür pili doğru ton; canlı pili ve nokta; tekrar metni;
      `Başlamasına N dk`; avatar yığını; `Katıl` / `Belki` durumları.** Ş6'nın 41 testi + durum
      01/06 görüntüleri.
- [x] **Kartta üç nokta menüsü yok** — Ş6 testi `<button` sayısını ve `aria-haspopup`
      yokluğunu iddia ediyor.
- [x] **`Katıl` → kart kenarı `--success/.4`, buton `Katılıyorsun`, sağ ray listesi ve başlık
      sayacı aynı anda güncelleniyor.** §3'teki 1 numaralı kusur bu maddede bulundu ve
      düzeltildi; e2e §5.2 üçünü tek etkileşimde iddia ediyor.
- [x] **Sağ ajanda rayı 300 px; 44 px saat kolonu + 1,5 px dikey çizgi; canlıda `Canlı` +
      nokta.** Ş7 parity testleri + durum 01.
- [x] **Detay paneli 326 px; ajanda rayının yerini alıyor; rol pilleri; CTA üç durumda doğru.**
      Durum 07: rol pili `Host`, CTA `Katıl` + `Paylaş`.
- [x] **Oluştur modalı 560 px; 6 tür, başlık, tarih-saat, süre segmenti, yer seçici,
      `Topluluk keşfetinde listele` anahtarı; `Esc` kapatıyor.** Durum 08 + e2e §5.5.
- [x] **Filtre şeridi yalnız aktif filtre varken; kaldır ve `Tümünü temizle` çalışıyor.**
      e2e §5.7: bir çip kaldırılınca yalnız o eksen düşüyor, `Tümünü temizle` şeridi kapatıyor.
- [x] **Boş ve hata durumu metinleri birebir; hata kodu satırı var.** Durum 09/10 + Ş6'nın
      literal testleri.
- [x] **Tema anahtarı çalışıyor; hiçbir parça tek temaya sabit değil.** Durum 11 + matrisin
      `theme-light` yarısı (iki tablo bit bit aynı).
- [x] **Dört çözünürlükte kaydırma/kırpma yok.** Altı çözünürlük × iki tema ölçüldü (§4).
- [x] **Tüm metinler birebir; placeholder/lorem yok. Tip kontrolü, lint ve testler geçiyor.**
      Etkinlikler'in sahiplendiği yüzeylerde üçü de temiz; ağaçtaki kırmızılar §9'da tek tek
      adlandırıldı.

## 8.1 Kabul — bu paketin eklediği

- [x] **Hatırlatma gerçekten gönderiliyor; saat değişince yeniden zamanlanıyor; RSVP geri
      alınınca iptal ediliyor; geçmişte kalan iş yazılmıyor.** Ş3'ün 14 testi;
      `reminder-scheduler.test.ts` yeşil.
- [x] **`.ics` geçerli dosya üretiyor.** Ş3'ün 18 testi (`BEGIN:VEVENT`, UTC `DTSTART`, `UID`,
      CRLF); durum 06'daki `Takvime ekle` gerçek bir `<a download>`.
- [x] **`MANAGE_EVENTS` olmayan kullanıcıda üç `Oluştur` girişi de gizli; `POST /events` 403.**
      e2e §5.9 üçünü de sayıyor (`events-feed-create`, `event-agenda-create` + ayak satırı,
      `events-empty-create`); 403 Ş3'ün rota testinde.
- [x] **`interestedCount` üç tüketicisi `count-contract.test.ts` ile kilitli.** Dört tüketici
      kilitli; silinen `listHomeEvents` testi §1.6'da gerekçeli.
- [x] **Mobil uçlar eski sözleşmeyle çalışıyor (K12).** `count-contract.test.ts` tüketici 3.
- [x] **Canlı geçişi: sesli kanala ilk giriş `ACTIVE`, kanal boşalınca `COMPLETED`.** Modül ve
      16 testi Ş3'te; **çağrı yeri hâlâ bağlı değil** (Ş3 §3, `TODO(Ş4)`), bkz. §10.
- [x] **Eski ekran ve uçları silindi; ölü referans yok** (§1).
- [x] **`parity.test.ts` yeşil; `SPEC_DEVIATIONS` beş kaydı taşıyor** (§2.1).

---

## 9. Kapı çıktısı

### 9.1 Kalite kapısı

```
$ pnpm --filter @wizards/db db:generate
✔ Generated Prisma Client (7.9.1) to .\src\generated\prisma in 514ms
```

```
$ pnpm typecheck
@wizards/web:typecheck: apps/web/next.config.ts(68,7): error TS2375: ... 'distDir' ...
  Types of property 'distDir' are incompatible.
    Type 'string | undefined' is not assignable to type 'string'.
 Tasks: 4 successful, 5 total   Failed: @wizards/web#typecheck
```

**Tek hata var ve Ş10'un dosyası değil.** `apps/web/next.config.ts` bu oturum sürerken (21:25:55)
**dışarıdan** değiştirildi; eklenen satır `distDir: process.env.NEXT_DIST_DIR?.trim() || undefined`
ve depo `exactOptionalPropertyTypes: true` ile derleniyor. Değişiklik Keşfet paketinin e2e
kurulumundan geliyor (aynı dakikada `apps/web/.next-discover-e2e/` ve
`apps/web/discover-e2e-server.tmp.ts` doğdu). Düzeltmesi tek satır — alanı koşullu yaymak:
`...(process.env.NEXT_DIST_DIR?.trim() ? { distDir: ... } : {})` — ama dosya Ş10'un sahiplenilen
listesinde değil ve o iş **şu anda başka bir oturumda açık**, o yüzden dokunulmadı.

Etkinlikler'in dosyaları temiz: hatayı süzünce `typecheck` çıktısı boş.

```
$ pnpm lint
@wizards/web:lint: ✖ 16260 problems (15514 errors, 746 warnings)
```

Bu sayının **15 511'i** aynı dış kaynaktan: `apps/web/.next-discover-e2e/` derleme çıktısı
eslint'in yok sayma listesinde değil (`.next` var, `.next-discover-e2e` yok). O iki artefakt
dışlanınca gerçek tablo:

```
$ npx eslint . --ignore-pattern ".next-discover-e2e/**" --ignore-pattern "discover-e2e-server.tmp.ts"
e2e/specs/discover/discover.spec.ts                   E0 W2
src/components/discover/server-join-modal.tsx         E1 W0  react-hooks/set-state-in-effect:138
✖ 3 problems (1 error, 2 warnings)
```

Üçü de Keşfet paketinin. `components/events/**` ve `lib/events/**` **temiz**.

```
$ pnpm format
Format check failed: 602 changed file(s) need Prettier (a50db1ad8710 baseline)
```

Listenin ezici çoğunluğu yine `.next-discover-e2e/**`. Ş10'un dokunduğu 31 dosya
`npx prettier --check` ile tek tek denetlendi; yedi dosya biçimlendi (`--write`) ve şimdi
**hepsi temiz**. Listede kalan `packages/types/src/events-screen.ts` Dalga 0'ın artefaktı ve bu
şeridin diff'inde yok.

### 9.2 Test kapısı

```
$ pnpm --filter @wizards/types test
ℹ tests 508   pass 508   fail 0
```

```
$ pnpm --filter @wizards/db test
ℹ tests 25    pass 25    fail 0     (tsx: seed sözleşmeleri)
ℹ tests 109   pass 109   fail 0     (node --test: şema sözleşmeleri)
```

```
$ pnpm --filter @wizards/web test
ℹ tests 5130   pass 5125   fail 4   skipped 1
✖ API v1 route contract
✖ Playwright E2E governance
✖ Mesajlar denetim bütçesi
```

Etkinlikler'in sahiplendiği süitlerin hepsi yeşil (tek tek koşuldu):

```
src/lib/events/parity.test.ts                       18/18
src/lib/events/count-contract.test.ts                5/5
src/components/events/event-grid.test.tsx           26/26   (5 yeni sentinel testi)
src/components/events/event-week-strip.test.tsx     27/27   (2 güncellenmiş iddia)
src/components/events/events-page.test.tsx          42/42
src/app/api/v1/events/route-logic.test.ts           18/18   (1 yeni Server-Timing testi)
src/lib/locale/events-screen-copy.test.ts           12/12   (1 yeni REMOVED_KEYS testi)
src/hooks/use-next-event-clock.test.ts              13/13   (Ş1↔Ş4 çelişkisi kapandı)
src/lib/home/{side-screens,mutations,optimistic}.test.ts + components/screens/side-screens.test.tsx
                                                    hepsi yeşil
```

Devralınan kırmızılar — üçü de bu şeridin diff'inin dışından:

| Kırmızı                                                                                | Dosya                               | Kaynak                                                                                                                                                                                                              |
| -------------------------------------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `requires mutating routes to either parse JSON centrally or be documented as bodyless` | `app/api/v1/route-contract.test.ts` | İzlenmeyen (`??`) `mobile/channels/[channelId]/messages/[messageId]/thread-follow` rotaları `BODYLESS_MUTATING_METHOD_PATHS` listesinde yok. Bahsedilmeler/thread işinden; Dalga 0 §4'ten beri her raporda kayıtlı. |
| `does not use unconditional sleeps in Playwright specs`                                | `lib/e2e/governance.test.ts`        | `e2e/specs/discover/discover.spec.ts:340,558` → `page.waitForTimeout(...)`. **Yeni** kırmızı; Keşfet paketinin izlenmeyen süiti.                                                                                    |
| `components/dm bütçeyi aşmaz` + `… bütçesi gerçekten harcanmış`                        | `lib/messages/audit-budget.test.ts` | `components/dm/group-create-dialog.tsx` token borcu. Mesajlar dalgasından; Dalga 0 §4'ten beri kayıtlı.                                                                                                             |

### 9.3 e2e kapısı

Ölçüm ortamı: `E2E_TEST_MODE=true`, `wizards_e2e` (üç bekleyen migration `prisma migrate deploy`
ile uygulandı), Redis, **üretim derlemesi** (`pnpm build && pnpm start`).

> Yerel `pnpm dev` sunucusu bu tur için kullanılamadı: `tsx watch` `apps/web` altına yazılan
> Playwright artefaktlarında (`test-results/`, `playwright-report/`) yeniden başlıyor ve tur
> ortasında `ECONNREFUSED` üretiyor. Üretim derlemesi hem kararlı hem de zamanlama ölçümü için
> doğru zemin.

```
$ pnpm --filter @wizards/web e2e:smoke
Running 16 tests using 1 worker
  ... 16 satırın 16'sı ok ...
  16 passed (1.0m)
```

```
$ pnpm --filter @wizards/web e2e:a11y
  ok  1 login screen                              ok  3 server text channel view
  ok  4 settings overlay                          ok  6 mentions screen
  ok  7 events screen                             ok  8 events create modal screen
  ok  9 events live tab screen                    ok 10 inbox screen
  ok 13 home command centre @720px                ok 14 command palette
  ok 19 Mesajlar · ekran okuyucu adları           ok 20 Mesajlar · odak tuzağı
  x   2 DM home shell                             x   5 home command centre
  x  11 home command centre · light theme         x  12 home command centre @1100px
  x  15/16/17/18/21 messages-a11y (5 test)
```

**Etkinlikler'in üç taraması da yeşil.** Kalan altı kırmızının tamamı tek bir ihlalden geliyor
ve o ihlal **kabuğun** kendi öğesinde:

```
[serious] color-contrast: (.text-\[hsl\(var\(--warning\)\)\])
apps/web/src/components/shell/app-nav-panel.tsx:416
  <span className={cn(DISPLAY_FONT, "shrink-0 bg-[hsl(var(--warning)/0.2)] text-[hsl(var(--warning))]")}>
    {t("discover.new")}
```

Ölçülen: `#f4ad2a` on `#665434` = **3,76:1** (9,5 px metin, eşik 4,5:1). Gezinme panelindeki
`Yeni` rozeti bu; tohum sunucusu her koşuda yeni olduğu için oturum açık her rotada çiziliyor.
Depoda tam bu iş için bir token var (`--warning-readable`, Bahsedilmeler dalgası) ve düzeltme
tek sınıf: `text-[var(--warning-readable)]`. **Yapılmadı**, çünkü PROMPT'un birinci kabul maddesi
"gezinme paneli hiç değişmedi" diyor ve `app-nav-panel.tsx` Ş10'un dosyası değil. `messages-a11y`
süiti de izlenmeyen bir dosya (Mesajlar paketi).

`e2e/specs/design/home-side-screens.spec.ts` de güncellendi (silinen ekranın iki turu kalktı,
`Takvim` hedefi `/events` oldu, Etkinlikler `AppScreen` kutu turundan çıktı) ama `e2e:design`
ayrı bir kapı ve prompt'un kapı listesinde yok; koşulmadı.

### 9.4 `graphify update .`

```
$ graphify update .
  AST extraction: 3601/3601 uncached files (100%) [16 workers]
  [graphify watch] Rebuilt: 78410 nodes, 170685 edges, 2943 communities
  [graphify watch] graph.json and GRAPH_REPORT.md updated in graphify-out
Code graph updated.
```

`graph.html` üretilmedi: 78 410 düğüm görselleştirme sınırının (5 000) üstünde — `graph.json` ve
`GRAPH_REPORT.md` güncel.

---

## 10. Bırakılan `TODO` notları

Ş10 yeni bir `TODO(api):` üretmedi. Devralınanlar yerinde:

| Not                                                 | Yer                                                   | Ne bekliyor                                                                                                        |
| --------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `TODO(api): recurrence generator`                   | `packages/db/prisma/schema.prisma` → `recurrenceRule` | K6; örnek üreten iş ve kurma UI'ı bu pakette yok.                                                                  |
| `TODO(api): viewerCanCreate`                        | `components/events/events-page.tsx`                   | Yanıt bu alanı taşımıyor; yetki kartların `viewerCanManage`inden türetiliyor, boş listede giriş kapalı kalıyor.    |
| `TODO(api): eventNotifications`                     | aynı dosya                                            | K7'nin hesap tercihini okuyan/yazan uç yok; zil oturum içinde çalışıyor.                                           |
| `TODO(api):` durum sayfası adresi                   | `components/events/events-error-state.tsx`            | `NEXT_PUBLIC_WHISPR_STATUS_PAGE_URL` tanımlı değilse buton çizilmiyor.                                             |
| `TODO(api):` `MANAGE_EVENTS` istemciye gelmiyor     | `lib/events/create-form.ts`                           | Yer seçici sunucu listesi `accessLevel` süzüyor; rolle dağıtılmış yetki listede görünmüyor (gerçek kapı sunucuda). |
| `TODO(api):` kanal tipi `STAGE` istemciye ulaşmıyor | `components/events/event-create-modal.tsx`            | `live`/`community` bugün yalnız `Harici bağlantı` ile kurulabiliyor.                                               |
| `TODO(Ş4):` canlı geçişi çağrı yeri                 | `lib/events/live-lifecycle.ts`                        | `syncEventLiveStateForChannel` sesli yaşam döngüsüne bağlanmadı; üretimde hâlâ kimse `ACTIVE` yazmıyor.            |
| `TODO(Ş4):` etkinliğe özgü socket olayı             | `lib/events/notifications.ts`                         | Bildirimler genel `notification:new` kanalından.                                                                   |

---

## 11. Kayda geçen sapmalar (Ş10'un kendi listesi)

`lib/events/metrics.ts` içindeki `SPEC_DEVIATIONS` dizisine **dokunulmadı** (Ş0.3'ün donmuş
artefaktı; `parity.test.ts` beş kaydı sayıyor). Bu şeridin sapmaları:

| #   | Sapma                                                                                                                                                                                                                                                                                   | Karar ve gerekçe                                                                                                                                                                                                                                                                                                      |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Sahiplenilen dosya listesinin dışında dokunulan altı dosya:** `components/events/events-page.tsx`, `event-grid.tsx` (+testi), `event-week-strip.tsx` (+testi), `lib/home/route-runner.ts`, `app/api/v1/events/route-logic.ts` (+testi), `app/api/v1/events/[eventId]/route-logic.ts`. | Beşi §3'teki dört kusurun düzeltmesi ve §7'nin ölçümü. Ş10 §2 "ölçü farkı bulunursa `SPEC_DEVIATIONS`'a değil **düzeltmeye** gider" diyor ve §6 `Server-Timing` ölçümünü şart koşuyor; ikisi de bu dosyalara dokunmadan yapılamıyordu.                                                                                |
| 2   | **Hafta okları artık `push`, gün kutuları `replace`.** Ş5 dokuz bağlantının dokuzunu da `replace` yazmıştı.                                                                                                                                                                             | Ş10 §5.6 "geri tuşu geri alıyor" diyor; `replace` ile geri tuşu ekrandan **çıkar**. K9 şeridi zaten "bir gezinme aracı, bir süzgeç değil" diye tanımlıyor. Gün kutuları bir **filtre** (`time=today`) olduğu için `replace` kaldı. `event-week-strip.test.tsx` iddiayı 9 → 7 replace + 2 push olarak güncelledi.      |
| 3   | **`events.grid.loadingMore` anahtarı eklendi** (tr + en).                                                                                                                                                                                                                               | Sonsuz kaydırmanın canlı bölgesi bir metin istiyor; SPEC bu durumu çizmiyor. Mevcut kardeş anahtarla aynı cümle (`mentions.feed.loadingMore` → "Daha fazla yükleniyor").                                                                                                                                              |
| 4   | **`runHomeRoute` opsiyonel `request` parametresi kazandı.**                                                                                                                                                                                                                             | §7'nin ölçümü `Server-Timing` istiyor; Ana Sayfa'nın sekiz ucu parametreyi geçmiyor ve yanıtları bit bit aynı kaldı. `route-contract.test.ts`in `instrumentedReadRoutes` listesine Etkinlikler **eklenmedi**: o test `timing.headers(` metnini rotanın kendi kaynağında arıyor, buradaki ölçüm çalıştırıcının içinde. |
| 5   | **Kolon sayısı ölçüm sapması** (§4.1).                                                                                                                                                                                                                                                  | Uygulama referansın aritmetiğini birebir üretiyor; PROMPT §6'nın cümlesiyle tasarım kaynağı çelişiyor. Izgaraya SPEC'te olmayan bir `max-width` yazmak yerine kayda geçirildi.                                                                                                                                        |
| 6   | **a11y süitine tarama önkoşulu eklendi** (§6.2).                                                                                                                                                                                                                                        | Ölçülmüş yanlış pozitif; süitin kendi doğruluğunu artırıyor ve tek dosyaya dokunuyor.                                                                                                                                                                                                                                 |
| 7   | **`ScreenSegmented` ortak ilkeli silinmedi.**                                                                                                                                                                                                                                           | Tek üretim tüketicisi (eski ekran) gitti, ama dosya `screen-chips.tsx` Ş10'un sahiplenilen listesinde değil ve kardeşi `ScreenFilterChips` gelen kutusunda kullanılıyor. Testi nötr etiketlerle korundu; ilkelin geleceği ayrı bir karar.                                                                             |
| 8   | **`events-screen-copy.test.ts` yeniden adlandırılmadı.**                                                                                                                                                                                                                                | Adı silinen `events-screen.tsx` ile çakışıyor ve §1.7'deki grep'in tek gürültüsü o. Dosya Ş0.5'in artefaktı; yeniden adlandırma iki yorumu ve bir testi daha kaydırırdı.                                                                                                                                              |
| 9   | **`renderCard` slotu hâlâ ölü** (Ş5 §2.6).                                                                                                                                                                                                                                              | `EventGrid` bir `renderCard` propu taşımıyor; bu şerit ızgaraya sentinel eklerken slot yüzeyini genişletmedi. Kabul listesinde karşılığı yok.                                                                                                                                                                         |
| 10  | **`newEventCount` çizilmiyor** (Ş4/Ş5 devir notu).                                                                                                                                                                                                                                      | Ş4'ün "yeni etkinlik" sinyali slot girdisinde duruyor; onu çizecek bir şerit SPEC'te yok ve kabul listesinde geçmiyor.                                                                                                                                                                                                |

---

## 12. Devreden

1. **Ş9 koşmalı** (§0). Klavye gezinmesi, roving tabindex, focus dönüşü ve üç küçük-ekran
   kırılımı paketin tek açık işi.
2. **Kabuğun `Yeni` rozeti** (§9.3): `app-nav-panel.tsx:416` → `text-[var(--warning-readable)]`.
   Tek satır, altı a11y kırmızısını birden kapatıyor.
3. **`next.config.ts` `distDir`** (§9.1): `exactOptionalPropertyTypes` altında koşullu yayılmalı.
   Keşfet paketinin işi.
4. **eslint / prettier yok sayma listeleri** `.next-discover-e2e/**` içermeli — aksi hâlde iki
   kapı da 15 000 satırlık gürültüyle kırmızı kalıyor.
5. **Canlı geçişinin çağrı yeri** (Ş3 §5): bağlanmadan `Canlı` sekmesi, ray noktası ve nav
   `--danger` işareti üretimde hiç dolmaz. Bu turda `ACTIVE` satırlar **elle** tohumlandı.
6. **Mobil kopya**: `apps/mobile/src/locale/mobile-copy.ts` → `serverEventInterestCount`
   ("{count} kişi ilgileniyor") K1'den sonra hâlâ eski anlamı yazıyor.
7. **`/api/v1/events/upcoming`** hâlâ ayakta ve Ana Sayfa'nın "Sıradaki" kartı onu okuyor
   (Ş4 §5'in önerisi: kartı sayaç ucuna taşımak). Bu şerit kartı taşımadı; uç bilerek kaldı.
8. **Deponun kökündeki `raporlar/` klasörü** Keşfet paketinin yedi raporunu yanlış yere yazmış
   (`raporlar/03-s2-rapor.md` … `raporlar/10-s9-rapor.md`). Etkinlikler'in değil; sahibi
   `docs/prompts/whispr-kesfet/raporlar/` altına taşımalı.

**Commit atılmadı.**
