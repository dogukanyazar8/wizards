# 03 — 1a + 1b + 1e · Hakkında ekranı (tek scroll view, açık ve koyu tema)

Önce `00-ortak-baglam.md` oku. Ön koşul: `01` ve `02` tamam. Branch `uat`, commit yok.

Referans: `screenshots/1a-hakkinda-ust.png`, `1b-hakkinda-alt.png`, `1e-koyu-tema.png` ·
HTML `#1a` (satır 694–815), `#1b` (816–918), `#1e` (1107–1246) · PROMPT.md §3.1, §3.2, §3.5.

1a ve 1b **aynı ekranın** iki kaydırma pozisyonudur → tek `ScrollView`.
1e, 1a ile **birebir aynı yerleşim**; yalnız renkler değişir → ayrı ekran yazılmaz,
`theme.about` koyu değerleri yeter.

---

## 1. Dosyalar

- Yeniden yaz: `apps/mobile/src/app/screens/mobile-about-settings-screen.tsx`
- Yeniden yaz: `apps/mobile/src/app/screens/mobile-about-settings-screen.styles.ts`
- Yeni alt bileşenler (aynı klasör, `about/` altında):
  - `about/about-identity-card.tsx` — kimlik kartı + güncelleme durumu satırı
  - `about/about-whats-new-card.tsx` — yenilikler özet kartı
  - `about/about-signature-block.tsx` — imza bloğu
- `settings-screen.tsx:2260` çağrısı yeni props'a göre güncellenir.

Mevcut ekranın **hiçbir parçası korunmaz**: eski `AboutLegalRow`, `styles.appCard`,
`updateButton`, mor CTA — hepsi gider (PROMPT.md §3.1 notu ve kabul kriteri 6).

---

## 2. Ekran iskeleti

```
ScrollView (theme.about.screen)
├─ AboutStickyHeader        ← 1b; scrollY > 12 iken görünür
├─ AboutScreenHeader        ← "Hakkında" 21/800 + sağda pano ikonu butonu
├─ Kimlik kartı
├─ AboutGroupLabel "YENİLİKLER" + sağda "Tümünü gör"
├─ Yenilikler kartı
├─ AboutGroupLabel "UYGULAMA" + kart (3 satır)
├─ AboutGroupLabel "DESTEK" + kart (3 satır)
├─ AboutGroupLabel "TOPLULUK" + kart (2 satır)
├─ AboutGroupLabel "YASAL" + kart (4 satır)
└─ İmza bloğu
```

`contentContainerStyle` alt boşluğu: `useMobileBottomSystemSpacing()` (mevcut hook) +
1a kabul kriteri "son kart 826px'de biter, altında 18px zemin kalır".

### Başlık (§2 · HTML 706–710)

`padding: 8px 16px 4px`, `gap: 12`.

- Geri butonu 36×36 `r13`, `card` zemin + `1px cardBorder`, chevron 17px `stroke 2.1`.
- Başlık `flex:1`, 21/800.
- Sağ buton 36×36 aynı stil, pano ikonu 16px `textSecondary` → §4.1 teşhis kopyalama.

### Sticky başlık (1b · HTML 820–833)

- Blok `card` zemin + `borderBottom 1px headerDivider`.
- Satır `padding: 6px 16px 12px`, `gap: 10`: 32px `r11` `control` zeminli geri butonu
  (chevron 16px) · "Hakkında" 15.5/800 · sağda sürüm `0.8.15` 11.5/700 `textTertiary`.
- `scrollY > 12` → 160 ms `ease-out` ile belirir; büyük başlık **aynı anda** opaklığını
  kaybeder (§4.12). Reanimated `useAnimatedScrollHandler` ile UI thread'inde.

---

## 3. Kimlik kartı (HTML 713–744)

Kart: `margin: 8px 16px 0`, `card` zemin, `1px cardBorder`, `r24`, `padding: 16px 16px 2px`.

**Üst blok** `flexDirection: row`, `alignItems: center`, `gap: 14`:

