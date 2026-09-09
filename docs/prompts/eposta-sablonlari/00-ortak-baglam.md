# 00 — Ortak bağlam (bağlayıcı)

Bu belge iki dalganın da okuması zorunlu olan tek kaynaktır. Dalga promptları bu dosyaya
atıf yapar; burada yazmayan hiçbir şey uydurulmaz.

Branch: `uat`. Tüm iş bu dalda yapılır, commit atılmaz (kullanıcı ayrıca istemedikçe).

---

## 1. Kaynaklar

| Dosya                                                     | Rol                                                            |
| --------------------------------------------------------- | -------------------------------------------------------------- |
| `design_handoff/eposta-handoff/SPEC.md`                   | **Bağlayıcı** tasarım + içerik şartnamesi                      |
| `design_handoff/eposta-handoff/PROMPT.md`                 | Katı teknik kurallar (tablo düzen, satır içi stil, MSO, boyut) |
| `design_handoff/eposta-handoff/html/dogrulama-kodu.html`  | Referans uygulama · 10 670 bayt                                |
| `design_handoff/eposta-handoff/html/sifre-sifirlama.html` | Referans uygulama · 11 977 bayt                                |
| `design_handoff/eposta-handoff/ekran-goruntuleri/*.png`   | Beklenen görsel sonuç (masaüstü 600 px, mobil 390 px)          |

Referans HTML'ler **çıktının kendisidir**. Üretilen şablonun örnek değerlerle doldurulmuş hâli bu
dosyalarla anlamlı farksız olmalıdır: aynı düğüm sırası, aynı hex değerleri, aynı dolgu/boşluk
sayıları, aynı sınıf adları (`w-wrap`, `w-px`, `w-code`, `w-h1`, `w-url`, `w-meta`).

---

## 2. Katı teknik kurallar (PROMPT.md · değiştirilemez)

- Düzen yalnız iç içe `<table role="presentation" cellpadding="0" cellspacing="0" border="0">`.
  Flexbox, grid, float, `position` yok. Tek kolon akış, 600 px.
- **Her stil satır içi.** `<head>` içindeki `<style>` yalnız font `@import` ve medya sorgusu
  taşır. O blok silinse bile e-posta doğru okunmalı.
- Hiç `<img>` yok, hiç `<script>` yok. Whispr işareti dâhil her şey tablo hücresi + tipografi.
- Buton "bulletproof": `bgcolor` + satır içi `border-radius` taşıyan `<td>`, içinde
  `display:block` ve satır içi `color` verilmiş `<a>`. `<button>` veya görsel buton yok.
- Outlook: her tabloya ve hücreye açık `width`, her metin hücresine
  `mso-line-height-rule:exactly`, `<head>` içinde `OfficeDocumentSettings` / `PixelsPerInch 96`.
- Gövdenin **ilk** elemanı gizli önizleme (preheader) satırı: `display:none`, `mso-hide:all`,
  sıfır boyut, 85–110 karakter.
