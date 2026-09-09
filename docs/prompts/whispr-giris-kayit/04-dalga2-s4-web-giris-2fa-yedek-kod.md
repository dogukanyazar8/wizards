# Ş4 — Web: Giriş · İki adımlı doğrulama · Yedek kod (Dalga 2)

Yalnız `apps/web/src/app/(auth)/login/**` altına yaz. `components/auth/**` ve `lib/auth/**`
**değiştirilmez** — Ş3'ün bileşenleri ve Ş2'nin eylemleri tüketilir. Eksik bulursan rapora yaz,
kendi kopyanı üretme.

Oku: `00-ortak-baglam.md`, `PLAN.md` §3, `SPEC.md` §4 (ortak tablo), §4.1, §4.2, §4.3, §4.8, §8, §9,
§11, ve `raporlar/s1-metin-eslemesi.md` · `s2-kimlik-backend.md` · `s3-ortak-parcalar.md`.

---

## 1. `/login` — Giriş (SPEC §4.1)

Form sütunu 384px, kolon dolgusu `0 72px`, alt bilgi **var**.

Sıra:

1. `AuthEyebrow` — `auth.login.eyebrow` (`GİRİŞ` / `SIGN IN`).
2. `AuthTitle` — `auth.login.title` (`Tekrar hoş geldin`).
3. `AuthDescription` — `auth.login.subtitle`.
4. `TextInput` e-posta — etiket `auth.field.email`, `type="email"`,
   `autocomplete="username email"`.
5. `PasswordInput` — etiket `auth.field.password`; etiket satırının **sağında**
   `auth.login.forgot` bağlantısı, `600 12px`, hedef `/forgot-password`.
   `autocomplete="current-password"`.
6. `AuthCheckbox` — `auth.login.remember` (18px, köşe 6, `--primary`, beyaz 11px ✓).
   Hata durumunda bu satırın **sağında** `auth.status.credentials.attemptsLeft`
   ("3 deneme kaldı") sayacı belirir (SPEC §8/1).
7. `PrimaryButton` — `auth.login.cta`.
8. `AuthDivider` — `auth.field.or`.
9. `SocialAuthButtons` — Google aktif; Microsoft ve Apple `disabled` + `aria-disabled` +
   `Yakında` rozeti (K14). Etiketler `auth.provider.google/microsoft/apple`.
10. Alt satır: `auth.login.noAccount` + `auth.login.createAccount` bağlantısı (13px, bağlantı 600),
    hedef `/register`.

### 1.1 Turnstile

Giriş formunda görünür Turnstile satırı **yoktur** (tasarımda yok), ama `loginAction` token
istiyor: `TurnstileWidget` görünmez/`invisible` modda çalışır ve token'ı forma yazar.
Token yoksa düğme `disabled` olur — kullanıcıya görsel bir şey eklenmez.

### 1.2 Gönderim ve durumlar

`loginAction` dönüşleri (Ş2 sözleşmesi) → ekran davranışı:

