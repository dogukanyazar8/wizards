# 00 — Ortak bağlam (Giriş · Hesap oluşturma · Kurtarma)

**Bu dosya uygulanmaz, okunur.** Her şerit işe başlamadan önce buradaki gerçekleri, kararları ve
tuzakları bilir. Şeritler arası her çelişki burada çözülür.

Kaynak paket: `design_handoff/giris-kayit-paketi/`
Otorite sırası: `SPEC.md` **>** `referans.html` (bundle içi inline `style`) **>** `ekranlar/*.png`
**>** `PROMPT.md` **>** `README.md`.
Plan ve kararlar: `docs/prompts/whispr-giris-kayit/PLAN.md` §3 (K1–K14). Dal: `uat`.

`referans.html` tek dosyalık bir bundle'dır; tarayıcıda açılır. Kaynak metni okumak gerekirse 370. satır bir JSON varlık haritasıdır (gzip+base64), 382. satır JSON-escape edilmiş HTML
gövdesidir. Gövde altı gruba ayrılır: `grp-web` · `grp-desktop` · `grp-mobile` · `grp-states` ·
`grp-inline` · `grp-interactive`.

---

## 1. Kapsam sınırı

| Yüzey             | Ekran                                                    | Rota / dosya               |
| ----------------- | -------------------------------------------------------- | -------------------------- |
| Web 1280×720      | Giriş                                                    | `/login`                   |
| Web               | İki adımlı doğrulama                                     | `/login/two-factor`        |
| Web               | Yedek kod                                                | `/login/backup-code`       |
| Web               | Hesap oluştur                                            | `/register`                |
| Web               | E-posta doğrulama (6 hane)                               | `/verify-email`            |
| Web               | Şifremi unuttum                                          | `/forgot-password`         |
| Web               | Bağlantı gönderildi **+** yeniden gönderildi             | `/forgot-password/sent`    |
| Web               | Yeni şifre                                               | `/reset-password?token=`   |
| Web               | Şifre güncellendi                                        | `/reset-password/done`     |
| Masaüstü 1040×720 | Giriş · Hesap oluştur (+ aynı kabukla diğerleri)         | Tauri kabuğu, aynı rotalar |
| Mobil 390×844     | Giriş · Hesap oluştur · 2FA kodu                         | `MobileAuthStackParamList` |
| Ortak             | 10 durum kartı · 3 hata seviyesi · 10 bileşen durum seti | —                          |

**K1 gereği kapsam dışı:** telefonla kayıt, SMS/sesli arama kodu, SPEC §4.6 web telefon doğrulama
ekranı, SPEC §6.4 mobil telefon doğrulama ekranı. Bu ekranlar **kurulmaz**.

