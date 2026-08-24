# Dalga 2 · Ş6 — Dört kart dili, ızgara, skeleton

**Ön koşul:** Dalga 0. **Paralel:** Ş1, Ş2, Ş3, Ş4, Ş5.
**Kapı:** dört kart testi + ızgara testi yeşil.

Kartlar **saf sunumdur**: sorgu açmaz, `router` kullanmaz. Her eylem bir prop callback'i çağırır;
URL yazımı sayfanın (Ş5) işidir.

---

## Sahiplenilen dosyalar

```
apps/web/src/components/discover/discover-server-card.tsx   (+ .test.tsx)
apps/web/src/components/discover/discover-person-card.tsx   (+ .test.tsx)
apps/web/src/components/discover/discover-channel-row.tsx   (+ .test.tsx)
apps/web/src/components/discover/discover-event-card.tsx    (+ .test.tsx)
apps/web/src/components/discover/discover-grid.tsx          (+ .test.tsx)
apps/web/src/components/discover/discover-card-skeleton.tsx
apps/web/src/components/discover/discover-presence-dot.tsx
apps/web/src/components/discover/discover-category-tile.tsx
```

---

## 0. Ortak kurallar

- Kart kökü `<article>`; içindeki her eylem gerçek `<button>`. Kartın kendisi de tıklanabilir
  (paneli açar) ama **`<button>` içinde `<button>` olmaz**. Desen: kart adı bir `<button>` içine
  alınır ve o buton `::after { position:absolute; inset:0 }` ile kartın tamamını kaplar; eylem
  butonları `position:relative` + üst `z-index` ile onun üstünde kalır.

  > `mention-card.tsx` bunu **böyle yapmıyor**: kök `<article>` doğrudan `onClick` alıyor ve
  > `aria-label` taşıyor — fare ile çalışır, klavye ile odaklanılamaz. O desen **kopyalanmaz**;
  > Keşfet kartı klavyeyle açılabilir olmak zorunda (SPEC erişilebilirlik maddesi).

- İki harfli tile `DiscoverCategoryTile` bileşeniyle çizilir; ton `DISCOVER_CATEGORIES`'ten,
  metin `toDiscoverInitials`'tan gelir. Kategori `null` ise ton `--primary`.
- Sayı biçimlendirme `formatServerProfileCount(count, locale)`.
- Presence noktası `DiscoverPresenceDot`: `success` / `warning` / `text-muted` + görünmez metin
  karşılığı (renk tek başına anlam taşımaz).
- Tüm kartlar `React.memo`.
- **Mavi doğrulama ikonu hiçbir kartta yoktur** (K10).

---

## 1. `DiscoverServerCard`

```
r 18, overflow hidden
zemin: joined ? H(surface-card) : H(surface-card/.6)
kenar 1px: selected H(primary/.5) → joined H(success/.4) → H(border/.6)
hover: border H(primary/.45) + translateY(-2px)
bant: h 46, linear-gradient(120deg, tone/.3 0%, tone/.1 100%)
tile: 44, r 14, tone/.14 zemin + tam ton, 600/15/display
      margin-top -19, box-shadow 0 0 0 3px H(surface-card)   ← banda oturur, çakışmaz
ad: 600/14.5/1.25/display, nowrap + ellipsis
meta: "{online} çevrimiçi" (6px success nokta) · 3px ayırıcı · "{members} üye" · 500/11
açıklama: 12.5/1.5 H(text-secondary), text-wrap pretty
etiketler: r 999, H(surface-soft), 600/10.5, nowrap
eylem satırı: margin-top 13, pad 11/14/13, border-top 1px H(border/.5), bg H(surface-soft/.35)
  Katıl: flex 1, h 32, r 10, H(primary)/#fff
         joined → "Katıldın", H(success/.16) zemin, H(success/.45) kenar, H(success) metin
  Önizle: h 32, padX 12, ikincil
seçili: sol 3px H(primary) şerit (top/bottom 16)
```

