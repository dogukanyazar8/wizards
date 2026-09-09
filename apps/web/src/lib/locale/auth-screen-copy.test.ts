import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { AUTH_STATUS_CATALOG, AUTH_STATUS_IDS } from "@/lib/auth/status-catalog";
import { SKIPPED_BY_K1 } from "@/lib/auth/skipped-copy";
import { EN_MESSAGES } from "./messages/en";
import { TR_MESSAGES } from "./messages/tr";

/**
 * SPEC-GIRIS-KAYIT §13 metin denetimi.
 *
 * `design_handoff/giris-kayit-paketi/SPEC.md` §13 tek doğruluk kaynağı ve metinlerin **birebir**
 * aynı olmasını istiyor (kabul kriteri 9). Bir kelime kaymasını hiçbir görsel test yakalamaz;
 * bu dosya yakalar. `{email}` · `{countdown}` · `{count}` gibi yer tutucular SPEC'in örnek
 * değerlerinin yerini alır; test yer tutucuyu SPEC'teki örnekle doldurup karşılaştırır.
 */

const TR: Record<string, string> = TR_MESSAGES;
const EN: Record<string, string> = EN_MESSAGES;

/** SPEC §13'ün örnek değerleri — şablonlar bunlarla doldurulunca tablo satırı çıkmalı. */
const SPEC_SAMPLES: Record<string, string> = {
  count: "3",
  countdown: "00:42",
  date: "27.08.2026",
  email: "ada@whispr.app",
  time: "11:24",
  username: "ada",
};

function fill(value: string, overrides: Record<string, string> = {}): string {
  return value.replace(
    /\{(\w+)\}/g,
    (match, name: string) => overrides[name] ?? SPEC_SAMPLES[name] ?? match,
  );
}

