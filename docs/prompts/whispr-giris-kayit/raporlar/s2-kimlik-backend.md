# Ş2 — Kimlik backend (Dalga 1)

Durum: **tamamlandı.** UI yazılmadı. Dal: `uat`. Commit yok (çalışma ağacında).
Migration **yerel veritabanında koştu**.

Kaynak: `design_handoff/giris-kayit-paketi/SPEC.md` §4.2, §4.3, §4.5, §4.7, §7, §10.
Kararlar: `PLAN.md` §3 (K2 · K3 · K8 · K9).

---

## 1. Dalga 2'nin backend sözleşmesi

Ekranlar `AuthActionResult.status` alanını okur ve `AUTH_STATUS_CATALOG` üstünden hangi gösterim
seviyesini çizeceğine karar verir. `error` alanı geriye uyumlu i18n anahtarıdır.

### 1.1 `loginAction(formData)` — `lib/auth/actions.ts`

Girdi: `email` · `password` · `rememberMe` · `turnstileToken` · `callbackUrl`
(+ geçici `twoFactorCode`, Ş4 kaldıracak).

| Dönüş                        | Ek alanlar     | Seviye | Ekran davranışı                                           |
| ---------------------------- | -------------- | ------ | --------------------------------------------------------- |
| `success: true`              | —              | —      | `redirectTo`'ya git                                       |
| `twoFactorRequired: true`    | `challengeId`  | —      | `/login/two-factor`; challenge **URL'e yazılmaz**         |
| `status: "credentials"`      | `attemptsLeft` | 1      | Şifre alanı kırmızı + `{count} deneme kaldı`              |
| `status: "accountLocked"`    | `retryAfterMs` | 3      | Blok panel + `Kalan süre 14:32`                           |
| `status: "accountSuspended"` | `reference?`   | 3      | Blok panel + `Referans · WSP-…`; alan yoksa bant gizlenir |
| `status: "rateLimit"`        | —              | 2      | Bant                                                      |
| `status: "network"`          | —              | 2      | Bant (Turnstile başarısızlığı da buraya düşer)            |

**Sıra önemli:** hız sınırı → **kilit** → Turnstile → parola. Kilitli hesabın parolası hiç
karşılaştırılmaz.

E-postası doğrulanmamış hesap jenerik kimlik hatası döner (bugünkü davranış) ama yanıtta `email`
taşır; Ş6 isterse `/verify-email`'e yönlendirebilir. **SPEC §13'te bu durum için giriş ekranı
metni yok** — Ş6 metin gerekirse durup rapora yazmalı.

### 1.2 `submitTwoFactorCodeAction` / `submitBackupCodeAction` — `lib/auth/two-factor-login-actions.ts`

Girdi: `challengeId` + (`code` | `backupCode`) + `rememberDevice` + `callbackUrl`.

| Dönüş                                  | Ek alanlar      | Ekran davranışı                                                                    |
| -------------------------------------- | --------------- | ---------------------------------------------------------------------------------- |
| `success: true`                        | —               | Oturum açıldı, `redirectTo`                                                        |
| `status: "codeInvalid"`                | `attemptsLeft?` | Altı hücre kırmızı; `attemptsLeft` yoksa challenge düşmüş demektir, `/login`'e dön |
| `status: "accountLocked"`              | `retryAfterMs`  | Blok panel                                                                         |
| `error: "auth.login.alertUnavailable"` | —               | Bant (doğrulayıcı erişilemez)                                                      |

### 1.3 `submitEmailVerificationCodeAction` — `lib/auth/actions.ts`

Girdi: `email` + `code` (6 hane).

| Dönüş                   | Ek alanlar      | Ekran                    |
| ----------------------- | --------------- | ------------------------ |
| `success: true`         | `email`         | Doğrulandı               |
| `status: "codeInvalid"` | `attemptsLeft?` | Hücreler kırmızı         |
| `status: "linkExpired"` | —               | Kod düştü, yeni kod iste |
| `status: "rateLimit"`   | —               | Bant + geri sayım        |

### 1.4 `resetPasswordAction` — `lib/auth/actions.ts`

Başarıda **yeni alanlar**: `signedOutDeviceCount` (sayı) ve `signedOutAt` (ISO). SPEC §4.7'nin
`{count} cihazda oturum kapatıldı · {date} · {time}` bandı bunları kullanır; **sayı 0 ise bant
gösterilmez**.

