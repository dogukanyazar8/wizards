# Dalga 3 · Ş9 — Boş/hata durumu, ölçekleme, kırılımlar, erişilebilirlik

**Ön koşul:** Ş5 + Ş6. **Paralel:** Ş7, Ş8. **Kapı:** durum testleri + a11y testleri yeşil.

---

## Sahiplenilen dosyalar

```
apps/web/src/components/discover/discover-empty-state.tsx   (+ .test.tsx)
apps/web/src/components/discover/discover-error-state.tsx   (+ .test.tsx)
apps/web/src/lib/discover/scale.ts                          (+ .test.ts)
apps/web/src/components/discover/discover-responsive.tsx
```

---

## 1. Boş durum

```
ikon 78×78, H(primary/.13) zemin, büyüteç
başlık "Sonuç bulunamadı"
metin  "“{q}” için dizinde eşleşme yok. Yazımı kontrol edebilir, kategori filtresini
        kaldırabilir ya da davet kodun varsa doğrudan katılabilirsin."
butonlar "Filtreleri temizle" (primary) · "Davet kodu gir"
```

- `q` boşsa (yalnız kategori filtresi eşleşme vermediyse) metnin ilk cümlesi tırnaksız varyanta
  düşer: `Bu filtrelerle dizinde eşleşme yok.` — ayrı i18n anahtarı, uydurma interpolasyon yok.
- `Filtreleri temizle` → `/discover` (tüm parametreler düşer).
- `Davet kodu gir` → `modal=join`.
- Boş durum **şerit başına** çizilir: kişiler/kanallar/etkinlikler şeritlerinin kendi metinleri
  aynı iskeleti kullanır, yalnız gövde cümlesi değişir (ayrı anahtarlar).

## 2. Hata durumu

```
ikon 78×78, H(danger/.13) zemin, uyarı üçgeni
başlık "Dizin yüklenemedi"
metin  "Topluluk dizinine şu anda ulaşılamıyor. Kendi sunucularını kullanmaya devam
        edebilirsin; davet bağlantıları ve kodlar bu hatadan etkilenmez."
butonlar "Yeniden dene" · "Kodla katıl"
alt satır "Hata kodu: {code} · son deneme {time}"
```

- `{code}` **gerçek** koddur: HTTP durumundan türetilir (`DIR-{status}`; ağ hatasında `DIR-NET`,
  zaman aşımında `DIR-TMO`). Tasarımdaki `DIR-502` örnek veridir.
- `{time}` son başarısız denemenin saati (`HH:mm`, kullanıcı saat dilimi).
- `Yeniden dene` `refetch()` çağırır; koşarken buton pasif ve metni `Yeniden deneniyor…`.
- Hata durumunda **dizin kolonu çalışmaya devam eder** (kategori/sıralama tıklanabilir) — SPEC
  §4.1 hata alt satırı "kendi sunucuların etkilenmedi" diyor, kabuk hiç etkilenmez.

---

## 3. Ölçekleme (SPEC-ANA-SAYFA §8)

`lib/discover/scale.ts` — Ana Sayfa paketinde bu mekanizma zaten kurulduysa **yeniden
yazılmaz**, oradan import edilir. Kurulmadıysa burada kurulur ve kök seviyeye yerleştirilir.

```
adım seçimi: min(100vw / 1360, 100dvh / 920)
  ≥ 2.00 → 32px (×2)     ← üst sınır, 5K/8K'da da burada kalır
  ≥ 1.50 → 24px (×1.5)
  ≥ 1.15 → 18px (×1.15)
  diğer  → 16px (×1)
```

Kurallar:

1. Sözlükteki her px `pxToRem` ile rem'e çevrilir. **Arbitrary px sınıfı yasak**
   (`w-[276px]`, `text-[13px]`). ESLint kuralı varsa açılır; yoksa Ş9 bir test yazar:
   `components/discover/**` içinde `/\[\d+px\]/` deseni sıfır eşleşme vermeli.
2. Hairline'lar `max(1px, 0.0625rem)` — `hairline()` yardımcısı.
3. İkonlar `em` (`18px → 1.125em`), avatarlar ve gölge yarıçapları rem.
4. Tıklama hedefi hiçbir adımda 44 fiziksel px altına düşmez. ×1'de 34×34 ikon butonları
   sınırdadır: çevrelerine `padding` ile hedef büyütülür (`::before { inset: -5px }`).
5. `zoom` **kullanılmaz** — referans HTML'deki `zoom` yalnız demo mekanizmasıdır.

### 3.1 İçerik yoğunluğu

