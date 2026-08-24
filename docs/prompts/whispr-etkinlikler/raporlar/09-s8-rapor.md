# Dalga 2 · Ş8 — Oluştur modalı (560), filtre şeridi, RSVP onay şeridi · rapor

**Tarih:** 2026-08-21 · **Dal:** `uat` · **Commit:** yok (kural gereği)
**Kapsam:** `09-dalga2-s8-modal-filtre-rsvp-seridi.md` §1–§3, kabul listesinin tamamı.

Üç bağımsız yüzey indi. Modalın **kuralları** React'sız bir modülde (`lib/events/create-form.ts`)
yaşıyor; bileşenler yalnız çiziyor. Bu ayrım keyfi değil: "tür değişince uyumsuz kanal temizlenir"
(K10) kuralının testi bir tıklama dizisine bağlansaydı, bu depoda hiç koşamazdı — web'in test
koşucusu DOM'suz (`renderToStaticMarkup`), bir tarayıcı yok.

---

## 1. Ne landed

| Dosya                                                        | Durum                                                        |
| ------------------------------------------------------------ | ------------------------------------------------------------ |
| `apps/web/src/lib/events/create-form.ts`                     | yeni — saf form modeli, süzme, doğrulama, `CreateEventInput` |
| `apps/web/src/lib/events/create-form.test.ts`                | yeni, **36 test**                                            |
| `apps/web/src/components/events/event-create-modal.tsx`      | yeni — `EventCreateForm` (çizim) + `EventCreateModal` (veri) |
| `apps/web/src/components/events/event-create-modal.test.tsx` | yeni, **20 test**                                            |
| `apps/web/src/components/events/event-kind-picker.tsx`       | yeni — 3 kolon, 6 seçenek, `radiogroup`                      |
| `apps/web/src/components/events/event-datetime-field.tsx`    | yeni — yerel tarih-saat                                      |
| `apps/web/src/components/events/event-place-picker.tsx`      | yeni — türe göre süzülen yer seçici                          |
| `apps/web/src/components/events/event-place-picker.test.tsx` | yeni, **19 test**                                            |
| `apps/web/src/components/events/event-filter-bar.tsx`        | yeni + `buildEventFilterChips`                               |
| `apps/web/src/components/events/event-filter-bar.test.tsx`   | yeni, **11 test**                                            |
| `apps/web/src/components/events/event-rsvp-strip.tsx`        | yeni + `describeEventRsvpStrip`                              |
| `apps/web/src/components/events/event-rsvp-strip.test.tsx`   | yeni, **13 test**                                            |
| `apps/web/src/lib/locale/messages/{tr,en}.ts`                | **+17** anahtar (§4 sapma 3)                                 |
| `apps/web/src/components/events/events-page.tsx`             | **3 nokta** — `renderCreateModal` bağlandı (§4 sapma 9)      |

**99 test**, hepsi yeşil. Beş süitin beşi de **test önce** yazıldı ve kırmızı görüldü (§7).

### 1.1 `create-form.ts` — modalın bütün kuralları

Modal `useState` + saf indirgeyici üzerinden sürülüyor; dosya React, DOM ve ağ **bilmiyor**.

- `EVENT_CREATE_KIND_CHANNEL_TYPES` — K10 haritası, `mutations.ts`teki sunucu haritasının
  kopyası. Kopya olmak zorunda: `mutations.ts` Prisma + outbox + `ApiError` zincirini içeri
  alıyor ve tarayıcı paketine giremez. **Ayrışma testle kilitli**: `create-form.test.ts` iki
  haritayı `deepEqual` ile karşılaştırıyor, biri değişirse kırmızı.
- `eventCreateFormReducer` — dokuz eylem. `setKind` seçili kanalı yeni kurala uyup uymadığına
  bakarak ya korur ya düşürür; düşürdüğünde `channelCleared` bayrağı doğar ve alan **uyarı
  gösterir**.
- `selectEventPlaceChannels(channels, kind)` — altı tür için ayrı ayrı test edilmiş süzgeç.
- `withEventServerType(state, type)` — sunucu tipi sonradan öğrenilir (§4 sapma 7); durum
  efektle güncellenmez, **türetilir**. Değişiklik yoksa aynı nesne döner.
- `validateEventCreateForm` → `{ ok: true, input }` | `{ ok: false, errors }`. Başarılı dalda
  girdi ayrıca `CreateEventInputSchema.parse`ten geçiyor: `channelId` + `externalLocation`
  birlikte üretilirse hata ağ isteğine değil forma çarpar.
