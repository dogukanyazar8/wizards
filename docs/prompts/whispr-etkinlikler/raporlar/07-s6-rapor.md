# Dalga 2 · Ş6 — `EventCard`, ızgara, gün grupları, iskelet, boş ve hata durumu · rapor

**Tarih:** 2026-08-21 · **Dal:** `uat` · **Commit:** yok (kural gereği)
**Kapsam:** `07-dalga2-s6-kart-izgara-bos-hata.md` §1–§5, kabul listesinin tamamı.

Ekranın gövdesi çizildi. Dokuz sahiplenilen dosyanın dokuzu da yazıldı; hiçbiri sorgu okumuyor,
hiçbiri mutasyon kurmuyor — kart yalnız kendi iyimser durumunu biliyor.

---

## 1. Ne landed

| Dosya                                                     | Durum                                               |
| --------------------------------------------------------- | --------------------------------------------------- |
| `apps/web/src/components/events/event-kind-tile.tsx`      | yeni — tür karesi + tür pili + canlı pili           |
| `apps/web/src/components/events/event-source-tile.tsx`    | yeni — kaynak karesi (K3 dili)                      |
| `apps/web/src/components/events/event-attendee-stack.tsx` | yeni — avatar yığını                                |
| `apps/web/src/components/events/event-card.tsx`           | yeni — kart + iyimser yamanın saf kuralları         |
| `apps/web/src/components/events/event-card.test.tsx`      | yeni, **41 test**                                   |
| `apps/web/src/components/events/event-day-group.tsx`      | yeni — `section` + `h2` + ızgara kabı               |
| `apps/web/src/components/events/event-grid.tsx`           | yeni — kaydırma alanı + gruplama + alt not          |
| `apps/web/src/components/events/event-grid.test.tsx`      | yeni, **21 test** (ızgara + iskelet + boş + hata)   |
| `apps/web/src/components/events/event-card-skeleton.tsx`  | yeni                                                |
| `apps/web/src/components/events/events-empty-state.tsx`   | yeni                                                |
| `apps/web/src/components/events/events-error-state.tsx`   | yeni                                                |
| `apps/web/src/lib/locale/messages/tr.ts` · `en.ts`        | **+1 anahtar** (`events.card.now`, bkz. §3 sapma 1) |

**62 test, 62 yeşil.** İkisi de test önce yazıldı ve kırmızı görüldü (§6.1).

### 1.1 Kart — üç nokta menüsü yok

Eylem satırında iki düğme var, üçüncüsü yok. Test bunu iki yönlü kilitliyor: markup'ta tam
**üç** `<button` var (başlık + `Katıl` + `Belki`) ve `aria-haspopup` hiç geçmiyor.

Klavye hedefi **tek**: başlık bir `<button>`. Kart gövdesindeki `onClick` fare kolaylığı, ikinci
bir sekme durağı değil — bir kartta üç durak olsaydı 24 kartlık bir ızgara klavyeyle geçilemezdi.

### 1.2 İyimser güncelleme — iki saf kural, bir bağlantı

Kart kendi durumunu tutuyor (`EventRsvpPatch { base, target }`), kararı iki saf fonksiyon
veriyor:

| Fonksiyon                                  | Kural                                                                                                                                                                                |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `resolveEventRsvpTarget(current, pressed)` | Aynı yanıta ikinci tık **kaldırır**, karşı yanıta tık **çevirir**. Toggle kararı burada, tek yerde: uç hedef durum alıyor (`SetEventRsvpSchema`), toggle değil.                      |
| `resolveDisplayedRsvp(serverRsvp, patch)`  | Üç dal: sunucu hedefe yetiştiyse yama şeffaf; sunucunun yanıtı tık anındakinden **başkasına** döndüyse yama düşer (detay panelinden yazılmış olabilir); aksi hâlde hedef gösterilir. |

