# Dalga 2 · Ş4 — Kabuğun 3. kolonu + dizin kolonu (276)

**Ön koşul:** Dalga 0. **Paralel:** Ş1, Ş2, Ş3, Ş5, Ş6.
**Kapı:** `third-column.test.ts` + `discover-sidebar.test.tsx` yeşil, sol taraf diff'i sıfır.

---

## Sahiplenilen dosyalar

```
apps/web/src/lib/home/third-column.ts                (+ mevcut testi genişletilir)
apps/web/src/components/shell/wizards-shell.tsx      (yalnız "discover" dalı — §2)
apps/web/src/components/discover/discover-sidebar.tsx
apps/web/src/components/discover/discover-sidebar-row.tsx
apps/web/src/components/discover/discover-sidebar.test.tsx
apps/web/src/components/discover/discover-rail-container.tsx
```

---

## 1. `selectThirdColumn`

`ThirdColumn` birleşimine `"discover"` eklenir:

```ts
export type ThirdColumn = "channels" | "discover" | "mentions" | "messages" | null;
```

```ts
// Keşfet kendi dizin kolonunu taşır (SPEC-KESFET §1: 74 + 228 + 276). Ana Sayfa
// paketinde `/discover` `null` dalındaydı çünkü o gün ekranın kolonu yoktu.
if (firstSegment === "discover") {
  return "discover";
}
```

Dosya başındaki blok yorumdaki `null` listesinden `/discover` **çıkarılır** ve yeni satır
belgelenir. `messages`/`mentions` gibi alt yollar yok; `/discover` tek yoldur, durum sorgu
dizesinde taşınır.

**Test:** `/discover`, `/discover?lane=people`, `/discover/` üçü de `"discover"` döner.

---

## 2. `wizards-shell.tsx` içindeki tam olarak üç değişiklik

Bundan fazlası bu şeridin kapsamı dışıdır ve kabul kriterini ("sol taraf hiç değişmedi") kırar.

1. **Genişlik:** `thirdColumnWidth` üçlü koşuluna `discover` dalı eklenir — Mesajlar ve
   Bahsedilmeler ile aynı 276 px değeri (`pxToRem(276)`).
2. **Render:** 3. kolon dallanmasına (`thirdColumn === "messages" ? … : thirdColumn === "mentions" ? …`)
   `: thirdColumn === "discover" ? discoverRail` dalı eklenir.
3. **Prop:** `discoverRail: React.ReactNode` prop'u, `mentionsRail`'in birebir yanına eklenir ve
   yalnız `thirdColumn === "discover"` iken kurulur (aksi halde kod bölünmesi bozulur).

Ana alanın sol ofseti (`calc(rail + nav + third)`) hesabı **zaten** `thirdColumnWidth` üzerinden
gidiyor; ek düzenleme gerekmez.

---

## 3. `DiscoverSidebar` — 276 px, saf sunum

Ray **hiçbir sorgu açmaz, hiçbir mutasyon çağırmaz.** Bahsedilmeler rayının kuralı burada da
geçerli: sayılar tek bir `DiscoverCategory[]` nesnesinden gelir ve o nesne Ş5'in sayfa
bileşeninden prop olarak iner. `categories === null` bir **hata durumudur, boş ekran değil**:
satırlar pilsiz çizilir, kategori seçimi çalışmaya devam eder.

Rayın altında kullanıcı barı **yoktur** (bar gezinme panelinin ayağındadır).

### 3.1 Yapı

```
başlık        "Keşfet" (700/22/display, -.02em) + sağda toplam pili (min-w 22, h 20, r 7)
arama         h 36, r 11, H(surface-soft/.7); odakta kenar H(primary/.5), boşta H(border/.6)
              ikon 15, placeholder discover.search.placeholder
              doluysa 20×20 temizle düğmesi (H(surface-tertiary)) + aria-label
KATEGORİLER   12 px ızgara ikonu + etiket (600/10.5/display/.15em/uppercase)
              6 satır: padY 9, padX 10, r 12, gap 10
SIRALA        3 satır: padY 8, padX 10, r 12, 8 px nokta (margin 0 10)
davet kartı   margin-top auto, padY 14 padX 16, border-top 1px H(border/.5)
```

### 3.2 Kategori satırı tonlaması

| Durum        | Tile                                       | Pil                                 |
| ------------ | ------------------------------------------ | ----------------------------------- |
| seçili       | kategori tonu `/.14` zemin + tam ton metin | tam ton zemin + `#fff` metin        |
| seçili değil | `H(surface-soft)` / `H(text-muted)`        | `H(surface-soft)` / `H(text-muted)` |

Seçili satırın kendisi `background: H(surface-soft)` alır. Ton adı
`DISCOVER_CATEGORIES[i].tone`'dan gelir (`primary`/`warning`/`info`/`success`/`danger`),
`hsl(var(--${tone}))` ile kurulur. Bileşende hex yoktur.

### 3.3 Erişilebilirlik

- Kategori listesi `role="listbox"`, satırlar `role="option"` + `aria-selected`.
- Sıralama listesi de `role="listbox"` (tek seçim) — SPEC yalnız kategoriler için söylüyor ama
  aynı etkileşim modeli.
- Sayı pili görsel olarak sayıdır; satırın erişilebilir adı
  `"{kategori}, {n} sunucu"` biçimindedir (`aria-label` satırda, pilde `aria-hidden`).
- Arama alanı `<label class="sr-only">` taşır.
- Klavye: `↑/↓` listede gezer, `Enter`/`Space` seçer, `Home`/`End` uçlara gider.

### 3.4 Navigasyon

Satırlar `<button>` değil **`<Link>`**'tir: kategori, sıralama ve arama URL'de duruyor
(`buildDiscoverHref`) ve gerçek bir `href` paylaşılabilir olmalı. Bahsedilmeler rayı bu kararı
aynı gerekçeyle almıştı.

Arama alanı bir `<input>`'tur; 250 ms debounce sonrası `router.replace(buildDiscoverHref({ q }))`
çağırır — `push` değil `replace`, yoksa her harf geçmişe bir kayıt bırakır.

**Kategori seçimi şeridi Sunucular'a alır** (SPEC §7): `buildDiscoverHref({ category, lane: "servers" })`.

---

## 4. `DiscoverRailContainer`

Rayı kabuğa bağlayan ince katman. Sorgu **açmaz**; `useDiscoverRouteState()` ile URL'i okur ve
kategori sayaçlarını React Query önbelleğinden `getQueryData` ile alır (Ş5'in açtığı sorgu).
Önbellek boşsa `categories={null}` geçer — ray yine çizilir.

> Neden önbellekten: ray ve ızgara aynı sayaçları göstermek zorunda. İkinci bir sorgu açmak
> ikisini er geç ayrıştırırdı; ikinci bir sayım yazmak da aynı sonucu verirdi.

---

## 5. Testler

`third-column.test.ts`: `/discover` ve varyantları `"discover"`; `/messages`, `/mentions`,
`/channels/x` **değişmemiş**.

`discover-sidebar.test.tsx`:

- 6 kategori satırı doğru iki harf ve doğru sayı ile çizilir (20/4/4/4/4/4)
- `categories={null}` iken satırlar pilsiz çizilir ve tıklanabilir kalır
- seçili kategori `aria-selected="true"` taşır, diğerleri `false`
- arama doluyken temizle düğmesi görünür ve `aria-label` taşır
- her satır bir `<a href>`; `href` `cat` parametresini ve `lane=servers`'ı taşır
- ray hiçbir `fetch` çağırmaz (global `fetch` casusu sıfır çağrı görür)