| `status`            | Seviye | Davranış                                                                                                                                                     |
| ------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `success`           | —      | `redirectTo`'ya git                                                                                                                                          |
| `twoFactorRequired` | —      | `/login/two-factor?c=<challengeId>` (challenge id URL'de **tutulmaz**; `sessionStorage` + rota state kullan, aşağıya bak)                                    |
| `credentials`       | 1      | Şifre alanı kırmızı + `auth.status.credentials.field`; remember satırının sağında kalan deneme sayacı; e-posta değeri korunur                                |
| `turnstile`         | 2      | `AuthBanner` (danger), odak ilk alana                                                                                                                        |
| `rateLimit`         | 2      | `AuthBanner` — `auth.status.rateLimit.*`                                                                                                                     |
| `network`           | 2      | `AuthBanner` + `auth.errorLevels.retry` ("Bağlantı bekleniyor…"); bağlantı gelince istek otomatik tekrarlanır (SPEC §10)                                     |
| `accountLocked`     | 3      | `BlockingPanel`: `⏻` karosu + `auth.status.accountLocked.*`, h44 sayaç bandı `Kalan süre 14:32` (canlı geri sayım), `Şifremi sıfırla` + `Giriş ekranına dön` |
| `accountSuspended`  | 3      | `BlockingPanel`: `⊘`, `Referans · WSP-…`, `İtiraz gönder` + `Kuralları oku`                                                                                  |

**Challenge taşınması:** `challengeId` URL'e yazılmaz (paylaşılabilir/loglanabilir olur).
`sessionStorage["whispr-2fa-challenge"]` içinde tutulur ve `/login/two-factor` mount'ta okur;
yoksa `/login`'e geri döner. `router.replace` kullanılır (geri tuşuyla forma dönülmez).

---

## 2. `/login/two-factor` — İki adımlı doğrulama (SPEC §4.2)

Aynı kabuk, form sütunu 384px, alt bilgi var.

1. `AuthEyebrow` — `auth.twoFactor.eyebrow` (`İKİ ADIMLI DOĞRULAMA`).
2. `AuthTitle` — `auth.twoFactor.title` (`Doğrulama kodunu gir`).
3. `AuthDescription` — `auth.twoFactor.subtitle` (30 saniyede yenilenir metni).
4. `CodeInput` altı hücre — otomatik odak ilk boş hücrede; altıncı hane girilince form
   **otomatik gönderilmez**, düğme etkinleşir (kazara gönderim yok).
5. `AuthCheckbox` — `auth.twoFactor.rememberDevice` (`Bu cihazı 30 gün hatırla`).
6. `PrimaryButton` — `auth.twoFactor.cta` (`Doğrula ve gir`).
7. `AuthLink` 600 — `auth.twoFactor.useBackup` → `/login/backup-code` (challenge korunur).
8. `AuthLink` `--text-muted` — `auth.common.backToLogin` → `/login` (challenge temizlenir).

Durumlar:

| Dönüş              | Davranış                                                                                                                                                                          |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `success`          | `redirectTo`                                                                                                                                                                      |
| `codeInvalid`      | Altı hücre `tone="danger"` (kırmızı dolu), altında `FieldError`; kalan deneme sayısı `auth.status.codeInvalid.description` ile birlikte; `Yedek kod kullan` bağlantısı vurgulanır |
| `challengeExpired` | `/login`'e dön + `AuthBanner` (danger) `auth.twoFactor.expired`                                                                                                                   |
| `rateLimit`        | Seviye 2 bant + geri sayım                                                                                                                                                        |

Erişilebilirlik: `CodeInput` grubu `aria-label="auth.field.code"`; hata `role="alert"`.

---

## 3. `/login/backup-code` — Yedek kod (SPEC §4.3)

1. `AuthEyebrow` — `auth.twoFactor.eyebrow` (aynı eyebrow, SPEC referansında da öyle).
2. `AuthTitle` — `auth.backupCode.title` (`Yedek kodunu gir`).
3. `AuthDescription` — `auth.backupCode.subtitle` ("Her kod yalnızca bir kez çalışır").
4. Tek alan: **h52**, köşe 12, `600 18px Outfit`, `letter-spacing:.14em`,
   placeholder `7QF4-2KDX-9M`, `autocomplete="one-time-code"`, `autocapitalize="characters"`,
   `spellcheck={false}`. Yazarken görüntü maskesi uygulanır (4-4-2 gruplama), sunucuya
   normalize edilmiş değer gider.
5. `PrimaryButton` — `auth.twoFactor.cta`.
6. `AuthLink` — `auth.common.backToLogin`.

Durumlar: geçersiz/kullanılmış kod → alan içi hata (seviye 1),
`auth.status.codeInvalid.title` metniyle; challenge süresi geçti → `/login`.

---

## 4. Kaldırılanlar

`login-client.tsx` içinden: `RoleTabs` + `selectedRole`, `showTwoFactorPrompt` ve satır içi 2FA
alanı, `AUTH_ERROR_MESSAGES` sabit metin sözlüğü (yerine `AUTH_STATUS_CATALOG`),
Discord dalı. `DesktopOAuthPendingDialog` ve masaüstü OAuth kablolaması **korunur** —
yalnız görsel dili SPEC'in bileşenlerine taşınır.

---

## 5. Testler

- `app/(auth)/login/login-client.test.tsx`: alan sırası, `Şifremi unuttum` bağlantısının etiket
  satırında olması, üç sağlayıcı + Discord'un olmaması, Microsoft/Apple `disabled` + rozet,
  `credentials` dönüşünde yalnız şifre alanının kırmızıya dönmesi ve e-postanın korunması,
  deneme sayacının remember satırının sağında görünmesi, `accountLocked` dönüşünde formun
  gizlenip blok panelin gelmesi.
- `two-factor-client.test.tsx`: challenge yoksa `/login`'e yönlenir, altı hane girilince düğme
  etkinleşir ama otomatik gönderilmez, `codeInvalid` altı hücreyi kırmızıya çevirir,
  `Yedek kod ile giriş yap` challenge'ı taşır.
- `backup-code-client.test.tsx`: maske 4-4-2, sunucuya normalize değer, tek kullanımlık hata metni.
- Metin testi: bu üç ekranda sabit dize yok (kaynak taraması).

## 6. Bitirme

`pnpm --filter @wizards/web typecheck` + `test` yeşil.
Rapor: `raporlar/s4-giris-2fa.md` — üç ekranın SPEC madde madde kontrol listesi (§4.1/§4.2/§4.3
her satırı ✓/✗), Ş2 sözleşmesinde eksik çıkan `status` değerleri, Ş3'te eksik çıkan bileşen
özellikleri.
