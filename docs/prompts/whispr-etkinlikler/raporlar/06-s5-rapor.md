# Dalga 2 · Ş5 — Sayfa iskeleti, akış başlığı, hafta şeridi, URL durumu · rapor

**Tarih:** 2026-08-21 · **Dal:** `uat` · **Commit:** yok (kural gereği)
**Kapsam:** `06-dalga2-s5-iskelet-baslik-hafta-seridi.md` §1–§4 ve kabul listesinin tamamı.

Ekranın **durum sahibi** indi. Bu şerit hiçbir kartın, panelin ya da modalın içini çizmedi;
adres çubuğunu tek doğruluk kaynağı yaptı, akış başlığını ve hafta şeridini çizdi, diğer üç
şeridi yerine oturttu.

---

## 1. Ne landed

| Dosya                                                        | Durum                                               |
| ------------------------------------------------------------ | --------------------------------------------------- |
| `apps/web/src/lib/events/week.ts`                            | yeni, 187 satır — saf hafta hesabı                  |
| `apps/web/src/lib/events/week.test.ts`                       | yeni, **24 test**                                   |
| `apps/web/src/components/events/event-week-strip.tsx`        | yeni, 254 satır                                     |
| `apps/web/src/components/events/event-week-strip.test.tsx`   | yeni, **27 test**                                   |
| `apps/web/src/components/events/events-feed-header.tsx`      | yeni, 405 satır                                     |
| `apps/web/src/components/events/events-feed-header.test.tsx` | yeni, **41 test**                                   |
| `apps/web/src/components/events/events-page.tsx`             | yeni, 878 satır — durum sahibi                      |
| `apps/web/src/components/events/events-page.test.tsx`        | yeni, **42 test**                                   |
| `apps/web/src/app/(main)/events/page.tsx`                    | **yeniden yazıldı** (`EventsScreen` → `EventsPage`) |
| `apps/web/eslint.config.mjs`                                 | `+1` glob: `src/lib/events/**` (bkz. §3.5)          |

**134 test**, hepsi yeşil. Dördünün dördü de **test önce** yazıldı ve kırmızı görüldü (§6.1).

### 1.1 `lib/events/week.ts` — saf hafta hesabı

React yok, `t()` yok, `Date.now()` yok: dil, saat dilimi ve şimdiki zaman **girdi**.

| İşlev                                                | Ne yapar                                                                          |
| ---------------------------------------------------- | --------------------------------------------------------------------------------- |
| `weekStartOf(value, timeZone)`                       | Anı önce izleyicinin takviminde bir güne indirger, **sonra** pazartesiye yuvarlar |
| `weekDays(weekStart)`                                | Yedi takvim günü; pazartesi olmayan bir gün verilirse haftasına yuvarlanır        |
| `shiftEventWeek(weekStart, steps)`                   | **Hafta** adımı (K9)                                                              |
| `eventWeekdayKey(date)` / `eventWeekDayNumber(date)` | Kutunun `dow` anahtarı ve rakamı                                                  |
| `weekMonthLabel(days, locale)`                       | Etiket **betimleyicisi** — `single` (Intl) ya da `span`                           |
| `resolveEventWeek(weekStart, days, todayDate)`       | Sunucunun `week` bloğunu yedi kutuya oturtur                                      |

Üç karar kayda değer:

1. **Sıra**: an → izleyicinin takvim günü → pazartesi. Ters sırada (önce yuvarla, sonra
   bölgeye çevir) gece yarısına yakın bir an haftayı bir gün kaydırırdı. Test 21:30 UTC'yi
   `Europe/Istanbul`da **31 Ağustos** (yeni hafta), `America/New_York`ta **24 Ağustos** (eski
   hafta) görüyor.
2. **Bütün gün aritmetiği UTC'de.** Yerel saatte yapılsaydı yaz saatine geçiş gecesi bir hafta
   7 gün 1 saat sürer ve `+7 gün` bir önceki güne düşerdi. Test `2026-10-19 → 2026-10-26`
   ile bunu kilitliyor.
