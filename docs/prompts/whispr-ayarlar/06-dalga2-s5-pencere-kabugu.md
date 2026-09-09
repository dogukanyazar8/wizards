# Dalga 2 · Ş5 — Ayarlar penceresi kabuğu: rota, modal, nav, başlık, sekme şeridi, kayıt

**Ön koşul:** Dalga 1 kapısı yeşil. **Paralel:** Ş6.

1180 × 800 pencerenin **çerçevesi**. Bu şerit hiçbir ayar satırı çizmez; içerik alanına Ş6'nın
satır motoru ve Ş7–Ş10'un bölümleri girer. Kabuk hazır olmadan bölümler bağlanamaz.

Önce `00-ortak-baglam.md` okunur.

---

## Sahiplenilen dosyalar

- `apps/web/src/app/settings/[section]/[tab]/page.tsx` (yeni — tam ekran)
- `apps/web/src/app/@modal/(.)settings/[section]/[tab]/page.tsx` (yeni — intercepting modal)
- `apps/web/src/app/(main)/layout.tsx` (**düzenlenir** — `@modal` slot'u)
- `apps/web/src/app/settings/{layout,page}.tsx` (**yeniden yazılır** — yönlendirme + eski sorgu göçü)
- `apps/web/src/components/settings/settings-window.tsx` (yeni)
- `apps/web/src/components/settings/settings-nav.tsx` (yeni)
- `apps/web/src/components/settings/settings-header.tsx` (yeni)
- `apps/web/src/components/settings/settings-tab-strip.tsx` (yeni)
- `apps/web/src/components/settings/settings-save-indicator.tsx` (yeni)
- `apps/web/src/components/settings/settings-dirty-bar.tsx` (yeni)
- `apps/web/src/components/settings/settings-search-panel.tsx` (yeni)
- `apps/web/src/components/settings/settings-skeleton.tsx` (yeni)
- `apps/web/src/components/settings/settings-window-state.ts` (yeni — tek reducer) + `.test.ts`
- `apps/web/src/components/settings/in-app-settings-overlay.tsx` (**yeniden yazılır**)
- `apps/web/src/lib/settings/client.ts` (**düzenlenir** — bootstrap genişler)

**Okunur, yazılmaz:** `lib/settings/{navigation,tree,metrics,search}.ts`,
`components/shell/wizards-shell.tsx` (yalnız çağrı noktası doğrulanır).

---

## İş

### 1. Rota ve modal (K2)

- `/settings/[section]/[tab]` — gerçek rota, tam ekran pencere (kabuk yok).
- `@modal/(.)settings/[section]/[tab]` — uygulama içinden gezinildiğinde kabuğun üstünde modal.
- `/settings` → `/settings/account/profile` yönlendirmesi.
- `/settings?section=…&panel=…` → `migrateLegacySettingsQuery` ile **301**; eşleşmeyen değer
  `/settings/account/profile`.
- `app/settings/appearance/` **silinir** (Ş13 doğrular).

Geri tuşu sekmeler arasında gezer; bölüm ve sekme değişimi `router.replace` ile URL'e yazılır
(tarayıcı geçmişini şişirmemek için sekme değişimi `replace`, bölüm değişimi `push`).

Modal doğrudan `wizards-shell.tsx:1817`'deki `openSettings` çağrısıyla da açılabilmeli —
`InAppSettingsOverlay` bu rotaya `router.push` eder, kendi state'ini tutmaz.

### 2. Pencere gövdesi

```
display flex · 1180 × 800 · radius 24 · H(surface-base) · border 1px H(border)
box-shadow 0 50px 110px -40px H(shadow-color) · overflow hidden
```

Örtü `H(backdrop,.62–.72)`, **kartın kardeşi** (tuzak #11) — kartın içine tıklamak kapatmaz.
Kart `pointer-events:auto` taşıyan ayrı katmanda ortalanır.

Ölçüler `SETTINGS_METRICS`'ten `pxToRem` ile; arbitrary px yasak.

### 3. Sol navigasyon (250 px)

- Üst: `Ayarlar` başlığı + arama alanı (`height:34`, `radius:11`, `H(surface-soft,.75)`,
  placeholder `Ayarlarda ara`; doluyken kenar `H(primary,.5)` + temizle düğmesi).
- Üç grup etiketi: `KULLANICI` · `UYGULAMA` · `BİLGİ` (`600 9.5px display`, `.15em`, uppercase).
- Satır: `padding:8px 10px`, `radius:10`, 16 px çizgi ikon; aktif `H(primary,.12)` +
  `H(primary)` + 600.
- `Masaüstü` satırı `APP` etiketi taşır ve **yalnız Tauri çalışma zamanında** listede (K11) —
  `lib/desktop/runtime.ts` okunur, kullanıcı seçimi değil.
- Alt kullanıcı kartı: `padding:11px 12px`, üst kenar `1px H(border,.6)`, `H(surface-card)`,
  34 px avatar + durum noktası, ad, `@kullanıcı · Durum`, 28 px çıkış düğmesi
  (hover `H(danger,.12)`/`H(danger)`).

`role="tablist"`, satırlar `role="tab"` + `aria-selected`, `↑/↓` gezinir.

### 4. İçerik başlığı

```
padding 14px 24px · border-bottom 1px H(border,.5) · H(surface-card)
sol: bölüm adı 600 16px display + alt satır 500 11.5px muted (ikisi de nowrap + ellipsis)
sağ: kayıt durumu (6px nokta + metin) · 31×31 kapat
```

**Web / Masaüstü segmenti çizilmez** (K11, sapma #3).

Kayıt durumu üç değer: `Kaydedildi` (success) · `Kaydediliyor` (muted) ·
`Kaydedilemedi · yeniden dene` (danger). `aria-live="polite"`.
Geçiş **gerçek yanıt** üzerine kurulur; referanstaki 850 ms sabit gecikme taklit edilmez (tuzak #14).
`Kaydedilemedi` durumunda metin tıklanabilir ve son yamayı yeniden dener.

### 5. Alt sekme şeridi

`padding:0 22px`, alt kenar `1px H(border,.5)`, `H(surface-card)`.
Sekme `height:38`, `padding:0 12`, aktif `H(primary)` metin + altında 2 px `H(primary)` çubuk.
**Bölüm tek sekmeliyse şerit render edilmez** (Hakkında).

`role="tablist"` + `aria-selected`; `←/→` gezinir, `Home`/`End` uçlara gider.

### 6. İçerik gövdesi ve kaydırma

```
overflow-y auto · H(surface-base) · içerik kolonu max-width 720 · padding 22px 24px 28px
```

Kaydırma konumu **sekme değişiminde ve bölüm değişiminde sıfırlanır** (PROMPT §8).
Bölümler `next/dynamic` ile tembel yüklenir; yüklenene kadar `SettingsSkeleton`.

### 7. Kirli şerit

Profil alanları (`pn`, `pu`, `pz`, `pbio`, `pp`, `ps`, `pe`, `px` — sapma #5, **önek sezgisi
kullanılmaz**) kirli bayrağı kurar:

```
padding:12px 24px · border-top 1px H(border,.6) · H(surface-card)
"Kaydedilmemiş değişikliklerin var." · [Sıfırla] · [Değişiklikleri kaydet] (yeşil)
```

Kirliyken bölüm/sekme değiştirmeye çalışmak **engellenmez** ama şerit görünmeye devam eder;
pencereyi kapatmaya çalışmak onay ister.

### 8. Tek reducer (tuzak #12)

`settings-window-state.ts` merdiveni **tek yerde** tanımlar:

```ts
type SettingsWindowState = {
  section: SettingsSection;
  tab: SettingsTab;
  query: string;
  openSelect: string | null; // aynı anda tek açılır menü
  openRisky: string | null; // aynı anda tek riskli blok
  save: "idle" | "saving" | "saved" | "error";
  dirty: boolean;
};
```

Bölüm değişimi: `tab` bölümün ilk sekmesine döner, `openSelect` ve `openRisky` **kapanır**.
Sekme değişimi: `openSelect` ve `openRisky` kapanır.
`Esc`: açık menü → riskli blok → pencere sırasıyla kapanır.

### 9. Arama görünümü

Arama doluyken içerik yerine `ARAMA SONUÇLARI` + sayı, ardından tek kap içinde satırlar
(başlık + `Bölüm › Grup` + chevron). Satıra tıklamak bölüm ve sekmeye götürür, aramayı temizler.
250 ms debounce (`lib/settings/search.ts` kullanılır, yeniden yazılmaz).

### 10. Yükleniyor

4 iskelet blok: `96 · 150 · 112 · 64 px`, `radius:16`, `H(surface-soft,.55)`.

### 11. Küçük ekran (SPEC §10)

- `<1240`: kenar boşluğu 16 px, genişlik `100%`.
- `<1024`: sol nav 64 px (yalnız ikon).
- `<860`: nav üstte yatay kaydırmalı şerit; içerik tam genişlik.
- `<720`: pencere tam ekran (`radius:0`), alt sekmeler yatay kaydırmalı.

Kırılım **CSS'te** seçilir (tuzak #10) — `useSyncExternalStore` ile JS'te değil.

---

## Kabul

- [ ] `/settings/notifications/quiet-hours` doğrudan açılıyor ve doğru sekmeyi gösteriyor.
- [ ] Uygulama içinden açılınca modal, adres çubuğu yine `/settings/...`.
- [ ] Eski `?section=voice&panel=camera` **301** ile `/settings/av/camera`'ya gidiyor;
      19 eski değerin hepsi test edildi.
- [ ] Geri tuşu sekme geçmişinde geziyor; sekme değişimi geçmişi şişirmiyor.
- [ ] Örtüye tıklamak kapatıyor, **kartın içine tıklamak kapatmıyor**.
- [ ] `Esc` sırayla menü → riskli blok → pencere kapatıyor; kapanışta focus tetikleyiciye dönüyor.
- [ ] Focus tuzağı çalışıyor; `Tab` pencereden dışarı çıkmıyor.
- [ ] Sol nav `role="tablist"`, `↑/↓` geziyor; `Masaüstü` yalnız Tauri'de listede.
- [ ] Web/Masaüstü segmenti **çizilmiyor**.
- [ ] Hakkında bölümünde sekme şeridi **render edilmiyor**.
- [ ] Kayıt göstergesi üç durumu gösteriyor, `aria-live` duyuruyor, `Kaydedilemedi` yeniden deniyor.
- [ ] Sabit 850 ms gecikme kodda **yok**.
- [ ] Bölüm ve sekme değişiminde kaydırma sıfırlanıyor, açık menü ve riskli blok kapanıyor.
- [ ] Kirli şerit yalnız 8 profil anahtarında çıkıyor; ses işleme satırları (`p1…p9`) kirli
      **yapmıyor** (sapma #5 regresyon testi).
- [ ] 4 kırılımda kırpma yok; kırılım CSS'te.
- [ ] Arbitrary px sınıfı yok; ölçüler sözlükten.

## Kapı

```
pnpm --filter @wizards/web typecheck && pnpm --filter @wizards/web lint && pnpm --filter @wizards/web test
```

Rapor: `docs/prompts/whispr-ayarlar/raporlar/06-s5-rapor.md`
