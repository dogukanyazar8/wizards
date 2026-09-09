# Ş2 — Kimlik backend (Dalga 1, Ş3 ile paralel)

**UI yazma.** Yalnız `apps/web/src/lib/**`, `apps/web/src/app/api/**`, `packages/db/**`.
`components/` ve `globals.css` bu şeritte **açılmaz**.

Oku: `00-ortak-baglam.md`, `PLAN.md` §3 (K1–K3, K9), `SPEC.md` §10 (davranış ve doğrulama),
§4.7 (sıfırlama zinciri), §7 (10 durum), Ş1 raporu.

---

## 1. Giriş kilidi — 5 deneme / 15 dakika (SPEC §10)

Yeni `apps/web/src/lib/auth/login-lockout.ts`, mevcut `attempt-tracker.ts` üstünde:

```ts
export const LOGIN_MAX_ATTEMPTS = 5;
export const LOGIN_LOCK_DURATION_MS = 15 * 60_000;

export type LoginAttemptState =
  { status: "ok"; attemptsLeft: number } | { status: "locked"; retryAfterMs: number };

export function createLoginLockout(deps: { store: AttemptStore; now?: () => number }): {
  peek(key: string): Promise<LoginAttemptState>;
  registerFailure(key: string): Promise<LoginAttemptState>;
  reset(key: string): Promise<void>;
};
```

- Anahtar: `login:${sha256(normalizedEmail)}` **ve** `login-ip:${sha256(clientIp)}` — iki sayaç.
  Hesap sayacı kilidi tetikler; IP sayacı hız sınırıdır (mevcut `checkLoginRequestRateLimit`
  korunur, kaldırılmaz).
- Redis varsa `createRedisAttemptStore`, yoksa `createMemoryAttemptStore` (mevcut desen).
- Başarılı girişte `reset` çağrılır — **2FA tamamlandıktan sonra**, kimlik doğrulandığı anda değil.
- `attemptsLeft` UI'ya `st_creds_a` ("3 deneme kaldı") olarak, `retryAfterMs` `st_lock_c`
  ("Kalan süre 14:32") olarak gider. Biçimleme sunucuda yapılmaz; ham sayı döner.

Test `login-lockout.test.ts`: 4 başarısız → `attemptsLeft: 1`; 5. → `locked`, `retryAfterMs ≈ 900000`;
kilitliyken doğru parola da reddedilir; süre dolunca sayaç sıfırlanır; iki farklı e-posta birbirini
kilitlemez.

---

## 2. İki adımlı giriş challenge'ı (K2)

Yeni `apps/web/src/lib/auth/login-challenge.ts`:

```ts
export const LOGIN_CHALLENGE_TTL_MS = 5 * 60_000;

export type LoginChallengeRecord = {
  userId: string;
  email: string;
  rememberMe: boolean;
  redirectTo: string;
  fingerprint: string; // sha256(ip + "\n" + userAgent)
  createdAt: number;
};

export function createLoginChallengeStore(deps: { redis?: Redis; now?: () => number }): {
  issue(record: Omit<LoginChallengeRecord, "createdAt">): Promise<string>; // opak id
  consume(id: string, fingerprint: string): Promise<LoginChallengeRecord | null>;
};
```

Kurallar (hepsi test edilir):

1. `id` = `crypto.randomBytes(32)` → base64url. Tahmin edilemez, kullanıcı kimliği içermez.
2. Redis anahtarı `auth:2fa-challenge:${sha256(id)}`; **ham id saklanmaz**.
3. `consume` **atomik** siler ve döndürür (`GETDEL` veya Lua). İkinci çağrı `null` döner.
4. TTL 300 sn; süresi geçmişse `null`.
5. `fingerprint` eşleşmezse kayıt **silinir** ve `null` döner (challenge çalınmasına karşı).
6. Redis yoksa süreç içi `Map` + TTL (tek düğümlü geliştirme); üretimde Redis zorunlu —
   `redis` yoksa ve `NODE_ENV === "production"` ise `issue` hata fırlatır.

### 2.1 `loginAction` yeniden kurulur

`apps/web/src/lib/auth/actions.ts`:

```
1. LoginSchema doğrula (artık twoFactorCode yok)
2. checkLoginRequestRateLimit  → aşılmışsa { status: "rateLimit" }
3. loginLockout.peek           → locked ise { status: "accountLocked", retryAfterMs }
4. verifyTurnstileToken        → başarısızsa { status: "turnstile" }  (SPEC §10: seviye 2 bant)
5. verifyLoginCredentials(email, password)   ← yeni saf yardımcı
     başarısız → loginLockout.registerFailure → { status: "credentials", attemptsLeft }
6. kullanıcı askıya alınmışsa → { status: "accountSuspended", reference }
7. 2FA kapalıysa → signIn("credentials", { email, loginProof, password, rememberMe, redirectTo })
                   + loginLockout.reset
8. 2FA açıksa   → challenge.issue(...) → { status: "twoFactorRequired", challengeId }
```

