# Ş1 — Sözleşme · token · metrik sözlüğü · i18n (Dalga 1 kapısı)

**UI yazma.** Bu şerit yalnız tip, token, ölçü sözlüğü, metin sözlüğü ve saf yardımcı üretir.
Ş2 ve Ş3 bu şerit bitmeden başlamaz.

Oku: `00-ortak-baglam.md`, `PLAN.md` §3, `design_handoff/giris-kayit-paketi/SPEC.md` §1, §2, §3,
§4, §5, §6, §10, §13.

---

## 1. `@wizards/types` — kimlik sözleşmesi

`packages/types/src/auth.ts`:

- `RegisterSchema` yeniden kurulur (K10):
  - `displayName` — 2–64, `trim`, boş değil. Hata anahtarı `validation.displayName.min` /
    `.max`. (Ad Soyad; `User.displayName` kolonuna yazılır.)
  - `username` — **mevcut kural korunur** (K8): 2–32, `/^[a-zA-Z0-9_]+$/`.
  - `email` — `z.string().email("validation.email.invalid")`.
  - `password` — yeni `RegistrationPasswordSchema` (aşağıda).
  - `turnstileToken` — mevcut `TurnstileTokenSchema`.
  - `confirmPassword` **kaldırılır**; `refine` eşleşme kontrolü de kalkar.
- `ResetPasswordSchema` `confirmPassword` ile **kalır**, `password` alanı
  `RegistrationPasswordSchema`'ya yükseltilir.
- `LoginSchema` ikiye ayrılır (K2):
  - `LoginSchema` = `email` + `password` + `rememberMe` + `turnstileToken`.
    **`twoFactorCode` alanı çıkar.**
  - `TwoFactorChallengeSchema` = `challengeId` (`z.string().min(24).max(128)`) +
    `code` (6 hane, `/^\d{6}$/`, hata `validation.twoFactor.invalid`) +
    `rememberDevice` (`RememberMeSchema` deseni).
  - `BackupCodeChallengeSchema` = `challengeId` + `backupCode`.
    `backupCode` `z.preprocess` ile `toUpperCase()` + `[^A-Z0-9]` temizliği yapar, 8–24 karakter.
- `EmailVerificationCodeSchema` = `code` (`/^\d{6}$/`).
- `ResendVerificationSchema` = `channel: z.literal("email")` (K1 gereği tek değer).
- Tip dışa vurumları: `RegisterInput` · `LoginInput` · `TwoFactorChallengeInput` ·
  `BackupCodeChallengeInput` · `EmailVerificationCodeInput`.

**Kırılan çağrı yerlerini tara ve düzelt** (`RegisterInput.confirmPassword`, `LoginInput.twoFactorCode`
okuyan her yer): `apps/web/src/app/(auth)/register/page.tsx`,
`apps/web/src/app/(auth)/login/login-client.tsx`, `apps/web/src/lib/auth/actions.ts`,
mobil `apps/mobile/src/auth/*`, `apps/web/src/app/api/v1/mobile/auth/*`. Bu şeritte yalnız
**derlenebilir hâle** getir (alanı kaldır / varsayılan ver); ekran davranışı Dalga 2–3'ün işi.

---

## 2. Şifre politikası — tek kaynak

Yeni dosya `packages/types/src/auth-password-policy.ts`:

```ts
export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_REQUIRED_RULE_COUNT = 3;

export type PasswordRuleId = "length" | "case" | "digit" | "symbol";
export type PasswordStrength = {
  rules: Record<PasswordRuleId, boolean>;
  satisfiedCount: number;
  score: 0 | 1 | 2 | 3 | 4;
};
export function evaluatePasswordStrength(value: string): PasswordStrength;
```

Kurallar **SPEC §4.4/5'ten birebir**:

| Kural    | Koşul                                            |
| -------- | ------------------------------------------------ |
| `length` | `value.length >= 10`                             |
| `case`   | `/[a-zçğıöşü]/.test(v) && /[A-ZÇĞİÖŞÜ]/.test(v)` |
| `digit`  | `/\d/.test(v)`                                   |
| `symbol` | `/[^A-Za-z0-9çğıöşüÇĞİÖŞÜ\s]/.test(v)`           |