Yama bir efektle temizlenmiyor, **render sırasında türetiliyor**. `useEffect` içinde `setState`
bu ekranda ayrıca yasak (`react-hooks/set-state-in-effect`) ve bir kare gecikmeli düzeltme
kullanıcıya yanıp sönen bir düğme olarak görünürdü.

Hata yolunda yama geri alınıyor ve toast çıkıyor. Sayaç, sağ ray ve RSVP onay şeridi **Ş5'in**:
kart `useMutation` / `useQueryClient` / `setQueryData` çağırmıyor ve bunun testi kaynak
taraması olarak duruyor.

**Test sınırı — açıkça:** koşucuda DOM yok, tık simüle edilmiyor. İki saf kural doğrudan
çağrılıyor, üç durumun (`null` / `going` / `maybe`) çizimi ayrı ayrı doğrulanıyor ve ikisini
birleştiren tek ifade (`resolveDisplayedRsvp(event.rsvp, patch)`) kaynak üzerinden kilitleniyor.
Uçtan uca tık yolu Ş9/Ş10'un e2e yüzeyinde.

### 1.3 Kaynak karesi — K3

`viewerIsMember === false && isPublic` → kare `--surface-tertiary` zemine düşüyor,
**%50 yuvarlanıyor** ve `TK` taşıyor. Üye olunan sunucuda köşeli (yarıçap 5) ve tint sunucu
kimliğinden türüyor (`getServerAccentStyle`, `lib/home/server-identity.ts`).

Üye olunan sunucunun herkese açık etkinliği **normal** kare çiziyor — `isPublic` tek başına
"topluluk" demek değil, izleyicinin üyeliğiyle birlikte anlam kazanıyor.

### 1.4 Izgara — tek değişken

`--e-min` **kaydırma kabına bir kez** yazılıyor; gruplar onu mirasla okuyor. Test bunu üç yönlü
kilitliyor: değişken markup'ta tam bir kez geçiyor, `medium` ve `large` çıktıları arasındaki
**tek** fark o değerin kendisi (dize karşılaştırması), ve kolonlar
`repeat(auto-fill,minmax(var(--e-min),1fr))`.

