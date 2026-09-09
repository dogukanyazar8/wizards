# Ş3 — Ortak UI parçaları (Dalga 1, Ş2 ile paralel)

**Ekran yazma.** Bu şerit yalnız `apps/web/src/components/auth/**` ve `globals.css` auth bloğunu
üretir. `app/(auth)/**` altındaki sayfalara **dokunma** — onlar Dalga 2'nin işi.
`lib/auth/**` içine yazma — orası Ş2.

Oku: `00-ortak-baglam.md`, `PLAN.md` §3 (K4, K5, K6, K13, K14), `SPEC.md` §2, §3, §4 (ortak form
parçaları tablosu), §8, §9, §11, Ş1 raporu + metin eşlemesi.

---

## 1. Kabuk

`components/auth/auth-screen.tsx` yeniden kurulur. Dışa vurulan adlar **korunur** (Dalga 2 bunlara
göre yazacak), içerikleri SPEC'e taşınır.

### 1.1 `AuthScreenLayout`

```
<div data-auth-surface data-auth-theme={mode} class="auth-window">
  <AuthAurora />               ← kökün İLK çocuğu (SPEC §3.1, §12/1)
  <AuthBrandPanel />           ← 512px, flex:none
  <div class="auth-form-column">{children}</div>
  <ThemeLanguageControls />    ← position:absolute top 26 right 32
  <FooterSecurity />           ← position:absolute left/right 72 bottom 30
</div>
```

- Pencere: `AUTH_METRICS.window.web` — köşe 14, `1px solid hsl(var(--border)/.55)`,
  `box-shadow: 0 30px 64px -30px hsl(var(--foreground)/.26)`, `overflow:hidden`, `display:flex`.
  Web'de tam ekranda bu ölçüler `1280×720` referansına oranla akışkan olur: **genişlik/yükseklik
  sabitlenmez**, kolon ölçüleri ve dolgular sabit kalır, form sütunu `max-width` ile ortalanır.
- Form sütunu: `flex:1`, `padding: 0 72px`, içerik dikey+yatay ortalı, `max-width: 384px`.
  `variant="register"` → `padding: 0 56px`, `max-width: 424px`, **alt bilgi yok** (K13).
- `AuthScreenLayout` bir `variant` ve bir `footer` bayrağı alır; hiçbir sayfa kendi kabuğunu kurmaz.
- `app/(auth)/layout.tsx` içindeki **muafiyet dalı kaldırılır**: login/register/forgot/reset artık
  bu kabuğu kullanır.

### 1.2 `AuthAurora`

`position:absolute; inset:-30%; pointer-events:none`, iki radyal (SPEC §3.1), `wdrift 18s`.
`tone` özelliği: `default` · `danger-field` (2. radyal `--danger/.1`) · `danger-banner`
(`--danger/.12`) · `danger-block` (1. radyal `--danger/.14`, 2. `--foreground/.06`) ·
`success` (2. radyal `--success/.16`) · `success-final` (1. `--success/.18`, 2. `--primary/.16`).
Masaüstü/mobil varyantları `AUTH_METRICS.aurora`'dan.

### 1.3 `AuthBrandPanel`

SPEC §3.3 tablosu birebir. Işıma halkası 150×150 `margin-left:-14px` `wglow 3.6s`;
`<BrandLogo animated interactive={false} />` `transform: scale(1.55)`; wordmark
`700 42px/1 Outfit` `-.025em` üst boşluk 10; slogan 14.5px `--text-muted` üst 12; ayırıcı 1px
`--border/.6` `margin:34px 0 28px` `max-width:300px`; başlık `600 21px/1.35` `-.015em`
`max-width:16ch`; gövde 13.5px/1.65 `--text-secondary` `max-width:36ch` üst 14; iki madde 12.5px,
5px nokta (`--primary`, `--success`), aralık 11px.
Metinler: `auth.brand.tagline` · `.heading` · `.body` · `.point1` · `.point2`.
**`HeroSection` metin rotasyonu silinir (K4); `ProfileCards`, `AudienceSelector`, `RoleTabs`
dosyaları ve kullanımları kaldırılır.**

### 1.4 `ThemeLanguageControls` (SPEC §3.4)