SPEC-ANA-SAYFA §8.3 liste kartları için satır sayısı veriyor. Keşfet'te karşılığı **sayfa
boyutudur**: ızgara `auto-fill` olduğu için artan alan zaten daha çok kart gösterir. Ek kural:
ilk sayfa boyutu adım başına büyür — ×1: 24, ×1.15: 24, ×1.5: 36, ×2: 48. Böylece 4K'da ilk ekran
boş kalmaz ve kullanıcı hemen sentinel'e çarpmaz.

---

## 4. Kırılımlar (SPEC §12)

| Genişlik   | Davranış                                                                                                                                                                                     |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `< 1100px` | Profil paneli **overlay** olur: sağdan kayar, arkasında `H(backdrop/.4)` örtü, odak tuzağı **kurulur**, `Esc` kapatır.                                                                       |
| `< 960px`  | Dizin kolonu drawer'a döner (kabuğun mevcut `MobileDrawerTrigger` makinesi). Akış başlığının altına **kategori şeridi** belirir: yatay kaydırılan çip listesi, aynı 6 kategori, aynı tonlar. |
| `< 720px`  | Izgara tek kolon. Öne çıkan blok dikey yığılır, CTA kolonu tam genişliğe geçer. Akış başlığındaki ikon grubu kalır, şerit sekmeleri yatay kaydırılır.                                        |

Kırılımlar **container query değil**, viewport medya sorgusudur (kabuk kolonları viewport'a
bağlı). `<960px` kategori şeridi yeni bir bileşendir (`discover-category-strip.tsx`) ama
`DiscoverSidebar` ile aynı `DISCOVER_CATEGORIES` kaynağını ve aynı `href` kurucusunu kullanır —
ikinci bir kategori listesi yazılmaz.

---

## 5. Erişilebilirlik denetimi

Bu şerit ekranın a11y kapısıdır. Kontrol listesi:

- [ ] Kategori listesi `role="listbox"`, satırlar `role="option"` + `aria-selected`
- [ ] Şerit sekmeleri `role="tablist"` / `role="tab"` + `aria-selected` + `aria-controls`
- [ ] Izgara `role="list"` değil (kartlar `article`) — kapsayıcı `aria-label` taşır
- [ ] Her kart klavyeyle açılabilir (Ş6 §0 deseni)
- [ ] İkon-only her buton `aria-label` taşır: `Sunucuya katıl`, `Kart boyutu`, `Paneli kapat`,
      `Aramayı temizle`, `Profili aç`, `Kapat`
- [ ] Sayı pilleri metin karşılığı taşır (`aria-label` satırda, pil `aria-hidden`)
- [ ] Presence noktaları renk + metin (`aria-label="çevrimiçi"`)
- [ ] Modal ve overlay panel: odak tuzağı, `Esc`, açılışta ilk öğeye odak, kapanışta tetikleyiciye
      dönüş
- [ ] Onay şeridi `role="status"` + `aria-live="polite"`
- [ ] Skeleton kapsayıcısı `aria-busy="true"`, tek `aria-live` duyurusu
- [ ] Odak stili token'lardan (`--ring`), hiçbir yerde `outline: none` tek başına yok
- [ ] Kontrast: `H(text-muted)` üzerindeki 10.5 px etiketler her iki temada AA (ölçülür,
      varsayılmaz — ölçüm çıktısı rapora yazılır)
- [ ] `prefers-reduced-motion` altında `translateY` hover ve panel kayma animasyonu kapanır

---

## 6. Testler

`discover-empty-state.test.tsx`: `q` dolu/boş iki metin varyantı · butonlar doğru hedefe gidiyor ·
dört şeridin kendi gövde metni.

`discover-error-state.test.tsx`: `{code}` HTTP durumundan türetiliyor (502 → `DIR-502`,
ağ hatası → `DIR-NET`) · `{time}` gerçek denemeden geliyor · `Yeniden dene` koşarken pasif ·
dizin kolonu hata sırasında hâlâ tıklanabilir.

`scale.test.ts`: dört adım eşiği · `min(vw/1360, vh/920)` iki eksene de bakıyor ·
5120×1440'ta ×1.5'te kalıyor · 3840×2160'ta ×2 · üst sınır aşılmıyor.

Arbitrary px testi: `components/discover/**` içinde `[\d+px]` deseni sıfır eşleşme.

Kırılım testleri: `<1100px` panel overlay + odak tuzağı kuruluyor · `<960px` kategori şeridi
çıkıyor ve sidebar drawer'a giriyor · `<720px` ızgara tek kolon.