- `eventCreateDefaultStart(now)` — varsayılan başlangıç **en az yarım saat ileride**. Tuzak #8:
  10 dakika sonrasına kurulan bir etkinlikte varsayılan hatırlatma (10 dk) hiç kuyruğa yazılamaz
  ve kullanıcı sebebini görmeden `scheduled: false` alır.

### 1.2 Modal

`components/ui/modal` üzerine kuruldu: `Esc`, focus tuzağı ve kapanışta tetikleyiciye dönüş
oradan geliyor, ikinci bir tuzak yazılmadı. Kabuğun `hideHeader`ı kullanıldı — SPEC §6 başlığı
38×38 ikon, 17 px başlık ve 32×32 kapat istiyor; `Modal`ın kendi başlığı `text-xl` ve 44 px
kapat düğmesi çiziyor.

**Açılışta odak tür ızgarasının ilk seçeneğinde.** `Modal` çalışma ağacında bu iş sürerken
`initialFocusRef` propunu kazandı (paralel bir şeridin işi, §4 sapma 10); Ş8 onu **okudu**:
`firstKindRef` modala veriliyor, `Modal` odağı kendi kapat düğmesi yerine oraya koyuyor.

Gönderim: `Oluştur` pasif + `createMutation.isPending`. Başarıda üç şey oluyor — liste ve sayaç
anahtarları geçersiz kılınıyor, toast çıkıyor, `onCreated(event)` çağrılıyor ve sayfa yeni
etkinliğin panelini açıyor (`pushRoute({ panel: eventId })`).

**Tekrar alanı yok** (K6). Test bunu bir sayı olarak tutuyor: çizilen HTML'de `Tekrar` sözcüğü
**tam bir kez** geçiyor, o da alt metnin kendisi.

### 1.3 Filtre şeridi

`buildEventFilterChips(state)` saf; şerit çip yoksa **hiç render edilmiyor** (`""`).

Çip sırası zaman → kaynak → katılım → arama, referans HTML'in `activeFilters` dizisiyle aynı.
Kaynak çipi bir sözlük anahtarı değil, **sunucunun kendi adı** — sunucu adı çevrilecek bir cümle
değil. Arama çipi tırnaklı (`events.filters.query` → `“{query}”`).

**Sekme çip üretmiyor** ve bunun ayrı bir testi var: yalnız `tab` seçiliyken dizi boş.
`Tümünü temizle`nin sekmeyi de `all`'a çekmesi eksen sahibinin (`onClearAll`) işi; şerit onu
çağırıyor, kendi kararını vermiyor.

Şerit `role="region"` + `aria-label`; her kaldır düğmesi gerçek bir `<button>` ve
`{label} filtresini kaldır` adını taşıyor.

### 1.4 RSVP onay şeridi

`role="status"` + `aria-live="polite"`, sekiz saniyede kendiliğinden kapanıyor
(`EVENT_RSVP_STRIP_AUTO_DISMISS_MS`), geçiş yalnız `motion-safe:` altında —
`prefers-reduced-motion` açıkken doğrudan kayboluyor.

Alt satırdaki `{n}` **gerçek tercihten** geliyor: `event.reminder.minutesBefore`. Sabit `10`
hiçbir yerde yazılı değil ve testi 30 dakikalık bir tercihle koşuyor. Üç durumda hatırlatma
cümlesi **hiç yazılmıyor** ve `events.rsvp.bannerSubPlain` (`{day} {time}`) devreye giriyor:

1. Ş3 `scheduled: false` döndüyse (etkinlik seçilen dakikadan yakın, tuzak #8),
2. hatırlatma satırı yoksa,
3. satır var ama `enabled: false`.

Gelmeyecek bir bildirimin sözü verilmiyor.

`Takvime ekle` bir `<a download href="/api/v1/events/:id/calendar.ics">` — `fetch` değil.
`Content-Disposition`daki dosya adının korunmasının tek yolu bu (K7); blob üzerinden indirmek adı
kaybeder.

**Şerit kuyruğa alınmıyor:** ikinci bir `Katıl` yanıtında `eventsUiReducer` yeni şeridi açıyor,
bileşen yeni etkinlikle yeniden monte oluyor ve sekiz saniyelik zamanlayıcı sıfırlanıyor.

---

## 2. Kabul listesi

- [x] Modal 560 px; `Esc` kapatıyor; focus tuzağı ve dönüşü çalışıyor. _(560/22 sözlükten;
      sınıf ↔ sözlük bağı ayrı bir testle kilitli. `Esc`/tuzak/dönüş `components/ui/modal`ın
      davranışı — bu depoda DOM testi yok, kabuk okundu ve değiştirilmedi.)_
- [x] 6 tür seçeneği 3 kolonda; seçili kutu `--primary/.1` + `--primary/.45`.
- [x] Tür değişince uyumsuz kanal temizleniyor ve uyarı çıkıyor.
- [x] Yer seçici kanal listesi türe göre süzülüyor (altı tür için ayrı test — hem saf modülde
      hem çizimde).
- [x] `Harici bağlantı` seçilince kanal alanı yerine URL alanı geliyor; geçersiz URL
      reddediliyor (`javascript:` ve şemasız değer dâhil).
- [x] `Topluluk keşfetinde listele` yalnız COMMUNITY sunucuda etkin; değilse pasif ve alt metin
      nedenini söylüyor.
- [x] Toggle topuz konumu açık 21 px / kapalı 3 px.
- [x] Modalda tekrar alanı **yok**; alt metin SPEC ile birebir.
- [x] Gönderim sırasında `Oluştur` pasif; başarıda modal kapanıp panel açılıyor.
- [x] Filtre şeridi yalnız aktif filtre varken çiziliyor.
- [x] Çip sırası zaman → kaynak → katılım → arama; arama çipi tırnaklı.
- [x] `Tümünü temizle` `tab`'ı da `all`'a çekiyor. _(Şerit `onClearAll`ı çağırıyor; `tab: "all"`
      yamasını eksen sahibi uyguluyor — bkz. §6 devir maddesi 1.)_
- [x] Sekme çip üretmiyor.
- [x] RSVP şeridi `{n}` değerini gerçek tercihten okuyor, sabit 10 yazmıyor.
- [x] `scheduled: false` durumunda hatırlatma cümlesi yazılmıyor.
- [x] `Takvime ekle` geçerli `.ics` indiriyor (`eventCalendarIcsHref`, `download`).
- [x] Şerit 8 saniyede kapanıyor; ikinci yanıtta yeniden açılıyor.
- [x] `role="status"` + `aria-live="polite"`.

### 2.1 İki kabul maddesinin gerçeği

**Filtre şeridi ve RSVP şeridi ekrana bağlanmadı.** Bileşenler hazır ve test edilmiş; Ş5'in
`events-page.tsx` içindeki slotları bugün `null` döndürmeye devam ediyor, çünkü slot girdileri
bu iki bileşenin ihtiyacını **karşılamıyor**:

| Slot              | Bugünkü girdi           | Eksik                                                                                                                                                            |
| ----------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `renderFilterBar` | `{ routeState }`        | `onRemove(axis)` · `onClearAll()` (ikisi de `pushRoute`/`replaceRoute` ister) · kaynak çipinin **sunucu adı** (`resolveEventsSourceTitle` sayfada zaten hesaplı) |
| `renderRsvpStrip` | `{ banner, onDismiss }` | `banner`ın gösterdiği **etkinlik nesnesi** (`items` sayfada) · Ş3 yanıtındaki **`scheduled`** bayrağı                                                            |

`scheduled` gerçek bir sözleşme boşluğu: `EventsRsvpBanner` (Ş0.1'de donduruldu) yalnız
`eventId` + `rsvp` taşıyor, `scheduled` ise `setEventRsvp` yanıtında doğuyor ve o çağrıyı Ş6'nın
kartı / Ş7'nin paneli yapıyor. Ya banner tipi bir alan daha taşımalı ya da RSVP'yi yazan yüzey
bayrağı sayfa durumunda tutmalı. `renderCreateModal` slotu bu ihtiyacı karşıladığı için
**bağlandı**; diğer ikisi §6'ya devredildi.

---

## 3. Bırakılan `TODO(api):` notları

| Not                                                 | Yer                                                                 | Ne bekliyor                                                                                                                                                                                                                                                                |
| --------------------------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TODO(api):` `MANAGE_EVENTS` istemciye gelmiyor     | `lib/events/create-form.ts` → `selectEventPlaceServers`             | `GET /api/v1/servers` yanıtı yalnız `accessLevel` taşıyor. Süzgeç bugün sahip ve yöneticiyi geçiriyor; **rolle dağıtılmış** `MANAGE_EVENTS` taşıyan bir üye listede görünmüyor. Gerçek kapı sunucuda (`ensureEventPermission` → 403); bu süzgeç yalnız listeyi kısaltıyor. |
| `TODO(api):` kanal tipi `STAGE` istemciye ulaşmıyor | `components/events/event-create-modal.tsx` → `toEventPlaceChannels` | `server-query-helpers.ts:74` her kanalı `VOICE` ya da `TEXT`e düzleştiriyor. K10 `live`/`community` için **`STAGE`** istiyor; bu iki tür bugün yalnız `Harici bağlantı` ile kurulabiliyor. Süzgeç doğru, **liste eksik**.                                                  |

Uydurma uç yok; karşılığı olmayan bir alan üretilmedi.

---

## 4. Kayda geçen sapmalar

`lib/events/metrics.ts` içindeki `SPEC_DEVIATIONS` dizisine **dokunulmadı** (Ş0.3'ün artefaktı,
`parity.test.ts` beş kaydı sayıyor). Bu şeridin sapmaları burada:

| #   | Sapma                                                                              | Karar ve gerekçe                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **`SegmentedControl` kullanılmadı.** PROMPT §1 süre alanı için onu adıyla istiyor. | `components/ui/segmented-control` ölçülerini `lib/messages/metrics` sözlüğünden alıyor: 28 px buton, 11 yarıçap, kenarsız, `inline-flex`. SPEC §6 / referans HTML ise **40 px yüksek, kenarlı, tam genişlik** bir segment çiziyor ve `EVENTS_METRICS.createModal.durationSegment*` bu değerleri taşıyor. "Ölçüler yalnız `metrics.ts`'ten" kuralı bileşen adını yendi; segment modalın içinde yazıldı ve **semantiği korundu** (`role="radiogroup"` + `role="radio"` + roving tabindex). Bahsedilmeler Ş8'in "kabuk bileşenleri SPEC ölçülerini alamıyor" kaydının aynısı. |
| 2   | **`ToggleSwitch` kullanıldı.**                                                     | Ölçüleri SPEC ile **birebir** aynı (44×26, topuz 20, kapalı 3 ↔ açık 21). Tek fark kozmetik: referans HTML topuza `0 2px 6px hsl(var(--shadow-color)/.6)` gölge veriyor, bileşende gölge yok. Bileşen "okunur, yazılmaz".                                                                                                                                                                                                                                                                                                                                                  |
| 3   | **17 yeni `events.*` anahtarı** (`tr` + `en`). Sözlük Ş0.5'in artefaktı.           | SPEC modalın doğrulama, uyarı, başarı ve boş-liste cümlelerini **yazmıyor**; karşılığı olmayan metni bileşenin içine gömmek `en` sözlüğünü ilk günden eksik bırakırdı. Eklenenler: `events.a11y.filterBar`, `events.create.{channelCleared,close,error,externalInvalid,externalPlaceholder,noServers,placeChannelLabel,placeEmpty,placeInvalid,placePlaceholder,placeServerLabel,publicDisabled,success,titleInvalid,whenInvalid}`, `events.rsvp.bannerSubPlain`. SPEC'te geçen hiçbir cümle **değiştirilmedi**; `events-screen-copy.test.ts` yeşil.                       |
| 4   | **Yer seçici panelinin ölçüleri türetildi.**                                       | SPEC §6 ve `.dc.html` yalnız **kapalı** alanı çiziyor; açılır panelin bir ölçüsü yok. Panel `createModal` bloğundan (yarıçap, boşluk, iç boşluk) türetildi; yeni sayı uydurulmadı.                                                                                                                                                                                                                                                                                                                                                                                         |
| 5   | **`isPublic` varsayılanı `false`.**                                                | Referans mock `pub: true` ile açılıyor. Ölçü otoritesi HTML'dir, **ürün varsayılanı** değil: açık doğan bir anahtar, kullanıcı hiç dokunmadan etkinliği topluluk keşfetine yazardı.                                                                                                                                                                                                                                                                                                                                                                                        |
| 6   | **Süre segmenti varsayılanı 45 dk, tür varsayılanı `voice`.**                      | Referans script'in kendi durumu (`kind: 'voice', dur: '45 dk'`). `voice` aynı zamanda ızgaranın ilk kutusu, yani açılış odağıyla tutarlı.                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 7   | **Sunucu tipi durumdan değil türetmeden geliyor.**                                 | `WorkspaceServerSummary` `type` taşımıyor, `COMMUNITY` yalnız detay yanıtında. Bilgi geldiğinde durumu bir efektle güncellemek `react-hooks/set-state-in-effect` kuralına takılırdı (bu depoda **error**); `withEventServerType` hem render'da hem `dispatch` içinde koşuyor, böylece indirgeyici her zaman gerçek tipi görüyor.                                                                                                                                                                                                                                           |
| 8   | **K10 haritası kopyalandı.**                                                       | Bkz. §1.1. Sözleşme testi kopyayı kilitliyor.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 9   | **`events-page.tsx` düzenlendi** (sahiplenilen dosya listesinde yok).              | Üç nokta: `EventCreateModal` importu, `renderCreateModalDefault`, ve slot girdisine `onCreated`. Dosyanın kendi yorumu bunu **davet ediyor** ("Bağlama işi tek satır: her varsayılan `TODO(Ş6/Ş7/Ş8)` notunu taşıyor") ve Ş7 aynı bağlamayı kendi iki slotu için yapmış. `onCreated` eklenmeseydi "başarıda panel açılıyor" kabul maddesinin karşılığı olmazdı.                                                                                                                                                                                                            |
| 10  | **`components/ui/modal.tsx` `initialFocusRef` kazandı** — bu şerit yazmadı.        | Değişiklik çalışma ağacında bu iş sürerken belirdi (paralel şerit). Ş8 propu **okudu** ve kullandı; dosyaya dokunmadı.                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 11  | **eslint arbitrary-px kapsamı genişletilmedi.**                                    | `eslint.config.mjs` `src/app/(main)/events/**` içeriyor ama `src/components/events/**` ve `src/lib/events/**` içermiyor. Dosya sahiplenilmedi ve `scripts/eslint-config.test.mjs` kapsam listesini iddia ediyor. Bu şeridin dört çizim süiti kendi çizdiği HTML'de `-[\d+px]` taraması yapıyor; kalıcı çözüm §6'ya devredildi.                                                                                                                                                                                                                                             |
| 12  | **Modal kartında `app-overlay` sınıfı kalıyor.**                                   | `Modal` kendi kabuk sınıfını her zaman yazıyor; SPEC'in `--surface-card` zemini üstüne `bg-[hsl(var(--surface-card))]` ile konuyor. Kabuğu değiştirmek "okunur, yazılmaz" sınırını aşardı.                                                                                                                                                                                                                                                                                                                                                                                 |

---

## 5. Kapı çıktısı

```
pnpm --filter @wizards/web typecheck    → exit 0, çıktı yok
```

```
pnpm --filter @wizards/web lint         → ℹ tests 10  pass 10  fail 0 · eslint temiz (çıktı yok)
```

```
pnpm --filter @wizards/web test
```

Bu şeridin sahiplendiği beş süit tek tek koşuldu, **99/99 yeşil**:

```
src/lib/events/create-form.test.ts                  tests 36  pass 36  fail 0
src/components/events/event-create-modal.test.tsx   tests 20  pass 20  fail 0
src/components/events/event-place-picker.test.tsx   tests 19  pass 19  fail 0
src/components/events/event-filter-bar.test.tsx     tests 11  pass 11  fail 0
src/components/events/event-rsvp-strip.test.tsx     tests 13  pass 13  fail 0
```

Tam süit sonucu §5.1'e işlendi.

### 5.1 Tam süit ve devralınan kırmızılar

```
ℹ tests 5155   pass 5150   fail 4   (1 atlandı)
```

**Tam yeşil değil: dört kırmızı var ve dördü de bu şeridin diff'inin dışından geliyor.** Üçü
Dalga 0 ve Ş3 raporlarında zaten kayıtlı; dördüncüsü Ş1 ↔ Ş4 çelişkisi.

| Kırmızı                                                                                | Dosya                                    | Kaynak                                                                                                                                                                                                              |
| -------------------------------------------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `requires mutating routes to either parse JSON centrally or be documented as bodyless` | `src/app/api/v1/route-contract.test.ts`  | İzlenmeyen `mobile/channels/[channelId]/messages/[messageId]/thread-follow` rotaları `BODYLESS_MUTATING_METHOD_PATHS` listesinde yok. Bahsedilmeler/thread işinden; Dalga 0 §4 ve Ş3 §7'de de kayıtlı.              |
| `components/dm bütçeyi aşmaz` + `components/dm bütçesi gerçekten harcanmış`            | `src/lib/messages/audit-budget.test.ts`  | `components/dm/group-create-dialog.tsx` token borcu. Mesajlar dalgasından; Dalga 0 §4 ve Ş3 §7'de kayıtlı.                                                                                                          |
| `hafif istek \`limit=0\` ile gider (gövde \`items\` taşımaz)`                          | `src/hooks/use-next-event-clock.test.ts` | **Ş1 ↔ Ş4 sözleşme çelişkisi:** Ş4'ün testi `client.ts` kaynağında `/api/v1/events?limit=0` arıyor, Ş1'in `fetchEventCounts`i `?tab=all&limit=0` yazıyor. Ş3 §7 aynı kırmızıyı bildiriyor; iki şeritten birine ait. |

Bu şerit `components/dm` altına, mobil rota sözleşmesine ve `use-next-event-clock.*` /
`client.ts`in Ş1 bölümüne **dokunmadı**. Dördü de kendi şeritlerine ait: kapatılmadı, kayda
geçirildi.

Ş7'nin `EventAgendaRail — kolon` kırmızısı bu iş sürerken çalışma ağacında görülmüştü; tam süit
koşusunda **yok**, sahibi kapatmış.

---

## 6. Ş9 / Ş10'a devreden

1. **Filtre şeridi ve RSVP şeridi slotları** (§2.1). `renderFilterBar` girdisi `onRemove(axis)`,
   `onClearAll()` ve kaynak adını; `renderRsvpStrip` girdisi etkinlik nesnesini ve `scheduled`
   bayrağını taşımalı. Bileşenlerin propları hazır ve testli.
2. **`EventsRsvpBanner` + `scheduled`.** Ş0.1'in tipi `scheduled`ı taşımıyor; RSVP'yi yazan
   yüzey (Ş6 kartı / Ş7 paneli) yanıttaki bayrağı bir yerde tutmalı. Aksi hâlde şerit her zaman
   hatırlatma cümlesini yazar ve tuzak #8 kullanıcıya yalan söyler.
3. **`STAGE` kanal tipi** (§3). Bu boşluk kapanmadan `live` ve `community` türleri kanala
   bağlanamıyor.
4. **`MANAGE_EVENTS` istemci yüzeyi** (§3). Rolle dağıtılmış yetki bugün yer seçicide görünmüyor.
5. **eslint arbitrary-px kapsamı** (§4 sapma 11): `src/components/events/**` ve
   `src/lib/events/**` kapsama alınmalı; `scripts/eslint-config.test.mjs` de birlikte.
6. **`Modal` kabuğunun ölçü sözleşmesi.** Kart genişliği ve yarıçapı Tailwind sınıfıyla
   yazılmak zorunda (`Modal` `style` propu almıyor, Tailwind dinamik sınıf derlemiyor); sınıftaki
   sayı `EVENT_CREATE_MODAL_CARD_STYLE` ile bir testte eşleştirildi. Kabuk bir `style` propu
   kazanırsa bu ikilik silinebilir.
7. **Süre segmentinin ortak bileşene taşınması** (§4 sapma 1): `SegmentedControl` ölçüleri
   proptan alabilseydi modal kendi segmentini yazmazdı.

**Commit atılmadı.**

---

## 7. Süreç — test önce

| Modül                    | Kırmızı                                                                                                   | Yeşil |
| ------------------------ | --------------------------------------------------------------------------------------------------------- | ----- |
| `create-form.ts`         | ✔ `ERR_MODULE_NOT_FOUND: create-form`                                                                     | 36/36 |
| `event-filter-bar.tsx`   | ✔ modül yok                                                                                               | 13/13 |
| `event-rsvp-strip.tsx`   | ✔ modül yok                                                                                               | 11/11 |
| `event-place-picker.tsx` | ✔ modül yok                                                                                               | 19/19 |
| `event-create-modal.tsx` | ✔ modül yok, sonra 2 gerçek kırmızı (seçili kutu ve segment iddiaları çizilen HTML'i yanlış dilimliyordu) | 20/20 |

Modal süitindeki iki kırmızı **testin kendi kusuruydu**: `aria-checked` özniteliği çizilen
HTML'de `data-testid`ten **önce** geliyor ve dilim onu dışarıda bırakıyordu. Testler artık
düğmenin tamamını (`<button` … `</button>`) okuyor.