3. **`mondayOf` `lib/events/routes.ts`'ten alınıyor**, kopyalanmıyor: haftanın kimliği (`?week=`)
   ile şeridin çizdiği yedi gün aynı yuvarlamadan geçmezse tıklanan gün ile paylaşılan adres
   ayrışır.

`weekMonthLabel` bir cümle değil betimleyici döndürüyor çünkü modül `t()` bilmiyor:

| Hafta          | Sonuç                                                                                 |
| -------------- | ------------------------------------------------------------------------------------- |
| 24–30 Ağustos  | `{ kind: "single", text: "Ağustos 2026" }` — `Intl`in kendi biçimi                    |
| 31 Ağu – 6 Eyl | `{ kind: "span", from: "Ağu", to: "Eyl", year: "2026" }` → `Ağu – Eyl 2026`           |
| 28 Ara – 3 Oca | `{ kind: "span", from: "Ara 2026", to: "Oca", year: "2027" }` → `Ara 2026 – Oca 2027` |

Üçüncü satır `events.week.monthSpan` şablonunun (`{from} – {to} {year}`) tek yıl taşımasının
karşılığı: hafta iki yılı bölüyorsa baştaki ay kendi yılını yanında taşıyor.

### 1.2 Hafta şeridi (SPEC §3.2)

- Yedi kutu **her zaman** çizilir; sunucu yanıtı gelmeden de. Kutuların yokluğu "bu hafta hiç
  etkinlik yok" demek değil, "henüz sorulmadı" demektir ve şeridin yükleme sırasında kaybolması
  altındaki ızgarayı zıplatır (`limit=0` kipi de haftayı boş döndürüyor — Ş1 §2.3).
- `isToday` **sunucudan** gelir; `todayDate` yalnız yanıt yokken kullanılan yedek. Yanıt
  geldiyse eşleşmeyen kutuya istemcinin tahmini konmuyor — iki "bugün" kutusu çizilirdi.
- Nokta satırı en çok **4** tür, `EVENT_KIND_TONE` token adlarından; satır `aria-hidden`,
  sayı gün kutusunun `aria-label`ında **metin** olarak (`27 Ağustos, 1 etkinlik`).
- Bugün ayrıca `aria-current="date"` taşıyor: renk tek başına anlam taşımaz.
- Kutular ve oklar gerçek `<Link>`; hepsi `replace` (§2.1).

### 1.3 Akış başlığı (SPEC §3.1)

**Saf sunum**: sorgu açmaz, mutasyon çağırmaz, sayı toplamaz. `resolveEventsFeedTitle` ve
`buildEventsFeedSubline` bileşenin dışında saf işlevler ve testte doğrudan çağrılıyorlar.