- **Dil tetikleyici:** h30, `padding:0 5px 0 12px`, köşe 999, `1px solid hsl(var(--border)/.8)`,
  zemin `hsl(var(--surface-card)/.85)`, `600 11.5px Figtree`, `--text-secondary`; sağında 20px
  daire (`--surface-soft`) içinde 8.5px `▾`. Hover: kenar `--foreground/.3`, metin `--foreground`.
  Açıkken `▴`, daire `--primary/.16`, ok `--primary`.
- **Menü:** 196px, köşe 14, `padding:6px`, `1px solid --border`, zemin `--surface-card`,
  gölge `0 18px 40px -22px hsl(var(--foreground)/.4)`. Satır 38px köşe 10; seçili satır
  `--primary/.12` zemin + `--primary` metin + 11px ✓.
- **Tema anahtarı:** dış kutu h30 `padding:3px` köşe 999 `1px solid --border/.8` zemin
  `--surface-inset`; segment 26px. Seçili: zemin `--surface-card`, metin `--foreground`,
  gölge `0 1px 3px hsl(var(--foreground)/.16)` (koyuda `/.4`). Seçili olmayan şeffaf `--text-muted`.
  Glifler `☀` / `☾`.
- **K6:** seçim `data-auth-theme` özniteliğine yazılır ve `localStorage["whispr-auth-theme"]`
  içinde saklanır; **`next-themes` global tercihine dokunulmaz**. İlk boyada doğru temada
  açılması için `app/(auth)/layout.tsx` içinde küçük bir senkron `<script>` ile öznitelik
  hidrasyondan önce konur (yanıp sönme yok).
- A11y (SPEC §11): dil tetikleyici `aria-haspopup="menu"` + `aria-expanded`; menü `role="menu"`,
  satırlar `role="menuitemradio"` + `aria-checked`. Tema anahtarı `role="radiogroup"`,
  segmentler `role="radio"`. Ok tuşları, `Home`/`End`, `Esc` ile kapanma, odak tuzağı yok.

### 1.5 `FooterSecurity`

Ortalanmış, `gap:16px`, 11.5px, `--text-muted`: `Whispr 2026` · `auth.footer.privacy` ·
`auth.footer.terms` · `auth.footer.cookies`. Web `absolute left:72 right:72 bottom:30`;
masaüstü `left/right:56 bottom:22`. Kayıt ekranında render **edilmez** (K13).

---

## 2. Form ilkeleri (SPEC §4 ortak tablo + §9 durumlar)

Hepsi `AUTH_METRICS`'ten okur, sabit sayı yazmaz.

