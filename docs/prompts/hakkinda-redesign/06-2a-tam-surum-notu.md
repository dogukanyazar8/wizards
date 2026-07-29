# 06 — 2a · Tam sürüm notu (tek sürüm detayı)

Önce `00-ortak-baglam.md` oku. Ön koşul: `01`, `02`, `04`. Branch `uat`, commit yok.

Referans: `screenshots/2a-tam-surum-notu.png` · HTML `#2a` (satır 35–111) ·
PROMPT.md §3.6, §4.13.

Rota: `AboutReleaseNote { version }` (`settings/about/releases/:version`).
Giriş noktaları: 1c "Tam sürüm notu", 1c geçmiş satırları, 2b satırları, 1d "Neler yeni?".

---

## 1. Dosyalar

- `apps/mobile/src/app/screens/about/about-release-note-screen.tsx` (+ `.styles.ts`)
- Container: `AboutReleaseNoteScreenContainer` (`route.params.version` ile **key'lenir**,
  aynı rotaya ikinci kez girildiğinde ekran yeniden kurulsun)

---

## 2. Yerleşim

### Başlık (HTML 47–51)

`AboutScreenHeader` — "Sürüm notu" 21/800, sağda 36×36 `r13` paylaş butonu
(yukarı ok + tabla ikonu 16px `textSecondary`).
Paylaş → `Share.share({ url })` ile sürüm notunun kalıcı bağlantısı
(`{webUrl}/settings/about/releases/{version}`) (§4.13).

### Başlık bloğu (HTML 53–63) — **kart yok**, sayfa zemini üzerinde

`padding: 10px 20px 0`:

1. Baseline satır `gap: 9`: `0.8.15` 26/800 `ls -.02em` + `“Echo”` 15/600 `textSecondary`.
2. `marginTop: 9`, satır `gap: 7`: `ŞU AN KULLANDIĞIN` çipi 9.5/800 `ls .08em`,
   `accent` / `accentChipSurface`, `r6`, `padding: 3px 7px`
   (**yalnız yüklü sürümde**; değilse çip render edilmez ve meta metni sola kayar) ·
   `{tarih} · Yapı {build} · {boyut}` 11.5/500 `textTertiary`.
   Eksik alan varsa o parça ayraçla birlikte düşer, `—` yazılmaz.
3. Özet 12.5/500 `lineHeight 1.55` `textSecondary`, `marginTop: 11`.
   `summary` yoksa blok render edilmez.

### Tür grupları (HTML 65–109)

Üç grup, sırayla `YENİ`, `İYİLEŞTİRME`, `DÜZELTME`.
`AboutGroupLabel` metni **sayı içerir**: `YENİ · 2`, `İYİLEŞTİRME · 3`, `DÜZELTME · 2`
(`padding: 16px 20px 8px`). **Boş tür grubu hiç render edilmez** (§4.13, kabul kriteri 23).

**YENİ kartı** — `padding: 14px 16px`, `gap: 13`; her madde `alignItems: flex-start`, `gap: 11`:

- 26px `r9` `accentSurface` ikon kutusu + 14px `accent` ikon.
  İkon eşlemesi tür değil **içerik** bazlı değildir; sunucudan ikon gelmez →
  YENİ grubunda tüm maddeler aynı kıvılcım ikonunu kullanır.
  **İstisna:** HTML'de ikinci madde dalga ikonu taşıyor. Bunu desteklemek için
  `ReleaseChange` üzerinde ikon alanı **yoktur**; bu yüzden ikon, madde sırasına göre
  sabit bir listeden seçilir: `[kıvılcım, dalga, ...]` — üçüncü ve sonrası kıvılcıma döner.
  Bu bilinçli sadeleştirme yorumla belirtilir.
- Metin kolonu `gap: 3`: başlık 13.5/700 + açıklama 11.5/500 `lineHeight 1.45`
  `textTertiary`. Açıklama yoksa yalnız başlık.

**İYİLEŞTİRME ve DÜZELTME kartları** — `padding: 12px 16px`, `gap: 11`;
**ikon kutusu yok**: 6px nokta (`successText` / `warningText`, `marginTop: 6`,
`alignItems: flex-start`) + 12.5/600 `lineHeight 1.45` metin.
Bu iki grupta `detail` alanı **gösterilmez** (uzun listede okuma hızını düşürür).

Kabul kriteri 23: "YENİ maddelerinde 26px ikon kutusu, diğer gruplarda 6px nokta —
ikisi karıştırılmaz."

---

## 3. Veri

- `useAboutReleaseQuery(version)` → `MobileReleaseDetail`.
- Yükleniyor: başlık bloğu + üç kart iskeleti.
- 404: boş durum (`kit/empty-state.tsx`) "Bu sürümün notu bulunamadı" + geri eylemi.
- Ağ yok: son önbellek varsa gösterilir, üstte küçük "çevrimdışı" bilgisi yoktur —
  React Query önbelleği zaten sessizce kullanılır.

---

## 4. Testler

`component-tests/mobile-about-release-note-2a.test.tsx`:

- Grup etiketleri sayıyı içeriyor (`YENİ · 2`).
- Boş tür grubu render edilmiyor (yalnız `FIXED` içeren sürümde iki grup yok).
- YENİ maddelerinde ikon kutusu var, İYİLEŞTİRME/DÜZELTME maddelerinde **yok** ve
  6px nokta var.
- Yüklü olmayan sürümde `ŞU AN KULLANDIĞIN` çipi render edilmiyor.
- `summary` yoksa özet bloğu yok.
- Paylaş butonu doğru URL ile `Share.share` çağırıyor (mock).
- 404 yanıtında boş durum görünüyor.

## 5. Doğrulama

```bash
pnpm --filter @wizards/mobile typecheck
```

```bash
npx jest component-tests/mobile-about-release-note-2a.test.tsx
```

## 6. Kabul kriterleri

23 (grup etiketinde sayı; ikon kutusu ↔ nokta ayrımı) · 9 (grup etiketi tipografisi) ·
1 (kırpma yok) · 22 (kontrast; `iconTint` metin değil).
