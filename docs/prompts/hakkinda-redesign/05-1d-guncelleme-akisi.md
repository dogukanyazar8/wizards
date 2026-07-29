# 05 — 1d · Güncelleme hazır kartı + indirme sayfası

Önce `00-ortak-baglam.md` oku. Ön koşul: `01`, `02`, `03`. Branch `uat`, commit yok.

Referans: `screenshots/1d-guncelleme-akisi.png` · HTML `#1d` (satır 1019–1106) ·
PROMPT.md §3.4, §4.2, §4.7, §4.8.

Bu ekran iki parçadır: 1a'nın üstüne binen **güncelleme kartı** ve scrim altında açılan
**indirme sayfası** (overlay sheet).

---

## 0. Dürüstlük sözleşmesi (bu promptun en önemli maddesi)

`expo-updates` yüzde, indirilen bayt, ETA, duraklatma ve "imza doğrulanıyor" aşaması
**vermez**. Ayrıca bu yapıda OTA yapılandırılmamıştır (`Updates.isEnabled === false`).

Bu yüzden:

- Tasarımın **tüm görsel yapısı birebir uygulanır** (progress çubuğu, aşama listesi, butonlar).
- Değerler `MobileUpdateController` (prompt 02) tarafından beslenir.
  `capabilities.reportsPercent === false` iken:
  - Yüzde metni yerine `İndiriliyor` etiketi ve **belirsiz** (indeterminate) progress
    çubuğu gösterilir: dolgu genişliği sabit %35, `translateX` ile sağa-sola akan bant,
    reduce-motion'da sabit ve `progressTrack` üzerinde `accent` şeritli.
  - `18,4 MB / 48,2 MB · yaklaşık 12 sn` satırı yerine `{toplam boyut} indiriliyor` yazılır.
  - `Duraklat` butonu **render edilmez**; `Arka planda` tek başına `flex: 1` olur.
- `capabilities.reportsPercent === true` olan bir adaptör bağlandığında ekran hiç
  değişmeden tasarımın tam hâlini gösterir. Bu yüzden bileşen yüzdeyi `number | null`
  alır, `null` iken belirsiz moda düşer.
- **Hiçbir yerde uydurma yüzde, uydurma ETA veya sahte "İmza doğrulanıyor" ilerlemesi
  üretilmez.** Aşama listesi yalnız denetleyicinin bildirdiği `step` değerine göre ilerler;
  adaptör yalnız `download` ve `install` biliyorsa `verify` satırı **gri bekleyen** olarak
  kalır ve doğrudan `install`e atlanır.

---

## 1. Dosyalar

- `apps/mobile/src/app/screens/about/about-update-banner.tsx` — indigo güncelleme kartı
- `apps/mobile/src/app/screens/about/about-update-sheet.tsx` (+ `.styles.ts`) — indirme sayfası
- `kit/overlay-registry.ts` — `about-update` overlay kaydı
- `03`'te bırakılan `renderUpdateBanner` uzantı noktası buraya bağlanır

---

## 2. Güncelleme kartı (HTML 1036–1049)

`margin: 8px 16px 0`, `r24`, `padding: 18px 18px 16px`,
zemin `linear-gradient(160deg, #5A51EA, #4338CA)` → `expo-linear-gradient`
(`colors: [updateGradientFrom, updateGradientTo]`, `start: {x:0,y:0}`, `end: {x:1,y:1}`
160° için `start {x:0.12,y:0}` / `end {x:0.88,y:1}` ile yaklaş; yorumla belirt),
gölge `0 14px 30px rgba(67,56,202,.28)`
(RN: `shadowColor "#4338CA"`, `shadowOpacity .28`, `shadowRadius 30`,
`shadowOffset {height:14}`, Android `elevation: 12`).

İçerik:

1. `GÜNCELLEME HAZIR` çipi 9.5/800 `ls .08em`, beyaz / `updateBadgeSurface`, `r6`,
   `padding: 4px 8px`.
2. `marginTop: 12`, baseline satır `gap: 8`: `0.9.0` 24/800 beyaz `ls -.02em` +
   `“Halo”` 14/600 `updateOnGradientMuted`.
3. `{boyut} · {tarih} · {zorunlu değil|zorunlu}` 12/500 `updateOnGradientMuted`,
   `marginTop: 5`.
4. Butonlar `marginTop: 15`, `gap: 9`:
   - `Şimdi güncelle` — `flex: 1`, beyaz zemin, `r14`, `padding: 12px 0`,
     13.5/800 `updatePrimaryText`, ortalı.
   - `Neler yeni?` — `updateGhostSurface`, `r14`, `padding: 12px 15px`, 13.5/700 beyaz →
     `AboutReleaseNote { version: latest }`.
5. **Taşma menüsü** (§4.8): `Neler yeni?` butonuna uzun basış değil, yanında 3 nokta
   yok — HTML'de yok. Bunun yerine `Neler yeni?` butonuna `onLongPress` ile
   "Bu sürümü atla" eylem sayfası açılır (`kit/sheet-primitives.tsx` `ActionSheet`).
   `mandatory === true` iken bu eylem **gizlidir**. Atlanan sürüm
   `whispr.update.skippedVersion` olarak yazılır ve kart bir daha gösterilmez.

Kart yalnız `state === "available"` iken render edilir ve kimlik kartının **üstünde** durur.

### BU SÜRÜMDE kartı (HTML 1051–1061)

