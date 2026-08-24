# Faz 0 — Sözleşme ve parity altyapısı

**Ön koşul:** yok. **Sonraki:** Faz 1.
**Önce oku:** `00-ortak-baglam.md`.

Bu faz **ekran yazmaz.** Sonraki sekiz fazın üstüne oturacağı üç şeyi kurar: ölçülerin tek kaynağı,
tasarım sisteminden sapmayı yakalayan otomatik denetim, ve parity'yi ölçen görsel matris.

Neden önce bu: ölçüler bileşenlere dağılmış halde yazılırsa 2K/4K göçü elle 300 sayı düzeltmeye
dönüşür ve "hangi değer doğruydu" sorusunun cevabı kalmaz.

---

## 0. Başlangıç

```
graphify query "globals.css token tanımları ve tema sınıfları"
graphify query "playwright visual ve design e2e kurulumu"
```

---

## 1. Ölçü sözlüğü — `apps/web/src/lib/home/metrics.ts`

`design/1a-komuta-merkezi.html` içindeki **her** ölçüyü tek modüle çıkar. Bileşenler bu modülden
okur; JSX içine çıplak sayı yazılmaz.

### 1.1 Yapı

```ts
/** ×1 ölçekteki tasarım pikseli. Tüketiciler rem'e çevirir. */
export const HOME_METRICS = {
  shell: { radius: 26, borderWidth: 1, minWidth: 1360, minHeight: 920 },
  rail: { width: 74, iconSize: 44, iconRadius: 15, gap: 4, paddingTop: 14, paddingBottom: 12 },
  panel: { width: 272, rowRadius: 13, rowPaddingY: 10, rowPaddingX: 12, iconSize: 18 },
  grid: { columns: 4, gap: 13, paddingX: 30, paddingTop: 8, paddingBottom: 18 },
  card: { radius: 20, borderOpacity: 0.5 },
  // ... her bölge
} as const;
```

Kurallar:

- Değerler **px cinsinden** tutulur (tasarım dili px). Tek bir `pxToRem` yardımcısı `px / 16`
  yapar ve çıktıyı `rem` string'i üretir.
- `pxToRem` saf, testli. `pxToRem(74) === "4.625rem"`, `pxToRem(13) === "0.8125rem"`.
- Hairline değerleri için ayrı yardımcı: `hairline()` → `max(1px, 0.0625rem)`.
- Renk **yok** — sözlük yalnız ölçü, yarıçap, boşluk, ağırlık, satır yüksekliği taşır.

### 1.2 Kapsam

En az şu gruplar: `shell`, `rail`, `panel`, `topBar`, `grid`, `card`, `continueCard`, `liveCard`,
`awaitingCard`, `presenceCard`, `upNextCard`, `friendsStrip`, `typography` (tip ölçeği tablosu),
`radius` (SPEC §1 yarıçap listesi), `shadow` (SPEC §1 gölge listesi), `motion` (0.16s / 0.18s,
`pls` 2s).

### 1.3 Tip ölçeği

SPEC §1'deki 12 satırlık tablo aynen kodlanır:

```ts
export const HOME_TYPE_SCALE = {
  greeting: { weight: 600, size: 27, lineHeight: 1.1, family: "display", tracking: "-0.02em" },
  panelLogotype: { weight: 700, size: 22, lineHeight: 1, family: "display" },
  cardBigNumber: { weight: 600, size: 27, lineHeight: 1, family: "display" },
  sectionLabel: {
    weight: 600,
    size: 10.5,
    lineHeight: 1,
    family: "display",
    tracking: "0.15em",
    transform: "uppercase",
  },
  // ...
} as const;
```

### 1.4 Testler — `metrics.test.ts`

- `pxToRem` altı örnek değerde doğru (74, 272, 13, 16, 20, 10.5).
- Sözlükteki hiçbir değer 0 veya negatif değil.
- Tip ölçeğindeki her satır geçerli `family` taşıyor (`display` | `body`).
- `HOME_METRICS.shell.minWidth/minHeight` = 1360/920 (ölçek motorunun taban sözleşmesi).

---

## 2. Token denetim testi

**Amaç:** yeni hex / yeni token / sabit renk yazılınca test kırmızıya dönsün.

`apps/web/src/lib/home/token-audit.test.ts` (ya da mevcut kalite testleri nereye konuyorsa oraya):

1. `apps/web/src/components/home/**`, `components/shell/app-nav-panel.tsx`,
   `components/command/**`, `app/(main)/{home,mentions,events,inbox}/**` dosyalarını tara.
2. Şu kalıplar **yasak**: `#rrggbb`, `#rgb`, `rgb(`, `rgba(`, `hsl(` (değişkensiz), `oklch(`.
3. İzinli istisnalar tam liste hâlinde:
   - `bg-amber-400` + `text-slate-900` (Takvim butonu)
   - `hsl(199 89% 48%)` ve `hsl(291 64% 55%)` (Mesajlar paketindeki swatch'lar — bu pakette
     kullanılmaz ama liste ortak)
4. `hsl(var(--…))` biçimi serbest.
5. Test mesajı sapan dosyayı ve satırı gösterir.

