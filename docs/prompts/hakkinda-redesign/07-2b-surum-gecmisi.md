# 07 — 2b · Tüm sürüm geçmişi (arama + yıl grupları + sayfalama)

Önce `00-ortak-baglam.md` oku. Ön koşul: `01`, `02`, `04`. Branch `uat`, commit yok.

Referans: `screenshots/2b-surum-gecmisi.png` · HTML `#2b` (satır 114–208) ·
PROMPT.md §3.7, §4.14.

Rota: `AboutReleaseHistory` (`settings/about/releases`).
Giriş: 1c "Tüm sürüm geçmişi ({total})".

---

## 1. Dosyalar

- `apps/mobile/src/app/screens/about/about-release-history-screen.tsx` (+ `.styles.ts`)
- Container: `AboutReleaseHistoryScreenContainer`

Liste `FlashList` yerine **`SectionList`** ile yazılır (yıl grupları + kart görünümü);
gruplar az sayıda ve her grup tek kart olduğu için sanallaştırma gereksiz.
`getItemType` tuzağına düşme riski yok.

---

## 2. Yerleşim

### Başlık (HTML 126–130)

`AboutScreenHeader` — "Sürüm geçmişi" 21/800, sağda **sayı rozeti**:
`{total}` 12.5/700 `textSecondary`, `card` + `1px cardBorder`, `r11`, `padding: 8px 11px`.
Rozet buton değildir; `accessibilityRole="text"`.

### Arama alanı (HTML 132–135)

`AboutSearchField` (prompt 02, 2e ile **aynı bileşen** — kabul kriteri 25):
`margin: 12px 16px 0`, `card` + `1px cardBorder`, `r16`, `padding: 11px 14px`, `gap: 9`,
16px büyüteç `iconTint`, placeholder "Sürüm veya özellik ara" 13.5/500 `textMuted`.
Metin girildiğinde sağda temizle (X) butonu belirir.

Arama **sürüm numarasında ve değişiklik metinlerinde** çalışır, 300 ms debounce (§4.14).
Sunucu tarafı arama ucu yoksa (01'de `app/releases` sorgu parametresi eklenmediyse)
istemci yüklenmiş sayfalarda filtreler ve listenin altına
"Yalnız yüklenen {n} sürümde arandı · Daha eskisini yükle" satırı koyar.
**Tercih edilen:** 01'de `app/releases?query=` desteği varsa sunucudan aranır.

### Yıl grupları (HTML 137–206)

`AboutGroupLabel` = yıl (`2026`, `2025`), `padding: 16px 20px 8px`.
Her yıl **tek kart**, `padding: 4px 0` (satır dolguları kartın kendi padding'i değil).

**Satır** `padding: 11px 16px`, `gap: 12`:

- Nokta 9px, `flex: none`, `marginLeft: 1`:
  - Yüklü sürüm: `accent` + halka `0 0 0 3.5px accentSurface`
    (RN'de `box-shadow` yok → 16px kapsayıcı `View`, `borderRadius: 8`,
    `backgroundColor: accentSurface`, içinde 9px `accent` daire).
  - Diğerleri: `timelineDot`.
- Metin kolonu `gap: 2`:
  - Başlık satırı `gap: 7`: `{version}` 13.5/700; kod adı iç içe 600 `textTertiary`;
    yüklü sürümde `YÜKLÜ` çipi (9/800 `ls .06em`, `accent`/`accentSurface`, `r5`,
    `padding: 2px 5px`); `skippedVersion` eşleşiyorsa `ATLANDI` çipi
    (`textTertiary` / `control`).
  - Alt metin 11/500 `textTertiary`: `{tarih} · {n} değişiklik · {öne çıkan}`.
- Chevron 14px `iconTint`.
- Dokunuş → `AboutReleaseNote { version }`.

### Son satır

`padding: 13px 16px`: `Daha eskisini yükle` 12.5/700 `accent` + **aşağı ok** 14px `accent`
(chevron değil — HTML 204). `hasNextPage` yokken satır render edilmez.
Yükleme sırasında etiket yerine küçük `ActivityIndicator` `accent`.

Boş arama sonucu: kartlar yerine `kit/empty-state.tsx` —
"Eşleşen sürüm yok" + "Başka bir sürüm numarası ya da özellik dene".

---

## 3. Veri

- `useAboutReleasesInfiniteQuery({ limit: 20 })` (prompt 02).
- `total` başlık rozetini besler; sayfa sayısıyla karıştırma.
- Yüklü sürüm listede **her zaman** bulunur (§4.14); sunucu sayfası onu kapsamıyorsa
  ilk sayfaya önden eklenir (`installedRelease` ayrı sorgu) ve tekrar etmemesi için
  `version` bazlı tekilleştirme yapılır.
- `whispr.update.skippedVersion` tercihinden `ATLANDI` çipi türetilir.

---

## 4. Testler

`component-tests/mobile-about-release-history-2b.test.tsx`:

- Başlık rozetinde `total` görünüyor (`38`).
- Yıl grupları doğru bölünüyor ve azalan tarihe göre sıralı.
- Yüklü sürümde halkalı indigo nokta + `YÜKLÜ` çipi; diğerlerinde `timelineDot`.
- `skippedVersion` eşleşen satırda `ATLANDI` çipi.
- Arama 300 ms debounce ile tetikleniyor (sahte zamanlayıcı) ve değişiklik metninde eşleşiyor.
- Boş sonuçta empty-state görünüyor.
- "Daha eskisini yükle" bir sonraki sayfayı çekiyor; son sayfada satır kaybolıyor.
- Satıra dokunuş `AboutReleaseNote` rotasına doğru sürümle gidiyor.

## 5. Doğrulama

```bash
pnpm --filter @wizards/mobile typecheck
```

```bash
npx jest component-tests/mobile-about-release-history-2b.test.tsx
```

## 6. Kabul kriterleri

24 (yüklü sürüm noktası indigo + `0 0 0 3.5px #EEF0FE` halka; diğerleri `#C9CDE3`) ·
25 (2b ve 2e arama alanı **aynı bileşen**: `r16`, `padding 11–12px 14px`, 16px büyüteç) ·
9 (grup etiketi) · 10 (satır ≥44px) · 1 (kırpma yok).