/** SPEC §13 — Türkçe sütun, tablodaki sırayla. */
const AUTH_TR = {
  "auth.ui.light": "Açık",
  "auth.ui.dark": "Koyu",
  "auth.brand.tagline": "Sesli sohbet ve topluluk",
  "auth.brand.heading": "Sesin, ekibinin yanında.",
  "auth.brand.body":
    "Kanallara gir, sesli odalarda buluş, konuşmayı kaldığın yerden sürdür. Whispr her cihazda aynı şekilde çalışır.",
  "auth.brand.point1": "Uçtan uca şifreli sesli odalar",
  "auth.brand.point2": "Masaüstü, web ve mobilde tek hesap",

  "auth.field.email": "E-posta",
  "auth.field.password": "Şifre",
  "auth.field.passwordPlaceholder": "En az 10 karakter",
  "auth.field.fullName": "Ad Soyad",
  "auth.field.username": "Kullanıcı adı",
  "auth.field.contact": "E-posta veya telefon",
  "auth.field.contactPlaceholder": "ada@whispr.app · +90 5xx xxx xx xx",
  "auth.field.emailDetected": "E-posta adresi algılandı",
  "auth.field.phoneDetected": "Telefon numarası algılandı · Türkiye (+90)",
  "auth.field.newPassword": "Yeni şifre",
  "auth.field.confirmNewPassword": "Yeni şifreyi tekrar gir",
  "auth.field.code": "Doğrulama kodu",
  "auth.field.backupCode": "Yedek kod",
  "auth.field.show": "Göster",
  "auth.field.hide": "Gizle",
  "auth.field.or": "veya",
  "auth.provider.google": "Google ile devam et",
  "auth.provider.microsoft": "Microsoft ile devam et",
  "auth.provider.apple": "Apple ile devam et",
  "auth.provider.soon": "Yakında",

  "auth.login.eyebrow": "GİRİŞ",
  "auth.login.title": "Tekrar hoş geldin",
  "auth.login.subtitle": "Hesabına giriş yap, konuşmaya kaldığın yerden devam et.",
  "auth.login.forgot": "Şifremi unuttum",
  "auth.login.remember": "Beni hatırla",
  "auth.login.cta": "Giriş yap",
  "auth.login.noAccount": "Hesabın yok mu?",
  "auth.login.createAccount": "Hesap oluştur",

  "auth.twoFactor.eyebrow": "İKİ ADIMLI DOĞRULAMA",
  "auth.twoFactor.title": "Doğrulama kodunu gir",
  "auth.twoFactor.subtitle":
    "Kimlik doğrulama uygulamandaki 6 haneli kodu yaz. Kod 30 saniyede bir yenilenir.",
  "auth.twoFactor.rememberDevice": "Bu cihazı 30 gün hatırla",
  "auth.twoFactor.cta": "Doğrula ve gir",
  "auth.twoFactor.useBackup": "Yedek kod ile giriş yap",
  "auth.common.backToLogin": "Giriş ekranına dön",
  "auth.backupCode.title": "Yedek kodunu gir",
  "auth.backupCode.subtitle":
    "Hesabını kurarken kaydettiğin kodlardan birini kullan. Her kod yalnızca bir kez çalışır.",

  "auth.register.eyebrow": "HESAP OLUŞTUR",
  "auth.register.title": "Whispr'a katıl",
  "auth.register.subtitle":
    "Dört alan yeterli. Sunucu kurmak ya da bir davete katılmak 30 saniye sürüyor.",
  /*
   * SPEC §13 `reg_user_hint` satırı `whispr.app/@ada` yazıyor. Kullanıcı kararıyla değişti:
   * `whispr.app` üründe gerçek değil (gerçek alan adı `whispr.team`) ve `/@kullaniciadi`
   * rotası hiç yok — satır var olmayan bir adresi vaat ediyordu. Alan adı düştü, sabit
   * `ada` yerine yazılan ad gösteriliyor.
   */
  "auth.register.usernameHint": "@ada · bu ad herkese görünür",
  "auth.register.usernameHintEmpty": "Bu ad herkese görünür",
  "auth.password.strength": "Şifre gücü",
  "auth.password.rule1": "En az 10 karakter",
  "auth.password.rule2": "Büyük ve küçük harf",
  "auth.password.rule3": "En az bir sayı",
  "auth.password.rule4": "En az bir sembol",
  "auth.password.strong": "Güçlü",
  "auth.register.terms": "Kullanım Şartları ve Gizlilik Politikası’nı okudum, kabul ediyorum.",
  "auth.register.turnstileTitle": "İnsan olduğun doğrulandı",
  "auth.register.turnstileHint": "Cloudflare Turnstile",
  "auth.register.cta": "Hesabı oluştur",
  "auth.register.haveAccount": "Hesabın var mı?",

  "auth.verifyEmail.eyebrow": "E-POSTA DOĞRULAMA",
  "auth.verifyEmail.title": "E-postanı doğrula",
  "auth.verifyEmail.subtitle":
    "ada@whispr.app adresine 6 haneli bir kod gönderdik. Kod 10 dakika geçerli.",
  "auth.verifyEmail.cta": "Doğrula",
  "auth.verifyEmail.resend": "Kodu tekrar gönder",
  "auth.verifyEmail.wait": "Tekrar gönder · 00:42",
  "auth.verifyEmail.changeEmail": "E-posta adresini değiştir",
  "auth.verifyPhone.title": "Telefonunu doğrula",
  "auth.verifyPhone.eyebrow": "TELEFON DOĞRULAMA",
  "auth.verifyPhone.changePhone": "Telefon numarasını değiştir",
  "auth.verifyPhone.callInstead": "SMS gelmedi mi? Sesli arama ile kod iste",

  "auth.forgotPassword.eyebrow": "ŞİFRE SIFIRLAMA",
  "auth.forgotPassword.title": "Şifreni sıfırla",
  "auth.forgotPassword.subtitle":
    "Hesabının e-posta adresini yaz, sıfırlama bağlantısını gönderelim.",
  "auth.forgotPassword.cta": "Sıfırlama bağlantısı gönder",
  "auth.forgotPassword.sentTitle": "Bağlantıyı gönderdik",
  "auth.forgotPassword.sentSubtitle":
    "ada@whispr.app adresine sıfırlama bağlantısı gitti. Bağlantı 30 dakika geçerli, yalnızca bir kez kullanılabilir.",
  "auth.forgotPassword.openMailApp": "E-posta uygulamasını aç",
  "auth.resetPassword.title": "Yeni şifre belirle",
  "auth.resetPassword.subtitle":
    "Yeni şifren eskisinden farklı olmalı. Kaydettiğinde diğer cihazlardaki oturumlar kapanır.",
  "auth.resetPassword.cta": "Şifreyi güncelle",
  "auth.resetPassword.doneTitle": "Şifren güncellendi",
  "auth.resetPassword.doneSubtitle":
    "Yeni şifrenle giriş yapabilirsin. Güvenlik için diğer cihazlardaki oturumlar kapatıldı.",
  "auth.resetPassword.doneMeta": "3 cihazda oturum kapatıldı · 27.08.2026 · 11:24",
  "auth.resetPassword.doneTip": "Şifreni bir parola yöneticisinde saklamanı öneririz.",
  "auth.forgotPassword.resentTitle": "Bağlantıyı yeniden gönderdik",
  "auth.forgotPassword.resentSubtitle":
    "ada@whispr.app adresine yeni bir sıfırlama bağlantısı gitti. Önceki bağlantı artık geçersiz.",
  "auth.forgotPassword.resendWait": "Yeniden gönderme 00:58 sonra açılır",

  "auth.status.credentials.label": "GİRİŞ HATASI",
  "auth.status.credentials.title": "E-posta veya şifre hatalı",
  "auth.status.credentials.description":
    "Bilgileri kontrol edip tekrar dene. Beş başarısız denemeden sonra hesap 15 dakika kilitlenir.",
  "auth.status.credentials.field": "E-posta ya da şifre eşleşmiyor",
  "auth.status.credentials.attemptsLeft": "3 deneme kaldı",
  "auth.status.accountLocked.label": "HESAP KİLİTLİ",
  "auth.status.accountLocked.title": "Hesap geçici olarak kilitli",
  "auth.status.accountLocked.description":
    "Çok fazla başarısız deneme yapıldı. 15 dakika sonra tekrar deneyebilir ya da şimdi şifreni sıfırlayabilirsin.",
  "auth.status.accountLocked.countdown": "Kalan süre 14:32",
  "auth.status.accountLocked.action": "Şifremi sıfırla",
  "auth.status.codeInvalid.label": "KOD GEÇERSİZ",
  "auth.status.codeInvalid.title": "Kod hatalı veya süresi geçmiş",
  "auth.status.codeInvalid.description":
    "Kodlar 30 saniyede bir yenilenir. Uygulamandaki güncel kodu gir ya da yedek kod kullan.",
  "auth.status.codeInvalid.action": "Yedek kod kullan",
  "auth.status.usernameTaken.label": "KULLANICI ADI",
  "auth.status.usernameTaken.title": "Bu kullanıcı adı alınmış",
  "auth.status.usernameTaken.description":
    "“ada” kullanımda. Aşağıdaki adlardan biri boşta — dokunarak seçebilirsin.",
  "auth.status.passwordWeak.label": "ŞİFRE",
  "auth.status.passwordWeak.title": "Şifre çok zayıf",
  "auth.status.passwordWeak.description":
    "En az 10 karakter, bir büyük harf, bir sayı ve bir sembol gerekiyor.",
  "auth.status.passwordWeak.field": "İki kural daha karşılanmalı",
  "auth.status.emailRegistered.label": "E-POSTA",
  "auth.status.emailRegistered.title": "Bu e-posta zaten kayıtlı",
  "auth.status.emailRegistered.description":
    "Bu adresle bir hesap var. Giriş yapabilir ya da şifreni sıfırlayabilirsin.",
  "auth.status.network.label": "BAĞLANTI",
  "auth.status.network.title": "Sunucuya ulaşılamadı",
  "auth.status.network.description":
    "İnternet bağlantını kontrol et. Bağlantı gelince isteğini otomatik olarak tekrar deneriz.",
  "auth.status.network.action": "Tekrar dene",
  "auth.status.linkExpired.label": "BAĞLANTI SÜRESİ",
  "auth.status.linkExpired.title": "Doğrulama bağlantısının süresi geçti",
  "auth.status.linkExpired.description":
    "Bağlantılar 30 dakika geçerlidir ve bir kez kullanılabilir. Yeni bir bağlantı isteyebilirsin.",
  "auth.status.linkExpired.action": "Yeni bağlantı gönder",
  "auth.status.rateLimit.label": "HIZ SINIRI",
  "auth.status.rateLimit.title": "Çok sık kod istedin",
  "auth.status.rateLimit.description":
    "Güvenlik için yeni kod isteklerini sınırlıyoruz. İki dakika sonra tekrar deneyebilirsin.",
  "auth.status.rateLimit.countdown": "Yeni kod · 01:58",
  "auth.status.accountSuspended.label": "HESAP DURUMU",
  "auth.status.accountSuspended.title": "Hesap askıya alındı",
  "auth.status.accountSuspended.description":
    "Topluluk kurallarının ihlali nedeniyle bu hesap askıda. Kararı inceletmek için itiraz gönderebilirsin.",
  "auth.status.accountSuspended.action": "İtiraz gönder",
  "auth.status.accountSuspended.secondaryAction": "Kuralları oku",

  "auth.errorLevels.heading": "Hataların arayüz üzerinde gösterimi",
  "auth.errorLevels.level1": "1 · Alan içi hata",
  "auth.errorLevels.level2": "2 · Form üstü bant",
  "auth.errorLevels.level3": "3 · Formu engelleyen blok",
  "auth.errorLevels.retry": "Bağlantı bekleniyor…",

  "auth.states.heading": "Seçilebilir ve tıklanabilir alanlar",
  "auth.states.idle": "Boşta",
  "auth.states.hover": "Üzerine gel",
  "auth.states.focus": "Odak",
  "auth.states.pressed": "Basılı",
  "auth.states.disabled": "Devre dışı",
  "auth.states.loading": "Yükleniyor",
  "auth.states.selected": "Seçili",
  "auth.states.notSelected": "Seçili değil",
  "auth.states.error": "Hatalı",
  "auth.states.filled": "Dolu",
  "auth.states.group.primaryButton": "Birincil düğme",
  "auth.states.group.secondaryButton": "İkincil düğme",
  "auth.states.group.textField": "Metin alanı",
  "auth.states.group.checkbox": "Onay kutusu",
  "auth.states.group.languageSelector": "Dil seçici",
  "auth.states.group.themeSelector": "Tema seçici",
  "auth.states.group.providerButton": "Sağlayıcı düğmesi",
  "auth.states.group.codeCell": "Kod hücresi",
  "auth.states.group.link": "Bağlantı",
  "auth.states.group.suggestionChip": "Öneri etiketi",
  "auth.states.openMenu": "Açık menü",

  "auth.footer.privacy": "Gizlilik Politikası",
  "auth.footer.terms": "Kullanım Şartları",
  "auth.footer.cookies": "Çerez Politikası",
} as const;