Başlık altı dal (`SPEC_DEVIATIONS` #4, HTML sırası):

```
q → Arama sonuçları | source+ad → sunucu adı | tab=live → Canlı
tab=going → Katılacağım | time=today → Bugün | diğer → Etkinlikler
```

Kaynak adı henüz yüklenmemişse dal **atlanıyor** ve sekme dalına düşülüyor: boş bir başlık,
yanlış bir başlıktan kötüdür.

Alt satır dört hâl, öncelik **hata > boş > arama > normal**:

```
8 etkinlik · Güne göre gruplu · 1 canlı · 2 katılım · takvim bağlı
2 etkinlik · “oyun” için 2 sonuç · 1 canlı · 2 katılım · takvim bağlı
0 etkinlik · Yaklaşan etkinlik yok · filtreleri temizleyebilirsin
Bağlantı yok · Son eşitleme 09:41 · yerel hatırlatmalar çalışıyor
```

Hata boş durumu **yeniyor**: "0 etkinlik" cümlesi sunucuya hiç ulaşılamadığında bir iddia
olurdu; hiçbir şey bilmiyoruz. Test dördünü de `tr.ts`'in literal metniyle karşılaştırıyor.

**Daralma kuralı (SPEC §3.1 zorunlu):** detay paneli açıkken sekme grubu **ve** ikon grubu
DOM'dan düşüyor. Sekme pilleri filtresiz sayaçtan (tuzak #3): kaynak ve zaman filtresi açıkken
de `8 / 7 / 1 / 2` yazıyor.

### 1.4 Sayfa iskeleti

```
┌─ ana kolon (flex:1, min-width:0) ────────────────┬─ sağ sütun ─┐
│  akış başlığı            (Ş5)                     │ ajanda rayı  │
│  hafta şeridi            (Ş5)                     │ (300)  VEYA  │
│  filtre şeridi           (Ş8, koşullu)            │ detay paneli │
│  RSVP onay şeridi        (Ş8, koşullu)            │ (326)  (Ş7)  │
│  ızgara / iskelet / boş / hata  (Ş6)              │              │
└──────────────────────────────────────────────────┴──────────────┘
                                     oluştur modalı (Ş8, koşullu)
```

- **Tek doğruluk kaynağı URL.** Sekme, zaman, kaynak, katılım, arama, hafta, kart boyutu, panel
  ve modal adres çubuğunda.
- **Adres → indirgeyici tek yönlü.** `syncEventsUiToRoute` eşitken `null` döner; koşulsuz bir
  `dispatch` her render'da yeni state yazar ve efekt kendi kendini tetiklerdi.
- **Sağ sütun tek.** Panel açıkken ajanda rayı `unmount` olur, `hidden` değil. Kaynak testi bu
  kuralı üçlü işleci arayarak kilitliyor.
- **`useEventsRealtime()` bir kez** mount edildi — Ş4'ün devir notunun karşılığı. Kabukta
  mount edilseydi `/events` dışındaki her rota da herkese açık odaya abone olurdu.
- **Sorgu:** `useInfiniteQuery`, `limit = selectEventsDensity(scale).gridPageSize`. Sayaçların
  ayrı sorgusu **yok** — aynı yanıtın içindeler (SPEC §8).
- **Bağımlılıklar ilkel (tuzak #12):** `const { fetchNextPage, hasNextPage, isFetchingNextPage,
isError, isPending, refetch } = listQuery;`

---

## 2. Kayda geçen kararlar ve sapmalar

### 2.1 `push` / `replace` ayrımı iki yerde yaşıyor ama tek kural

PROMPT §4: "Bu ayrım `buildEventsHref` çağrı yerinde değil, `pushRoute` / `replaceRoute` iki
yardımcısında durur."

Uygulamada kural bir **saf işlev**: `eventsNavigationMode(patch)` — yama `panel` ya da
`createOpen` taşıyorsa `push`, aksi hâlde `replace`. `pushRoute` ve `replaceRoute` ikisi de
onu çağıran tek bir `navigate`in üstünde duruyor.

Bildirimsel bağlantılar (sekme, hafta oku, gün kutusu) ise `<Link replace>` yazıyor. Bunlar
`navigate`ten geçmiyor çünkü gerçek bir `href` taşımaları gerekiyor: paylaşılabilir adres, orta
tıkla yeni sekme ve sağ tık menüsü bir `onClick` ile gelmiyor. Üçü de **istisnasız** filtre
olduğu için `replace` sabit; bir `push` bağlantısı yok. Test bunu `data-nav="replace"`
işaretiyle sayıyor (şeritte 9 bağlantı: 2 ok + 7 gün).

### 2.2 `viewerCanCreate` yanıtta yok — istemcide türetildi

PROMPT §2: "`GET /api/v1/events` yanıtına `viewerCanCreate: boolean` alanı eklenir (Ş1
sözleşmesine ait; burada tüketilir)."

**Ş1 bu alanı eklemedi** ve `EventsListResponseSchema` Dalga 0'da dört alanla donduruldu
(`items`, `nextCursor`, `counts`, `week`). Eklemek `packages/types` ve `lib/events/events-service.ts`
dosyalarına dokunmak demekti; ikisi de bu şeridin sahiplenilen listesinde **yok**.

Uygulanan: `deriveEventsViewerCanCreate(items)` = `items.some((item) => item.viewerCanManage)`.

Sınırı açıkça yazıyorum: **listede yetkili tek bir kart bile yoksa `Oluştur` girişleri
kapalı kalır.** Yani bir sunucuda `MANAGE_EVENTS` taşıyan ama o filtrede hiç etkinliği
olmayan kullanıcı butonu göremez. `TODO(api)` kodda ve §4'te.

### 2.3 Zil butonu bir uç bulamadı

PROMPT §2: "Zil butonu `eventNotifications` tercihini yazar (`PUT /api/v1/account/notifications`)."

O uç **yok**. En yakını `PATCH /api/v1/users/me/settings` ve onun `NotificationSettingsRecord`u
`eventNotifications` **taşımıyor** (`desktopNotifications`, `mobileNotifications`,
`emailNotifications`, `notificationSound`, `notificationSoundFile`). Okuma tarafı da yok:
alan bugün yalnız `GET /api/v1/events/[eventId]` yanıtındaki `reminderSuppressed` üzerinden
dolaylı görünüyor (Ş2).

Uygulanan: zil oturum içinde çalışan bir `useState` sürüyor ve alt satırın son parçasını
(`takvim bağlı` / `takvim bağlı değil`) değiştiriyor. Tercih **kalıcı değil**; uydurma bir uç
çağrılmadı. `TODO(api)` kodda ve §4'te.

### 2.4 Gün kutusu: bugün dışındaki gün zaman filtresini **kaldırıyor**

PROMPT §3: "Gün kutusuna tıklamak zaman filtresini o güne alır; bugüne tıklamak `time=today`."

`EventTimeFilter` Dalga 0'da dört değerle donduruldu (`today/week/month/past`) ve **gün başına
bir değeri yok**. Referans HTML'in `go` işleyicisi de bunu söylüyor:

```js
go: () => this.setState({ ..., time: w.today ? 'today' : null, ... })
```

Otorite HTML olduğu için (kurallar §"Bir ölçüden emin olmadığında NİHAİ OTORİTE ...
inline `style` değeridir" — burada aynı dosyanın davranış kaynağı) bugün dışındaki kutu
zaman filtresini **kaldırıyor**. Kabul listesindeki "gün kutusuna ikinci tık filtreyi
kaldırıyor" maddesi bugün kutusunda `toggleEventTimeFilter` ile karşılanıyor.

### 2.5 Daralma `display:none` değil DOM'dan düşürme

SPEC §3.1 "sekme grubu ve ikon grubu `display:none` olur" diyor; PROMPT'un kabul listesi
"**DOM'da yok**" diyor. Kabul listesi uygulandı.

Gerekçe `mentions-feed-header.tsx` ile aynı: `display:none` onları odak sırasında bırakırdı ve
432 px'e düşmüş bir akışta göremediğin bir butona `Tab` ile varmak, ekranın kaybolduğu
izlenimi verir. Görsel sonuç birebir aynı.

### 2.6 Slot sayısı dört değil yedi

PROMPT dört slot sayıyor: `renderCard`, `renderAgendaRail`, `renderDetailPanel`,
`renderCreateModal`. Üçü daha eklendi ve hepsi **yerleştirme** kararı:

| Slot              | Neden ayrı                                                                                                                        |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `renderGrid`      | Ş6'nın `EventGrid`i yalnız **dolu** hâli biliyor; hata / ilk yükleme / boş dallarının sırası **sorgunun** durumu ve o sayfaya ait |
| `renderFilterBar` | SPEC §3.3 "yalnız aktif filtre varken"; koşulun kendisi (`hasActiveEventsFilters`) durum sahibinin                                |
| `renderRsvpStrip` | Şerit durumu `eventsUiReducer`'ın içinde (`ui.rsvpBanner`) ve o bu dosyada yaşıyor                                                |

Dördünün varsayılanı da artık **gerçek bileşen**: Ş6, Ş7 ve Ş8 bu şerit sürerken indi ve
bıraktığım `TODO(Ş6/Ş7/Ş8)` yer tutucuları tek tek bağlandı. Ekran uçtan uca çiziliyor.

**`renderCard` bugün ölü bir slot.** `EventGrid` kartlarını kendi içinde kuruyor ve bir
`renderCard` propu taşımıyor; slot ancak `renderGrid` de değiştirildiğinde etkili oluyor. Prop
yerinde bırakıldı (PROMPT onu adıyla istiyor) ve sınırı tip yorumuna yazıldı.

### 2.7 Kaydırma kabı ızgaranın kendisinde

PROMPT'un iskeleti "ızgara (kaydırma alanı)" diyor; Ş6'nın `EventGrid`i kendi
`overflow-y-auto` kabını ve `grid.scrollPadding*` dolgusunu **kendi** yazıyor. Sayfanın
kabına ikinci bir `overflow` konsaydı iç içe iki kaydırıcı olur ve klavye gezinmesinin
`scrollIntoView`'u yanlış kabı sürerdi. Sayfa kabı yalnız `role="region"` +
`aria-label="Etkinlik ızgarası"` taşıyor; dolguyu ve kaydırmayı ızgara veriyor. İlk yükleme
iskeleti ızgarasız çizildiği için `--e-min` değişkenini ve dolguyu sayfa veriyor.

### 2.8 RSVP yazımı sayfaya bağlandı

`EventCard` (Ş6) `onRsvp` geri çağrısını **çağırıyor** ama isteği atmıyor; iyimser yamayı
kendi içinde tutuyor. Şeridin durumu (`ui.rsvpBanner`) ise bu dosyanın indirgeyicisinde.
İkisini birleştiren tek yer durum sahibi olduğu için mutasyon buraya bağlandı
(`setEventRsvp` → `applyEventWriteToPages`).

Yanıt güncel etkinliği **ve** güncel sayaçları birlikte döndürdüğü için ikinci istek yok
(SPEC §8). Sayaçlar **her sayfaya** yazılıyor: sonsuz listede "ilk sayfa" değişmez bir şey
değil ve tek sayfayı yamamak sayfalar arasında iki farklı sayaç bırakırdı.

`onSuccess` anahtarı bir `ref`ten okuyor: istek uçarken filtre değişmiş olabilir ve yanıtı
eski anahtara yazmak artık görünmeyen bir listeyi tazelemek olurdu.

SPEC §7 uyarınca yalnız `Katıl` onay şeridini açıyor; `Belki` ve geri alma açmıyor.

---

## 3. Sahiplenilen liste dışına dokunulan tek dosya

### 3.5 `apps/web/eslint.config.mjs`

Kabul listesi "ana kolonda ölçü sözlüğü dışında sabit px yok (`grep -n "\[[0-9]\+px\]"` boş)"
diyor. `grep` yalnız bugünü ölçer; kural onu kalıcı yapar. Arbitrary-px kapsamına
**`src/lib/events/**`** eklendi (tek satır, katkı niteliğinde).

`src/components/events/**` aynı dakikalarda **Ş7 tarafından da** eklenmişti; iki şerit aynı
satırı yazınca liste iki kopya taşıdı ve tekrar tekilleştirildi. Bugün listede her ikisi de
tek kez geçiyor.

Kapsam açıldıktan sonra `eslint .` **temiz**: `components/events` ve `lib/events` altındaki
36 dosyanın hiçbirinde arbitrary px yok.

---

## 4. Bırakılan `TODO(api):` notları

| Not                             | Yer                                                                 | Ne bekliyor                                                                                                                                                           |
| ------------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TODO(api): viewerCanCreate`    | `components/events/events-page.tsx` → `deriveEventsViewerCanCreate` | `GET /api/v1/events` yanıtına `viewerCanCreate: boolean`. Bugün yetki kartların `viewerCanManage` alanından türetiliyor; boş listede giriş kapalı kalıyor (§2.2).     |
| `TODO(api): eventNotifications` | aynı dosya → `notificationsEnabled`                                 | K7'nin hesap tercihini okuyan/yazan bir uç. `PATCH /api/v1/users/me/settings` alanı taşımıyor, PROMPT'un adlandırdığı `PUT /api/v1/account/notifications` yok (§2.3). |

Dalga 0'ın `TODO(api): recurrence generator` notu yerinde duruyor; bu şerit ona dokunmadı.

---

## 5. Kabul listesi

- [x] **Başlık altı dalın altısında da doğru metni yazıyor.** `resolveEventsFeedTitle` sekiz
      testle: arama > kaynak > `live` > `going` > `today` > varsayılan, artı "kaynak adı
      yüklenmediyse sekme dalına düş" ve "`upcoming`in kendi başlığı yok".
- [x] **Alt satır dört durumda da SPEC metniyle birebir.** Test `tr.ts`i doğrudan okuyan bir
      çeviriciyle literal karşılaştırıyor; ayrıca `takvim bağlı değil`, "hata boş durumu
      yener" ve "sayaç gelmemişken sıfır yazar" dalları.
- [x] **Detay paneli açıkken sekme grubu ve ikon grubu DOM'da yok** — başlık ve alt satır
      kalıyor.
- [x] **432 px'de başlık tek satır.** `flex-wrap:nowrap`, başlık bloğu `flex:1 1 10.625rem` + `min-width:0`, başlık **ve** alt satır `text-overflow:ellipsis` (test ikisini de
      sayıyor), sekme ve ikon grupları `flex:none`.
- [x] **Hafta şeridi 7 gün, gün başına en çok 4 nokta, bugün vurgulu** (`--primary/.14` zemin,
      `--primary/.45` kenar, `aria-current="date"`).
- [x] **`‹` bir hafta geri götürüyor** (`/events?week=2026-08-17`); ay sınırında etiket
      `Ağu – Eyl 2026`, yıl sınırında `Ara 2026 – Oca 2027`.
- [x] **Gün kutusuna ikinci tık filtreyi kaldırıyor** — bugün kutusunda `time=today` ↔ yok;
      bugün olmayan kutu HTML otoritesiyle filtreyi kaldırıyor (§2.4).
- [x] **`viewerCanCreate: false` iken `Oluştur` butonu çizilmiyor**; kart boyutu ve zil
      kalıyor.
- [x] **Kart boyutu düğmesi `?size=large` yazıyor ve `localStorage`'a düşüyor.**
      `commitEventCardSize` ikisini tek çağrıda yapıyor; test enjekte edilmiş bir yazıcıyla
      ikisini de görüyor ve varsayılana dönüşte parametrenin **silindiğini** de doğruluyor.
- [x] **Filtre değişimi `replace`, panel/modal `push`.** `eventsNavigationMode` yedi testle;
      "panel + filtre aynı yamada gelirse push kazanır" dâhil.
- [x] **Ana kolonda ölçü sözlüğü dışında sabit px yok.** `grep` boş **ve** eslint kapsamı
      açıldı (§3.5). Sabit renk de yok: başlıkta hiç hex yok, `#fff` yerine `text-white`.
- [x] **`Esc` merdiveni: modal açıkken yalnız modal, sonra panel.** `resolveEventsEscapePatch`
      merdiveni `eventsUiReducer`'dan **okuyor**; test iki sonucun aynı olduğunu ayrıca
      iddia ediyor.

---

## 6. Kapı çıktısı

```
pnpm --filter @wizards/web typecheck    → exit 0, 0 hata
pnpm --filter @wizards/web lint         → ℹ tests 10  pass 10  fail 0 · eslint temiz (çıktı yok)
```

Bu şeridin sahiplendiği dört süit:

```
src/lib/events/week.test.ts                          tests 24  pass 24  fail 0
src/components/events/event-week-strip.test.tsx      tests 27  pass 27  fail 0
src/components/events/events-feed-header.test.tsx    tests 41  pass 41  fail 0
src/components/events/events-page.test.tsx           tests 42  pass 42  fail 0
                                                     ----------------------------
                                                     tests 134 pass 134 fail 0
```

Ş0.3'ün parity kapısı da yeşil kaldı: `src/lib/events/parity.test.ts` 18/18.

Tam süit sonucu §6.2'de.

### 6.1 Süreç — test önce

| Modül                    | Kırmızı                                    | Yeşil |
| ------------------------ | ------------------------------------------ | ----- |
| `lib/events/week.ts`     | `ERR_MODULE_NOT_FOUND: week`               | 24/24 |
| `event-week-strip.tsx`   | `ERR_MODULE_NOT_FOUND: event-week-strip`   | 27/27 |
| `events-feed-header.tsx` | `ERR_MODULE_NOT_FOUND: events-feed-header` | 41/41 |
| `events-page.tsx`        | `ERR_MODULE_NOT_FOUND: events-page`        | 42/42 |

İki gerçek kırmızı daha görüldü ve ikisi de bir kusuru yakaladı:

1. `resolveEventWeek` sunucu yanıtı **kısmi** geldiğinde eşleşmeyen kutuya istemcinin
   tahminini koyuyordu ve iki kutu birden "bugün" oluyordu. Kural düzeltildi: yanıt geldiyse
   `isToday` bütünüyle sunucunundur.
2. Başlık testlerinin yedisi öznitelik **sırasına** bağlıydı (`data-testid` önce gelsin
   varsayımı). Bu bir uygulama ayrıntısı; testler açılış etiketinin tamamını çıkarıp iddiayı
   onun üzerine kurdu.

**Dürüstlük notu:** §2.6'da anlatılan bağlama işi (filtre şeridi durumu, RSVP yazımı, ızgara
dallarının sırası) Ş6/Ş7/Ş8 bu şerit sürerken indiği için **kod önce, test sonra** yazıldı.
`buildEventsFilterBarState`, `hasActiveEventsFilters`, `eventsFilterRemovalPatch`,
`EVENTS_CLEAR_FILTERS_PATCH` ve `applyEventWriteToPages` bugün 12 testle kaplı ama bu beş
işlevde sıra kaçtı.

### 6.2 Tam süit

```
pnpm --filter @wizards/web test
  ℹ tests 5155   pass 5150   fail 4   (1 atlandı)
```

**Web kapısı tam yeşil değil: 4 kırmızı var ve dördü de bu şeridin diff'inin dışından
geliyor.** Üçü Dalga 0'dan beri kayıtlı, biri Dalga 1'in kendi içinde açık kalmış bir
sözleşme çelişkisi.

| Kırmızı                                                                                | Dosya                                    | Kaynak                                                                                                                                                                                                                                                                                                                                                               |
| -------------------------------------------------------------------------------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `requires mutating routes to either parse JSON centrally or be documented as bodyless` | `app/api/v1/route-contract.test.ts`      | `mobile/channels/[channelId]/messages/[messageId]/thread-follow` rotalarının `PUT` ve `DELETE` metotları `BODYLESS_MUTATING_METHOD_PATHS` listesinde yok. Bahsedilmeler/thread işinden; Dalga 0 §4, Ş2 §6.1 ve Ş3 §7'de de kayıtlı.                                                                                                                                  |
| `hafif istek \`limit=0\` ile gider (gövde \`items\` taşımaz)`                          | `hooks/use-next-event-clock.test.ts:126` | **Ş1 ↔ Ş4 çelişkisi, hâlâ açık.** Ş4'ün testi `client.ts` kaynağında `/api/v1/events?limit=0` arıyor; Ş1'in `fetchEventCounts`i `"/api/v1/events?tab=all&limit=0"` yazıyor (`client.ts:194`). İki dosya da bu şeritte **okundu, o satıra dokunulmadı**. Çözüm iki şeritten birine ait: ya regex `tab=all`i kabul edecek ya `fetchEventCounts` parametreyi düşürecek. |
| `components/dm bütçeyi aşmaz` (×2)                                                     | `lib/messages/audit-budget.test.ts`      | `components/dm/group-create-dialog.tsx` token borcu. Mesajlar dalgasından; Dalga 0 §4'te kayıtlı.                                                                                                                                                                                                                                                                    |

Bu şerit `components/dm` altına, `api/v1/route-contract.test.ts`e, `use-next-event-clock.*`a ve
`client.ts`e dokunmadı. Dördü de kendi paketlerine/şeritlerine ait: **kapatılmadı, kayda
geçirildi.**

Karşılaştırma için: aynı dört kırmızı `pnpm --filter @wizards/web test` çıktısında Ş3'ün
raporunda da (4758 test) duruyordu; test sayısı Dalga 2'nin dört şeridiyle 5155'e çıktı ve
kırmızı sayısı **artmadı**.

### 6.3 Tarayıcıda doğrulama yapılmadı

`/events` `(main)` grubunun altında ve layout oturum istiyor; kimliksiz bir dev sunucusu
`/login`e yönlendirir ve hiçbir şey kanıtlamaz. Bu şeridin kapısı `typecheck` + `lint` +
`test`; üçü de yukarıda. Görsel parity Ş10'un (`11-dalga3-s10-temizlik-parity-qa.md`) işi.

---

## 7. Dalga 2'nin kalanına / Dalga 3'e devreden

- **Sonsuz kaydırma bağlı değil.** `handleLoadMore` (ilkel bağımlılıklarla, tuzak #12) ızgara
  slotunun girdisinde duruyor ama `EventGrid` bir `onLoadMore` propu ya da sentinel taşımıyor.
  İkinci sayfa bugün hiç çekilmiyor. Ş9/Ş10'un işi: ya ızgaraya bir sentinel propu eklenir ya
  da gözlemci ızgaranın kendi kabına taşınır.
- **Klavye gezinmesi bağlı değil** (SPEC §7 `←/→/↑/↓`, `Enter`, `K`). `ui.cursor` ve
  `onCursorChange` slot girdisinde hazır; kolon sayısını ölçen `ResizeObserver` (tuzak #5)
  yazılmadı. `Esc` merdiveni çalışıyor.
- **`newEventCount` çizilmiyor.** Ş4'ün sinyali slot girdisinde (`newEventCount`,
  `onResetNewEvents`) ama akış başında bir şerit çizen kimse yok.
- **`renderCard` ölü slot** (§2.6). `EventGrid`e bir `renderCard` propu eklenmediği sürece
  yalnız `renderGrid` ile birlikte değiştirilebiliyor.
- **İki `TODO(api)`** (§4): `viewerCanCreate` ve `eventNotifications`. İkisi de bir uç
  açıldığında tek satırlık değişiklik.
- **`components/screens/events-screen.tsx` hâlâ ağaçta.** Rota artık `EventsPage`e bağlı ve
  eski ekranı kimse çizmiyor; silinmesi Ş10'un işi (00-ortak-baglam §2.1).
- **`GET /api/v1/events/list` ve `/calendar` uçları** hâlâ ağaçta ve artık bu ekran tarafından
  çağrılmıyor. Ş10'da silinecekler.
- **Varsayılan zaman penceresi kararı** (Ş1 §4.3): ekran varsayılan bir `time` **seçmedi**.
  `Tümü` sekmesi süzgeçsiz koşuyor ve Ş1'in ölçtüğü en pahalı dal bu (24 000 satırda 9 ms,
  `member` dalı `serverId_idx`e düşüyor). Kayda geçiriliyor.

**Commit atılmadı.**