- `AboutBrandLogo size={60} radius={15}` — bar 3.5px, `gap 3.5`, yükseklikler
  `15, 22, 30, 21, 16`; gölge `0 16px 34px theme.about.logoShadow` + iç üst ışık
  `inset 0 1px 0 rgba(255,255,255,.42)`.
  React Native'de `inset` gölge yok → üst kenara `rgba(255,255,255,.42)` 1px çizgi
  (`borderTopWidth` veya mutlak konumlu ince `View`) ile karşılanır; bunu yorumla belirt.
- Metin kolonu `flex:1`, `gap: 6`:
  1. `Whispr` 19/800, `letterSpacing -0.01em` (RN: `letterSpacing: -0.19`).
  2. Satır `gap: 6`: sürüm çipi `0.8.15` (11/800 `accent`, `accentSurface`, `r7`,
     `padding: 3px 7px`) · kod adı `“Echo”` 12/600 `textSecondary` · kanal çipi
     (9/800 `ls .06em`, `warningText` / `warningSurface`, `r5`, `padding: 3px 6px`).
     Kanal metni bootstrap `app.releaseChannel` değerinden **büyük harfe** çevrilir
     (`uat` → `UAT`, `production` → `KARARLI`, `canary` → `CANARY`, `development` → `DEV`).
  3. Satır `gap: 6`: `Yapı 8150 · 24 Tem 2026` 11/500 `textTertiary` + kopyala ikonu
     11px `iconTint`. Yapı numarası ve tarih `app.buildId` / build tarihinden gelir;
     bilinmiyorsa satır **gizlenmez**, bilinmeyen alan yerine `—` yazılır.
- Bu üst blok tamamı dokunulabilir: dokunuş → §4.1 teşhis kopyalama.

**Hairline:** `height 1`, `hairline`, `margin: 14px -16px 0` (kart padding'ini aşan
tam genişlik — kabul kriteri 8). RN'de negatif `marginHorizontal: -16`.

**Güncelleme durumu satırı** (`padding: 12px 0`, `gap: 11`):

- 32px `r11` durum kutusu, zemin duruma göre (§4.2 tablosu):
  `current` → `successSurface` + 15px tik `successText` `stroke 2.4`
  `available` → `accentSurface` + indirme oku `accent`
  `checking` → `control` + dönen spinner `textTertiary`
- Metin kolonu `flex:1`, `gap: 2`: başlık 13.5/700, alt metin 11/500 `textTertiary`.
- Sağda buton: `control` zemin, `r12`, `padding: 9px 14px`, 12.5/700 `accent`.
  Etiketler: `Denetle` / `Güncelle` / `Durdur`.
- Dördüncü durum (ağ yok): kutu `control`, başlık `Bağlantı yok · denetlenemedi`,
  buton `Denetle` (dokunulabilir, tekrar dener).
- OTA kapalıysa (`controller.capabilities.isEnabled === false`) alt metin
  "Bu yapıda otomatik güncelleme kapalı" olur ve buton **pasif** görünür değil, gizlenir —
  yalan bir eylem sunulmaz.

`available` durumunda 1d'nin indigo güncelleme kartı kimlik kartının **üstüne** eklenir
(§4.2 son cümlesi). O kart prompt `05`'te yazılır; burada yalnız yerleşim boşluğu ve
`renderUpdateBanner` uzantı noktası bırakılır.

---

## 4. Yenilikler kartı (HTML 751–786)

Kart `margin: 0 16px`, `padding: 14px 16px 2px`.

- Üst satır `gap: 8`: `0.8.15 “Echo”` 14.5/800 · `YENİ` rozeti (9/800 `ls .06em`,
  `accent`/`accentSurface`, `r5`, `padding: 2px 5px`) · `flex:1` boşluk · `24 Tem`
  11/600 `textTertiary`.
  `YENİ` rozeti **yalnız** `release.version > seenVersion` iken (§4.5).
- `marginTop: 13`, maddeler kolonu `gap: 13`. Her madde `alignItems: flex-start`, `gap: 11`:
  - 26px `r9` ikon kutusu, tür rengine göre zemin/ikon:
    `new` → `accentSurface` / kıvılcım `accent`
    `improved` → `successSurface` / yukarı ok `successText`
    `fixed` → `warningSurface` / anahtar `warningText`
  - Metin kolonu `gap: 2`: başlık 13/700, açıklama 11.5/500 `lineHeight 1.45` `textTertiary`.
  - En fazla **3 madde** gösterilir (sunucu sırasına göre ilk üç).