| Bileşen             | Notlar                                                                                                                                                                                                                             |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AuthEyebrow`       | `600 10px/1 Outfit`, `letter-spacing:.18em`, `--text-muted`                                                                                                                                                                        |
| `AuthTitle`         | `600 29px/1.2 Outfit`, `-.02em`, üst 14                                                                                                                                                                                            |
| `AuthDescription`   | 13.5px/1.6 `--text-secondary`, üst 10                                                                                                                                                                                              |
| `TextInput`         | h46, köşe 12, `1px solid --border`, zemin `--surface-card`, `padding:0 14px`, 14px. Etiket `600 12.5px Figtree` `--text-secondary`, alanla arası 7px. Etiket satırının sağına isteğe bağlı `trailing` (Şifremi unuttum bağlantısı) |
| `PasswordInput`     | `TextInput` + sağ içinde `Göster`/`Gizle` düğmesi: h30, köşe 8, `--surface-soft`, `600 11.5px`, `top:7px right:7px`; alanın sağ dolgusu 66px                                                                                       |
| `PrimaryButton`     | h48, köşe 12, `--primary`, `600 14.5px`, `0 12px 26px -12px hsl(var(--primary)/.7)`                                                                                                                                                |
| `SecondaryButton`   | şeffaf + `--border`                                                                                                                                                                                                                |
| `AuthLink`          | `--primary`, hover `underline`, odak `--primary/.1` zemin + 3px halka köşe 5                                                                                                                                                       |
| `AuthDivider`       | 1px `--border/.8` çizgiler + 11.5px `--text-muted` `veya`, `margin:24px 0 18px`                                                                                                                                                    |
| `AuthCheckbox`      | 18px (mobil 20), köşe 6, seçili `--primary` + beyaz 11px ✓                                                                                                                                                                         |
| `SocialAuthButtons` | K14                                                                                                                                                                                                                                |
| `CodeInput`         | §2.1                                                                                                                                                                                                                               |
| `PasswordStrength`  | §2.2                                                                                                                                                                                                                               |
| `TurnstileRow`      | h52, köşe 12, `1px solid --border`, zemin `--surface-card/.7`; solda 20px yeşil onay karesi, ortada `auth.register.turnstileTitle`, sağda 10.5px `auth.register.turnstileHint`                                                     |
| `SuggestionChip`    | `--surface-inset` + `--border`; hover `--surface-soft` + `--foreground/.3`; seçili `--primary/.12` + kenar `--primary` + ✓                                                                                                         |
| `SuccessTile`       | 52×52, köşe 14, zemin `--success/.14` (kapanış ekranında `.16`), kenar `1px solid --success/.35` (`.4`), 24px ✓ `--success-soft`, `margin:0 auto`                                                                                  |
| `CountdownPill`     | h34, köşe 999, `--surface-inset`, `1px solid --border/.7`, `600 12px --text-muted`, solunda 6px nokta `flex:none`, **`white-space:nowrap`**                                                                                        |

**Beş durum (SPEC §9) her bileşende kurulur.** Odak halkası **her zaman**
`0 0 0 3px hsl(var(--primary)/.16)` + `1.5px solid hsl(var(--primary))` kenar; basılı yüzey
`translateY(1px)` iner ve gölgesini kaybeder. Birincil düğme odağı iki halkalıdır:
`0 0 0 3px --primary/.28, 0 0 0 5px --primary/.14`. Yükleniyor: zemin `--primary/.85`, metnin
soluna 14px spinner (`2px solid --primary-foreground/.35`, üst kenar opak, `wspin .8s linear`).
Tüm odak halkaları `:focus-visible` ile çizilir; hiçbir yerde tek başına `outline:none` yok.

### 2.1 `CodeInput` (SPEC §4.2, §11)

- Altı hücre: 54×62, köşe 12, `gap:10px`, `1px solid --border`, zemin `--surface-card`,
  rakam `600 25px Outfit`. Boş hücre `--surface-card/.6`.
- **Tek alan gibi davranır:** `inputmode="numeric"`, `autocomplete="one-time-code"`,
  yapıştırma altı haneyi dağıtır, `Backspace` bir önceki hücreye döner, ok tuşları gezinir,
  altıncı hane girilince `onComplete` tetiklenir.
- Odaklı hücre: `1.5px --primary` + 3px halka + 2×26px imleç (`wcaret 1.1s steps(1) infinite`).
- Hata durumu (`tone="danger"`): `1.5px solid --danger`, zemin `--danger/.06`; odaklıysa ek
  `0 0 0 3px --danger/.14`.
- Ekran okuyucu: görünmez tek `<input>` + `aria-label`, hücreler `aria-hidden`. Alternatif olarak
  altı gerçek input kullanılırsa hepsi aynı `aria-describedby` ve grup `role="group"` alır.

### 2.2 `PasswordStrength` (SPEC §4.4/4-5)

- Çubuk h5, köşe 999, kanal `--surface-soft`, dolgu `width: score/4*100%`,
  `transition: width .25s ease`. Ton: `0–1 danger · 2 warning · 3–4 success`.
- Etiket `600 11.5px`, rengi tonun **`-soft`** hâli: `Şifre gücü · <…>`.
- Kural listesi: 2×2 grid, `gap:5px 14px`, 11.5px. Her satır 14px daire
  (`1px solid currentColor`) + metin; karşılanınca `--success` + daire içinde 8.5px ✓,
  karşılanmayınca `--text-muted` + boş daire.
- Skoru **hesaplamaz** — `evaluatePasswordStrength` (Ş1) sonucunu alır.
- `aria-live="polite"` ile skor değişimi duyurulur (her tuşta değil, ton değişince).

---

## 3. Üç hata seviyesi (SPEC §8)

`components/auth/auth-error-levels.tsx`:

1. **`FieldError`** — alanın hemen altında, 12px, `--danger-soft`, başında 15px kırmızı daire
   içinde beyaz ✕. Alan `aria-invalid="true"` + `aria-describedby`. Diğer alanlar dokunulmaz,
   değerler korunur.
2. **`AuthBanner`** — `padding:14px 15px`, köşe 12, zemin `--danger/.1`,
   `1px solid --danger/.32`; solda 22px kırmızı karo (köşe 7) içinde beyaz `!`; sağda
   `600 13px` başlık + 12px/1.55 açıklama (`--danger-soft`, `opacity:.85`).
   `role="alert"`. Görününce odak ilk alana taşınır.
   **`tone="success"` varyantı birebir aynı yapı**, yalnız `--success` ve karo glifi `↻`
   (SPEC §4.7: ✓ değil — tik zaten ekranın üstünde).
3. **`BlockingPanel`** — form tamamen gizlenir; yerine 56px ikon karosu + etiket + 29px başlık +
   açıklama + h48 durum bandı + tek birincil eylem (+ ikincil `Giriş ekranına dön`).
   Kilitli hesap · askı · süresi geçmiş bağlantı bunu kullanır.

Üçü de `AUTH_STATUS_CATALOG` (Ş1) kaydından beslenir; metin bileşenin içine yazılmaz.

---

## 4. Durum kartı (SPEC §7)

`components/auth/auth-status-card.tsx` — 440px, `padding:22`, köşe 16, `1px solid --border/.7`,
zemin `--surface-card`, `box-shadow: 0 14px 32px -22px hsl(var(--foreground)/.24)`.
Başlık satırı: 24px karo (köşe 8, zemin `<ton>/.18`–`/.22`, glif `<ton>-soft`) + `700 9.5px`
`+.14em` etiket. Kart başlığı `600 16.5px/1.3 Outfit`, açıklama 12.5px/1.6 `--text-muted`.
`children` slotu kart içi parçayı alır (hatalı alan, sayaç bandı, öneri etiketleri, ilerleme
çubuğu…). Kartların **içeriklerini bağlamak Ş9'un işidir**; bu şerit kabuğu ve 10 kaydın
görsel iskeletini bırakır.

---

## 5. Animasyon ve hareket (SPEC §3.2)

`globals.css` auth bloğuna dört keyframe: `wdrift` · `wglow` · `wcaret` · `wspin` (SPEC'teki
tanımlar birebir). Logo halkası `wglow 3.6s ease-in-out infinite` +
`radial-gradient(circle, hsl(var(--primary)/.26), transparent 66%)`.

```css
@media (prefers-reduced-motion: reduce) {
  [data-auth-surface] *,
  [data-auth-surface] *::before,
  [data-auth-surface] *::after {
    animation: none !important;
  }
}
```

**Düzen ve renk değişmez** — yalnız animasyon durur.

---

## 6. Temizlik

- `components/auth/audience-selector.tsx`, `role-tabs.tsx`, `theme-toggle.tsx` (yerini
  `ThemeLanguageControls` alıyorsa) kaldırılır; her birinin kullanım yerleri taranır.
- `social-login.tsx` içindeki `DiscordIcon` ve `PROVIDERS` Discord satırı kaldırılır (K4);
  NextAuth sağlayıcı yapılandırmasına **dokunulmaz**.
- `globals.css` içindeki `auth-reference-*` blokları (1909–2050) kaldırılır.
  `modern-*` sınıfları **bu şeritte silinmez** — Dalga 2 sayfaları hâlâ kullanıyor olabilir;
  silme işi Ş9'a bırakılır, bulunanlar rapora yazılır.
- `--font-auth-body` kullanımı (globals.css:4454) `--font-sans`'a çevrilir.

---

## 7. Testler

- `components/auth/auth-screen.test.tsx` — aurora kökün ilk çocuğu mu, kolonlarda opak zemin var mı,
  kayıt varyantında alt bilgi gizli mi, `BrandLogo` `interactive={false}` ile mi çağrılıyor.
- `components/auth/code-input.test.tsx` — yapıştırma dağıtımı, Backspace geri dönüşü,
  `onComplete`, `autocomplete="one-time-code"`.
- `components/auth/password-strength.test.tsx` — beş skor için ton ve etiket, kural listesi ikonları.
- `components/auth/auth-error-levels.test.tsx` — `role="alert"`, `aria-invalid`, success bandının
  `↻` glifi, blok panelinin formu gizlemesi.
- `components/auth/auth-motion.test.ts` — reduced-motion kuralı dosyada var ve yalnız
  `animation`'ı kapatıyor (renk/düzen özelliği içermiyor).

## 8. Bitirme

`pnpm --filter @wizards/web typecheck` + `test` yeşil.
Rapor: `raporlar/s3-ortak-parcalar.md` — dışa vurulan bileşen listesi ve özellikleri (Dalga 2'nin
API sözleşmesi), silinen dosyalar, silinemeyen `modern-*` sınıfları ve kullanım yerleri,
SPEC'te karşılığı bulunamayan her ölçü.
