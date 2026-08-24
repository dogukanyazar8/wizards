# Dalga 2 · Ş7 — Sağ ajanda rayı (300) ve etkinlik detay paneli (326) · rapor

**Tarih:** 2026-08-21 · **Dal:** `uat` · **Commit:** yok (kural gereği)
**Kapsam:** `08-dalga2-s7-ajanda-rayi-detay-paneli.md` §1–§3, kabul listesinin tamamı.

Sağ sütunun iki yüzü. İkisi aynı anda görünmez ve bu şerit onları **birbirinden habersiz**
bıraktı: ray paneli, panel rayı içeri almıyor; ternary Ş5'in sayfasında.

---

## 1. Ne landed

| Dosya                                                          | Durum             |
| -------------------------------------------------------------- | ----------------- |
| `apps/web/src/components/events/event-agenda-rail.tsx`         | yeni              |
| `apps/web/src/components/events/event-agenda-rail.test.tsx`    | yeni, **19 test** |
| `apps/web/src/components/events/event-agenda-timeline.tsx`     | yeni              |
| `apps/web/src/components/events/event-going-row.tsx`           | yeni              |
| `apps/web/src/components/events/event-detail-panel.tsx`        | yeni              |
| `apps/web/src/components/events/event-detail-panel.test.tsx`   | yeni, **21 test** |
| `apps/web/src/components/events/event-attendee-row.tsx`        | yeni              |
| `apps/web/src/components/events/event-reminder-strip.tsx`      | yeni              |
| `apps/web/src/components/events/event-reminder-strip.test.tsx` | yeni, **13 test** |

**53 test, 53 yeşil.** Üçü de **test önce** yazıldı ve kırmızı görüldü (§7).

Sahiplenilen liste dışında dokunulan dört dosya §4'te tek tek gerekçeli.

### 1.1 Ray filtre okumuyor — ve okuyamıyor

Kural bir yorum değil, bir **tip**: `EventAgendaRailProps` içinde `source` / `serverId` /
`query` / `tab` / `mine` alanı yok. Test props bloğunu kaynaktan okuyup bu beş kelimeyi arıyor;
biri eklenirse test düşer.

İki sorgu da sabit girdiyle kuruluyor ve girdiler **saf fonksiyon** olarak dışa aktarıldı, yani
"ne isteniyor" sorusu bir render'ı beklemeden cevaplanabiliyor:

```ts
agendaRailQueryInput(4); // { limit: 4, tab: "all", time: "today" }
agendaGoingQueryInput(3); // { limit: 3, tab: "going" }   ← `time` yok: bugüne sınırlı değil
```

`Katılacağım` bölümünün bugüne sınırlı olmadığı iki yerden kilitli: `time` alanının yokluğu ve
`dayBucket: "week"` taşıyan bir etkinliğin rayda çizildiğini gösteren render testi.

### 1.2 Önbellek anahtarına `"agenda"` halkası

`eventsQueryKeys.list(...)` `limit` taşımıyor. Ana kolonun sonsuz listesi `gridPageSize`,
rayınki `agendaRows` istiyor; halka olmadan `tab=going` açık bir ekranda iki tüketici **tek**
önbellek girdisini paylaşır ve biri diğerinin sayfa boyutunu çizerdi.

Halka öneki bozmuyor: anahtarlar hâlâ `["events","list",…]` ile başlıyor, yani Ş4'ün
`setQueriesData({ queryKey: eventsQueryKeys.lists })` yaması ray girdilerini de yamıyor.

### 1.3 Zaman çizelgesi