Kenar önceliği **sırayla** değerlendirilir: seçili > katıldı > varsayılan. Bir kart hem seçili hem
katıldıysa primary kenar kazanır.

`Katıl` butonu ikinci tıkta ayrılma tetikler (SPEC §7: "ikinci tık ayrılır"). Ayrılma **onay
istemez** — kabuk `leaveMutation`'ında onay diyaloğu var ama Keşfet kartında yok; bu bir sapma
olarak Ş6 raporuna yazılır ve Ş10 kabulünde kullanıcıya sorulur.

`aria`: kart `aria-labelledby` ile ada bağlanır; `Katıl` butonu `aria-pressed={joined}` taşır.

---

## 2. `DiscoverPersonCard`

```
pad 15/15/13, r 18, H(surface-card/.6), border 1px H(border/.6)
avatar 44 + 12 px durum noktası (2.5px H(surface-card) halka)
ad 600/14/display · kullanıcı adı 500/11.5 H(text-muted)
ortak şerit: pad 8/10, r 11, H(surface-soft/.6), 13px kişi ikonu + metin
etiketler: r 999, H(surface-soft), 600/10.5
"Arkadaş ekle" flex 1, h 32 → basınca "İstek gönderildi" (H(surface-tertiary))
32×32 profil aç düğmesi (dış bağlantı ikonu) + aria-label
```

Ortak şerit metni: `mutualServerCount > 0` ise
`discover.person.mutualServers` (`{count} ortak sunucu · {server}`), değilse
`FriendSuggestionDTO`'nun kendi gerekçe metni. İkisi de yoksa şerit **çizilmez**.

`interestTags` boşsa etiket satırı çizilmez (boş satır bırakılmaz).

`Arkadaş ekle` → `requestSent` iyimser olarak `true` olur, hata dönerse geri alınır ve toast
gösterilir. İstek mutasyonu Ş5'in sayfasında; kart yalnız callback çağırır.

Profil düğmesi mevcut `UserProfilePopover`'ı açar — yeni bir profil yüzeyi yazılmaz.

---

## 3. `DiscoverChannelRow`

```
pad 13/15, r 16, H(surface-card/.6), border 1px H(border/.6)
hover: border H(primary/.4) + background H(surface-card)
38×38 r 13 tile (kategori tonu) + hash ikonu 17
ad 600/14/display + hareket pili (Yoğun/Canlı/Haftalık/Açık/Yeni/Resmî)
alt satır: 15×15 kategori tile + kaynak metni 500/11.5, ellipsis
sağ: avatar yığını (24, -8 bindirme, 2px H(surface-card) halka) + "Önizle" 32
```

Hareket pilinin tonu `activityLabel` sınıfına bağlıdır:
`official → primary` · `live → danger` · `busy → primary` · `open → success` · `new → warning` ·
`weekly → info`.

Avatar yığını **dekoratiftir**: `aria-hidden`, satırın erişilebilir adı kanal adı + kaynak.

`Önizle` kanalın sunucusunun profil panelini açar (kanalı açmaz — kullanıcı üye olmayabilir).

Bu satır `shell/channel-item.tsx`'i **kullanmaz** (o kanal listesi satırıdır, farklı ölçü ve
farklı etkileşim); ondan yalnız hash ikonu ve ad kırpma dili alınır.

---

## 4. `DiscoverEventCard`

Etkinlikler ekranındaki kart dilinin sadeleştirilmiş hâli. **Etkinlikler ekranı henüz yeniden
tasarlanmadı** (`design_handoff/etkinlikler-paketi` uygulanmadı), bu yüzden ortak bir `EventCard`
bileşeni **yoktur** ve bu kart bağımsız yazılır.

```
42×42 tür tile'ı (entityType tonundan) · tür pili
başlık 600/14.5/display
saat + süre satırı · yer satırı
"{n} kişi ilgileniyor"
eylem satırı: "İlgileniyorum" (H(primary/.12) zemin, H(primary/.4) kenar) + "Detay"
```

