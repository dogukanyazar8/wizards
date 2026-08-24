# Faz 1 — Tipografi + ölçek motoru

**Ön koşul:** Faz 0. **Sonraki:** Faz 2.
**Önce oku:** `00-ortak-baglam.md` (özellikle §4 ölçekleme gerçeği, §6.1–6.4 tuzakları).

İki app-wide değişiklik: onaylanan font çifti ve rem tabanlı ölçek adımları. Bu faz **ekran
yazmaz**, ama uygulamanın tamamının görünümünü etkiler — kapısı da ona göredir.

---

## 0. Başlangıç

```
graphify query "layout.tsx font tanımları ve globals.css font değişkenleri"
graphify query "interface density değişkenleri ve tüketicileri"
```

---

## 1. Tipografi

### 1.1 Font varlıkları

- `apps/web/src/app/fonts/figtree-latin.woff2` **ekle**. Latin + Latin Extended-A alt kümesi
  (Türkçe `ı ğ ş ç ö ü İ Ğ Ş Ç Ö Ü` şart), variable ağırlık 400–700.
- `outfit-latin.woff2` zaten var; yeniden indirme.
- `apps/web/src/app/fonts/OFL.txt` içine Figtree lisans girdisi eklenir.
- Dosya boyutu raporda yazılır; alt küme sonrası **> 60 KB ise** neden büyük olduğu açıklanır.

### 1.2 Bağlama — `apps/web/src/app/layout.tsx`

`layout.tsx:19` ve `:25`:

```ts
const bodyFont = localFont({
  src: "./fonts/figtree-latin.woff2",
  variable: "--font-sans",
  weight: "400 700",
  display: "swap",
});

const displayFont = localFont({
  src: "./fonts/outfit-latin.woff2",
  variable: "--font-display",
  weight: "400 700",
});
```

- `--font-auth-body` (DM Sans) ve `--font-message-*` (mesaj fontu tercihleri) **dokunulmaz**.
- `plus-jakarta-sans-latin.woff2` ve `space-grotesk-latin.woff2` başka tüketici kalmadıysa
  silinir; kalıyorsa raporda kim kullanıyor yazılır. Körü körüne silme.
- Mevcut `layout-fonts.test.ts` güncellenir — hangi değişkenin hangi aileyi taşıdığı testte
  sabitlenir.

### 1.3 Harf aralığı

SPEC §1: display için `-0.02em`, büyük harfli bölüm etiketlerinde `+0.15em`. Bunlar
`HOME_TYPE_SCALE` üzerinden gelir; global bir `letter-spacing` kuralı yazma.

### 1.4 FOUT / CLS

`display: "swap"` metriklerde kayma yaratır. `next/font/local` fallback metriklerini otomatik
üretir; yine de `globals.css` içindeki `font-family` zincirlerinde `sans-serif` fallback'i kalır.
Kapıda CLS gözle doğrulanır.

---

## 2. Ölçek motoru

### 2.1 Saf çekirdek — `apps/web/src/lib/home/scale.ts`

```ts
export const UI_SCALE_STEPS = [
  { scale: 1, rootFontSizePx: 16 },
  { scale: 1.15, rootFontSizePx: 18 },
  { scale: 1.5, rootFontSizePx: 24 },
  { scale: 2, rootFontSizePx: 32 },
] as const;

/** Tasarımın taban kabuğu — HOME_METRICS.shell'den gelir. */
const BASE_WIDTH = 1360;
const BASE_HEIGHT = 920;

export function selectUiScale(viewport: { width: number; height: number }): UiScaleStep;
```

Kural (SPEC §8.1):

1. `fit = min(width / 1360, height / 920)`.
2. `fit` değerini geçmeyen **en yüksek** adım seçilir.
3. Seçilen adımdan sonra kalan düzen alanı en az 1360×920 CSS px olmalı:
   `height / scale >= 920 && width / scale >= 1360`. Sağlamıyorsa bir alt adıma düş.
4. Üst sınır ×2 — 5K/8K'da da ×2.

**Testler (`scale.test.ts`) — bu tablo aynen doğrulanır:**

| Görünüm alanı | Beklenen adım | Neden                                       |
| ------------- | ------------- | ------------------------------------------- |
| 1366×768      | ×1            | yükseklik 920'nin altında, taban            |
| 1360×920      | ×1            | tam taban                                   |
| 1600×900      | ×1            | yükseklik yetmiyor                          |
| 1920×1080     | ×1.15         | üst sınır 1080/920 = 1.17                   |
| 1920×1200     | ×1.15         | genişlik sınırı 1.41, yükseklik 1.30 → 1.15 |
| 2560×1440     | ×1.5          | ikisi de yeter                              |
| 3840×2160     | ×2            | ikisi de yeter                              |
| 5120×1440     | ×1.5          | yükseklikten sınırlı — ×2 seçilmemeli       |
| 7680×4320     | ×2            | üst sınır                                   |
| 1024×640      | ×1            | küçük ekran; kırılımlar Faz 7               |

### 2.2 Uygulayıcı — `apps/web/src/hooks/use-ui-scale.ts`

- `useSyncExternalStore` + `matchMedia` ile adım değişimini izle. `resize` dinleyicisi
  kullanılacaksa `requestAnimationFrame` ile throttle edilir; her pikselde state güncellemesi yok.
- Seçilen adımı `document.documentElement.style.fontSize` ve `data-ui-scale="1|1.15|1.5|2"`
  olarak yazar. `data-*` niteliği testlerin ve CSS istisnalarının tutamağıdır.
- SSR: sunucuda adım bilinmez. İlk boyada 16px ile başla, hidrasyondan sonra düzelt — **layout
  shift'i önlemek için** kabuk yüksekliği `100dvh` ile sabitlenir, içerik rem'e bağlı olduğu için
  düzeltme tek karede olur.