- Hairline `margin: 12px -16px 0` + alt satır `padding: 12px 0`:
  `{n} iyileştirme ve {m} düzeltme daha` 12/700 `accent` + chevron 14px `accent`.
  Sayılar gösterilmeyen maddelerden hesaplanır; hiç kalmadıysa satır render edilmez.
- Kartın tamamı ve "Tümünü gör" → `AboutWhatsNew` rotası (prompt 04).

---

## 5. Gruplar

### UYGULAMA (HTML 789–810)

| Satır                                                  | Sağ taraf                                        | Eylem                                |
| ------------------------------------------------------ | ------------------------------------------------ | ------------------------------------ |
| Güncelleme kanalı                                      | kanal etiketi 12.5/700 `textSecondary` + chevron | `AboutUpdateChannel` (prompt 08)     |
| Beta programı / "Yeni özellikleri iki hafta önce dene" | toggle, varsayılan kapalı                        | açılışta 2d onay sheet'i (prompt 09) |
| Otomatik güncelle / "Yalnızca Wi-Fi bağlıyken indirir" | toggle, varsayılan **açık**                      | `whispr.settings.autoUpdate`         |

Beta toggle'ı iyimser değil: onay verilene kadar **kapalı kalır** (§4.4, §4.16).

### DESTEK (HTML 835–859, `padding: 10px 20px 6px`)

- Servis durumu → pill (`successSurface`, `r9`, `padding: 5px 9px`, 7px nokta `successDot`,
  `Sorunsuz` 11.5/700 `successText`) + chevron. Üç seviye (§4.9):
  `ok` yeşil "Sorunsuz" · `degraded` `star` rengi "Kısmi yavaşlık" · `down` `danger` "Kesinti".
  Dokunuş → durum sayfası URL'i (`Linking.openURL`).
- Yardım merkezi / "Rehberler, kısayollar, sık sorulanlar" → `HelpCenter` (prompt 10).
- Sorun bildir / "Telefonu sars; günlükler otomatik eklenir" → `BugReport` (prompt 11).
  **Not:** sarsma algılama bu iş kapsamında **yok**; alt metin sözü tutamayacağı için
  `Günlükler otomatik eklenir` olarak kısaltılır. (Bilerek yapılan tek metin sapması;
  yorumla gerekçelendir.)

### TOPLULUK (HTML 861–883)

- Whispr topluluk sunucusu / "12,4B üye · yol haritası ve erken testler" →
  `CommunityInvite` (prompt 12). Üye sayısı davet ucundan gelir; veri yokken satır
  alt metni yalnız "yol haritası ve erken testler" olur.
- Whispr'ı puanla / "30 saniye sürer, çok işimize yarar" → sağda 5 yıldız 13px
  (4 dolu `star`, 1 boş `starEmpty`) → 2h sheet'i (prompt 13).

### YASAL (HTML 885–904, satırlar `padding: 11px 16px`)

Kullanım şartları · Gizlilik politikası · Çerez politikası · Açık kaynak lisansları
(`{count} paket` 12.5/700 `textSecondary`).
Mevcut `openMobileLegalDocument("terms"|"privacy"|"cookies")` ve
`openMobileOpenSourceLicenses` çağrıları korunur; paket sayısı mevcut
`summarizeMobileOpenSourceLicenses` sonucundan gelir.

---

## 6. İmza bloğu (HTML 906–914)

Kolon, ortalı, `gap: 9`, `padding: 16px 32px 0`:

- 3 sosyal chip 34px `r12`, `card` + `1px cardBorder`; ikonlar 14–15px `textSecondary`:
  X, Instagram, e-posta. Dokunuş → `Linking.openURL` (adresler `mobile-copy` içinde
  sabit değil, `apps/mobile/src/config/` altında tek yerde tutulur).