- `<html lang="…">` (locale'e göre `tr` / `en`), `<meta name="color-scheme" content="light dark">`
  ve `supported-color-schemes`. Saf `#000` / `#fff` zemin yok.
- Tüm bağlantılar gerçek `https://` adresi taşır; `#` ölü çapa yok.
- Her şablonun üretilmiş HTML'i **15 KB altında**.
- Daktilo (monospace) font kullanılmaz.

## 3. Renk tokenları (SPEC §1 · yalnız bu değerler)

| Amaç                                       | Hex       |
| ------------------------------------------ | --------- |
| Buton zemini, işaret rozeti                | `#5966F2` |
| Gövde içi bağlantı metni, yedek URL        | `#4C59E0` |
| Üst marka bandı                            | `#11151D` |
| Başlık, kod, güçlü değer                   | `#1A202D` |
| Gövde metni, alt bilgi bağlantıları        | `#515C70` |
| Etiketler, ikincil satırlar                | `#778092` |
| Bant üstü etiket, telif, meta etiketi      | `#8B93A5` |
| Kart ve kutu kenarlığı                     | `#CED4DE` |
| 1 px ayırıcı                               | `#E3E6EE` |
| Kod kutusu / yedek kutu / alt bilgi zemini | `#F9FAFB` |
| `<body>` zemini                            | `#F2F4F7` |
| Kart gövdesi                               | `#FFFFFF` |
| Süre vurgusu ("10 dakika", "30 dakika")    | `#B4761A` |

Marka işareti gradyanı: `linear-gradient(145deg,#7C70FF,#5B62FF 46%,#2F6DFF)`,
`bgcolor="#5B62FF"` yedeğiyle.

## 4. Tipografi (SPEC §2)

Yığınlar:

- Başlık / kod / marka adı: `'Outfit','Trebuchet MS',Tahoma,Arial,sans-serif`
- Gövde, etiket, alt bilgi, buton, URL: `'Figtree',Arial,Helvetica,sans-serif`

| Rol                    | Boyut / satır   | Ağırlık | Ek                                           |
| ---------------------- | --------------- | ------- | -------------------------------------------- |
| Marka adı              | 17 / 22         | 600     | `letter-spacing:-0.2px`                      |
| Bant etiketi           | 10.5 / 16       | 600     | `letter-spacing:1.5px`, uppercase, `#8B93A5` |
| Göz üstü etiket        | 10.5 / 15       | 600     | `letter-spacing:1.7px`, uppercase, `#778092` |
| H1                     | 25 / 31         | 600     | `letter-spacing:-0.5px`                      |
| Gövde                  | 14.5 / 23       | 400     | `#515C70`                                    |
| Doğrulama kodu         | 34 / 40         | 600     | `letter-spacing:11px`, `#1A202D`             |
| Buton                  | 14.5 / 19       | 600     | `#FFFFFF`                                    |
| Kutu etiketi           | 10.5 / 15       | 600     | `letter-spacing:1.5–1.6px`, uppercase        |
| Küçük açıklama         | 12–12.5 / 18–19 | 400     | `#778092`                                    |
| Güvenlik notu          | 13 / 21         | 400     | `#515C70`                                    |
| Meta etiketi           | 10 / 19         | 600     | `letter-spacing:1.3px`, uppercase, `#8B93A5` |
| Meta değeri            | 12.5 / 19       | 600     | `#1A202D`                                    |
| Alt bilgi bağlantıları | 12 / 19         | 600     | `#515C70`, altı çizgisiz                     |
| Telif                  | 11.5 / 18       | 400     | `#8B93A5`                                    |

Font yükleme: `<!--[if !mso]><!-->` içinde `<link>` + `<style>` içinde `@import`.
Outfit 400/500/600/700, Figtree 400/500/600.

## 5. İskelet (SPEC §3)

```
<body bgcolor #F2F4F7>
  gizli preheader span
  tam genişlik tablo (#F2F4F7)
    td align=center, padding 24px 12px 32px
      600 px kart (.w-wrap)
        marka bandı  #11151D · radius 16px 16px 0 0 · padding 18px 32px
        gövde        #FFFFFF · padding 30px 32px 26px · yan kenarlık #CED4DE
        alt bilgi    #F9FAFB · padding 18px 32px 20px · radius 0 0 16px 16px
```

Marka bandı üç hücre: 36 px işaret · 12 px boşluk sonra "Whispr" · sağa yaslı ekran etiketi.
İşaret: 36×36 gradyan kare, radius 10 px, ortasında dikey ortalanmış beş beyaz çubuk,
her biri 3 px genişlik / 2 px radius, yükseklikler **12 / 18 / 24 / 17 / 13**, aralar 3 px.

Alt bilgi iki satır (her şablonda aynı): `Gizlilik · Şartlar · Çerezler` (12 px, 600,
`#515C70`, altı çizgisiz, ayırıcı `&nbsp;·&nbsp;`) ve `© 2026 Whispr` (11.5 px, `#8B93A5`).
Adres, yardım merkezi, abonelik/tercih satırı **yok**.

Yarıçaplar: kart 16 px, kutular 14 px, buton 12 px, işaret 10 px.

## 6. Duyarlılık (SPEC §3)

```css
@media only screen and (max-width: 520px) {
  .w-wrap {
    width: 100% !important;
  }
  .w-px {
    padding-left: 22px !important;
    padding-right: 22px !important;
  }
  .w-code {
    font-size: 28px !important;
    letter-spacing: 8px !important;
  }
  .w-h1 {
    font-size: 21px !important;
  }
  .w-url {
    font-size: 11px !important;
  }
  .w-meta {
    display: block !important;
    width: 100% !important;
    padding: 0 0 10px 0 !important;
  }
}
```

Her şablon yalnız kendi kullandığı kuralları taşır (`.w-code` yalnız doğrulama, `.w-url` ve
`.w-meta` yalnız sıfırlama).

---

## 7. Kararlar (kullanıcı onayı alındı · bağlayıcı)

| #      | Karar                                                                                                                                                                                                                                                                                                                                                          |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **K1** | E-postadaki bağlantılar **gerçek ürün rotalarıdır**: `/verify-email?token=…`, `/reset-password?token=…`, `/privacy`, `/terms`, `/cookies`, `/settings/account/security`. SPEC'teki Türkçe yollar (`/dogrula`, `/sifre-sifirla`, `/gizlilik`, `/sartlar`, `/cerezler`, `/guvenlik`) uygulanmaz; yeni rota/redirect **eklenmez**. Tasarımın geri kalanı birebir. |
| **K2** | tr metinleri SPEC'ten **birebir** alınır. en metinleri SPEC metninin sadık çevirisidir (§11 tablosu). Tasarım, renk, düzen, boşluk iki dilde aynıdır. `<html lang>` locale'e göre değişir.                                                                                                                                                                     |
| **K3** | Tek gönderen: mevcut `RESEND_FROM_EMAIL` / `RESEND_FROM`. `hesap@` / `guvenlik@` ayrımı uygulanmaz, yeni env eklenmez.                                                                                                                                                                                                                                         |
| **K4** | Kapsam: `sendVerificationEmail` + `sendPasswordResetEmail` (SPEC birebir) **ve** `sendRegistrationAttemptEmail` (aynı kabuk/token/alt bilgi, metni değişmez). `sendAccountDeletionReauthEmail` **kapsam dışı**, dokunulmaz.                                                                                                                                    |
| **K5** | Şifre sıfırlama "Cihaz" satırı: `Tarayıcı · OS · Şehir, Ülke`. Eksik parça sessizce düşer (`Chrome · macOS · TR`, gerekirse `Chrome · macOS`). Hiçbiri yoksa satır hiç çizilmez — uydurma değer yazılmaz.                                                                                                                                                      |
| **K6** | "İstek zamanı" saat dilimi: `UserSettings.timeZone` varsa o, yoksa `Europe/Istanbul`. Etiket gerçek farkı gösterir (`(GMT+3)`), yaz saati otomatik.                                                                                                                                                                                                            |
| **K7** | Doğrulama e-postasının konusu kodu taşır: `Whispr doğrulama kodun: 482915`. Kod üretilemediyse (hız sınırı) konu kodsuz biçime düşer.                                                                                                                                                                                                                          |
| **K8** | `/dev/email-preview` galerisi kurulur; `/dev/auth-states` deseni, üretimde `notFound()`.                                                                                                                                                                                                                                                                       |

## 8. Tasarım dışı çıkarımlar (yalnız K4'ün gerektirdiği kadar)

SPEC kayıt denemesi e-postasını çizmiyor. Yeni kabuğa taşımak için üç değer türetilir; başka
hiçbir yerde çıkarım yapılmaz:

- **E1** Bant etiketi: `Hesap güvenliği` / `Account security`.
- **E2** Göz üstü etiketi: `Bildirim` / `Notice`.
- **E3** Gövde düzeni: göz üstü → H1 → paragraf(lar) → 1 px ayırıcı → güvenlik bloğu.
  Kod kutusu, buton, yedek URL kutusu ve meta ızgarası **kullanılmaz** (bu e-postada eylem yok).

Mevcut kayıt denemesi metni "siz" dilinde, SPEC şablonları "sen" dilinde. **Metin K4 gereği
değiştirilmez.** Dil birliği istenirse ayrı bir karar olarak açılır.

---

## 9. Mevcut kod gerçekleri

Doğrulandı (2026-08-27, `uat`):

| Yer                                                        | Gerçek                                                                                                                        |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/lib/auth/email-verification.ts:169`          | `renderVerificationEmail` — eski tasarım (Inter, `#6366f1`, 560 px, radius 28 px)                                             |
| `apps/web/src/lib/auth/email-verification.ts:285`          | `renderRegistrationAttemptEmail` — sözlük değil, dosya içi gömülü tr/en metin                                                 |
| `apps/web/src/lib/auth/email-verification.ts:362`          | `sendVerificationEmail(user, locale)` — token üretir, `requestEmailVerificationCode` ile 6 haneli kodu alır, kod yoksa `null` |
| `apps/web/src/lib/auth/password-reset.ts:196`              | `renderPasswordResetEmail` — eski tasarım                                                                                     |
| `apps/web/src/lib/auth/password-reset.ts:288`              | `sendPasswordResetEmail(user, locale)` — istek bağlamı **almıyor**                                                            |
| `apps/web/src/lib/auth/password-reset.ts:13`               | `PASSWORD_RESET_TOKEN_EXPIRY_MINUTES = 30`                                                                                    |
| `apps/web/src/lib/auth/email-verification-code.ts:17`      | `EMAIL_CODE_TTL_MS = 10 * 60_000`                                                                                             |
| `apps/web/src/lib/auth/email-verification.ts`              | Link token ömrü 24 saat (`EMAIL_VERIFICATION_TOKEN_EXPIRY_HOURS`) — yeni tasarımda **yazılmaz**                               |
| `escapeHtml`                                               | Üç dosyada birebir kopya: `email-verification.ts`, `password-reset.ts`, `reauth-email.ts:110`                                 |
| `apps/web/src/lib/auth/actions.ts:228,285,767`             | Doğrulama e-postası çağrıları (kayıt, var olan hesap, tekrar gönder)                                                          |
| `apps/web/src/lib/auth/actions.ts:618`                     | Şifre sıfırlama çağrısı — `headerStore` bu fonksiyonda zaten var                                                              |
| `apps/web/src/lib/mobile/auth.ts:1059,1075,1121,1169,1217` | Mobil uçların aynı fonksiyonları çağırdığı yerler (DI seçenekleriyle)                                                         |
| `apps/web/src/lib/analytics/client-info.ts:176`            | `getAnalyticsClientInfo(headers)` → `browser`, `os`, `countryCode`, `deviceType`, `ipHash`. Şehir başlığı okumuyor.           |
| `packages/db/prisma/schema.prisma:908`                     | `UserSettings.timeZone String?`                                                                                               |
| `apps/web/src/lib/locale/messages/tr.ts:1248-1275`         | `auth.emailVerification.*` (e-posta + ekran anahtarları karışık)                                                              |
| `apps/web/src/lib/locale/messages/tr.ts:1328-1364`         | `auth.passwordReset.*` (e-posta + ekran anahtarları karışık)                                                                  |
| `apps/web/src/lib/locale/messages.test.ts`                 | tr/en anahtar kümesi eşitliği kapısı (`PACKAGE_PREFIXES`)                                                                     |
| `apps/web/src/app/dev/auth-states/page.tsx`                | Üretimde `notFound()` olan geliştirme galerisi deseni                                                                         |
| `apps/web/src/app/(legal)/[legalDocument]`                 | `/privacy`, `/terms`, `/cookies`                                                                                              |
| `apps/web/src/lib/settings/navigation.ts:72`               | Güvenlik bölümü → `/settings/account/security`                                                                                |

**Mobil ve masaüstü ayrı şablon üretmez.** Üç istemci de aynı sunucu fonksiyonlarını çağırır
(mobil `apps/web/src/lib/mobile/auth.ts` üzerinden, masaüstü Tauri kabuğu web akışını kullanır).
Bu paketin mobil/masaüstü işi = istek bağlamının uçlardan geçirilmesi ve bağlantıların üç
istemcide de açılıyor olması.

## 10. Hedef dosya haritası

Yeni modül kökü: `apps/web/src/lib/email/`

| Dosya                                     | Sorumluluk                                                                                                                                             |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `email-theme.ts`                          | §3 hex tokenları + §4 tipografi rolleri. Tek kaynak; başka hiçbir dosyada ham hex yok.                                                                 |
| `email-html.ts`                           | `escapeHtml`, satır içi stil birleştirici, öznitelik yardımcıları. Üç kopya buraya toplanır.                                                           |
| `email-shell.ts`                          | Kabuk: `<head>` (MSO, font, medya sorgusu), preheader, marka bandı + işaret, gövde sarmalayıcı, alt bilgi.                                             |
| `email-blocks.ts`                         | Bloklar: göz üstü etiketi, H1, paragraf, kod kutusu, buton, buton altı not, yedek URL kutusu, meta ızgarası, 1 px ayırıcı, güvenlik bloğu.             |
| `email-text.ts`                           | Düz metin (`text`) sürümü üreteci (§12).                                                                                                               |
| `email-links.ts`                          | K1 rotaları: `buildVerifyEmailUrl`, `buildResetPasswordUrl`, `PRIVACY_PATH`, `TERMS_PATH`, `COOKIES_PATH`, `SECURITY_PATH` — hepsi `APP_URL` kökünden. |
| `email-request-context.ts`                | **Dalga 2** — cihaz satırı + istek zamanı çözümü (K5, K6).                                                                                             |
| `templates/verification-code-email.ts`    | SPEC §4                                                                                                                                                |
| `templates/password-reset-email.ts`       | **Dalga 2** — SPEC §5                                                                                                                                  |
| `templates/registration-attempt-email.ts` | K4 + E1–E3                                                                                                                                             |

Her dosyanın yanında `*.test.ts`.

## 11. Sözlük

Yeni önek: `auth.email.`. Eski **yalnız e-postada kullanılan** anahtarlar silinir; ekranlarda da
kullanılanlar (`resendCta`, `resendHelp`, `notConfigured`, `sendFailed`, `senderRestricted`,
`rateLimited`, `title` vb.) silinmeden önce `grep` ile doğrulanır.

Ortak:

| Anahtar                           | tr              | en              |
| --------------------------------- | --------------- | --------------- |
| `auth.email.common.brandName`     | `Whispr`        | `Whispr`        |
| `auth.email.common.footerPrivacy` | `Gizlilik`      | `Privacy`       |
| `auth.email.common.footerTerms`   | `Şartlar`       | `Terms`         |
| `auth.email.common.footerCookies` | `Çerezler`      | `Cookies`       |
| `auth.email.common.copyright`     | `© 2026 Whispr` | `© 2026 Whispr` |

Doğrulama (SPEC §4 · tr birebir):

| Anahtar                                    | tr                                                                                                                   | en                                                                                                                           |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `auth.email.verification.subject`          | `Whispr doğrulama kodun: {code}`                                                                                     | `Your Whispr verification code: {code}`                                                                                      |
| `auth.email.verification.subjectNoCode`    | `Whispr doğrulama kodun`                                                                                             | `Your Whispr verification code`                                                                                              |
| `auth.email.verification.preheader`        | `Doğrulama kodun {spacedCode} — {minutes} dakika geçerli. Kodu Whispr uygulamasına girerek hesabını etkinleştir.`    | `Your verification code is {spacedCode} — valid for {minutes} minutes. Enter it in the Whispr app to activate your account.` |
| `auth.email.verification.bandLabel`        | `Hesap doğrulama`                                                                                                    | `Account verification`                                                                                                       |
| `auth.email.verification.documentTitle`    | `Whispr doğrulama kodun`                                                                                             | `Your Whispr verification code`                                                                                              |
| `auth.email.verification.eyebrow`          | `Son bir adım`                                                                                                       | `One last step`                                                                                                              |
| `auth.email.verification.heading`          | `E-posta adresini doğrula`                                                                                           | `Verify your email address`                                                                                                  |
| `auth.email.verification.body`             | `Merhaba {name}, Whispr hesabını oluşturmak için aşağıdaki tek kullanımlık kodu uygulamadaki doğrulama alanına gir.` | `Hi {name}, enter the one-time code below in the app's verification field to create your Whispr account.`                    |
| `auth.email.verification.codeLabel`        | `Doğrulama kodu`                                                                                                     | `Verification code`                                                                                                          |
| `auth.email.verification.codeExpiryPrefix` | `Kod `                                                                                                               | `Code valid for `                                                                                                            |
| `auth.email.verification.codeExpiryValue`  | `{minutes} dakika`                                                                                                   | `{minutes} minutes`                                                                                                          |
| `auth.email.verification.codeExpirySuffix` | ` geçerli.`                                                                                                          | `.`                                                                                                                          |
| `auth.email.verification.cta`              | `Doğrulamayı tarayıcıda tamamla`                                                                                     | `Finish verification in your browser`                                                                                        |
| `auth.email.verification.ctaNote`          | `Kodu elle girmek istemiyorsan bu bağlantı yeterli.`                                                                 | `If you'd rather not type the code, this link is enough.`                                                                    |
| `auth.email.verification.securityLabel`    | `Bu hesabı sen mi oluşturdun?`                                                                                       | `Did you create this account?`                                                                                               |
| `auth.email.verification.securityBody`     | `İsteği sen yapmadıysan bir şey yapmana gerek yok; kod kullanılmadan geçersiz olur ve hesap açılmaz.`                | `If this wasn't you, there's nothing to do; the code expires unused and no account is created.`                              |

Şifre sıfırlama (SPEC §5 · tr birebir):

| Anahtar                               | tr                                                                                                                                 | en                                                                                                                  |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `auth.email.reset.subject`            | `Şifreni sıfırla — bağlantı {minutes} dakika geçerli`                                                                              | `Reset your password — link valid for {minutes} minutes`                                                            |
| `auth.email.reset.preheader`          | `Şifreni sıfırlamak için bağlantı hazır — {minutes} dakika geçerli. İstek sana ait değilse bu e-postayı yok say.`                  | `Your password reset link is ready — valid for {minutes} minutes. If you didn't request it, ignore this email.`     |
| `auth.email.reset.bandLabel`          | `Hesap güvenliği`                                                                                                                  | `Account security`                                                                                                  |
| `auth.email.reset.documentTitle`      | `Whispr şifre sıfırlama`                                                                                                           | `Whispr password reset`                                                                                             |
| `auth.email.reset.eyebrow`            | `Şifre sıfırlama`                                                                                                                  | `Password reset`                                                                                                    |
| `auth.email.reset.heading`            | `Yeni bir şifre belirle`                                                                                                           | `Set a new password`                                                                                                |
| `auth.email.reset.body`               | `Merhaba {name}, {email} hesabı için şifre sıfırlama isteği aldık. Aşağıdaki bağlantı seni yeni şifre belirleme ekranına götürür.` | `Hi {name}, we received a password reset request for {email}. The link below takes you to the new password screen.` |
| `auth.email.reset.cta`                | `Şifremi sıfırla`                                                                                                                  | `Reset my password`                                                                                                 |
| `auth.email.reset.ctaNotePrefix`      | `Bağlantı `                                                                                                                        | `The link is valid for `                                                                                            |
| `auth.email.reset.ctaNoteValue`       | `{minutes} dakika`                                                                                                                 | `{minutes} minutes`                                                                                                 |
| `auth.email.reset.ctaNoteSuffix`      | ` geçerli ve tek kullanımlıktır.`                                                                                                  | ` and can be used only once.`                                                                                       |
| `auth.email.reset.fallbackLabel`      | `Düğme çalışmıyorsa`                                                                                                               | `If the button doesn't work`                                                                                        |
| `auth.email.reset.metaTimeLabel`      | `İstek zamanı`                                                                                                                     | `Request time`                                                                                                      |
| `auth.email.reset.metaDeviceLabel`    | `Cihaz`                                                                                                                            | `Device`                                                                                                            |
| `auth.email.reset.securityLabel`      | `Bu isteği sen yapmadıysan`                                                                                                        | `If you didn't request this`                                                                                        |
| `auth.email.reset.securityBodyBefore` | `E-postayı yok sayman yeterli; şifren değişmez. Hesabına başkasının erişmeye çalıştığını düşünüyorsan `                            | `Just ignore this email; your password won't change. If you think someone else is trying to reach your account, `   |
| `auth.email.reset.securityBodyLink`   | `tüm oturumlarını kapat`                                                                                                           | `sign out of all sessions`                                                                                          |
| `auth.email.reset.securityBodyAfter`  | ` ve iki adımlı doğrulamayı aç.`                                                                                                   | ` and turn on two-step verification.`                                                                               |

Kayıt denemesi (K4 · mevcut metin korunur, E1/E2 eklenir):

| Anahtar                                        | tr                                                                                                      | en                                                                                                       |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `auth.email.registrationAttempt.subject`       | `Whispr kayıt denemesi bildirimi`                                                                       | `Whispr registration attempt notice`                                                                     |
| `auth.email.registrationAttempt.preheader`     | `E-posta adresinizle yeni bir Whispr hesabı oluşturulmaya çalışıldı; hesabınızda değişiklik yapılmadı.` | `Someone tried to create a new Whispr account with your email address; nothing on your account changed.` |
| `auth.email.registrationAttempt.bandLabel`     | `Hesap güvenliği`                                                                                       | `Account security`                                                                                       |
| `auth.email.registrationAttempt.documentTitle` | `Whispr kayıt denemesi`                                                                                 | `Whispr registration attempt`                                                                            |
| `auth.email.registrationAttempt.eyebrow`       | `Bildirim`                                                                                              | `Notice`                                                                                                 |
| `auth.email.registrationAttempt.heading`       | `E-posta adresinizle kayıt denemesi`                                                                    | `Registration attempt using your email`                                                                  |
| `auth.email.registrationAttempt.greeting`      | `Merhaba {name},`                                                                                       | `Hello {name},`                                                                                          |
| `auth.email.registrationAttempt.body`          | `Birisi bu e-posta adresiyle yeni bir Whispr hesabı oluşturmaya çalıştı.`                               | `Someone tried to create a new Whispr account using this email address.`                                 |
| `auth.email.registrationAttempt.securityLabel` | `Bu işlem size ait değilse`                                                                             | `If this wasn't you`                                                                                     |
| `auth.email.registrationAttempt.securityBody`  | `Hesabınızda değişiklik yapılmadı; bu iletiyi yok sayabilirsiniz.`                                      | `No account changes were made and you can ignore this message.`                                          |

Preheader uzunlukları 85–110 karakter aralığında olmalı; tr doğrulama 99, tr sıfırlama 104
karakter (örnek değerlerle) ölçüldü. Çeviriler de aynı aralıkta tutulur ve test ile kapıya bağlanır.

## 12. Düz metin (`text`) sürümü

Resend'e `html` ile birlikte `text` gönderiliyor; bu korunur. Kural:

- Sıra HTML ile aynı: başlık → gövde → kod / buton hedefi → not → istek özeti (varsa) → güvenlik notu → alt bilgi.
- Bağlantılar çıplak URL olarak yazılır (buton metni, ardından satır başında URL).
- Vurgu parçaları düz metinde birleştirilir (`Kod 10 dakika geçerli.`).
- Alt bilgi: `Gizlilik: <url>` / `Şartlar: <url>` / `Çerezler: <url>` ve telif satırı.
- HTML kaçışı uygulanmaz (düz metin), ama satır sonu enjeksiyonuna karşı `\r` / `\n` temizlenir.

## 13. Güvenlik kuralları

- Kullanıcı denetimli her değer (`name`, `email`, cihaz satırı, şehir) HTML'e **kaçırılarak**
  girer. `escapeHtml` tek yerden gelir.
- Konu satırına giren her değerden `\r` ve `\n` çıkarılır (başlık enjeksiyonu).
- Kod yalnız rakamdır; şablon bunu doğrular, doğrulamıyorsa kodsuz biçime düşer (K7).
- Token'lı URL yalnız `href` ve yedek URL kutusunda görünür; log'a yazılmaz.
- Cihaz / şehir bilgisi yalnız istek başlıklarından okunur; ham IP saklanmaz, mevcut
  `hashAnalyticsValue` davranışı korunur.
- Şifre sıfırlama akışının jenerik yanıtı bozulmaz: e-posta gönderilemese de uç aynı yanıtı
  döner (hesap varlığı sızdırılmaz).

## 14. Doğrulama komutları

```bash
pnpm --filter @wizards/web typecheck
```

```bash
pnpm --filter @wizards/web test
```

```bash
pnpm --filter @wizards/web lint
```

Tek dosya testi (web paketi kökünden):

```bash
node --test --import tsx src/lib/email/email-shell.test.ts
```

`typecheck` / `lint` **pnpm üzerinden** çalıştırılmalı (runner `npm_execpath` denetler).
Kod değişikliği sonrası: `graphify update .`

## 15. Kabul ölçütleri (SPEC §6 + paket ekleri)

1. Üretilen her HTML tek başına açılıyor; `<img>` ve `<script>` yok; **< 15 KB**.
2. Gövdenin ilk elemanı gizli preheader; uzunluk 85–110 karakter.
3. Buton `<td bgcolor="#5966F2">` + `display:block` `<a>`; görsel yok.
4. Tüm bağlantılar gerçek `https://` adresi (K1 rotaları).
5. 600 px kart yatay taşma yapmıyor; 390 px'te tek kolon, 22 px yan boşluk, kod 28 px.
6. Alt bilgi yalnız Gizlilik · Şartlar · Çerezler + telif.
7. Metinler §11 tablosundaki hâliyle birebir.
8. Hiçbir hex `email-theme.ts` dışında yazılmıyor.
9. `<style>` bloğu silindiğinde e-posta hâlâ okunabilir (satır içi stil bütünlüğü).
10. tr/en anahtar kümeleri eşit (`messages.test.ts` yeşil).
11. `flex`, `grid`, `float`, `position`, `<button>`, monospace font geçmiyor.

## 16. Yasaklar

- SPEC dışında metin, blok, ikon, renk, boşluk **eklenmez**.
- Yeni e-posta türü açılmaz, `reauth-email.ts` dosyasına dokunulmaz.
- Yeni rota / redirect eklenmez (K1).
- Yeni ortam değişkeni eklenmez (K3).
- Kütüphane eklenmez (react-email, mjml, juice vb. **yok**).
- Şema (Prisma) değişikliği yok, migration yok.
- Commit atılmaz.