Gruplama: `today → tomorrow → week`, grup içi `startsAt ASC`. **Boş grup render edilmiyor.**
`past` kovası akışta hiç çizilmiyor (sapma #5); `time=past` seçiliyken tek `Geçmiş` grubu
çiziliyor ve diğer üçü hiç kurulmuyor.

Grup başlığındaki tarih istemcide biçimleniyor (`presentation.ts`): tek günlü grup `27 Ağustos`,
çok günlü grup `29 Ağustos – 2 Eylül` (`events.grid.dateRange`). Aralık **grubun kendi
uçlarından** türüyor — `week` kovasının sonu açık, sabit bir pencere yazılsaydı hafta şeridi
ileri sarıldığında başlık yalan söylerdi.

### 1.5 İskelet — sıçrama yok

`EVENT_CARD_MIN_HEIGHT` **ölçülerden türüyor** (`event-card.tsx`), elle yazılmıyor:
üst blok + saat bloğu + katılımcı satırı + eylem satırı. Kart da iskelet de aynı sayıyı okuyor.
Test sayıyı sözlükten bağımsız olarak yeniden hesaplayıp eşitliği ve her iki yüzeyde
kullanıldığını doğruluyor (206,1 px → `12.88125rem`).

### 1.6 Boş ve hata metinleri

İkisi de SPEC ile **karakter karakter** aynı ve testler literal dizeyle karşılaştırıyor
(`markup.includes(BODY)`). Sözlük tarafındaki ikizi `lib/locale/events-screen-copy.test.ts` —
o sözlükte durduğunu, bu dosya ekrana çıktığını kanıtlıyor.

`viewerCanCreate=false` iken `Etkinlik oluştur` çizilmiyor ve geriye tek düğme kalıyor (K4).

---

## 2. Kabul listesi

- [x] **Kartta üç nokta menüsü yok**; eylem satırında yalnız iki buton (`<button` sayısı = 3,
      `aria-haspopup` yok).
- [x] **Altı türün altısında da doğru token**; hiçbirinde hex yok. Test altı türü tek tek
      çiziyor ve `#fff` dışındaki her hex kalıbını arıyor — sonuç boş.
- [x] **Canlı kartta hem nokta hem `Canlı` metni** var; saat satırı `Şu an` + `1 sa 20 dk geçti`
      yazıyor.
- [x] **`Başlamasına {n} dk` yalnız `startsInMinutes` doluyken**, `Her çarşamba` yalnız
      `recurrenceRule` doluyken; **ikisi birden varsa tekrar yazılıyor** (HTML `e.repeat || e.soon`).
- [x] **Avatar yığını**: ilk `margin-left:0`, sonrakiler `-0.5rem`, halka `0 0 0 0.125rem
hsl(var(--surface-card))`. Önizleme boşken yığın hiç çizilmiyor, sayı metni kalıyor.
- [x] **`Katıl` basılınca** kart kenarı `--success/.4`'e dönüyor ve düğme `Katılıyorsun`
      oluyor; hata gelince yama geri alınıyor (§1.2'deki test sınırıyla birlikte).
- [x] **`Belki` ikinci tıkta yanıtı kaldırıyor** (`resolveEventRsvpTarget("maybe","maybe") === null`).
- [x] **Seçili kartta** sol 3 px `--primary` şerit (üst/alt 16) ve kenar `--primary/.5`.
- [x] **`viewerIsMember=false && isPublic`** → kaynak karesi yuvarlak ve `TK`.
- [x] **Izgara `auto-fill minmax(280px,1fr)`**, `large` iken 340 — yalnız `--e-min` değişiyor
      (dize karşılaştırmasıyla kanıtlı).
- [x] **Boş grup render edilmiyor.**
- [x] **Boş ve hata metinleri SPEC ile karakter karakter aynı** (literal test).
- [x] **`viewerCanCreate=false` iken tek buton** kalıyor.
- [x] **İskelet yüksekliği gerçek kartla aynı** — ikisi de `EVENT_CARD_MIN_HEIGHT` okuyor.

---

## 3. Kayda geçen sapmalar

`lib/events/metrics.ts` içindeki `SPEC_DEVIATIONS` dizisine **dokunulmadı** (Ş0.3'ün
sahiplendiği artefakt; `parity.test.ts` beş kaydı sayıyor). Bu şeridin sapmaları burada:

| #   | Sapma                                                                                           | Karar ve gerekçe                                                                                                                                                                                                                                                                                                                                                           |
| --- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **`events.card.now` anahtarı eklendi** (`tr.ts` + `en.ts`, sahiplenilen dosya listesinde yok).  | SPEC §3.6 ve `.dc.html` canlı kartta saat yerine `Şu an` yazıyor; Ş0.5'in 132 anahtarında karşılığı yoktu. İki seçenek vardı: canlı kartta gerçek başlangıç saatini yazmak (tasarımdan sapma) ya da tek anahtar eklemek. İkincisi seçildi; `events-screen-copy.test.ts` ve `messages.test.ts` yeşil kaldı (`NEW_KEYS.length >= 90` sınırı, iki dilin anahtar kümesi eşit). |
| 2   | **Kaynak karesi yarıçapı 5, PROMPT 9 diyor.**                                                   | PROMPT §1 "üye olunan sunucularda normal sunucu tile'ı (radius 9)" diyor; SPEC §3.6 tablosu ve `.dc.html` `:361` kartta `border-radius:5px` veriyor, `metrics.card.sourceTileRadius` de 5. **Nihai otorite HTML** (PROMPT'un kendi kuralı) → 5. `9` başka bir yüzeyin dili; kare zaten prop ile ölçü alıyor, Ş7/Ş8 kendi sayısını geçer.                                   |
| 3   | **`EVENT_DISPLAY_FONT` yerel tanımlandı.**                                                      | `components/home/home-primitives` **bu ekranda kullanılmaz** (00-ortak-baglam §2.5). Tek satırlık sınıf `event-kind-tile.tsx`'te duruyor ve aile onu oradan alıyor; `shell/server-icon.tsx` aynı deseni zaten taşıyor. Bahsedilmeler `home-primitives`'ten alıyor — o kararı bu ekrana taşımak, silinmesi planlanan bir modüle yeni bağımlılık yazmak olurdu.              |
| 4   | **`TK` bir kod sabiti** (`EVENT_PUBLIC_SOURCE_GLYPH`), sözlük anahtarı değil.                   | `EVENT_KIND_GLYPH` ile aynı sınıfta: bir cümle değil bir **işaret**. Kare zaten `aria-hidden`; yanındaki `{sunucu} › {kanal}` satırı aynı bilgiyi çevrilebilir metin olarak yazıyor.                                                                                                                                                                                       |
| 5   | **Sunucu karesinin tonu hash'ten türüyor.**                                                     | `.dc.html` `SRC` haritası sunucu başına sabit renk veriyor (`whispr` primary + `#fff`, `product` success, `oyun` warning). Bunlar **örnek veri**; ürün sabit renk ataması yapmaz (`lib/home/server-identity.ts` yorumu). `getServerAccentStyle(serverId, "panel")` kullanıldı — aynı sunucu her yüzeyde aynı tonu taşıyor ve `#fff` karta hiç girmiyor.                    |
| 6   | **RSVP hatası toast'ı `errors.genericTitle` okuyor.**                                           | `events.*` ailesinde RSVP hatasına ait bir metin yok ve sapma 1'de bir anahtar eklemek zaten sınırdaydı; ikincisi için gerekçe yoktu. Mutasyonun sahibi Ş5 kendi `onError`'unda daha özel bir metin gösterirse kartınki yedek kalır.                                                                                                                                       |
| 7   | **`--e-min` rem yazılıyor** (`17.5rem` / `21.25rem`), px değil.                                 | SPEC ve HTML `280px` / `340px` diyor; tuzak #10 arbitrary px'i yasaklıyor ve ölçek motoru kök font boyutunu büyütüyor. rem yazılınca 2K/4K'da kolon genişliği içerikle birlikte büyüyor — `EVENTS_DENSITY`'nin sayfa boyutunu ölçekle artırmasıyla aynı yön. Sayı sözlükten (`grid.minColumnWidth`) geliyor, dosyada çıplak px yok.                                        |
| 8   | **Durum sayfası adresi `process.env`'den okunuyor**, `WHISPR_STATUS_PAGE_URL` içe aktarılmıyor. | `lib/app/service-status.ts` `lib/health` üzerinden **Prisma'ya** bağlanıyor; istemci bileşeninden içe aktarmak sunucu kodunu tarayıcı paketine çekerdi (Ş4'ün §7'de uyardığı zincirin aynısı). Değişken tanımlı değilse buton çizilmiyor. `TODO(api):` §4'te.                                                                                                              |
| 9   | **Boş / hata / iskelet testleri `event-grid.test.tsx` içinde.**                                 | Sahiplenilen dosya listesi **iki** test dosyası veriyor (`event-card.test.tsx`, `event-grid.test.tsx`) ve liste bağlayıcı. Üç ayrı test dosyası açmak yerine ızgara dosyası prompt'un kendi başlığını taşıyor: "ızgara, boş ve hata".                                                                                                                                      |
| 10  | **Grup tarihi grubun kendi uçlarından.**                                                        | SPEC sabit örnekler veriyor (`29 Ağustos – 2 Eylül`); `week` kovası sunucuda "yarından sonrası" olarak tanımlı ve sonu yok (`toDayBucket`). Sabit pencere yazılsaydı hafta şeridi ileri sarıldığında başlık yalan söylerdi.                                                                                                                                                |
| 11  | **`EVENT_CARD_MIN_HEIGHT` yeni bir dışa aktarım.**                                              | Prompt "iskelet gerçek kartın yüksekliğini taşır" diyor ama sözlükte kart yüksekliği yok — çünkü yükseklik bir ölçü değil, ölçülerin **toplamı**. Elle yazılmış bir sayı bir gün karttan ayrışırdı.                                                                                                                                                                        |

---

## 4. Bırakılan `TODO` notları

| Not                               | Yer                                        | Ne bekliyor                                                                                                                                                                                                                                                                |
| --------------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TODO(api):` durum sayfası adresi | `components/events/events-error-state.tsx` | `WHISPR_STATUS_PAGE_URL` ve `https://status.whispr.team` yedeği istemcinin de okuyabileceği bir modüle taşınmalı (bugün `lib/app/service-status.ts` Prisma'ya bağlı). O güne kadar `NEXT_PUBLIC_WHISPR_STATUS_PAGE_URL` tanımlı değilse `Durum sayfası` butonu çizilmiyor. |

Uydurma endpoint yok; karşılığı olmayan alan üretilmedi. Kart `WhisprEvent`in dışına çıkmıyor.

---

## 5. Kapı çıktısı

```
pnpm --filter @wizards/web typecheck
```

Ş6'nın **on bir dosyasının hiçbirinde hata yok**. Ağaçtaki 37 hata paralel şeritlerden geliyor:

| Kaynak                          | Dosyalar                                                                                                                               |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Ş7 / Ş8 (aynı ağaçta koşuyor)   | `components/events/event-filter-bar.test.tsx`, `event-place-picker.test.tsx`, `event-rsvp-strip.test.tsx`, `lib/events/create-form.ts` |
| Ş5 (test önce, modül henüz yok) | `components/events/events-page.test.tsx`                                                                                               |
| Keşfet paketi                   | `app/api/v1/discover/**`, `components/discover/**`, `lib/discover/**`                                                                  |

```
pnpm --filter @wizards/web lint
  ℹ tests 10  pass 10  fail 0 · eslint temiz (çıktı yok)
```

```
pnpm --filter @wizards/web test
  ℹ tests 5106  pass 5082  fail 23  (1 atlandı)
```

Ş6'nın sahiplendiği iki süitin ikisi de yeşil:

```
src/components/events/event-card.test.tsx    tests 41  pass 41  fail 0
src/components/events/event-grid.test.tsx    tests 21  pass 21  fail 0
                                             ------------------------
                                             tests 62  pass 62  fail 0
```

Metin sözleşmesi de yeşil kaldı (yeni anahtardan sonra tekrar koşuldu):

```
src/lib/locale/events-screen-copy.test.ts + messages.test.ts   tests 20  pass 20  fail 0
```

### 5.1 Devralınan 23 kırmızı — hiçbiri bu şeridin diff'inde değil

| Kırmızı                                                                | Sayı | Kaynak                                                                                                                                   |
| ---------------------------------------------------------------------- | ---- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `components/discover/**`, `lib/discover/**`, `api/v1/discover/**`      | 17   | Keşfet paketi (izlenmeyen çalışma ağacı işi).                                                                                            |
| `components/events/event-create-modal.test.tsx`                        | 1    | **Ş8**, test-önce kırmızısı: `ERR_MODULE_NOT_FOUND: event-create-modal`.                                                                 |
| `hooks/use-next-event-clock.test.ts` → `hafif istek limit=0 ile gider` | 1    | **Ş1 ↔ Ş4 sözleşme çelişkisi**; Ş3 raporunda da kayıtlı. `fetchEventCounts` `?tab=all&limit=0` yazıyor, Ş4'ün regex'i `?limit=0` arıyor. |
| `api/v1/route-contract.test.ts`                                        | 1    | İzlenmeyen `mobile/.../thread-follow` rotaları sözleşme listesinde yok. Dalga 0 ve Ş3 raporlarında kayıtlı.                              |
| `lib/messages/audit-budget.test.ts` (×2)                               | 2    | `components/dm/group-create-dialog.tsx:608` token borcu. Mesajlar dalgasından; Dalga 0 ve Ş3 raporlarında kayıtlı.                       |
| `lib/discover/scale.test.ts`                                           | 1    | Keşfet, modül yok.                                                                                                                       |

Bu şerit `components/discover`, `components/dm`, `hooks/use-next-event-clock`, `lib/events/client.ts`
ve `api/v1/**` altına **hiç dokunmadı**.

### 5.2 Süreç — test önce

| Süit                  | Kırmızı                                                | Yeşil |
| --------------------- | ------------------------------------------------------ | ----- |
| `event-card.test.tsx` | `ERR_MODULE_NOT_FOUND: @/components/events/event-card` | 41/41 |
| `event-grid.test.tsx` | `ERR_MODULE_NOT_FOUND: @/components`                   | 21/21 |

İki kırmızı ara adım gerçek kusur değil, **testin kendi kusuruydu** ve kayda geçiyor:

1. `hairline()` düz metin döndürüyor (`max(1px, 0.0625rem)`) ve içindeki parantezler regex'te
   grup açıyordu. Test artık `escapeRegExp` ile kaçırıyor.
2. `AccountPreferenceProvider` klasik JSX dönüşümü için `import React` taşımıyor
   (`Avatar`/`Skeleton` bu yüzden yorumlu bir varsayılan içe aktarım taşıyor). Sağlayıcı Ş6'nın
   dosyası değil; ızgara testi onu kullanmaktan **vazgeçti** ve kurgudaki başlangıçları
   `12:00 UTC`ye çekti — ±11 saatlik her bölgede aynı takvim gününde kalıyorlar, dolayısıyla
   grup tarihleri koşucunun saat dilimine bağlı değil.

**Commit atılmadı.**

---

## 6. Ş5 / Ş7 / Ş9'a devreden

- **`useEventsRealtime()` hâlâ mount edilmedi** (Ş4'ün devir notu). Ş6 ekranın kökünü
  yazmıyor; kancayı **bir kez** çağıracak yer Ş5'in `events-page.tsx`'i.
- **Sayaç, sağ ray ve RSVP onay şeridi Ş5'in.** Kart `onRsvp(target)` çağırıp yamasını
  yazıyor, başka hiçbir şeye dokunmuyor. Mutasyon yanıtındaki `counts` Ş5'in elinde.
- **`now` tek yerden gelmeli.** `EventCard` ve `EventGrid` `now` propunu opsiyonel alıyor
  (verilmezse render anındaki `new Date()`). Sayfa tek bir dakika saati tutup aşağı geçirmeli;
  kart başına zamanlayıcı kurulmadı ve kurulmamalı.
- **`events.a11y.grid` anahtarı kullanılmadı.** Kaydırma kabına `role` verilmedi (prompt
  `role="grid"`i yasaklıyor, `role`süz bir `div`'de `aria-label` da okunmaz). Kaydırma
  bölgesinin adlandırılması ve klavye gezinmesi **Ş9'un** işi; tuzak #5 (kolon sayısının
  `ResizeObserver` ile ölçülmesi) de orada.
- **`src/components/events/**` eslint kapsamına eklenmedi.** `eslint.config.mjs` ve
  `scripts/eslint-config.test.mjs` bu şeridin dosyaları değil. Ş6'nın on bir dosyasında çıplak
  px yok (hepsi `pxToRem` / `pxToEm` / `hairline`), ama kural açılmadan yazılacak yeni bir
  etkinlik bileşeni bunu sessizce bozabilir. **Ş10 kapsamı açmalı.**
- **`EventSourceTile` üç ölçüyü de prop alıyor** (16 / 15 / 18). Ş7 detay panelinde
  `detailPanel.sourceTileSize`, Ş8 modalda `createModal.placeTileSize` geçmeli; K3 kuralı
  yeniden yazılmamalı.
- **`EventKindTile` / `EventKindPill` aynı şekilde prop ile ölçülüyor** — detay paneli 38×38,
  modal 26×26.