### 1.5 `POST /api/v1/auth/username-availability`

Girdi `{ username }`. Çıktı `{ available, suggestions, valid }`. Kayıt hız sınırının arkasında.
Öneriler ürün kuralına uyar (K8: `a-zA-Z0-9_`), tasarımın `ada.dev` örneğindeki nokta üründe
geçersiz olduğu için `ada_dev` biçiminde üretilir — **etiketlerin görünümü değişmez**.

---

## 2. Yeni modüller

| Dosya                                            | İş                                                                                                                                                                                                |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/auth/login-lockout.ts`                      | SPEC §10 — 5 deneme / 15 dakika. Hesap + ağ olmak üzere iki sayaç; kilit yalnız hesap sayacından doğar, ağ sayacı (25) aynı IP'nin hesap taramasını keser. E-posta SHA-256 özetiyle anahtarlanır. |
| `lib/auth/login-challenge.ts`                    | K2 — 5 dakikalık challenge + 30 saniyelik bilet. İkisi de opak, tek kullanımlık, depoda **özetiyle**; IP+User-Agent parmak izine bağlı. Üretimde Redis yoksa **fail-closed**.                     |
| `lib/auth/login-credentials.ts`                  | Parola doğrulamasının tek yeri (`authorize` ve `loginAction` aynı fonksiyonu çağırır). Bilinmeyen hesap da bcrypt maliyetini öder.                                                                |
| `lib/auth/two-factor-login.ts`                   | İkinci adımın saf mantığı: challenge + kod → bilet. `"use server"` değil, bu yüzden test edilebilir.                                                                                              |
| `lib/auth/two-factor-login-actions.ts`           | İki sunucu eylemi; istek bağlamını okur ve `signIn`'i biletle çağırır.                                                                                                                            |
| `lib/auth/email-verification-code.ts`            | K3 — 6 hane / 10 dakika / hash'li saklama / 5 denemede iptal / 60 sn kilit / 3 istekten sonra 2 dakika.                                                                                           |
| `lib/auth/account-suspension.ts`                 | SPEC §7/10 referans numarası.                                                                                                                                                                     |
| `lib/auth/username-availability.ts`              | SPEC §10 kullanıcı adı sorgusu + üç öneri.                                                                                                                                                        |
| `app/api/v1/auth/username-availability/route.ts` | Uç.                                                                                                                                                                                               |

## 3. Değişen mevcut dosyalar

- **`auth.ts`** — `authorize` iki yeni şey yapıyor: (1) parola doğrulaması ortak modüle taşındı,
  (2) `twoFactorTicket` dalı eklendi. Bilet dalı **parolanın yerine geçmez**: yalnız parola
  doğrulandıktan sonra basılır, imzalı `loginProof` olmadan kabul edilmez, tükettiği anda düşer,
  e-postası eşleşmezse reddedilir ve yasaklı/silinmiş/doğrulanmamış hesapta çalışmaz.
  Ölü `WEB_MISSING_ACCOUNT_PASSWORD_HASH` sabiti ve `bcrypt` importu kalktı.
- **`attempt-tracker.ts`** — `readState` eklendi (kilidi tetiklemeden sayaç okumak için).
  Mevcut davranış değişmedi.
- **`password-reset.ts`** — TTL **60 → 30 dakika** (SPEC §4.7). `resetPasswordWithToken` artık
  kapatılan cihaz sayısını ve zaman damgasını döndürüyor.
- **`email-verification.ts`** — doğrulama e-postası artık **hem bağlantıyı hem 6 haneli kodu**
  taşıyor (K3). Kod hız sınırına takıldıysa mektup yalnız bağlantıyla gider.
- **`status-catalog.ts`** — `accountSuspended.supported` `false` → **`true`** (veri kaynağı bulundu).
- **`actions.ts`** — `AuthActionResult` yedi yeni opsiyonel alan aldı; `registerAction`
  `usernameTaken` durumunu döndürüyor.

## 4. Veri

Yeni model `EmailVerificationCode` (`userId` · `email` · `codeHash` · `expiresAt` · `attempts` ·
`consumedAt` · `createdAt`), migration
`packages/db/prisma/rebaseline-migrations/20260827090000_email_verification_code/`.
**Yerel veritabanında koştu** (`prisma migrate deploy` → applied).
`EmailVerificationToken` **kaldırılmadı**; gönderilmiş bağlantılar çalışmaya devam ediyor.

## 5. Testler

| Dosya                             | Test |
| --------------------------------- | ---- |
| `login-lockout.test.ts`           | 10   |
| `login-challenge.test.ts`         | 15   |
| `two-factor-login.test.ts`        | 11   |
| `email-verification-code.test.ts` | 9    |
| `username-availability.test.ts`   | 6    |
| `account-suspension.test.ts`      | 4    |

`src/lib/auth/**` tamamı: **275/275 ✅**. `pnpm --filter @wizards/web typecheck` → Ş2 tarafında
**0 hata**.

Güvenlik negatifleri (hepsi test edilmiş): challenge tek kullanımlık · süresi dolar · başka
tarayıcıda çalışmaz · parmak izi uyuşmazlığında **silinir** · üç yanlış kodda düşer · yanlış kod
ömrü uzatmaz · bilet tek kullanımlık, 30 saniye, başka hesapta çalışmaz, boş bilet reddedilir ·
üretimde depo yoksa challenge üretilmez.

## 6. Kararlar ve sapmalar

1. **Hız sınırı penceresi SPEC'ten geniş.** SPEC "üç istekten sonra 2 dakika" diyor. Pencereyi
   2 dakika yapmak işe yaramıyor: 60 saniyelik yeniden gönderme kilidi iki dakikaya zaten en fazla
   iki istek sığdırıyor, sınır **hiç tetiklenmezdi**. Sayım penceresi kodun ömrü (10 dakika),
   ceza SPEC'in dediği gibi 2 dakika.
2. **Askı referansı türetiliyor.** `WSP-` + moderasyon vakası kimliğinin ilk 8 karakteri.
   Kısa referansın kendi kolonu yok; vaka yoksa referans gönderilmez.
3. **Turnstile hatası `network` durumuna eşlendi.** SPEC §10 bunu seviye 2 bant istiyor;
   katalogda seviye 2 olan iki durum var (`network`, `rateLimit`) ve ikisinden yakın olanı bu.
4. **E-posta şablonuna iki yeni metin girdi** (`auth.emailVerification.codeLabel` / `.codeHint`).
   SPEC §13 e-posta şablonu metni içermiyor; tasarım paketinde e-posta tasarımı da yok.
5. **`loginAction` geçici köprüyü koruyor.** Form `twoFactorCode` gönderirse eski tek atışlı yol
   çalışır; göndermezse challenge üretilir. Bugünkü giriş ekranı bozulmadan çalışmaya devam
   ediyor. **Ş4 bu dalı silmeli.**

## 7. Sonraki şeritler için borç

1. **Mobil kayıt/giriş sözleşmesi hizalanmadı.** `MobileAuthRegisterRequestSchema` hâlâ
   `confirmPassword` taşıyor, `displayName` bilmiyor; mobil giriş ucu challenge akışını
   tanımıyor. Ş8 mobil ekranları kurmadan önce bu uçlar güncellenmeli — Ş2'nin kapsamı web
   eylemleriydi, mobil API paritesi ayrı bir iş olarak duruyor.
2. **`rememberDevice` henüz hiçbir şey yapmıyor.** Şema ve eylem alanı taşıyor; SPEC §10'un
   "cihaz parmak izi 30 gün saklanır" kısmı için `TwoFactorTrustedDevice` tablosu **açılmadı**.
   Ş4 ekranı kutuyu gösterebilir; kalıcı etki için ayrı bir iş gerekiyor.
3. **`resendPasswordResetAction` şimdilik `forgotPasswordAction`'a delege ediyor.** Yeniden
   gönderme kilidi mevcut `checkPasswordResetRequestRateLimit` üstünden geliyor; SPEC §4.7'nin
   `Yeniden gönderme 00:58 sonra açılır` pill'i için eylemin `retryAfterMs` döndürmesi gerekiyor.
   Ş6 bunu isterse hız sınırı yardımcısı kalan süreyi döndürecek şekilde genişletilmeli.
4. **Ağaçtaki yabancı hatalar duruyor:** `lib/polls/service.test.ts`
   (`authorizeChannelViewer`) tipten düşüyor ve `lib/workspace/scheduled-event-service.test.ts`
   tam pakette ~8 dakika sonra takılıyor. İkisi de Ş1/Ş2'nin dokunduğu dosyalar değil.