Saat metni istemcide kurulur: bugün → `Bugün HH:mm`, yarın → `Yarın HH:mm`, 7 gün içinde →
`{kısa gün} HH:mm` (`Cmt 14:00`), sonrası → `d MMM HH:mm`. `Intl.DateTimeFormat` + aktif locale.
`durationLabel` boşsa süre parçası çizilmez.

`İlgileniyorum` `aria-pressed={interested}` taşır; basınca sayı iyimser olarak ±1 değişir.

> **Devir notu (Etkinlikler paketi için):** bu kart, Etkinlikler ekranı uygulandığında ortak bir
> `EventCard`'a çıkarılmalıdır. Dosya başına `TODO(etkinlikler): ortak EventCard'a çıkar` yazılır.

---

## 5. `DiscoverGrid`

```
grid-template-columns: repeat(auto-fill, minmax(var(--discover-card-min), 1fr))
gap 12
--discover-card-min: 262px (medium) | 330px (large)   ← pxToRem ile rem
```

Kanallar şeridi ızgara **değildir**: tek kolon, `gap 8` satır listesi.

Sonsuz kaydırma: `IntersectionObserver` sentinel (mevcut `ScreenInfiniteSentinel` bileşeni
kullanılır — `components/screens/screen-infinite-sentinel.tsx` zaten var). Kişiler şeridinde
sentinel kurulmaz (Ş2 §A.4: tek sayfa).

**Sanallaştırma yapılmaz.** Gerekçe: kart yüksekliği değişken, sayfa boyutu 24, kullanıcı
tipik olarak 2–3 sayfa kaydırıyor. `memo` + `content-visibility: auto` yeterli; ölçüm Ş10'da
yapılır ve 200 kartta kare düşüşü görülürse sanallaştırma ayrı bir iş olarak açılır.

Panel açıkken ana kolon 456 px'e iner ve ızgara tek kolona düşer — bu doğru davranıştır
(tuzak 7), `minmax` değeri değiştirilmez.

---

## 6. `DiscoverCardSkeleton`

**6 kart** (SPEC §7). Aktif şeridin kart iskeletini taklit eder: sunucu için bant + tile + üç
satır, kişi için avatar + iki satır, kanal için tek satır, etkinlik için tile + üç satır.
`ui/skeleton` bileşeni kullanılır, yeni skeleton primitifi yazılmaz.

Skeleton `aria-busy="true"` taşıyan bir kapsayıcı içinde; ekran okuyucuya
`aria-live="polite"` ile "Yükleniyor" duyurusu bir kez yapılır.

---

## 7. Testler

Her kart için ortak kontroller:

- kök `<article>`, eylemler `<button>`, ikon-only butonlarda `aria-label`
- hiçbir kart `fetch` çağırmıyor (casus sıfır çağrı)
- hiçbir kartta `BadgeCheck`/doğrulama ikonu yok

Karta özel:

- **Sunucu:** kenar önceliği (seçili > katıldı > varsayılan) üç kombinasyonda · `joined` iken
  buton metni `Katıldın` ve `aria-pressed="true"` · kategori `null` iken tile `--primary` tonunda ·
  etiket dizisi boşken etiket satırı yok
- **Kişi:** `interestTags` boşken satır yok · ortak metni yokken şerit yok · `requestSent` iken
  buton `İstek gönderildi` ve pasif
- **Kanal:** altı `activityLabel` sınıfı doğru pil metnini ve tonunu veriyor · avatar yığını
  `aria-hidden`
- **Etkinlik:** bugün/yarın/hafta içi/uzak dört saat biçimi · `durationLabel` boşken süre yok ·
  `interested` iken `aria-pressed="true"`
- **Izgara:** `medium`/`large` `--discover-card-min` değerini değiştiriyor · kanallar şeridinde
  tek kolon · kişiler şeridinde sentinel yok