Aynı test dosyasında ikinci bir kontrol: **font adı gömme yasağı** — bu klasörlerde `Outfit`,
`Figtree`, `font-family:` (değişkensiz) geçmeyecek.

---

## 3. Arbitrary-px lint kuralı

Yeni yazılan yüzeylerde `w-[272px]`, `text-[13px]` gibi arbitrary px yasak — ölçek motoru bunları
büyütemez.

- ESLint yapılandırmasına dosya-yolu kapsamlı bir kural ekle (`no-restricted-syntax` ya da mevcut
  özel kural düzenine uygun biçimde). Kapsam: `components/home/**`, `components/command/**`,
  `components/shell/app-nav-panel.tsx`, yeni rota dizinleri.
- İzinli: `[max(1px,0.0625rem)]` gibi hairline ifadeleri ve `rem`/`em`/`%`/`dvh`/`vw` birimleri.
- **Mevcut 120 dosya kapsam dışı** — göç faz faz yapılacak; kural yeni yüzeyleri korur.
- Repo genelindeki kalan px sayısını raporlayan küçük bir script yaz
  (`scripts/quality/count-arbitrary-px.mjs`), her fazın raporunda sayı yazılsın. Bugünkü taban:
  **1208 değer / 120 dosya**.

---

## 4. Görsel parity matrisi iskeleti

`apps/web/e2e/specs/design/home-parity.spec.ts` — bu fazda **ekran yok**, o yüzden test `test.skip`
ile işaretli ama matris ve yardımcıları gerçek:

```ts
const VIEWPORTS = [
  { name: "base", width: 1360, height: 920, expectedScale: 1 },
  { name: "hd", width: 1600, height: 900, expectedScale: 1 },
  { name: "fhd", width: 1920, height: 1080, expectedScale: 1.15 },
  { name: "qhd", width: 2560, height: 1440, expectedScale: 1.5 },
  { name: "uhd", width: 3840, height: 2160, expectedScale: 2 },
  { name: "ultra", width: 5120, height: 1440, expectedScale: 1.5 },
] as const;
const THEMES = ["theme-light", "theme-dark"] as const;
```

Yardımcılar (gerçek, testli):

- `expectNoOverflow(page)` — yatay **ve dikey** taşma yok. Mevcut
  `e2e/specs/design/whispr-chat-preview.spec.ts` içindeki `expectNoHorizontalOverflow`'u genelleştir,
  kopyalama.
- `expectNoClippedText(page)` — `scrollWidth > clientWidth` olup `text-overflow: ellipsis`
  taşımayan metin düğümü yok.
- `readRootFontSize(page)` — `getComputedStyle(document.documentElement).fontSize`.
- `expectMinTapTarget(page, selector)` — 44 fiziksel px altına düşen tıklama hedefi yok.

Matris 6 × 2 = 12 kombinasyon üretir. Faz 8'de bunların hepsi açılır.

---

## 5. Rapor şablonu

`raporlar/` dizinini oluştur, `raporlar/SABLON.md` yaz:

```
# Faz <n> raporu

## Yapıldı
## Kapı çıktıları (komut + sonuç)
## Ölçülen sayılar (sorgu sayısı, yanıt süresi, kalan arbitrary px)
## Güvenlik kontrol listesi (§5.1 maddeleri, her biri işaretli)
## Açık kalan / sonraki faza devreden
## Kullanıcı doğrulaması gereken maddeler
```

---

## 6. Kapı

```bash
pnpm --filter @wizards/web test
pnpm typecheck
pnpm lint
node scripts/quality/count-arbitrary-px.mjs
```

**Geçme koşulları:**

- [ ] `metrics.test.ts` yeşil; `pxToRem` altı örnekte doğru.
- [ ] Token denetim testi mevcut kodda yeşil (henüz yeni dosya yok, kapsam boş → geçer) ve
      kasten bozulmuş bir örnekte kırmızı olduğu elle doğrulandı.
- [ ] Lint kuralı yeni kapsamda arbitrary px'i reddediyor (kasten bozulmuş örnekle doğrulandı).
- [ ] Parity matrisi 12 kombinasyon üretiyor, `test.skip` ile bekliyor.
- [ ] `count-arbitrary-px` çıktısı raporda: **1208 / 120** (taban).
- [ ] Hiçbir üretim davranışı değişmedi — `git diff` yalnız yeni dosyalar + lint yapılandırması.

## 7. Tuzaklar

- Ölçü sözlüğünü "geleceğe hazır" diye genişletme. HTML'de olmayan ölçüyü uydurma; §1'de yoksa
  Faz 4'te ihtiyaç doğduğunda HTML'den okunup eklenir.
- Token denetim testini regex ile "her yerde" çalıştırma — mevcut 120 dosya kırmızıya döner ve
  test işe yaramaz hale gelir. Kapsam yalnız yeni yüzeyler.
- `expectNoClippedText` gürültülü olabilir; ellipsis'li düğümleri dışlamayı unutma, yoksa
  tasarımın kasıtlı kırpmaları test kırar.
