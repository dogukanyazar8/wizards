# Dalga 2 · Ş5 — Sayfa iskeleti, akış başlığı, öne çıkan blok, filtre şeridi

**Ön koşul:** Dalga 0. **Paralel:** Ş1, Ş2, Ş3, Ş4, Ş6.
**Kapı:** `discover-page.test.tsx` + `discover-feed-header.test.tsx` yeşil.

Bu şerit **sayfanın sahibidir**: `discover-page.tsx` burada yazılır, diğer şeritler ona yalnız
prop ekler. Ş6 kartları, Ş7 paneli, Ş8 modalı, Ş9 durumları kendi dosyalarında yazar ve bu
sayfadan çağrılır — sayfaya kod yazmazlar.

---

## Sahiplenilen dosyalar

```
apps/web/src/app/(main)/discover/page.tsx            (yeniden yazılır)
apps/web/src/components/discover/discover-page.tsx   (+ .test.tsx)
apps/web/src/components/discover/discover-feed-header.tsx (+ .test.tsx)
apps/web/src/components/discover/discover-featured.tsx
apps/web/src/components/discover/discover-filter-strip.tsx
apps/web/src/components/discover/discover-section-head.tsx
apps/web/src/lib/discover/client.ts                  (sorgu anahtarları + fetch'ler)
apps/web/src/lib/discover/use-discover-route.ts
```