- `Wizards ekibi tarafından İstanbul'da yapıldı` 11.5/600 `textTertiary`, ortalı.
- `© 2026 Wizards · Tüm hakları saklıdır` 11/500 `textTertiary`. Yıl **sabit yazılmaz**,
  build tarihinden alınır.

---

## 7. Davranışlar

1. **Teşhis kopyalama** (§4.1): sürüm/yapı satırı **ve** başlıktaki pano butonu aynı işi
   yapar → `buildDiagnosticsText()` (prompt 02) → `expo-clipboard` `setStringAsync` →
   `showToast` "Kopyalandı" → `selection()` haptiği.
2. **Denetle** (§4.3): `controller.check()`; en az 800 ms `checking` görünür.
   `checking` sırasında buton `Durdur` olur ve isteği iptal eder.
3. **Beta toggle** → 2d sheet'i; onay gelmezse toggle eski hâline döner.
4. **`YENİ` rozeti / profil noktası** (§4.5): `whispr.about.seenVersion` karşılaştırması.
   Profil hub'ındaki "Hakkında" satırında da aynı koşulla indigo nokta —
   `settings-screen.tsx` içindeki `MobileProfileHubRow`'a `showDot` prop'u eklenir.
5. **Erişilebilirlik** (§4.11): tüm satırlar ≥44px; `maxFontSizeMultiplier` kullanılırsa
   literal ve ≥2; rozet metinlerinde `allowFontScaling={false}`; reduce-motion'da
   spinner dönmez, sticky başlık anında geçer, logo animasyonu kapanır.

---

## 8. Testler

`component-tests/mobile-about-screen-1a-1b.test.tsx`:

- Kimlik kartı 60px logo ile render ediliyor, sürüm/kod adı/kanal çipi **tek satırda**.
- Güncelleme durumu üç durumda doğru başlık + buton etiketi (model fonksiyonu üzerinden).
- Eski mor tam genişlik CTA'sı **yok** (`queryByTestId("mobile-about-check-updates")` null).
- `YENİ` rozeti `seenVersion` güncelken görünmüyor.
- Beta toggle'ına basınca sheet açılıyor ve toggle **kapalı** kalıyor.
- Servis durumu üç seviyede doğru renk token'ı.
- Yasal satırlarında paket sayısı görünüyor.
- İmza bloğunun iki metni de render ediliyor.
- Kaydırma > 12 → sticky başlık görünür (`fireEvent.scroll` + `await`).
- Koyu temada aynı ağaç render ediliyor ve `theme.about.card` koyu değeri kullanılıyor
  (1e için ayrı test dosyası açma; aynı dosyada tema sarmalayıcısıyla).

**RNTL 14 uyarısı:** her `render` ve `fireEvent` `await` edilecek.

---

## 9. Doğrulama

```bash
pnpm --filter @wizards/mobile typecheck
```

```bash
npx jest component-tests/mobile-about-screen-1a-1b.test.tsx
```

Ölçü doğrulaması: `screenshots/1a-hakkinda-ust.png` ve `1e-koyu-tema.png` üzerine
390×844 çerçevede bindirme; kırpılan metin/kart olmayacak, son kart 826px'de bitecek.

## 10. Kabul kriterleri (PROMPT.md §7'den bu ekrana düşenler)

1 (kırpma yok, 826px) · 2 (60px logo, bar 15/22/30/21/16, gap 3.5, r15) ·
3 (iki katmanlı logo zemini + üst ışık) · 4 (sürüm+kod adı+kanal tek satır, gap 6) ·
5 (yapı satırı + 11px kopyala ikonu) · 6 (tek satır güncelleme durumu, mor CTA yok) ·
7 (3 madde, üç ayrı tür rengi, açıklama 11.5/500 lh1.45) · 8 (hairline `-16px`) ·
9 (grup etiketleri 10.5/700 ls .1em) · 10 (satırlar ≥44px) · 11 (toggle 44×26 knob 20;
beta kapalı, otomatik güncelleme açık) · 12 (sticky başlık beyaz + `#ECEEF7` çizgi,
sağda sürüm) · 13 (imza bloğu tam görünür) · 14 (servis pill'i) ·
21 (1e aynı piksel yerleşim) · 22 (kontrast; `iconTint` metin olarak kullanılmadı).