`verifyLoginCredentials` mevcut NextAuth `authorize` mantığından **çıkarılan** saf fonksiyondur
(`lib/auth/api.ts` içindeki parola karşılaştırması tek yerde kalır; iki kopya doğmaz).

### 2.2 NextAuth `authorize` challenge dalı

Credentials sağlayıcısı iki girdi kabul eder:

- **Klasik:** `email` + `password` + `loginProof` (bugünkü yol, değişmez).
- **Challenge:** `email` + `loginProof` + `challengeTicket`.

`challengeTicket`, `/login/two-factor` eylemi 2FA kodunu **doğruladıktan sonra** üretilen
ikinci, tek kullanımlık, 30 saniyelik bir bilettir (`auth:2fa-ticket:${sha256(t)}`, `GETDEL`).
`authorize` bileti tüketir, `userId` eşleşiyorsa parola sormadan oturumu kurar.

**Güvenlik kapısı — negatif testler zorunlu:**

- `challengeTicket` olmadan parola boş gönderilirse `authorize` **reddeder**.
- Aynı bilet iki kez kullanılamaz.
- 30 sn sonra bilet geçersiz.
- Bilet `email` ile eşleşmiyorsa reddedilir.
- Redis kapalıyken üretimde bilet üretilemez (fail-closed).

### 2.3 İki adımlı doğrulama eylemleri

`apps/web/src/lib/auth/two-factor-login-actions.ts`:

```ts
export async function submitTwoFactorCodeAction(formData: FormData): Promise<AuthActionResult>;
export async function submitBackupCodeAction(formData: FormData): Promise<AuthActionResult>;
```