`score` = karşılanan kural sayısı (0–4). Ton eşlemesi tüketicide: `0–1 danger · 2 warning ·
3–4 success` (SPEC §4.4/4). Etiket anahtarları: `0 → pw.veryWeak`, `1 → pw.weak`, `2 → pw.medium`,
`3 → pw.good`, `4 → pw.strong` (metinler §13'ten: Çok zayıf · Zayıf · Orta · İyi · Güçlü).

`RegistrationPasswordSchema` bu modülü kullanır: `min(10)` + `satisfiedCount >= 3` +
mevcut `isBcryptPasswordWithinLimit` kontrolü. Hata anahtarı `validation.password.rules`.

Test: `packages/types/src/auth-password-policy.test.ts` — 4 kuralın her biri için pozitif/negatif,
Türkçe karakterli parola (`Şifreçğı1!`), yalnız boşluk sembol sayılmaz, 4/4 skor, sınır 10 karakter.

---

## 3. Auth token katmanı (K5)

`apps/web/src/app/globals.css` sonuna **yeni bir blok**:

```css
[data-auth-surface] {
  /* SPEC §1.1 — açık */
  --background: 220 23% 98%;
  --foreground: 222 26% 14%;
  --surface-card: 0 0% 100%;
  --surface-soft: 220 24% 91%;
  --surface-inset: 220 24% 96%;
  --border: 220 20% 84%;
  --primary: 235 86% 65%;
  --primary-foreground: 0 0% 100%;
  --success: 154 60% 42%;
  --success-soft: 154 46% 22%;
  --warning: 39 90% 56%;
  --warning-soft: 34 55% 22%;
  --danger: 352 84% 60%;
  --danger-soft: 352 70% 30%;
  --text-secondary: 220 16% 38%;
  --text-muted: 220 11% 52%;
}

[data-auth-surface][data-auth-theme="dark"] {
  /* SPEC §1.2 */
  --background: 222 26% 9%;
  --foreground: 220 22% 96%;
  --surface-card: 222 22% 13%;
  --surface-soft: 222 16% 22%;
  --surface-inset: 222 20% 16%;
  --border: 222 15% 27%;
  --primary: 235 86% 68%;
  --success: 154 55% 48%;
  --success-soft: 154 58% 76%;
  --warning: 39 92% 62%;
  --warning-soft: 39 85% 78%;
  --danger: 352 84% 66%;
  --danger-soft: 352 88% 82%;
  --text-secondary: 220 14% 74%;
  --text-muted: 220 12% 60%;
}
```

Kurallar:

- Bu blok **yalnız** auth kökünde geçerlidir; global `:root` ve `html.theme-*` blokları
  **değiştirilmez**. `splash-contrast.test.ts` dokunulmaz.
- `color-scheme` de auth kökünde ayarlanır (`light` / `dark`), yoksa tarayıcı form kontrolleri
  yanlış temada çizilir.
- Ayrıca `--desktop-titlebar-height` **global 34px → 38px** (K7, globals.css:109).

Kapı testi `apps/web/src/app/auth-tokens.test.ts` (node):
`globals.css` okunur; `[data-auth-surface]` bloğundaki 17 tokenın hepsi tanımlı mı, değerleri SPEC
tablosuyla birebir mi, `data-auth-theme="dark"` bloğunda 15 tokenın hepsi var mı, dosyada auth
bloğu dışında `--surface-inset` tanımı yok mu — dördü de doğrulanır.

---

## 4. Ölçü sözlüğü — `AUTH_METRICS`

Yeni dosya `apps/web/src/lib/auth/metrics.ts`. Sabit sayı hiçbir bileşenin içine yazılmaz;
hepsi buradan okunur. En az şu alanlar (değerler SPEC'ten):

```
window:   { web: {w:1280,h:720,radius:14}, desktop: {w:1040,h:720,radius:16,titlebar:38} }
brand:    { web: {width:512, padding:[56,52], ring:150, ringOffsetLeft:-14, logoScale:1.55,
                  wordmark:42, tagline:14.5, dividerTop:34, dividerBottom:28, dividerMax:300,
                  heading:21, headingMax:"16ch", body:13.5, bodyMax:"36ch", bullet:12.5,
                  dot:5, bulletGap:11},
            desktop:{width:376, padding:[40,38], ring:104, logoScale:1.2, wordmark:32,
                  tagline:13, dividerMax:230, heading:18, body:12.5} }
form:     { web:{padding:72, maxWidth:384, registerPadding:56, registerMaxWidth:424},
            desktop:{padding:56, maxWidth:352, registerPadding:48, registerMaxWidth:392} }
type:     { eyebrow:{size:10, weight:600, tracking:".18em"},
            title:{web:29, desktop:25, mobile:27, weight:600, tracking:"-.02em", leading:1.2},
            description:{web:13.5, desktop:12.75, leading:1.6},
            label:{web:12.5, desktop:12, weight:600, gap:7} }
field:    { height:{web:46, desktop:43, mobile:49}, radius:{web:12, desktop:12, mobile:14},
            paddingX:14, fontSize:{web:14, desktop:13.5, mobile:14.75},
            focusRing:"0 0 0 3px", focusBorder:1.5 }
button:   { primary:{height:{web:48,desktop:46,mobile:52}, radius:{web:12,desktop:12,mobile:14},
                     fontSize:{web:14.5,desktop:14,mobile:15},
                     shadow:"0 12px 26px -12px hsl(var(--primary)/.7)"},
            provider:{height:{web:44,desktop:42,mobile:48}, radius:{web:12,desktop:12,mobile:14},
                      tile:22, tileRadius:6, label:13.5, badgeHeight:20, badgeRadius:6,
                      badgeSize:9.5, badgeTracking:".1em"} }
codeCell: { width:54, height:62, radius:{web:12,mobile:14}, gap:10,
            digit:{web:25,mobile:24,weight:600}, caret:{w:2,h:{web:26,mobile:24}} }
checkbox: { size:{web:18,mobile:20}, radius:6, tick:11 }
pill:     { height:{web:30,desktop:28,mobile:34}, radius:999 }
strength: { barHeight:5, radius:999, transition:"width .25s ease",
            ruleGrid:{columns:2, gap:[5,14], fontSize:11.5, dot:14, tick:8.5} }
turnstile:{ height:52, radius:12, tile:20, hint:10.5 }
banner:   { padding:[14,15], radius:12, tile:22, tileRadius:7, title:13, body:12, leading:1.55 }
successTile:{ size:52, radius:14, glyph:24 }
statusCard:{ width:440, padding:22, radius:16, tile:24, tileRadius:8,
             label:{size:9.5,weight:700,tracking:".14em"}, title:16.5, body:12.5 }
blocking: { icon:56, title:29, band:48 }
footer:   { gap:16, fontSize:{web:11.5,mobile:10.5},
            web:{left:72,right:72,bottom:30}, desktop:{left:56,right:56,bottom:22} }
selector: { languageWidth:196, menuRadius:14, menuPadding:6, rowHeight:38, rowRadius:10,
            chevronCircle:20, chevronSize:8.5, segmentWidth:{web:26,desktop:24,mobile:30} }
aurora:   { web:{inset:"-30%", a:"30% 34% at 34% 38%", b:"26% 32% at 68% 66%",
                 alphaA:.22, alphaB:.12, duration:"18s"},
            desktop:{inset:"-32%", a:"32% 36% at 30% 36%", b:"26% 30% at 72% 70%", duration:"16s"},
            mobile:{inset:"-25%", a:"32% 26% at 50% 26%", b:"30% 24% at 62% 74%", duration:"16s"} }
logo:     { size:52, radius:13, bar:{width:3, gap:3, heights:[17,25,34,24,18],
            delays:[0,.13,.26,.39,.52]}, cycle:"2.1s" }
mobile:   { deviceRadius:44, statusBar:52, statusPaddingX:30, contentPaddingX:28,
            homeIndicator:{w:134,h:5}, minTapTarget:44 }
```

Kapı testi `apps/web/src/lib/auth/metrics.test.ts`: sözlük dondurulmuş mu (`Object.isFrozen`),
SPEC §1.4 tablosundaki 8 satır birebir mi, `minTapTarget === 44` mü.

---

## 5. i18n — SPEC §13 tablosu

1. **Eşleme tablosu.** `docs/prompts/whispr-giris-kayit/raporlar/s1-metin-eslemesi.md` üretilir:
   `referans anahtarı | ürün anahtarı | TR | EN | kullanan ekran`. SPEC §13'ün **tüm** satırları
   (~150 çift) girer.
2. **Ürün anahtar biçimi** `auth.<grup>.<parça>`:
   `auth.brand.*` (panel) · `auth.field.*` · `auth.provider.*` · `auth.login.*` · `auth.twoFactor.*`
   · `auth.backupCode.*` · `auth.register.*` · `auth.password.*` · `auth.verifyEmail.*` ·
   `auth.forgotPassword.*` · `auth.resetPassword.*` · `auth.status.*` · `auth.errorLevels.*` ·
   `auth.states.*` · `auth.footer.*` · `auth.ui.*`.
3. `apps/web/src/lib/locale/messages/tr.ts` ve `en.ts` bu anahtarlarla doldurulur. TR sütunu
   SPEC'in TR sütunu, EN sütunu SPEC'in EN sütunudur — **birebir**, tırnak tipi dahil
   (`Politikası’nı` içindeki kesme işareti `’`).
4. `apps/mobile/src/locale/mobile-copy.ts` aynı metinleri camelCase anahtarla alır
   (`authLoginTitle`, `authTwoFactorRemember`, …). Eşleme tablosu mobil sütunu da içerir.
5. **K1 listesi.** `apps/web/src/lib/auth/skipped-copy.ts`:
   ```ts
   export const SKIPPED_BY_K1 = [
     "vp_t",
     "vp_s",
     "vp_eyebrow",
     "vp_change",
     "vp_call",
     "f_contact",
     "f_contact_ph",
     "f_contact_phone",
   ] as const;
   ```
   Anahtarlar sözlüğe **girer** (ileride telefon açıldığında hazır olsun), ama parity testi bunları
   "ekranda görünmeli" kuralından muaf tutar.
6. Kapı testi `apps/web/src/lib/locale/auth-copy-parity.test.ts`:
   - `tr.ts` ve `en.ts` auth anahtar kümeleri **eş**.
   - Eşleme tablosundaki her satırın karşılığı iki sözlükte de var.
   - Hiçbir auth metni boş değil, hiçbiri `TODO` içermiyor.
   - Eski `REGISTER_COPY` / `AUTH_ERROR_MESSAGES` benzeri sabit metin blokları
     `app/(auth)/**` altında kalmamış (kaynak taraması).

---

## 6. Durum kataloğu — `AUTH_STATUS_CATALOG`

`apps/web/src/lib/auth/status-catalog.ts`. SPEC §7'nin 10 durumu + SPEC §8'in üç seviyesi tek
sözlükte. Her kayıt:

```ts
type AuthStatusId =
  | "credentials"
  | "accountLocked"
  | "codeInvalid"
  | "usernameTaken"
  | "passwordWeak"
  | "emailRegistered"
  | "network"
  | "linkExpired"
  | "rateLimit"
  | "accountSuspended";

type AuthStatusDefinition = {
  id: AuthStatusId;
  tone: "danger" | "warning" | "neutral";
  level: 1 | 2 | 3; // SPEC §8 gösterim seviyesi
  labelKey: string;
  titleKey: string;
  descriptionKey: string;
  primaryActionKey?: string;
  secondaryActionKey?: string;
  glyph: string; // ! ⏻ @ ✉ ⚡ ⏱ ⏳ ⊘
};
```

Seviye eşlemesi (SPEC §8): `credentials` → 1 · `passwordWeak` → 1 · `usernameTaken` → 1 ·
`emailRegistered` → 1 · `codeInvalid` → 1 · `network` → 2 · `rateLimit` → 2 ·
`accountLocked` → 3 · `accountSuspended` → 3 · `linkExpired` → 3.

Test: 10 kaydın hepsi var, her `*Key` sözlükte karşılığı olan bir anahtar, `tone`/`level` SPEC §7
tablosuyla aynı.

---

## 7. Mobil tasarım katmanı

- `apps/mobile/src/design/tokens.ts` → `mobileAuthMetrics` ve `mobileAuthTypography` eklenir
  (SPEC §6 ölçüleri: alan 48–50/köşe 14/14.5–15px, birincil düğme 52/14/15, sağlayıcı 48,
  onay kutusu 20, kod hücresi `flex:1`×62/köşe 14/24px, durum çubuğu 52, içerik dolgusu 28,
  home indicator 134×5, cihaz köşesi 44, `minTapTarget: 44`).
- `apps/mobile/src/design/palette.ts` → mevcut `redesignAuthLight` / `redesignAuthDark`
  **SPEC §1.1/§1.2 üçlülerine göre** gözden geçirilir; eksik anahtarlar (`surfaceInset`,
  `dangerSoft`, `successSoft`, `warningSoft`) eklenir. Var olan anahtarlar **silinmez**, yalnız
  değerleri SPEC'e çekilir; silinmesi gerekenleri rapora yaz, silme.
- Kapı testi `apps/mobile/scripts/mobile-auth-token-contract.test.ts`: iki paletin anahtar kümesi
  eş, SPEC §1 değerleri birebir, `mobileAuthMetrics.minTapTarget === 44`.

---

## 8. Bitirme

- `pnpm --filter @wizards/types test`, `pnpm --filter @wizards/web typecheck`,
  `pnpm --filter @wizards/web test`, `pnpm --filter @wizards/mobile test` — dördü de yeşil.
- Rapor: `docs/prompts/whispr-giris-kayit/raporlar/s1-sozlesme.md`
  — değişen dosya listesi, üretilen sözlük boyutları, kırılan ve düzeltilen çağrı yerleri,
  `redesignAuth*` içinde silinmesi önerilen anahtarlar, koşulamayan komutlar.
- Ayrıca `raporlar/s1-metin-eslemesi.md` (§5.1) — sonraki altı şeridin tek metin kaynağı.