Referans HTML'in geometrisi birebir: 44 px saat kolonu → saat metni → `flex:1` dikey çizgi
(`margin:6px 0`), 11 px boşluk, sonra kart. Çizgi **`hairline()` değil**: hairline istisnası
1 px kenarlar içindir, buradaki 1,5 px tasarımın kendi kalınlığı ve ölçekle büyümesi gerekiyor
(tuzak #10). Test bunu ayrıca iddia ediyor (`!markup.includes(width:hairline(1.5))`).

Canlı etkinlikte saat kolonu **saati değil durumu** yazıyor (`Canlı`, `--danger`) ve kartın
sağında 6 px nokta çıkıyor. Nokta `aria-hidden`; canlı bilgisi satırın `aria-label`'ında metin
olarak duruyor (`{title} · Canlı · {kaynak}`) — renk tek başına anlam taşımıyor.

### 1.4 Detay paneli

- Zemin `--surface-panel` (HTML `:483`), `--surface-card` **değil**. Test kök öğenin `style`
  değerini birebir eşleştiriyor, "içinde geçiyor" demiyor.
- Katılımcılar `useInfiniteQuery`; `{n} kişi daha` `fetchNextPage()` çağırıyor ve sayfalar
  `mergeEventAttendees` ile **kimlik üzerinden** ayıklanarak birleşiyor.
- Açıklama boşsa (`trim()` boş) blok **hiç** çizilmiyor — bölüm etiketi de yok.
- CTA üç dal, sunucudan metin gelmiyor: `rsvp === "going"` → `Katılımı geri al`
  (`--surface-tertiary` / `--text-secondary`); `canJoinLive && joinHref` → `Yayına katıl`
  (gerçek `href` taşıyan `<Link>`, orta tık ve "yeni sekmede aç" çalışıyor); diğer → `Katıl`.
- `Paylaş` `/events?panel=<id>` adresini (`buildEventsHref`) panoya kopyalıyor ve toast
  gösteriyor. `.ics` **burada değil** — test `calendar.ics` ve `Takvime ekle` dizelerinin
  panelde geçmediğini ayrıca iddia ediyor (o Ş8'in RSVP şeridinde).

### 1.5 Odak ve `Esc`

Panel **kendi `keydown` dinleyicisini kurmuyor**; test kaynakta `keydown`, `"Escape"` ve
`closeTransient` geçmediğini doğruluyor. Merdiven Ş5'in `eventsUiReducer` çağrısında.

Odak sırası saf bir fonksiyona alındı:

```ts
applyDetailPanelFocus(closeButton, trigger); // açılışta close.focus(), dönen temizleyici trigger.focus()
```

Efekt onu `document.activeElement` ile besliyor. Kural bir DOM'a değil bir **sıraya** dair ve
iki sahte nesneyle sınanan sıra, bir tarayıcı taklidinden daha doğru bir kanıt: test tetikleyici
`null` iken kapanışta hiçbir şeye odaklanılmadığını da görüyor.

### 1.6 Hatırlatma şeridi — üç özel durum

Durum seçimi saf: `resolveEventReminderState({ reminder, rsvp, scheduled, suppressed })`.

| Girdi                 | Sonuç        | Çizim                                                                |
| --------------------- | ------------ | -------------------------------------------------------------------- |
| `rsvp !== "going"`    | `hidden`     | Şerit **yok** — hatırlatma bir RSVP sonucudur                        |
| `suppressed`          | `suppressed` | `Bildirimler kapalı` + ayarlara bağlantı; `Değiştir` **yok**         |
| `scheduled === false` | `tooSoon`    | `Etkinlik çok yakın, hatırlatma gönderilmeyecek`; tercih yine yazılı |
| tercih kapalı / yok   | `off`        | `Hatırlatma kapalı`                                                  |
| tercih açık           | `on`         | `Hatırlatma açık` / `Başlamadan {n} dk önce`                         |

`scheduled` iki kanaldan geliyor: şeridin kendi yazımından **ve** panelin `Katıl` yanıtından
(Ş3 üç yazma ucunda da aynı gövdeyi dönüyor). İkincisi olmasaydı, 5 dakika sonra başlayan bir
etkinliğe `Katıl` diyen kullanıcı "Hatırlatma açık" yazan bir şerit görür ve bildirim hiç
gelmezdi (tuzak #8).

`Değiştir` paylaşılan `ContextMenu` kabuğunu açıyor: 5 / 10 / 15 / 30 / 60 dk + `Hatırlatma
kapalı`. Seçim iyimser yazılıyor (panelin sayfa önbelleği önce güncelleniyor), sonra
`PUT /api/v1/events/[eventId]/reminder`'a gidiyor.

---

## 2. Ş6 · Ş5 ile paylaşım — kopyalanan hiçbir şey yok

Şerit başladığında `components/events/` **boştu**; prompt bu durumda `event-kind-tile.tsx` ve
`event-source-tile.tsx` için `TODO(Ş6):` ile boş sarmalayıcı bırakılmasını istiyor. Öyle
başlandı. Şerit koşarken Ş5 · Ş6 · Ş8 ağaca indi; sarmalayıcılar **aynı oturumda** Ş6'nın
gerçek bileşenleriyle değiştirildi:

- ray `Katılacağım` satırı → `EventKindTile` (30 / radius 10)
- panel başlığı → `EventKindTile` (38 / radius 13) + `EventKindPill`
- panel bilgi kartı → `EventSourceTile` (15 / radius 5), K3'ün `TK` dilini o bileşen taşıyor

Yerel bir kopya hiçbir aşamada yazılmadı. `TODO(Ş6):` notu kalmadı.

`components/home/home-primitives` bu ekranda kullanılmıyor (00-ortak-baglam §2.5); display
font sınıfı Ş6'nın `EVENT_DISPLAY_FONT` sabitinden geliyor.

---

## 3. Sağ sütun seam'i — Ş5 ile

Ş5'in `events-page.tsx`i sağ sütunu **kendi** sarmalayıcısıyla çiziyor:

```tsx
<aside data-testid="events-right-column" style={{ borderLeft: hairline…pageDividerAlpha,
        width: pxToRem(detailPanelOpen ? columns.detailPanelWidth : columns.agendaRailWidth) }}>
  {detailPanelOpen && routeState.panel ? renderDetailPanel({…}) : renderAgendaRail({…})}
</aside>
```

Genişlik (300 / 326) ve sol ayırıcı orada. Ş7'nin bileşenleri onları **ikinci kez çizmiyor**:
iki `border-left` üst üste gelseydi ayırıcı çift kalınlıkta görünür, iki `width` de iç kolonu
1 px taşırırdı (`box-sizing: border-box`). Ray ve panel sarmalayıcıyı dolduruyor
(`h-full w-full`) ve yalnız `--surface-panel` zeminini kendileri veriyor.

Kabul maddesi "Ray 300 px, panel 326 px; ikisi aynı anda DOM'da değil" bu yüzden **seam
testiyle** kilitlendi: iki test dosyası da `events-page.tsx` kaynağını okuyup
`columns.agendaRailWidth`, `columns.detailPanelWidth`, `pageDividerAlpha` ile ayırıcıyı ve
ternary'yi (`hidden` değil) doğruluyor; bileşen tarafında da ayırıcının **çizilmediği** iddia
ediliyor.

---

## 4. Kayda geçen sapmalar

| #   | Sapma                                                                                                    | Karar ve gerekçe                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| --- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Yedi yeni i18n anahtarı** (`tr.ts` + `en.ts`, Ş0.5'in dosyası).                                        | Ş2 raporu §7 bunu adıyla devrediyor: "`reminderSuppressed` üretiliyor ama karşılığında çizilecek metin anahtarı yok… Ş7 ya mevcut bir anahtarı kullanır ya yeni anahtar ister." Eklenenler: `events.a11y.agendaRow`, `events.agenda.goingWhen`, `events.detail.reminderOff` / `reminderSettings` / `reminderSuppressed` / `reminderSuppressedSub` / `reminderTooSoon`. `Paylaş` toast'ı için **yeni anahtar açılmadı**, mevcut `common.linkCopied` kullanıldı. |
| 2   | **`events-page.tsx`in iki `TODO(Ş7)` varsayılanı bağlandı** (Ş5'in dosyası).                             | Notun kendisi bu şeride yazılmış ("Bağlama işi tek satır") ve bağlanmadan ray da panel de üretimde hiç çizilmiyordu: `/events` rotası `EventsPage`i varsayılanlarla kullanıyor. Dokunulan tek yer iki varsayılan + iki import satırı.                                                                                                                                                                                                                          |
| 3   | **Ray props'u Ş5'in yuvasına uyduruldu** (`goingRows` / `onOpenDetail` / `panelId` / `rows`).            | Prompt `selectedEventId` + `onOpenEvent` gibi adlar ima ediyordu ama Ş5 yuvayı **önce** yayımladı ve satır sayılarını yoğunluk tablosundan sayfada okuyor. İkinci bir `useUiScaleStep` okuyucusu açmak, aynı ekranda iki farklı sayfa boyutu demekti.                                                                                                                                                                                                          |
| 4   | **`account-preference-provider.tsx`e `import React`** eklendi (davranış değişmedi).                      | Sağlayıcı JSX çiziyor ama varsayılan React içe aktarımını taşımıyordu; node test koşucusunun klasik JSX dönüşümü onu çözemiyor ve **altında** render edilen her ağaç `ReferenceError: React is not defined` ile düşüyor. `ui/avatar.tsx` ve `ui/skeleton.tsx` aynı notu aynı gerekçeyle taşıyor. Alternatif, saat dilimini varsayılana (`AUTO` → makinenin bölgesi) bırakıp `15:00` iddiasını koşan makineye bağlamaktı.                                       |
| 5   | **`eslint.config.mjs` arbitrary px kapsamına** `src/components/events/**` + `src/lib/events/**` eklendi. | Kapsam kod yazılmadan önce açılır (Bahsedilmeler Ş0.1 aynı gerekçeyle `components/mentions/**` açmış). Ekleme sonrası `eslint .` **temiz**: Ş5 · Ş6 · Ş8'in dosyaları da kuralı geçiyor, yani kimseye borç yazmıyor.                                                                                                                                                                                                                                           |
| 6   | **Ray başlığındaki `{count}` çizilen satır sayısıdır**, günün toplamı değil.                             | Sayaç bloğu **filtresizdir** (tuzak #3) ve `time` uygulamıyor; yanıtta "bugün kaç etkinlik var" diye bir alan yok. `items.length` en azından yalan söylemiyor: rayın gösterdiği kadarını sayıyor. Gerçek toplam istenirse sayaçlara `today` ekseni gerekir (Ş10/Dalga 3).                                                                                                                                                                                      |
| 7   | **CTA sırasında `going`, `canJoinLive`i yener.**                                                         | Prompt'un tablosu bu sırada yazılmış. Sonuç: katıldığı bir etkinlik canlıya geçtiğinde panelin birincil butonu `Katılımı geri al` kalır, `Yayına katıl` olmaz. Canlıya giriş kartın ve ray satırının kendi yolundan açık.                                                                                                                                                                                                                                      |
| 8   | **Panel CTA'sı RSVP onay şeridini açmıyor.**                                                             | SPEC §7 şeridi `Katıl (e1)` satırına, yani **ızgara kartına** bağlıyor; Ş8 şeridi oradan besliyor. Panelden verilen `going` yanıtı yalnız paneli ve sayaçları tazeliyor.                                                                                                                                                                                                                                                                                       |
| 9   | **Rol pili yarıçapı `rounded-full`.**                                                                    | HTML `border-radius:999px` diyor; sözlükte `rolePillRadius` yok ve sözlük Ş0.3'ün donmuş artefaktı. Sınıf bir arbitrary px değil, tam yuvarlaklık.                                                                                                                                                                                                                                                                                                             |
| 10  | **Katılımcı sayfalaması `useInfiniteQuery`, imleç halkası değil.**                                       | Ş2 raporu §7 anahtara `[…details(id), cursor]` halkası öneriyordu. Sayfaları sorgunun kendisine bırakmak, Ş4'ün `event:updated` → `invalidateQueries(details(id))` çağrısının **bütün** sayfaları birden tazelemesini sağlıyor; halkalı anahtarlarda ikinci sayfa bayat kalırdı.                                                                                                                                                                               |

---

## 5. Bırakılan `TODO` notları

Yok. Bu şerit karşılığı olmayan bir alan üretmedi; ray ve panelin her değeri ya Ş1/Ş2'nin
yanıtından ya ölçü sözlüğünden geliyor. Ş6'ya bırakılan geçici sarmalayıcılar da aynı oturumda
gerçek bileşenlerle değiştirildi (§2).

---

## 6. Kabul listesi

- [x] Ray ve panel sarmalayıcıyı dolduruyor; 300 / 326 ve ternary `events-page.tsx`te, seam
      testiyle kilitli. İkisi aynı anda DOM'da değil (ne kaynakta birbirini içeri alıyorlar, ne
      çıktıda birbirinin `data-testid`'si geçiyor).
- [x] Zaman çizelgesi: 44 px saat kolonu, `pxToRem(1.5)` çizgi, sol 3 px tür şeridi.
- [x] Canlı etkinlikte saat yerine `Canlı` + `--danger`; sağda 6 px nokta, nokta `aria-hidden`.
- [x] Seçili etkinlikte ray kartı `--primary/.1` zemin, `--primary/.35` kenar.
- [x] Ray listesi ekran filtrelerinden bağımsız: props'ta filtre ekseni yok, sorgu girdileri
      sabit ve saf fonksiyondan geliyor.
- [x] `Katılacağım` bugünle sınırlı değil (`time` alanı yok; `week` kovalı etkinlik çiziliyor).
- [x] `viewerCanCreate=false` iken alt bölüm hiç render edilmiyor — `border-top` da çıkmıyor.
- [x] Panel CTA üç durumda da doğru metin ve doğru zemin.
- [x] Açıklama boşken blok çizilmiyor.
- [x] Rol pilleri dört rolde de `EVENT_ATTENDEE_ROLE_TONE`dan geliyor. **`Dinliyor` yalnız
      canlı etkinlikte çıkar** kuralı sunucuda: Ş2 `listening` dalını `isLive && channelId`
      kapısının içine koydu ve `SCHEDULED` etkinlikte `VoiceState` sorgusunu hiç açmadığını
      kendi testiyle kanıtlıyor. Panel gelen rolü çiziyor, rol üretmiyor.
- [x] `{n} kişi daha` ikinci sayfayı getiriyor (`fetchNextPage`), aynı kişiyi tekrarlamıyor
      (`mergeEventAttendees` + iki sayfalık render testi: satır sayısı 3, `Mert Kaya` bir kez).
- [x] Hatırlatma şeridi üç özel durumda da doğru; `going` değilken çizilmiyor.
- [x] Panel açılışında focus kapatma butonunda, kapanışta tetikleyicide.
- [x] Panel kendi `Esc` dinleyicisini kurmuyor (kaynakta `keydown` / `"Escape"` yok).

---

## 7. Süreç — test önce

| Dosya                           | Kırmızı                                        | Yeşil |
| ------------------------------- | ---------------------------------------------- | ----- |
| `event-agenda-rail.test.tsx`    | ✔ `ERR_MODULE_NOT_FOUND: event-agenda-rail`    | 19/19 |
| `event-detail-panel.test.tsx`   | ✔ `ERR_MODULE_NOT_FOUND: event-detail-panel`   | 21/21 |
| `event-reminder-strip.test.tsx` | ✔ `ERR_MODULE_NOT_FOUND: event-reminder-strip` | 13/13 |

Üç dosya da bileşenlerden **önce** yazıldı ve ilk koşu üçünde de modül bulunamadı hatasıyla
düştü.

---

## 8. Kapı çıktısı

```
pnpm --filter @wizards/web typecheck    → exit 0, çıktı yok
pnpm --filter @wizards/web lint         → ℹ tests 10  pass 10  fail 0 · eslint temiz (exit 0)
pnpm --filter @wizards/web test         → ℹ tests 5155  pass 5150  fail 4  (1 atlandı)
```

`typecheck` ve `lint` **tam yeşil**. Test kapısında dört kırmızı var ve dördü de bu şeridin
diff'inin dışından geliyor:

| Kırmızı                                                                                | Dosya                                    | Kaynak                                                                                                                                                                                        |
| -------------------------------------------------------------------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `requires mutating routes to either parse JSON centrally or be documented as bodyless` | `src/app/api/v1/route-contract.test.ts`  | İzlenmeyen mobil `thread-follow` rotaları sözleşme listesine eklenmemiş. **Devralındı** — Dalga 0 raporu §4 ve Ş3 raporu §7 aynı kırmızıyı taşıyor.                                           |
| hafif istek `limit=0` ile gider (gövde `items` taşımaz)                                | `src/hooks/use-next-event-clock.test.ts` | **Ş1 ↔ Ş4 sözleşme çelişkisi**: Ş4'ün testi kaynakta `/api/v1/events?limit=0` arıyor, Ş1'in `fetchEventCounts`i `?tab=all&limit=0` yazıyor. Ş3 raporu §7'de kayıtlı; iki şeritten birine ait. |
| `components/dm bütçeyi aşmaz`                                                          | `src/lib/messages/audit-budget.test.ts`  | `components/dm/group-create-dialog.tsx:608` token borcu (`background: hsl(${PRESENCE_TONE[...]})`). Mesajlar dalgasından; Dalga 0 raporu §4'te kayıtlı.                                       |
| `components/dm bütçesi gerçekten harcanmış`                                            | aynı dosya                               | Aynı borç kaydının ikinci yüzü.                                                                                                                                                               |

Bu şerit `components/dm` altına, `route-contract.test.ts`e, `client.ts`e ve
`use-next-event-clock.*`a **dokunmadı**. Dördü de kendi paketlerine/şeritlerine ait:
kapatılmadı, kayda geçirildi.

Ş7'nin sahiplendiği süitlerin hepsi yeşil:

```
✔ EventAgendaRail — kolon                        (3/3)
✔ EventAgendaRail — zaman çizelgesi              (7/7)
✔ EventAgendaRail — filtre bağımsızlığı          (5/5)
✔ EventAgendaRail — oluştur girişi (K4)          (2/2)
✔ EventAgendaRail — ray ↔ panel                  (1/1)
✔ EventDetailPanel — kolon                       (4/4)
✔ EventDetailPanel — gövde blokları              (3/3)
✔ EventDetailPanel — katılımcılar                (6/6)
✔ EventDetailPanel — CTA (Ş2'nin üç alanı)       (4/4)
✔ EventDetailPanel — odak ve `Esc`               (3/3)
✔ resolveEventReminderState — üç özel durum      (4/4)
✔ EventReminderStrip — çizim                     (6/6)
✔ EventReminderStrip — menü ve yazma             (3/3)
```

Not: `lib/events/*.test.ts` dosyaları **runner dışında** koşturulduğunda
`DATABASE_URL is required for the PostgreSQL Prisma adapter.` ile düşüyor; env'i
`scripts/run-node-tests.mjs` veriyor. Kapı komutuyla koşulduğunda hepsi yeşil.

---

## 9. Dalga 3'e devreden

- **Ray başlığındaki gün sayısı** çizilen satır kadar (§4 sapma 6). Günün gerçek toplamı
  istenirse sayaç bloğuna `today` ekseni gerekiyor ve o eksen tuzak #3'ün kuralını
  (sayaçlar filtresizdir) delmeden eklenmeli.
- **Ray boş/hata durumu** tek satırlık bir metin (`events.calendar.emptyDay` /
  `events.error.title`). Tasarımda rayın kendi boş durumu çizilmemiş; Ş9/Ş10 bir yüzey isterse
  ölçüsü sözlükte yok.
- **`event-attendee-row` yalnız panelde kullanılıyor.** Ş8'in modalı katılımcı listesi
  çizmiyor; ortaklaştırma gerekmedi.
- **Küçük ekran (SPEC §11):** panel `<1100` overlay olmalı, ray `<720` katlanır bloğa dönmeli.
  Sarmalayıcı Ş5'in, kırılım Ş9'un işi; bu şerit kırılım kuralı yazmadı ve
  `columns.detailPanelOverlayBelow` / `agendaRailDropsBelow` sözlükte hazır bekliyor.
- **Devralınan kırmızılar bu şeridin dışında** (§8). `typecheck` listesindeki dosyaların hiçbiri
  Ş7'nin değil: `event-create-modal` · `event-place-picker` · `event-filter-bar` ·
  `event-rsvp-strip` · `lib/events/create-form.ts` (Ş8) ve `discover/*` (Keşfet paketi).

**Commit atılmadı.**