**Dokunulmayacak:** oturum açıldıktan sonraki hiçbir yüzey, admin paneli, `/invite/[code]`,
`/g/[code]`, desktop/mobile OAuth handoff rotaları (`/desktop/oauth/*`, `/mobile/oauth/*`),
NextAuth sağlayıcı yapılandırması (yalnız Discord **düğmesi** UI'dan çıkar, sağlayıcı kalır).

Diff bunların dışına taşıyorsa şerit hatalıdır.

---

## 2. Doğrulanmış gerçekler (kodda okundu, tahmin değil)

### 2.1 Web auth bugün

- `app/(auth)/layout.tsx` **login/register/forgot-password/reset-password** rotalarını
  `AuthScreenLayout`'tan **muaf tutuyor** (erken `return <>{children}</>`). Yani bugün iki kuşak
  auth arayüzü yan yana duruyor: `AuthScreenLayout` (yeni sayfalarda) ve sayfa içi `modern-*`
  işaretlemesi (login/register'da).
- `components/auth/auth-screen.tsx` (499) şunları **zaten** dışa veriyor:
  `ThemeLanguageControls` · `ProfileCards` · `FooterSecurity` · `HeroSection` · `AuthCard` ·
  `AuthScreenLayout` · `TextInput` · `PrimaryButton` · `SecondaryButton` · `SocialAuthButtons`
  ve `BrandLogo` yeniden dışa vurumu. **Yeni bileşen kütüphanesi yazılmaz**, bunlar SPEC ölçülerine
  taşınır.
- `components/brand/brand-logo.tsx` → `BrandLogo`. `interactive={false}` verilmezse bileşen
  `<a href="/login">` olarak render edilir (SPEC §2 bunu ayrıca uyarıyor).
- `components/auth/social-login.tsx` bugün **dört** sağlayıcı çiziyor: Google · Microsoft · Apple ·
  **Discord**. Üçünün resmî SVG'leri dosyanın içinde hazır (Google 4 renkli path, Microsoft 4 kare,
  Apple monokrom). SPEC'in "harf karosu" temsilleri **kullanılmaz**, bu SVG'ler kullanılır.
- `components/auth/turnstile-widget.tsx` (160) hazır; `NEXT_PUBLIC_TURNSTILE_SITE_KEY` okunuyor.
- `app/(auth)/login/login-client.tsx` (440): `showTwoFactorPrompt` state'i ile **aynı ekranda**
  2FA alanı açıyor; `selectedRole` (`RoleTabs`) yalnız görsel, sunucuya gitmiyor.
- `app/(auth)/register/page.tsx` (410): `REGISTER_COPY` sabiti ile **sabit kodlanmış TR/EN metin**
  taşıyor. SPEC §13 gereği bu blok tamamen i18n anahtarlarına taşınır.
- `globals.css` içinde `modern-*` sınıfı **325 kez**, `auth-reference-*` blokları 1909–2050
  aralığında. Yeni tasarım bu iki kuşağın yerine geçer; ölü kalan sınıflar silinir.
- `--font-display` = **Outfit**, `--font-sans` = **Figtree** (`app/layout.tsx` `localFont`).
  SPEC'in `--w-display` / `--w-body` adları bunlara eşlenir; **yeni font yüklenmez**.
  `--font-auth-body` (DM Sans) bugün auth'ta kullanılıyor (`globals.css:4454`) ve **düşer**.

### 2.2 Kimlik backend bugün

- `LoginSchema` (`packages/types/src/auth.ts`) `twoFactorCode` alanını **giriş formunun içinde**
  taşıyor; `loginAction` (`lib/auth/actions.ts:291`) tek atışta `signIn("credentials", …)` çağırıyor.
  Ayrı 2FA ekranı **yok** → K2.
- `lib/auth/` hazır parçalar: `attempt-tracker.ts` (Redis + bellek `AttemptStore`,
  `createAttemptTracker`), `request-rate-limits.ts`, `password-reset.ts`, `session-revocation.ts`,
  `two-factor.ts` (TOTP + `TwoFactorRecoveryCode`), `web-login-two-factor.ts`, `login-proof.ts`,
  `turnstile.ts`, `username.ts`, `registration-policy.ts`, `email-verification.ts`.
- `PASSWORD_RESET_TOKEN_EXPIRY_MINUTES = 60` (`password-reset.ts:8`) — **SPEC 30 dakika diyor**.
- E-posta doğrulama bugün **link tabanlı**: `EmailVerificationToken` modeli + `/verify-email?token=`
  sunucu bileşeni. 6 haneli kod **yok** → K3.
- Giriş kilidi (5 deneme / 15 dk) **yok**. `attempt-tracker` altyapısı var, giriş yoluna bağlı değil.
- **SMS/sesli arama sağlayıcı yok** (twilio · sns · vonage · messagebird — hiçbiri bağımlılık
  listesinde). `User.phoneNumber` / `User.phoneVerified` kolonları şemada duruyor ama akış yok → K1.
- Prisma: yeni migration **yalnız** `packages/db/prisma/rebaseline-migrations/` altına yazılır;
  Prisma bu klasörü okur.

### 2.3 Renk ve tema

- Açık tema tokenları **SPEC §1.1 ile birebir aynı** (`--background 220 23% 98%`,
  `--foreground 222 26% 14%`, `--surface-card 0 0% 100%`, `--surface-soft 220 24% 91%`,
  `--border 220 20% 84%`, `--primary 235 86% 65%`, `--text-secondary 220 16% 38%`,
  `--text-muted 220 11% 52%`, `--danger/--success/--warning` üçlüleri dahil). Doğrulandı.
- **`--surface-inset` ürün token setinde yok.** SPEC bunu 6 yerde kullanıyor.
- `-soft` üçlüleri ayrışıyor: ürün açıkta `--danger-soft 352 70% 16%` / `--success-soft 154 46% 16%`
  / `--warning-soft 34 55% 17%`; SPEC `30%` / `22%` / `22%`. Ürün değerleri **20 koyu palet için
  ölçülmüş** ve `splash-contrast.test.ts` kapısıyla korunuyor (globals.css 110–155 yorum bloğu).
- Ürünün koyu teması SPEC'in koyusundan farklı: `theme-dark` = `220 8% 19%`,
  SPEC = `222 26% 9%`. → **K5** bu çatışmayı çözüyor.
- `--desktop-titlebar-height: 34px` (globals.css:109), beş yerde okunuyor → **K7** ile 38px.

### 2.4 Mobil bugün

- Ekranlar: `auth-welcome-screen.tsx` (265) · `auth-login-screen.tsx` (473) ·
  `auth-register-screen.tsx` (335) · `auth-forgot-password-screen.tsx` (314) ·
  `auth-language-picker-sheet.tsx` (252). Her biri yanında `.styles.ts`.
- `navigation/mobile-auth-navigation-types.ts` → `MobileAuthStackParamList` = `Welcome` · `Login` ·
  `Register` · `ForgotPassword`. Navigator `mobile-auth-navigator.tsx`.
- `app/screens/auth/mobile-auth-screen-contract.ts` → `MOBILE_AUTH_SCREEN_TEST_IDS` dört kimlik.
- Kit hazır: `app/components/kit/auth/` altında `auth-text-field` · `auth-primary-button` ·
  `auth-secondary-button` · `auth-checkbox` · `auth-eyebrow-header` · `auth-info-banner` ·
  `auth-password-strength-row` · `auth-screen-background` · `auth-social-provider-icon` ·
  `auth-top-bar` · `auth-security-card` · `auth-profile-type-selector` · `auth-welcome-background`.
- Tasarım katmanı: `design/palette.ts` içinde **`redesignAuthLight` (1325) ve `redesignAuthDark`
  (1349) zaten var**; `design/tokens.ts` içinde `mobileRadii` · `mobileSizing` · `mobileSpacing` ·
  `mobileTypography` · alan bazlı `*Metrics` sözlükleri deseni.
- Yazı tipleri mobilde yüklü: `WhisprOutfit_600SemiBold` · `WhisprOutfit_700Bold` ·
  `WhisprFigtree_400/500/600/700` (`design/mobile-fonts.ts`). **Yeni font eklenmez.**
- Metinler `locale/mobile-copy.ts` içinde düz anahtar-değer (`tr` / `en` blokları).

### 2.5 Metin altyapısı

- Web: `lib/locale/messages/tr.ts` + `en.ts`, düz `"auth.login.x": "…"` anahtarları (bugün 250 auth
  anahtarı). Tüketim `useI18n().t(key)` (`components/providers/locale-provider.tsx`).
- Mobil: `locale/mobile-copy.ts`, camelCase anahtar.
- SPEC §13 anahtarları (`login_eyebrow`, `tfa_t`, `st_creds_d` …) **referans sözlüğünün** adlarıdır;
  ürüne `auth.<ekran>.<parça>` biçiminde girer. Eşleme tablosunu Ş1 üretir ve tek kaynak olur.

---

## 3. Tekrarlanan tuzaklar

1. **Bundle'ı kopyalama.** `referans.html` bir prototiptir. Üretimde `@wizards/ui` / mevcut auth
   bileşenleri kullanılır. Ölçü okunur, işaretleme kopyalanmaz.
2. **`interactive={false}` unutma.** `BrandLogo` varsayılanda `<a href="/login">` üretir; giriş
   ekranının içinde kendine link veren bir logo doğar.
3. **Logo büyütmesi.** Yalnız `transform: scale()`. Çubuk genişliği 3px, yükseklikler
   `17 · 25 · 34 · 24 · 18`, aralık 3px — intrinsic ölçü sabit.
4. **Aurora'nın yeri.** Pencere **kökünün ilk çocuğu**. Kolonlara opak zemin verilirse ayırıcıyı
   geçemez ve SPEC §12/1 düşer.
5. **Doygun ton metinde kullanılmaz.** Durum metni her zaman `-soft`. 9,5px uppercase etiketi
   doygun tonda beyaz zeminde 1.9:1'e düşüyor (SPEC §1.2 notu).
6. **Sabit metin bırakma.** `REGISTER_COPY` gibi bir blok kalırsa SPEC §12/5 ve §12/9 düşer.
7. **Prisma migration yolu.** Yalnız `packages/db/prisma/rebaseline-migrations/`.
8. **`prefers-reduced-motion`.** Aurora · ışıma · imleç · spinner durur; **düzen ve renk değişmez**.
9. **Mobil dokunma hedefi.** Onay kutusu satırı ve geri satırı `minHeight: 44`.
10. **Kod hücreleri tek alan gibi davranır.** Yapıştırma altı haneyi dağıtır, Backspace bir önceki
    hücreye döner, `autocomplete="one-time-code"`, `inputmode="numeric"`.

---

## 4. Referans ↔ SPEC çelişkileri (çözülmüş)

| #   | Çelişki                                                                                                                 | Çözüm                                                                 |
| --- | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Ç1  | SPEC §12/8 "alt bilgi hesap oluşturma dışında her ekranda"; referans **mobil** hesap oluşturmada alt bilgiyi gösteriyor | Web + masaüstü kayıtta alt bilgi **yok**, mobil kayıtta **var** (K13) |
| Ç2  | SPEC §6.4 mobil telefon doğrulamada `Telefon numarasını değiştir`; referans `ve_change` yazıyor                         | K1 gereği ekran kurulmuyor, çelişki düşüyor                           |
| Ç3  | SPEC "çerçevesiz Electron penceresi"; ürün **Tauri**                                                                    | Kabuk Tauri; ölçü ve davranış SPEC'ten (K7)                           |
| Ç4  | SPEC sağlayıcı harf karosu; PROMPT.md "üretimde resmî SVG"                                                              | Depodaki resmî SVG'ler kullanılır                                     |
| Ç5  | SPEC §1.2 koyu tema ≠ ürün `theme-dark`                                                                                 | K5: auth kendi token katmanını kurar                                  |
| Ç6  | Referans mobil 2FA'da 3 dolu hücre, web'de 4                                                                            | Mock durumu; üretimde gerçek kod uzunluğu                             |

---

## 5. Doğrulama komutları

```bash
pnpm --filter @wizards/web typecheck
```

```bash
pnpm --filter @wizards/web test
```

```bash
pnpm --filter @wizards/mobile test
```

```bash
pnpm --filter @wizards/types test
```

E2E yalnız Ş9'da ve yalnız yerel Playwright ortamı ayaktaysa koşulur; koşulamıyorsa rapora
"koşulamadı" yazılır, "geçti" yazılmaz.