/** SPEC §13 — English sütunu. */
const AUTH_EN = {
  "auth.ui.light": "Light",
  "auth.ui.dark": "Dark",
  "auth.brand.tagline": "Voice chat and community",
  "auth.brand.heading": "Your voice, next to your people.",
  "auth.brand.body":
    "Jump into channels, meet in voice rooms, pick conversations up where you left them. Whispr works the same on every device.",
  "auth.brand.point1": "End-to-end encrypted voice rooms",
  "auth.brand.point2": "One account across desktop, web and mobile",

  "auth.field.email": "Email",
  "auth.field.password": "Password",
  "auth.field.passwordPlaceholder": "At least 10 characters",
  "auth.field.fullName": "Full name",
  "auth.field.username": "Username",
  "auth.field.contact": "Email or phone",
  "auth.field.contactPlaceholder": "ada@whispr.app · +1 555 000 00 00",
  "auth.field.emailDetected": "Email address detected",
  "auth.field.phoneDetected": "Phone number detected · Türkiye (+90)",
  "auth.field.newPassword": "New password",
  "auth.field.confirmNewPassword": "Confirm new password",
  "auth.field.code": "Verification code",
  "auth.field.backupCode": "Backup code",
  "auth.field.show": "Show",
  "auth.field.hide": "Hide",
  "auth.field.or": "or",
  "auth.provider.google": "Continue with Google",
  "auth.provider.microsoft": "Continue with Microsoft",
  "auth.provider.apple": "Continue with Apple",
  "auth.provider.soon": "Soon",

  "auth.login.eyebrow": "SIGN IN",
  "auth.login.title": "Welcome back",
  "auth.login.subtitle": "Sign in to your account and continue where you left off.",
  "auth.login.forgot": "Forgot password?",
  "auth.login.remember": "Keep me signed in",
  "auth.login.cta": "Sign in",
  "auth.login.noAccount": "Don't have an account?",
  "auth.login.createAccount": "Create account",

  "auth.twoFactor.eyebrow": "TWO-STEP VERIFICATION",
  "auth.twoFactor.title": "Enter your verification code",
  "auth.twoFactor.subtitle":
    "Type the 6-digit code from your authenticator app. It refreshes every 30 seconds.",
  "auth.twoFactor.rememberDevice": "Remember this device for 30 days",
  "auth.twoFactor.cta": "Verify and sign in",
  "auth.twoFactor.useBackup": "Use a backup code instead",
  "auth.common.backToLogin": "Back to sign in",
  "auth.backupCode.title": "Enter a backup code",
  "auth.backupCode.subtitle":
    "Use one of the codes you saved during setup. Each code works only once.",

  "auth.register.eyebrow": "CREATE ACCOUNT",
  "auth.register.title": "Join Whispr",
  "auth.register.subtitle":
    "Four fields is all it takes. Creating a server or joining an invite takes 30 seconds.",
  "auth.register.usernameHint": "@ada · visible to everyone",
  "auth.register.usernameHintEmpty": "This name is visible to everyone",
  "auth.password.strength": "Password strength",
  "auth.password.rule1": "At least 10 characters",
  "auth.password.rule2": "Upper and lower case",
  "auth.password.rule3": "At least one number",
  "auth.password.rule4": "At least one symbol",
  "auth.password.strong": "Strong",
  "auth.register.terms": "I have read and accept the Terms of Use and Privacy Policy.",
  "auth.register.turnstileTitle": "Verified you are human",
  "auth.register.turnstileHint": "Cloudflare Turnstile",
  "auth.register.cta": "Create account",
  "auth.register.haveAccount": "Already have an account?",

  "auth.verifyEmail.eyebrow": "EMAIL VERIFICATION",
  "auth.verifyEmail.title": "Verify your email",
  "auth.verifyEmail.subtitle":
    "We sent a 6-digit code to ada@whispr.app. It is valid for 10 minutes.",
  "auth.verifyEmail.cta": "Verify",
  "auth.verifyEmail.resend": "Resend code",
  "auth.verifyEmail.wait": "Resend in 00:42",
  "auth.verifyEmail.changeEmail": "Change email address",
  "auth.verifyPhone.title": "Verify your phone",
  "auth.verifyPhone.eyebrow": "PHONE VERIFICATION",
  "auth.verifyPhone.changePhone": "Change phone number",
  "auth.verifyPhone.callInstead": "No SMS? Get the code by phone call",

  "auth.forgotPassword.eyebrow": "PASSWORD RESET",
  "auth.forgotPassword.title": "Reset your password",
  "auth.forgotPassword.subtitle": "Enter your account email and we'll send a reset link.",
  "auth.forgotPassword.cta": "Send reset link",
  "auth.forgotPassword.sentTitle": "Check your inbox",
  "auth.forgotPassword.sentSubtitle":
    "A reset link is on its way to ada@whispr.app. It expires in 30 minutes and works once.",
  "auth.forgotPassword.openMailApp": "Open email app",
  "auth.resetPassword.title": "Set a new password",
  "auth.resetPassword.subtitle":
    "Your new password must differ from the old one. Saving it signs you out on other devices.",
  "auth.resetPassword.cta": "Update password",
  "auth.resetPassword.doneTitle": "Your password is updated",
  "auth.resetPassword.doneSubtitle":
    "You can sign in with your new password. For security, sessions on your other devices were closed.",
  "auth.resetPassword.doneMeta": "Signed out on 3 devices · 27.08.2026 · 11:24",
  "auth.resetPassword.doneTip": "We recommend keeping your password in a password manager.",
  "auth.forgotPassword.resentTitle": "We sent the link again",
  "auth.forgotPassword.resentSubtitle":
    "A new reset link is on its way to ada@whispr.app. The previous link no longer works.",
  "auth.forgotPassword.resendWait": "Resend unlocks in 00:58",

  "auth.status.credentials.label": "SIGN-IN ERROR",
  "auth.status.credentials.title": "Wrong email or password",
  "auth.status.credentials.description":
    "Check your details and try again. After five failed attempts the account locks for 15 minutes.",
  "auth.status.credentials.field": "Email and password do not match",
  "auth.status.credentials.attemptsLeft": "3 attempts left",
  "auth.status.accountLocked.label": "ACCOUNT LOCKED",
  "auth.status.accountLocked.title": "Account temporarily locked",
  "auth.status.accountLocked.description":
    "Too many failed attempts. Try again in 15 minutes, or reset your password now.",
  "auth.status.accountLocked.countdown": "14:32 remaining",
  "auth.status.accountLocked.action": "Reset password",
  "auth.status.codeInvalid.label": "CODE INVALID",
  "auth.status.codeInvalid.title": "Code is wrong or expired",
  "auth.status.codeInvalid.description":
    "Codes refresh every 30 seconds. Enter the current code or use a backup code.",
  "auth.status.codeInvalid.action": "Use a backup code",
  "auth.status.usernameTaken.label": "USERNAME",
  "auth.status.usernameTaken.title": "That username is taken",
  "auth.status.usernameTaken.description":
    "“ada” is in use. One of these is free — tap to pick it.",
  "auth.status.passwordWeak.label": "PASSWORD",
  "auth.status.passwordWeak.title": "Password is too weak",
  "auth.status.passwordWeak.description":
    "Needs at least 10 characters, one capital letter, one number and one symbol.",
  "auth.status.passwordWeak.field": "Two more rules to go",
  "auth.status.emailRegistered.label": "EMAIL",
  "auth.status.emailRegistered.title": "That email is already registered",
  "auth.status.emailRegistered.description":
    "An account already uses this address. Sign in, or reset your password.",
  "auth.status.network.label": "CONNECTION",
  "auth.status.network.title": "Could not reach the server",
  "auth.status.network.description":
    "Check your connection. We retry automatically as soon as it comes back.",
  "auth.status.network.action": "Try again",
  "auth.status.linkExpired.label": "LINK EXPIRED",
  "auth.status.linkExpired.title": "This verification link has expired",
  "auth.status.linkExpired.description":
    "Links last 30 minutes and work once. You can request a new one.",
  "auth.status.linkExpired.action": "Send a new link",
  "auth.status.rateLimit.label": "RATE LIMIT",
  "auth.status.rateLimit.title": "Too many code requests",
  "auth.status.rateLimit.description":
    "We limit code requests for security. You can try again in two minutes.",
  "auth.status.rateLimit.countdown": "New code in 01:58",
  "auth.status.accountSuspended.label": "ACCOUNT STATUS",
  "auth.status.accountSuspended.title": "Account suspended",
  "auth.status.accountSuspended.description":
    "This account is suspended for breaking the community rules. You can appeal the decision.",
  "auth.status.accountSuspended.action": "Submit an appeal",
  "auth.status.accountSuspended.secondaryAction": "Read the rules",

  "auth.errorLevels.heading": "How errors appear in the interface",
  "auth.errorLevels.level1": "1 · Field error",
  "auth.errorLevels.level2": "2 · Banner above the form",
  "auth.errorLevels.level3": "3 · Blocking panel",
  "auth.errorLevels.retry": "Waiting for a connection…",

  "auth.states.heading": "Selectable and clickable surfaces",
  "auth.states.idle": "Idle",
  "auth.states.hover": "Hover",
  "auth.states.focus": "Focus",
  "auth.states.pressed": "Pressed",
  "auth.states.disabled": "Disabled",
  "auth.states.loading": "Loading",
  "auth.states.selected": "Selected",
  "auth.states.notSelected": "Not selected",
  "auth.states.error": "Error",
  "auth.states.filled": "Filled",
  "auth.states.group.primaryButton": "Primary button",
  "auth.states.group.secondaryButton": "Secondary button",
  "auth.states.group.textField": "Text field",
  "auth.states.group.checkbox": "Checkbox",
  "auth.states.group.languageSelector": "Language selector",
  "auth.states.group.themeSelector": "Theme selector",
  "auth.states.group.providerButton": "Provider button",
  "auth.states.group.codeCell": "Code cell",
  "auth.states.group.link": "Link",
  "auth.states.group.suggestionChip": "Suggestion chip",
  "auth.states.openMenu": "Open menu",

  "auth.footer.privacy": "Privacy Policy",
  "auth.footer.terms": "Terms of Use",
  "auth.footer.cookies": "Cookie Policy",
} as const;