Ş8 eski ekranı sildiğinde `page.tsx` zaten yeni bileşeni gösteriyor olacak; bu şerit `page.tsx`'i
yeni sayfaya bağlar, eski dosyayı **silmez** (silme Ş8'in işi, sırayı bozmamak için).

---

## 1. Rota sayfası

```tsx
export const dynamic = "force-dynamic";

export default function DiscoverRoute() {
  return <DiscoverPage />;
}
```

Yorumu Bahsedilmeler'inkiyle aynı gerekçeyi taşır: `(main)` layout'u oturumu ve ban kontrolünü
zaten yapıyor, ikinci `requireAuth` yok; durum adres çubuğunda olduğu için sayfa istek başına
çiziliyor.

---

## 2. `DiscoverPage` — durum sahibi

Tek doğruluk kaynağı **URL**: `lane`, `cat`, `sort`, `q`, `panel`, `modal`. React state'te tutulan
tek şeyler: arama alanının anlık metni (debounce öncesi), kart boyutu (`localStorage`, K7) ve
katılım onay şeridinin görünürlüğü.

### 2.1 Sorgular

`lib/discover/client.ts`:

```ts
export const discoverQueryKeys = {
  root: ["discover"] as const,
  servers: (q: DiscoverQuery) => ["discover", "servers", q] as const,
  people: (q: string) => ["discover", "people", q] as const,
  channels: (q: string) => ["discover", "channels", q] as const,
  events: (q: string) => ["discover", "events", q] as const,
  profile: (serverId: string) => ["discover", "profile", serverId] as const,
};
```

Aktif şeridin sorgusu `useInfiniteQuery`, diğerleri **açılmaz** (`enabled: lane === …`). Şerit
sekmesine basılınca yeni sorgu açılır; önceki önbellekte kalır.

`staleTime`: sunucular 60 sn, kişiler/kanallar/etkinlikler 120 sn. Dizin saatlik güncelleniyor,
daha agresif tazeleme israf.

### 2.2 Bağımsız yükleme (SPEC §7 performans kuralı)

Dizin kolonu ile ızgara **birbirini beklemez**. Ray, sayaçları önbellekten okur ve yoksa pilsiz
çizilir (Ş4 §4). Izgara askıdayken 6 kartlık `DiscoverCardSkeleton` gösterilir (Ş6). Akış başlığı
sayaç yokken alt satırını `—` ile değil, **sayısız** biçimiyle çizer
(`Keşfet · 6 kategori · popüler sıralı`).

### 2.3 `Esc` sırası

Tek bir `keydown` dinleyicisi: modal açıksa modalı kapatır, değilse panel açıksa paneli kapatır,
ikisi de kapalıysa hiçbir şey yapmaz. Kapatma `router.replace(buildDiscoverHref({ modal: null }))`
biçiminde **URL üzerinden** olur, yerel state ile değil.

Aynı anda tek panel, tek modal (SPEC §8 durum disiplini): `panel` ve `modal` ayrı parametreler
olduğu için ikisi birlikte bulunabilir, ama modal açıkken panel görsel olarak arkada kalır ve
focus tuzağı modaldedir.

---

## 3. Akış başlığı

```
padY 15, padX 24, border-bottom 1px H(border/.45), display flex, flex-wrap NOWRAP, gap 14
```

### 3.1 Başlık metni

| Koşul                          | Metin                                  |
| ------------------------------ | -------------------------------------- |
| arama dolu                     | `Arama sonuçları`                      |
| şerit = people/channels/events | `Kişiler` / `Kanallar` / `Etkinlikler` |
| kategori seçili                | kategori adı                           |
| diğer                          | `Keşfet`                               |

Sıra bağlayıcıdır (yukarıdan aşağı ilk eşleşen).

### 3.2 Alt satır

| Durum  | Metin                                                                               |
| ------ | ----------------------------------------------------------------------------------- |
| normal | `{n} sunucu · 6 kategori · {sort} sıralı`                                           |
| boş    | `0 sonuç · Dizinde eşleşme yok · filtreleri temizleyebilirsin`                      |
| hata   | `Bağlantı yok · Dizin eşitlemesi {time}'de kesildi · kendi sunucuların etkilenmedi` |

`{time}` **gerçek** son başarısız deneme saatidir (`HH:mm`, kullanıcının saat dilimi), tasarımdaki
`09:41` sabiti değil.

Başlık ve alt satır ikisi de `nowrap` + `ellipsis`; başlık bloğu `flex: 1 1 170px; min-width: 0`.
Kabul kriteri: **başlık tek satırda kalır.**

### 3.3 Daralma kuralı (zorunlu)

`panel !== null` iken **şerit grubu ve ikon grubu `display:none`**. Üçüncü etki: öne çıkan blok da
gizlenir (§4). Tek koşul, üç sonuç — koşul bir kez hesaplanır ve prop olarak inar.

### 3.4 Şerit sekmeleri

```
grup: pad 4, r 13, H(surface-secondary), border 1px H(border/.55)
sekme: h 33, padX 13, r 10, 600/12.5; aktif H(primary)/#fff
sayaç: min-w 17, h 17, r 6, 600/10/display
```

`role="tablist"` / `role="tab"` + `aria-selected` + `aria-controls`. Sekmeler `<Link>`
(URL durumu). Sayaç, o şeridin **toplam** sonucudur; şerit henüz yüklenmediyse sayaç çizilmez
(`0` yazmaz — sıfır bir bilgidir, bilinmiyor değil).

### 3.5 İkon grubu

- `Sunucuya katıl` 34×34, `H(primary)` zemin, beyaz artı, `aria-label` = `discover.header.joinServer`.
  Tıklama: `buildDiscoverHref({ modal: "join" })`.
- Kart boyutu 34×34, `aria-pressed` taşır, `localStorage` anahtarı `wizards.discover.cardSize.v1`
  (`"medium"` | `"large"`). Değer okuma **hydration sonrası** yapılır (SSR ile uyuşmazlık
  olmaması için ilk render `"medium"`).

---

## 4. Öne çıkan blok

Koşul (dördü birden): `lane === "servers"` **ve** `cat === "all"` **ve** `q` boş **ve**
`panel === null`. Beşinci koşul: sunucudan `featured !== null` (K11 — bayraklı sunucu yoksa blok
hiç çizilmez).

```
flex-wrap WRAP, gap 16, margin-bottom 18, padY 17 padX 18, r 20
background H(primary/.08), border 1px H(primary/.3)
tile 60, r 20, H(primary)/#fff, 600/22/display, shadow 0 12px 26px -14px H(primary)
metin kolonu flex 1 1 260px, min-width 0
CTA kolonu flex none, width 146
```

- `ÖNE ÇIKAN` pili + çevrimiçi sayısı (6 px success nokta).
- Ad, açıklama (`max-width 520`, `text-wrap: pretty`), üç meta pili:
  `{n} üye` · `{kategori}` · `{diller · ile birleştirilmiş}`. Diller boşsa **üçüncü pil çizilmez**
  (boş pil değil).
- CTA: üyeyse `Zaten üyesin` (`H(surface-tertiary)`, pasif), değilse `Katıl` (primary) +
  `Önizle` (ikincil). SPEC'in "Zaten üyesin" hâli örnek veriden gelir; ürün `joined`'a bakar.
- `Önizle` öne çıkan sunucunun **kendi** profil panelini açar (`panel=<featured.id>`).
  Referans HTML'in "Whispr Destek'i açar" davranışı demo kısayoludur.

Dar genişlikte sarar (`flex-wrap: wrap`), CTA kolonu tam genişliğe geçer (`<720px`, Ş9).

---

## 5. Bölüm başlığı

```
padTop 2, padBottom 11, gap 11
etiket 600/10.5/display/.14em/uppercase (nowrap) · sayı · not (nowrap+ellipsis) · esneyen hairline
```

| Şerit    | Etiket                     | Not                                                                            |
| -------- | -------------------------- | ------------------------------------------------------------------------------ |
| servers  | `TOPLULUK SUNUCULARI`      | `Popülerlik sırasına göre` / `{kategori} kategorisi` / `“{q}” için eşleşenler` |
| people   | `KİŞİ ÖNERİLERİ`           | `Ortak sunucu ve ilgi alanına göre`                                            |
| channels | `POPÜLER KANALLAR`         | `Son 24 saatteki hareketliliğe göre`                                           |
| events   | `HERKESE AÇIK ETKİNLİKLER` | `Sunucu üyeliği gerekmez`                                                      |

Sunucular şeridinde not seçimi: arama doluysa arama notu, değilse kategori seçiliyse kategori
notu, değilse popülerlik notu.

Izgaranın altında alt not: sunucular şeridinde
`Dizin her saat güncellenir · yalnızca herkese açık sunucular listelenir`, diğerlerinde
`Öneriler ortak sunucu ve ilgi alanına göre hesaplanır`.

---

## 6. Filtre şeridi

Yalnız **aktif filtre varken** çizilir. `padY 11, padX 24`, zemin `H(primary/.06)`.

Çip kaynakları (SPEC §4.8): kategori (≠ `all`) · sıralama (≠ `popular`) · arama sorgusu.
Her çip bir `<button>`; tıklanınca yalnız kendi parametresini temizler. Sağda
`Filtreleri temizle` bağlantısı hepsini temizler (`/discover`'a döner).

Şerit `lane` değişiminde de görünür kalır — `lane` bir filtre değil, bir görünüm seçimidir ve
çip üretmez.

---

## 7. Testler

`discover-page.test.tsx`:

- yalnız aktif şeridin sorgusu açılır (diğer üçünün `queryFn`'ı çağrılmaz)
- `Esc` önce modalı, sonra paneli kapatır; ikisi de kapalıyken hiçbir şey olmaz
- kart boyutu `localStorage`'dan okunur ve yazılır; ilk render `medium`
- panel açıkken: şerit grubu, ikon grubu ve öne çıkan blok DOM'da **yok**

`discover-feed-header.test.tsx`:

- başlık metni beş koşul için doğru (sıra dâhil)
- alt satır üç durumu (normal/boş/hata) ve hata saatinin gerçek değerden geldiği
- sekmeler `role="tab"` + `aria-selected` + `href` taşır
- şerit sayacı yüklenmemişken çizilmiyor, `0` yazmıyor
- ikon butonları `aria-label` taşıyor

`discover-featured.test.tsx`: beş koşulun her biri tek tek bloğu gizliyor · `languages` boşken
üçüncü meta pili yok · `joined` iken CTA `Zaten üyesin`.