- Şema: `TwoFactorChallengeSchema` / `BackupCodeChallengeSchema` (Ş1).
- Challenge tüket → yoksa `{ status: "challengeExpired" }` (UI kullanıcıyı `/login`'e döndürür).
- TOTP: mevcut `verifyTwoFactorCredential` + `totp-replay.ts` (aynı kod ikinci kez geçmez).
- Yedek kod: mevcut `TwoFactorRecoveryCode` — **tek kullanımlık**, tüketilince işaretlenir.
  Girdi normalize edilir (büyük harf, `[^A-Z0-9]` temizliği); depodaki biçim tasarımın
  `7QF4-2KDX-9M` maskesinden farklıysa **görüntü maskesi korunur**, doğrulama normalize değer
  üzerinden yapılır. Gerçek biçimi rapora yaz.
- Yanlış kod: challenge **tüketilmez sayılmaz** → yeni bir challenge üretilip aynı `challengeId`
  altında kalan deneme sayısı düşürülür; **3 yanlış** kodda challenge iptal edilir ve kullanıcı
  `/login`'e döner (`st_code_t` durumu, seviye 1).
- `rememberDevice` işaretliyse cihaz parmak izi 30 gün saklanır (SPEC §10). Mevcut
  `auth-session-service.ts` / `Session` üzerinden; yeni tablo gerekiyorsa
  `TwoFactorTrustedDevice` (`userId`, `fingerprintHash`, `expiresAt`, `createdAt`,
  `lastUsedAt`) — migration `rebaseline-migrations/`.
- Başarıda: bilet üret → `signIn("credentials", { email, loginProof, challengeTicket })` →
  `loginLockout.reset`.

---

## 3. E-posta doğrulama — 6 haneli kod (K3)

### 3.1 Şema

`packages/db/prisma/schema.prisma` → yeni model:

```prisma
model EmailVerificationCode {
  id          String   @id @default(cuid())
  userId      String
  email       String
  codeHash    String
  expiresAt   DateTime
  attempts    Int      @default(0)
  consumedAt  DateTime?
  createdAt   DateTime @default(now())
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, createdAt])
  @@index([expiresAt])
}
```

Migration **yalnız** `packages/db/prisma/rebaseline-migrations/` altına. `User` tarafına
`emailVerificationCodes EmailVerificationCode[]` ilişkisi eklenir.

### 3.2 Servis

`apps/web/src/lib/auth/email-verification-code.ts`:

```ts
export const EMAIL_CODE_TTL_MS = 10 * 60_000; // SPEC §10
export const EMAIL_CODE_MAX_ATTEMPTS = 5;
export const EMAIL_CODE_RESEND_COOLDOWN_MS = 60_000; // SPEC §10 "Tekrar gönder · 00:42"
export const EMAIL_CODE_RATE_WINDOW_MS = 2 * 60_000; // 3 istekten sonra 2 dk (durum 9)
export const EMAIL_CODE_RATE_MAX_REQUESTS = 3;
```

- Kod: `crypto.randomInt(0, 1_000_000)` → 6 hane, sol sıfır dolgulu. **Hash'lenerek** saklanır
  (`sha256(code + userId)`); düz kod yalnız e-postaya gider.
- Aynı kullanıcının önceki kullanılmamış kodları yeni kod üretilirken **iptal edilir**.
- Doğrulama: süresi geçmiş / tüketilmiş / `attempts >= 5` → `codeInvalid` (durum 3).
  Her yanlış denemede `attempts++`; 5'te kod iptal.
- Yeniden gönderme: son gönderimden 60 sn geçmeden reddedilir → UI geri sayım gösterir.
  2 dakikalık pencerede 3'ten fazla istek → `rateLimit` (durum 9).
- Başarıda `User.emailVerified` işaretlenir ve mevcut `email-verification.ts` başarı yolu
  (hoş geldin akışı, kayıt telafi mantığı `registration-compensation.ts`) **aynen** çalışır.
- Link geriye uyum: `verifyEmailToken` dokunulmaz; iki yol da tek `markEmailVerified(userId)`
  fonksiyonunu çağırır.

### 3.3 Uçlar

- Sunucu eylemleri: `requestEmailVerificationCodeAction`, `submitEmailVerificationCodeAction`.
- Mobil API paritesi: `app/api/v1/mobile/auth/verification-email/route.ts` kod moduna genişletilir
  (mevcut sözleşme kırılmaz; yeni `mode: "code"` alanı).

---

## 4. Şifre sıfırlama zinciri (SPEC §4.7, §10)

- `PASSWORD_RESET_TOKEN_EXPIRY_MINUTES` **60 → 30** (`password-reset.ts:8`). Testleri güncelle.
- Yeniden gönderme: `resendPasswordResetAction` — 60 sn kilit (`rs_wait` sayacı için
  `retryAfterMs` döner), önceki token **geçersizleşir** (SPEC: "Önceki bağlantı artık geçersiz").
- `resetPasswordWithToken` sonrası:
  - diğer tüm oturumlar kapatılır (`session-revocation.ts`),
  - **kapatılan oturum sayısı** döner → `rps_meta` bandı ("3 cihazda oturum kapatıldı ·
    27.08.2026 · 11:24"). Tarih/saat sunucu zaman damgası olarak döner, biçimleme UI'da
    kullanıcının yereline göre yapılır.
  - `AuditLog`/güvenlik olayı yazılır (mevcut `security-events` deseni).
- Süresi geçmiş / kullanılmış token → `linkExpired` (durum 8, seviye 3 blok).
- Turnstile: sıfırlama **isteğinde** zorunlu (SPEC §10). `ForgotPasswordSchema` zaten taşıyor.

---

## 5. Kayıt tarafı (K1, K9, K10)

- `registerAction` `displayName` alır ve `User.displayName`'e yazar.
- `confirmPassword` kalkar; parola `RegistrationPasswordSchema` ile doğrulanır
  (min 10 + en az 3 kural).
- Kullanıcı adı müsaitlik ucu: `POST /api/v1/auth/username-availability`
  (`{ username }` → `{ available, suggestions: string[] }`). Alan bırakıldığında çağrılır
  (SPEC §10). Öneri üretimi mevcut `buildUsernameCandidate` ile üç aday
  (`ada.dev` deseni yerine ürün kuralına uygun: `ada_dev` gibi — K8, nokta yok).
  **Tasarımdaki üç öneri etiketi görsel olarak birebir kalır**, içerikleri sunucudan gelir.
- E-posta zaten kayıtlıysa `emailRegistered` (durum 6) döner; **kullanıcı numaralandırmasına**
  dikkat: bu bilgi yalnız kayıt formunda döner, şifremi unuttum akışı jenerik yanıt vermeye
  devam eder (mevcut `auth.forgot.genericSuccess`).
- Turnstile zorunlu (SPEC §10); başarısızsa seviye 2 bant.

---

## 6. Askıya alınmış hesap (durum 10)

`User` üzerinde askı bilgisi var mı **kontrol et**:

- Varsa → `accountSuspended` durumu referans numarasıyla (`WSP-40219` biçimi) döner.
- **Yoksa** → yeni kolon/model **açma**. Durum kataloğu kaydı UI'da kalır ama tetiklenmez;
  eksikliği rapora yaz ve `status-catalog.ts` içine `supported: false` bayrağı koy.

---

## 7. Ağ hatası (durum 7)

Sunucu tarafında iş yok; sözleşme: eylemler ağ/veritabanı hatasında
`{ status: "network", detail: "whispr.app · 503" }` döner (SPEC §7/7 bandı). `detail` alanı host +
HTTP durum kodudur, yığın izi **sızdırılmaz**.

---

## 8. Bitirme

- Yeni/değişen her modül için birim testi. En az: `login-lockout.test.ts`,
  `login-challenge.test.ts` (6 kural), `two-factor-login-actions.test.ts` (5 negatif senaryo),
  `email-verification-code.test.ts` (TTL · 5 deneme · 60 sn · 3/2dk), `password-reset.test.ts`
  (30 dk + yeniden gönderme + oturum sayısı).
- Migration yerel veritabanında koşturulur; koşturulamazsa rapora **"koşulmadı"** yaz.
- `pnpm --filter @wizards/web typecheck` + `test` yeşil.
- Rapor: `raporlar/s2-kimlik-backend.md` — eylem sözleşmeleri (girdi/çıktı `status` değerleri
  tablosu), yedek kod gerçek biçimi, askı desteği var mı, migration durumu, açık borçlar.
  Bu tablo Dalga 2'nin **tek** backend sözleşmesidir.