/** SPEC §4.7 ve §7 sayaç örnekleri tabloda farklı değerlerle geçiyor. */
const SAMPLE_OVERRIDES: Record<string, Record<string, string>> = {
  "auth.forgotPassword.resendWait": { countdown: "00:58" },
  "auth.status.accountLocked.countdown": { countdown: "14:32" },
  "auth.status.rateLimit.countdown": { countdown: "01:58" },
};

describe("auth screen copy", () => {
  it("matches the SPEC §13 Turkish column word for word", () => {
    for (const [key, expected] of Object.entries(AUTH_TR)) {
      assert.equal(fill(TR[key] ?? "", SAMPLE_OVERRIDES[key]), expected, key);
    }
  });

  it("matches the SPEC §13 English column word for word", () => {
    for (const [key, expected] of Object.entries(AUTH_EN)) {
      assert.equal(fill(EN[key] ?? "", SAMPLE_OVERRIDES[key]), expected, key);
    }
  });

  it("keeps the Turkish and English auth key sets identical", () => {
    const trKeys = Object.keys(TR)
      .filter((key) => key.startsWith("auth."))
      .sort();
    const enKeys = Object.keys(EN)
      .filter((key) => key.startsWith("auth."))
      .sort();

    assert.deepEqual(trKeys, enKeys);
  });

  it("never leaves an auth string empty or marked TODO", () => {
    for (const dictionary of [TR, EN]) {
      for (const [key, value] of Object.entries(dictionary)) {
        if (!key.startsWith("auth.")) {
          continue;
        }

        assert.ok(value.trim().length > 0, `${key} boş.`);
        assert.equal(/TODO|FIXME|\bTBD\b/i.test(value), false, `${key} bir yer tutucu taşıyor.`);
      }
    }
  });

  it("keeps every K1-skipped phone key in the dictionary", () => {
    for (const key of SKIPPED_BY_K1) {
      assert.ok(TR[key], `${key} Türkçe sözlükte yok.`);
      assert.ok(EN[key], `${key} İngilizce sözlükte yok.`);
    }
  });

  it("resolves every status catalog key against both dictionaries", () => {
    for (const id of AUTH_STATUS_IDS) {
      const status = AUTH_STATUS_CATALOG[id];
      const keys = [
        status.labelKey,
        status.titleKey,
        status.descriptionKey,
        status.fieldKey,
        status.meterKey,
        status.primaryActionKey,
        status.secondaryActionKey,
      ].filter((key): key is string => typeof key === "string");

      for (const key of keys) {
        assert.ok(TR[key], `${id} → ${key} Türkçe sözlükte yok.`);
        assert.ok(EN[key], `${id} → ${key} İngilizce sözlükte yok.`);
      }
    }
  });

  it("covers all ten SPEC §7 statuses with the SPEC §8 levels", () => {
    assert.equal(AUTH_STATUS_IDS.length, 10);

    const levels: Record<string, number> = {
      accountLocked: 3,
      accountSuspended: 3,
      codeInvalid: 1,
      credentials: 1,
      emailRegistered: 1,
      linkExpired: 3,
      network: 2,
      passwordWeak: 1,
      rateLimit: 2,
      usernameTaken: 1,
    };
    const tones: Record<string, string> = {
      accountLocked: "danger",
      accountSuspended: "neutral",
      codeInvalid: "danger",
      credentials: "danger",
      emailRegistered: "warning",
      linkExpired: "warning",
      network: "danger",
      passwordWeak: "warning",
      rateLimit: "warning",
      usernameTaken: "warning",
    };

    for (const id of AUTH_STATUS_IDS) {
      assert.equal(AUTH_STATUS_CATALOG[id].level, levels[id], `${id} seviyesi`);
      assert.equal(AUTH_STATUS_CATALOG[id].tone, tones[id], `${id} tonu`);
    }
  });
});