`AboutGroupLabel` "BU SÜRÜMDE" + kart `padding: 14px 16px`, `gap: 12`.
Her satır `alignItems: center`, `gap: 11`: 26px `r9` `accentSurface` ikon kutusu
(14px `accent` ikon) + 13/700 metin.
İçerik `latest.changes` içinden ilk **2** `NEW` maddesi; yoksa ilk 2 madde.

---

## 3. İndirme sayfası (HTML 1065–1102)

Overlay: scrim `about.scrim` (`rgba(20,23,42,.42)`) — arkadaki ekranın **opaklığı
düşürülmez**, üstüne scrim gelir.

Sheet: `position: absolute; left/right/bottom: 0`, `card` zemin,
`borderTopLeftRadius/RightRadius: 30`, alt köşeler cihaz köşesine oturur
(`borderBottomLeftRadius/RightRadius: 44` — kabul kriteri 19; gerçek cihazda güvenli alan
altına taşar, `useSafeAreaInsets().bottom` kadar iç boşluk eklenir),
`padding: 10px 20px 30px`, gölge `0 -14px 40px rgba(20,23,42,.18)`.

1. Grabber 38×4 `r2` `grabber`, `margin: 0 auto 16px`.
2. Satır `gap: 13`: `AboutBrandLogo size={46} radius={11.5}` (bar 2.5 / gap 2.5,
   yükseklikler 11, 17, 23, 16, 12) · metin kolonu `gap: 3`
   (`{version} indiriliyor` 15.5/800 + ilerleme meta 11.5/500 `textTertiary`) ·
   sağda yüzde 15/800 `accent` (**yüzde yoksa bu metin render edilmez**).
3. Progress: `height: 8`, `r4`, `progressTrack`, `marginTop: 14`; dolgu `accent`.
   Belirsiz modda §0'daki akan bant.
4. Aşama listesi `marginTop: 16`, `gap: 11`; üç satır:
   - Aktif: 20px daire `borderWidth: 2.5`, `borderColor: accent`,
     `borderTopColor: spinnerTrail`, 360°/0.9 s dönüş (Reanimated `withRepeat`);
     etiket 12.5/700; sağda ağ etiketi 11.5/600 `textTertiary` (`Wi-Fi` / `Hücresel`).
   - Bekleyen: 20px `control` daire + 12.5/600 `textMuted` etiket.
   - Tamamlanan: 20px `successSurface` daire + 12px tik `successText`.
     Etiketler: `İndiriliyor`, `İmza doğrulanıyor`, `Kuruluyor`.
     Reduce-motion → spinner dönmez (§4.11).
5. Butonlar `marginTop: 18`, `gap: 9`, `control` zemin, `r15`, `padding: 13px 0`, 13.5/700:
   `Duraklat` (yalnız `canPause` ise) ve `Arka planda`.
   `Duraklat` basıldığında etiket `Sürdür` olur — **aynı buton** (§4.7).
   `Arka planda` sheet'i kapatır, indirme sürer; bittiğinde "Kurulmaya hazır" bildirimi
   (mevcut yerel bildirim altyapısı `apps/mobile/src/notifications/` üzerinden;
   altyapı yoksa toast ile ve yorumla belirt).
6. Not 11/500 `textTertiary`, ortalı, `marginTop: 12`:
   `Kurulum bitince Whispr yeniden başlar · sohbetler korunur`.

### Hata durumu (§4.7 son cümle)

İmza doğrulaması başarısızsa sheet `danger` durumuna geçer:
aşama dairesi `danger`, etiket "Doğrulama başarısız", birincil buton "Tekrar dene",
not satırı hata mesajı olur. Renk `about.danger` (`#DC4E5F`).

---

## 4. Testler

`component-tests/mobile-about-update-1d.test.tsx`:

- `state="available"` iken kart render ediliyor, `current` iken **edilmiyor**.
- `mandatory` iken "Bu sürümü atla" eylemi görünmüyor.
- Atlanan sürüm için kart bir daha render edilmiyor.
- `reportsPercent=false` adaptörüyle: yüzde metni yok, `Duraklat` butonu yok,
  `Arka planda` tek buton.
- `reportsPercent=true` sahte adaptörüyle: `%38` metni, iki buton, dolgu genişliği %38.
- Aşama listesi tam 3 satır; yalnız biri aktif.
- `Duraklat` → `Sürdür` etiket değişimi aynı butonda.
- Doğrulama hatası → `danger` durumu ve "Tekrar dene".
- Reduce-motion açıkken spinner animasyonu başlatılmıyor.

`scripts/mobile-update-controller.test.ts`'e ekleme: `download()` çağrısı
`isEnabled=false` iken hata fırlatmaz, `state="failed"` + açıklayıcı sebep döner.

## 5. Doğrulama

```bash
pnpm --filter @wizards/mobile typecheck
```

```bash
npx jest component-tests/mobile-about-update-1d.test.tsx
```

## 6. Kabul kriterleri

18 (160° gradyan + `0 14px 30px rgba(67,56,202,.28)` gölge) ·
19 (sheet alt köşe 44px, scrim .42) ·
20 (aşama listesi 3 satır, yalnız ilki aktif spinner, diğerleri `#9AA0BC`) ·
1 (kırpma yok) · 22 (kontrast).

Ek kabul (bu iş için): ekranda **hiçbir uydurma sayı yok** — yüzde ve ETA yalnız
denetleyici gerçekten bildiriyorsa görünür.