- Kill-switch: kökte `data-ui-scale-lock="off"` varsa hook hiçbir şey yazmaz (§5.2).
- Unmount'ta dinleyiciler temizlenir.

### 2.3 Nereye takılır

`(main)/layout.tsx` yerine **kök `layout.tsx`** değil — ölçek yalnız uygulama kabuğunda anlamlı.
`AuthenticatedAppProviders` içinde ya da `WizardsShell`'in en üstünde tek çağrı. İki yerde
çağrılmaz.

### 2.4 Ölçeklenmeyecekler (SPEC §8.2.3)

| Şey                        | Nasıl                                        |
| -------------------------- | -------------------------------------------- |
| Hairline kenar/ayırıcı     | `max(1px, 0.0625rem)` — `metrics.hairline()` |
| İkon boyutu                | `em` (18px ikon → `1.125em`)                 |
| Avatar, gölge yarıçapı     | `rem` (ölçeklenir)                           |
| Kabuk yarıçapı + dış gölge | Yalnız pencere modunda; tam ekranda kenarsız |

### 2.5 Tıklama hedefi

Hiçbir adımda tıklama hedefi 44 fiziksel px altına düşmez. ×1'de zaten uygun; test Faz 8'de.

---

## 3. Density değişkenlerinin göçü

`globals.css:6019` altındaki `--density-control-min-height`, `--density-row-gap`,
`--density-section-gap`, `--density-vertical-padding` px cinsinden. rem'e çevir:

```
48px → 3rem      12px → 0.75rem     16px → 1rem
44px → 2.75rem    8px → 0.5rem      12px → 0.75rem
```

`[data-density-control] { min-height: max(2.75rem, var(--density-control-min-height)); }` — `44px`
sabiti de rem olur ama **erişilebilirlik tabanı** olduğu için `max(2.75rem, 44px)` biçiminde
korunur: ×1'de 44px, büyük adımlarda rem kazanır.

`getInterfaceDensityMetrics` (`@wizards/types`) px döndürüyorsa tüketicileriyle birlikte kontrol
edilir; sayı üreten taraf değişiyorsa testi de değişir.

---

## 4. Regresyon taraması — bu fazın asıl işi

Font ve kök font boyutu app-wide değişti. Aşağıdaki ekranlar **açık ve koyu temada**, `1360×920`
ve `1920×1080` boyutlarında gözle taranır ve raporda tek tek işaretlenir:

1. Giriş / kayıt (kendi font değişkenini kullanıyor — değişmemeli)
2. Sunucu + kanal sohbeti
3. DM listesi + DM sohbeti
4. Sesli oda
5. Profil (kart + sayfa)
6. Ayarlar (en az 3 sayfa)
7. Keşfet
8. Admin konsolu (bir sayfa)

Aranan: taşan başlık, kırılan buton, satır yüksekliği bozulan liste, ikonla metnin hizasız kalması.

Bulunan sapmalar **bu fazda düzeltilmez** (kapsam patlar); `raporlar/02-faz1-rapor.md` içinde
numaralı liste hâline getirilir ve ilgili ekranın kendi redesign paketine devredilir. İstisna:
okunamaz hâle gelen ya da tıklanamaz hâle gelen bir şey varsa **hemen** düzeltilir.

---

## 5. Performans notları

- Font `swap` ile yükleniyor; `preload` yalnız gerçekten ilk boyada kullanılan iki aile için açık.
- Ölçek hook'u dakikada bir değil, **yalnız adım değiştiğinde** state günceller. 1920→1921 piksel
  değişimi yeniden render tetiklememeli.
- `document.documentElement.style.fontSize` yazımı stil yeniden hesaplaması tetikler; adım
  değişmediyse yazma (`if (current === next) return`).

---

## 6. Kapı

```bash
pnpm --filter @wizards/web test
pnpm typecheck
pnpm lint
pnpm --filter @wizards/web e2e:visual
```

**Geçme koşulları:**

- [ ] `scale.test.ts` §2.1'deki 10 satırlık tabloyu geçiyor.
- [ ] `layout-fonts.test.ts` güncel: `--font-sans` = Figtree, `--font-display` = Outfit.
- [ ] Türkçe karakterler (`ığşçöüİĞŞÇÖÜ`) iki fontta da fallback'e düşmeden çiziliyor — gözle
      doğrulandı, ekran görüntüsü raporda.
- [ ] `data-ui-scale` niteliği 6 görünüm alanında doğru değeri taşıyor (geçici e2e ile ölçüldü).
- [ ] Density değişkenleri rem; 44px erişilebilirlik tabanı korunuyor.
- [ ] §4 regresyon taraması 8 ekran × 2 tema tamamlandı, bulgular numaralı listede.
- [ ] Adım değişmeyen resize'da yeniden render yok (React Profiler ya da sayaç ile doğrulandı).
- [ ] `count-arbitrary-px` sayısı raporda (bu fazda düşmez, taban aynı kalır).

## 7. Tuzaklar

- **`zoom` kullanma.** (§6.1)
- `rem` yerine `em` yazma — `em` yalnız ikon boyutlarında.
- Ölçek hook'unu iki yerde çağırma; iki yazıcı birbirini ezer ve resize'da titreşim çıkar.
- `100vh` kullanma — mobil ve pencere modunda yanlış. `100dvh`.
- Font dosyasını `public/` altına koyma; `next/font/local` `app/fonts/` düzenini kullanıyor.
- Space Grotesk / Plus Jakarta dosyalarını tüketici kontrolü yapmadan silme (mesaj fontu
  tercihleri bunlardan birini kullanıyor olabilir).
