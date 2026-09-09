# Ş3 — Hesap ve güvenlik API'si · rapor

**Tarih:** 2026-08-24 · **Dal:** `uat` · **Commit:** yok (kullanıcı istemedi)
**Şerit:** Dalga 1 / Ş3 — parola, 2FA, oturumlar, güvenlik günlüğü, e-posta/telefon satır verisi,
bağlı hesaplar adapteri.

Bu şerit **hiç ekran çizmedi.** Beş yeni dosya + yedi düzenlenen dosya; hepsi Ş7'nin (Hesabım)
okuyacağı sunucu ve istemci sözleşmesi.

---

## 1. Ne yapıldı

### 1.1 Parola — ortak servis (§1)

`apps/web/src/lib/account/password-service.ts` **yeni**. Mobil ucun doğrulama ve değiştirme
mantığı buraya çıkarıldı; sıra **birebir** korundu: `loadUser → ölü hesap reddi → compare →
hash → save → revoke`.

| Yüzey                              | Hız sınırı                                                      | Yazma                                   | Hata sözlüğü                                                                   |
| ---------------------------------- | --------------------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------ |
| Mobil (`/mobile/account/password`) | `enforceApiRateLimit("mobile:account:password")`                | `passwordHash` + `sessionsRevokedAfter` | 404 / 409 / **401 `INVALID_CREDENTIALS`**                                      |
| Web (`POST /users/me/password`)    | katmanlı `account:password` (ağ + özne) + ayrı **hata bütçesi** | yalnız `passwordHash`                   | 400 `PASSWORD_MISMATCH` / 400 `WEAK_PASSWORD` / 400 `INVALID_CURRENT_PASSWORD` |

- **Mobil davranışı değişmedi.** `MobilePasswordRouteDependencies` alanları, çağrı sırası ve üç
  hata kodu aynen duruyor; `route-logic.test.ts` **dokunulmadan** yeşil (8 test).
- Parola politikası tek yerde: `checkPasswordPolicy` → `length` · `digit` · `uppercase` ·
  `maxLength` · `reused`. `WEAK_PASSWORD` yanıtı **hangi kuralın düştüğünü** `failedRules` dizisi
  olarak döner; metin istemcide (`settings.security.password.rule.*`).
- `maxLength` bcrypt'in 72 baytta sessizce kesmesini kapatıyor — bayt sayılıyor, karakter değil.
- Hız sınırı `lib/auth/request-rate-limits.ts` desenini izliyor (ağ + özne, 15 dk pencere) ve
  **kapalı düşüyor**: limitleyici erişilemezse istek reddedilir.
- Yanlış mevcut parola **ikinci ve daha dar** bir bütçe harcar (özne başına 5/15 dk). Tek bütçe,
  bu ucu kimliği doğrulanmış bir parola kahini yapardı.

### 1.2 Parola değişimi ↔ oturumlar (tuzak #13)

Web ucu `sessionsRevokedAfter`'ı **yazmaz**. Küresel işaretçi `sessionStartedAt <= revokedAfter`
karşılaştırması yaptığı için, onu ilerletmek parolayı değiştiren pencereyi de kapatırdı.
Bunun yerine `revokeOtherAuthSessions(userId, currentSessionId)` çağrılır: hedef kümesi
`id != currentSessionId` ile **kuruluşundan** dolayı mevcut oturumu içermez, mobil satırlar
`revokeMobileSession` ile ayrıca iptal edilir.

Sözleşmeyi iki test kilitliyor:

- `users/me/password/route-logic.test.ts` — “never advances the account-wide revocation marker”:
  hem şerit varsayılanının `revokeSessions` **taşımadığını** hem de yalnız `revoke-others`
  çağrıldığını doğruluyor. `ChangeAccountPasswordDependencies.revokeSessions` bilerek
  **opsiyonel** yapıldı: işaretçiye dokunmaması gereken çağıran, bir varsayılanı ezmeyi unutarak
  ona dokunamaz.
- `lib/auth/auth-session-service.test.ts` — “keeps the caller signed in after revoke-others”:
  `revoke-others` sonrası mevcut oturum `isAuthSessionActive` ile hâlâ `true`, diğer ikisi
  `false`, ve **tek** `SESSION_REVOKED` satırı yazılıyor.

### 1.3 İki aşamalı doğrulama (§2)

`lib/auth/two-factor.ts` genişledi:

- `formatManualEntryKey` — `K4XP 9QF2 7MRT 1DVB` dörtlü gruplama.
- `getRecoveryCodeStatus(userId)` → `{ total, unused }` (`10 kod · 8 tanesi kullanılmadı`).
- `regenerateRecoveryCodes({ userId, password, code })` — eski seti **siler**, on yeni kod üretir,
  `RECOVERY_CODES_REGENERATED` yazar.
- Depo iki metot kazandı: `countRecoveryCodes`, `replaceRecoveryCodes`.

`lib/account/actions.ts`:

- **`beginTwoFactorSetupAction` (yeni)** — `{ otpauthUri, manualEntryKey }`. **Resim yok.**
  QR istemcide `otpauthUri`'den çizilir. Eski `startTwoFactorSetupAction` (data-URL görüntü
  döndüren) ölmekte olan panel için olduğu gibi bırakıldı; Ş13 ikisini birlikte siler.
- `getRecoveryCodeStatusAction`, `regenerateRecoveryCodesAction` (hız sınırı
  `account:recovery-codes`, 5/10 dk).
- `TWO_FACTOR_ENABLED` / `TWO_FACTOR_DISABLED` olayları burada, istek başlıklarıyla yazılıyor.

**Reauth.** Devre dışı bırakma ve kurtarma kodu yenileme **aynı** çifti ister: hesap parolası
**ve** canlı ikinci faktör. İkisi tek sayaç ve tek genel sonuç üzerinden reddedilir, bu yüzden uç
bir parola kahini değildir. `lib/auth/reauth.ts` (tek amaçlı `account-delete` jetonu) şeridin
“okunur, yazılmaz” listesinde olduğu için amaç kümesi genişletilmedi — §4 sapma 2.

### 1.4 Güvenlik günlüğü (§3, K5)

`apps/web/src/lib/security/security-event-service.ts` **yeni**.

```ts
recordSecurityEvent({ userId, kind, ip?, userAgent?, location?, metadata? }): Promise<void>
recordSecurityEventFromHeaders(headers, { userId, kind, metadata? }): Promise<void>
listSecurityEvents(userId, limit = 10): Promise<SecurityEventRecord[]>
serializeSecurityEvent(record): SecurityEvent   // wire casing, ipHash yok
```

- **Ham IP saklanmıyor.** `ipHash` = `hashAnalyticsValue` — `AdminAuditLog.ipHash` ile **aynı**
  fonksiyon: `sha256("${salt}:${value}")`, tuz `ANALYTICS_HASH_SECRET` / `AUTH_SECRET` /
  `NEXTAUTH_SECRET` ortam değişkenlerinden.
- İstek kapsamlı çağrı biçimi (`…FromHeaders`) adresi hiç görmez: `getAnalyticsClientInfo`
  güvenilen-vekil çözücüsünün arkasında zaten hash'lenmiş değeri verir.
- `location` = CDN ülke başlığı (oturum listesindeki **aynı** türetme), coğrafi sorgu değil.
- **Yazma ana akışı düşürmez:** `recordSecurityEvent` kendi hatasını yutar ve loglar. Test:
  “swallows a write failure so the calling flow survives”.
- `userAgent` 256, `location` 64 karaktere kırpılır; boş `userId` satır yazmaz.
- `SECURITY_EVENT_KINDS` sekiz üyeyle **kapalı**; şema enum'uyla uyumu derleme zamanında
  `assertKindsMatchPrisma` ile iki yönlü kontrol ediliyor.

**Sekiz türün de gerçek bir yazıcısı var:**

| Tür                          | Yazıcı                                                   | Test                                    |
| ---------------------------- | -------------------------------------------------------- | --------------------------------------- |
| `LOGIN_NEW_DEVICE`           | `lib/auth/auth-session-service.ts` (`ensureAuthSession`) | `auth-session-service.test.ts` (2 test) |
| `PASSWORD_CHANGED`           | `app/api/v1/users/me/password/route-logic.ts`            | `route-logic.test.ts`                   |
| `FAILED_LOGIN`               | `src/auth.ts` (credentials `authorize`)                  | `security-event-writers.test.ts`        |
| `TWO_FACTOR_ENABLED`         | `lib/account/actions.ts`                                 | `security-event-writers.test.ts`        |
| `TWO_FACTOR_DISABLED`        | `lib/account/actions.ts`                                 | `security-event-writers.test.ts`        |
| `SESSION_REVOKED`            | `lib/auth/auth-session-service.ts`                       | `auth-session-service.test.ts` (2 test) |
| `RECOVERY_CODES_REGENERATED` | `lib/auth/two-factor.ts`                                 | `two-factor.test.ts` (3 test)           |
| `EMAIL_CHANGED`              | `lib/account/service.ts`                                 | `service.test.ts`                       |

`security-event-writers.test.ts` kaynak taraması yapıyor: her tür için en az bir üretim yazıcısı
olmalı, beklenen dosyaya bağlı kalmalı ve **hiçbir dosya** `prisma.securityEvent.create`'i
doğrudan çağırmamalı. `auth.ts` ve `"use server"` eylemlerinin birim koşum yeri yok; kablolama
bu taramayla kilitlendi.

`LOGIN_NEW_DEVICE` **her girişte değil**, o tarayıcı/işletim sistemi/istemci bileşiminden
açılan **ilk** oturumda yazılır. Oluşturma tespiti fazladan sorgu istemez: `upsert` dönüşündeki
`createdAt`, güncellemede eski anı, oluşturmada geçilen anı taşır.

**`GET /api/v1/users/me/security-events`** — en çok 10 kayıt, `private, no-store`,
`{ id, kind, location, userAgent, createdAt }`. `ipHash` **yanıtta yok** (test bunu hem anahtar
listesiyle hem ham metin taramasıyla doğruluyor) ve **Türkçe metin yok** (test yanıt gövdesinde
Türkçe karakter aramıyor: yok).

### 1.5 Oturum satırı (§4)

Uçlar (`GET/DELETE /users/me/sessions`, `revoke-others`) **yeniden kullanıldı, yazılmadı**.
`current` alanı `AuthSessionSchema`'da zaten vardı. `platform` sözleşmesi
`lib/settings/security-client.ts` içinde `clientType`'tan türetiliyor
(`WEB|UNKNOWN → web`, `DESKTOP → desktop`, `MOBILE → mobile`) ve satır
`AccountSessionSchema` ile ayrıştırılıyor. Gerekçe §4 sapma 1.

### 1.6 E-posta · telefon · dışa aktarma · silme (§5)

`lib/account/service.ts`:

- `getAccountSettingsRows(userId)` → `SettingsAccount`:
  `email` · `emailVerified` · `phone` (**maskeli**) · `phoneVerified` ·
  `verificationEmailSentAt` (son `EmailVerificationToken.createdAt`) ·
  `passwordChangedAt` (son `PASSWORD_CHANGED` olayı — böyle bir kolon yok, günlük kayıttır).
- `maskPhoneNumber("+905321234218") → "+905•••••4218"`. Ham numara sunucudan **çıkmıyor**.
- E-posta gerçekten değişince `EMAIL_CHANGED` yazılıyor; satır **yeni adresi taşımıyor**.

**Hesap silme doğrulama cümlesi sunucuda zaten denetleniyor:** `DELETE /api/v1/users/me`
gövdeyi `AccountDeletionRequestSchema` (`confirmation: z.literal(...)`) ile ayrıştırıyor ve
ayrıca reauth jetonu istiyor. Uç “okunur, yazılmaz” listesinde; **değiştirilmedi**.
İstemci tarafı §4 sapma 3'te.

`data-export` ve `deletion` uçlarına dokunulmadı.

### 1.7 Bağlı hesaplar (§6, K5)

`lib/settings/security-client.ts` içinde tipli adapter:

```ts
// TODO(api): GitHub / Spotify / Steam / Xbox OAuth uygulamaları kurulunca gerçek uca bağlanır.
export function fetchConnections(): Promise<AccountConnection[]>;
```

`STATIC_CONNECTIONS` dört servisi `connected: false, available: false` ile döner; kopya döndürür,
çağıran statik tabloyu bozamaz (test var). **Uydurma endpoint çağrısı yok** —
`GET /users/me/connections` yazılmadı, çağrılmadı.

### 1.8 İstemci yüzeyi

`lib/settings/security-client.ts` (yeni): `securityQueryKeys`, `fetchSecurityEvents`,
`fetchAccountSessions`, `revokeAccountSession`, `revokeOtherAccountSessions`, `changePassword`,
`matchesDeletionConfirmation`, `fetchConnections`. Yanıtlar zod ile ayrıştırılıyor;
`SecurityClientError` sunucu kodunu **ve** `failedRules` listesini taşıyor.

---

## 2. Dosyalar

**Yeni (12):**

```
apps/web/src/lib/security/security-event-service.ts        + .test.ts (10)
apps/web/src/lib/security/security-event-writers.test.ts   (3)
apps/web/src/lib/account/password-service.ts               + .test.ts (12)
apps/web/src/app/api/v1/users/me/password/route.ts
apps/web/src/app/api/v1/users/me/password/route-logic.ts   + .test.ts (10)
apps/web/src/app/api/v1/users/me/security-events/route.ts
apps/web/src/app/api/v1/users/me/security-events/route-logic.ts + .test.ts (5)
apps/web/src/lib/settings/security-client.ts               + .test.ts (11)
```

**Düzenlenen (9):**

```
apps/web/src/app/api/v1/mobile/account/password/route-logic.ts   ortak servise geçti
apps/web/src/lib/auth/two-factor.ts        (+ .test.ts)          kurtarma kodları + olay
apps/web/src/lib/auth/auth-session-service.ts (+ .test.ts)       LOGIN_NEW_DEVICE + SESSION_REVOKED
apps/web/src/lib/account/actions.ts                              2FA olayları + üç yeni eylem
apps/web/src/lib/account/service.ts        (+ .test.ts)          EMAIL_CHANGED + hesap satırları
apps/web/src/lib/api-rate-limit.ts                               iki yeni anahtar
apps/web/src/auth.ts                                             FAILED_LOGIN
```

Yeni testlerin toplamı: **51** (10 + 3 + 12 + 10 + 5 + 11); düzenlenen dosyalara eklenen:
`auth-session-service.test.ts` +4, `two-factor.test.ts` +6, `service.test.ts` +4 → **+14**.

---

## 3. Sahiplenilen dosya listesinden sapma

Prompt'un “Sahiplenilen dosyalar” bölümü bağlayıcıydı; iki noktada tutmadı.

**3.1 `lib/auth/session-valid… session-revocation.ts` düzenlenmedi; yerine
`lib/auth/auth-session-service.ts` düzenlendi.**

Prompt `session-revocation.ts`'i “olay yazımı” için işaretlemişti. Ama:

- `revokeUserSessions` (o dosyada) **küresel** işaretçiyi ilerleten fonksiyon; parola değişimi,
  hesap silme ve parola sıfırlama hepsi oradan geçiyor. `SESSION_REVOKED`'ı oraya koymak,
  hesap silmede de “oturum kapatıldı” satırı yazardı.
- §4'ün istediği “`revoke-others` çağrıldığında `SESSION_REVOKED` yazılır” maddesi ise
  `revokeOtherAuthSessions`'a bağlı ve o fonksiyon `auth-session-service.ts` içinde.
  `revoke-others` **rotası** “okunur, yazılmaz” listesinde olduğu için olay ancak servis
  katmanında yazılabilirdi.

Değişiklik minimal: iki fonksiyona `recordEvent?` seçeneği (varsayılan gerçek yazıcı) ve
`ensureAuthSession`'a opsiyonel `countKnownDevices` deposu. Paralel şeritlerin (Ş1/Ş2/Ş4) sahiplik
listelerinde bu dosya **yok**; çakışma riski taranarak doğrulandı.

**3.2 `lib/api-rate-limit.ts` ve `src/auth.ts` listede yoktu.**

- `api-rate-limit.ts`: iki anahtar eklendi (`account:security-events`, `account:recovery-codes`).
  Bu dosya paylaşılan, yalnızca-ekleme yapılan bir kayıt defteri; Ş1 de aynı koşumda
  `settings:notification-prefs` ekledi.
- `auth.ts`: `FAILED_LOGIN`'in tek gerçek yeri kimlik doğrulama akışı. İki çağrı eklendi
  (yanlış parola, yanlış ikinci faktör), her ikisi de hatasını yutan yazıcıyı çağırıyor.
  Başka hiçbir satır değişmedi.

---

## 4. Kayda geçen sapmalar

**1. `platform` alanı sunucuda değil, istemci adapterinde.**
§4 “yanıt satırı `current` ve `platform` taşır” diyor, ama aynı promptun “okunur, yazılmaz”
listesi `api/v1/users/me/sessions/*`'ı kapsıyor ve `AuthSessionSchema` `.strict()` — alan
eklemek `packages/types` sözleşmesini ve mobil ucu da değiştirirdi. `current` yanıtta **zaten
vardı**; `platform` `clientType`'tan `lib/settings/security-client.ts` içinde türetiliyor ve
Ş0'ın `AccountSessionSchema`'sıyla doğrulanıyor. Ekranın gördüğü satır sözleşmeye uygun,
kablo şekli değişmedi.

**2. 2FA kapatma reauth'u parola + TOTP, `AccountReauthChallenge` değil.**
§2 “mevcut `AccountReauthChallenge` akışı” diyor; o akışın jetonu tek amaca
(`ACCOUNT_DELETION_REAUTH_PURPOSE = "account-delete"`) HMAC ile bağlı ve `lib/auth/reauth.ts`
bu şeritte **okunur, yazılmaz**. Mevcut `disableTwoFactor` zaten hesap parolası **ve** canlı
ikinci faktör istiyor — silme akışından daha zayıf değil, daha güçlü. Kurtarma kodu yenileme de
aynı çifti ister. Amaç kümesini genişletmek reauth.ts'i yazmayı gerektirir; Ş7 ya da sonraki bir
şeride bırakıldı.

**3. `Görüntüle` eski kurtarma kodlarını gösteremez.**
§2 `Görüntüle / İndir / Yenile` üçlüsünü istiyor. Kodlar `hashRecoveryCode` ile **sha256** olarak
saklanıyor; düz metin yalnız üretildiği anda vardır. `Görüntüle` ancak o anki sayfayı yeniden
açabilir; eski bir seti geri getirmenin tek yolu `Yenile`. Servis bunu yorumla kayda geçiriyor.
`İndir` tamamen istemci işi (üretilen listeden metin dosyası) — sunucu tarafı yok.

**4. Hesap silme cümlesi: ekranda Türkçe, telde sabit literal.**
SPEC `hesabımı kalıcı olarak sil` yazdırıyor; sunucunun denetlediği literal
`ACCOUNT_DELETION_CONFIRMATION_PHRASE` (`DELETE MY ACCOUNT`) ve bu literal mobil istemciyle
paylaşılıyor. İstemci **yerelleştirilmiş** cümleyi karşılaştırır
(`matchesDeletionConfirmation`), protokol literal'ini gönderir; sunucu literal'i **yine de**
`z.literal` ile denetler. Yani istemci kontrolü atlanırsa hesap yine silinemez.

**5. Mobil parola ucu `SecurityEvent` yazmıyor.**
“Davranış değişmez” kuralı bağlayıcıydı; oraya bir yazıcı eklemek mevcut testin sayaç
iddialarını (`errorLog.mock.callCount() === 1`) kırardı. `PASSWORD_CHANGED`'in gerçek yazıcısı
web ucu. Mobil ucu günlüğe bağlamak, mobil test dosyasına dokunmayı gerektirir — Ş13'e ya da
mobil şeridine bırakıldı.

**6. `location` alanı ülke kodu, şehir değil.**
SPEC `İstanbul, TR` gösteriyor. Üründe coğrafi çözümleyici yok; oturum listesinde de yalnız
CDN'in `cf-ipcountry` / `x-vercel-ip-country` başlığı var. Aynı türetme yeniden kullanıldı, satır
`TR` taşıyor ve “tahmindir” notu (`Konum bilgisi IP adresine göre tahmin edilir`) satırın kendi
metninde kalıyor.

**7. `ipHash` tuzunun kod içi son çaresi.**
`hashAnalyticsValue` tuzu üç ortam değişkeninden okur, hiçbiri yoksa `"whispr-analytics"`e düşer.
Bu, `AdminAuditLog` ile **aynı** şemanın parçası; ayrı bir davranış üretmemek için olduğu gibi
kullanıldı. Dağıtılmış hiçbir ortamda `AUTH_SECRET` boş olamaz (reauth imzası onu zorunlu
kılıyor), yani düşüş yalnız yapılandırılmamış yerel koşumda mümkün.

---

## 5. Bırakılan `TODO(api):`

| Yer                                                    | Not                                                                                                                                                                                                   |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/settings/security-client.ts` — `fetchConnections` | `TODO(api): GitHub / Spotify / Steam / Xbox OAuth uygulamaları kurulunca gerçek uca bağlanır.` Dört satır `available: false`, Ş7 `disabled` çizer.                                                    |
| Telefon numarası satırı                                | Kolon (`phoneNumber`, `phoneVerified`) ve maskeleyici var, **SMS sağlayıcı yok**. `getAccountSettingsRows` maskeli değeri döner; `Değiştir` / `Kodu gönder` düğmeleri Ş7'de `disabled`. Uç yazılmadı. |

Uydurma endpoint çağrısı **yok**.

---

## 6. Kabul listesi

- [x] Mobil parola ucunun davranışı değişmedi; mevcut testleri dokunulmadan yeşil
- [x] Web parola ucu üç hata dalını ayrı kodla döndürüyor; yanlış denemede ayrı hız-sınırı
      sayacı artıyor
- [x] Parola değişince diğer oturumlar kapanıyor, mevcut oturum kalıyor
- [x] `revoke-others` sonrası mevcut oturum hâlâ geçerli (tuzak #13 regresyon testi)
- [x] 2FA kurulum yanıtı `otpauth://` URI + 4'lü gruplanmış manuel anahtar taşıyor; yeni eylem
      **resim göndermiyor**
- [x] 2FA devre dışı bırakma reauth istiyor (parola + canlı TOTP) — §4 sapma 2
- [x] Kurtarma kodu sayacı `{ total, unused }`; `Yenile` eski kodları geçersiz kılıyor
- [x] Sekiz `SecurityEvent` türü de gerçekten yazılıyor; her biri için test
- [x] `SecurityEvent` ham IP saklamıyor; `ipHash` tuzlu, tuz ortam değişkeninden
- [x] `recordSecurityEvent` hatası ana akışı düşürmüyor
- [x] `GET /security-events` en çok 10 kayıt, sunucu Türkçe metin göndermiyor
- [x] Oturum satırı `current` ve `platform` taşıyor — `platform` istemci adapterinde (sapma 1)
- [x] Hesap silme doğrulama cümlesi sunucuda denetleniyor (`z.literal` + reauth jetonu)
- [x] `connections` için uydurma endpoint çağrısı yok; adapter `TODO(api):` taşıyor
- [x] Commit atılmadı

---

## 7. Kapı çıktısı

```
pnpm --filter @wizards/web typecheck   ✔ (çıktı yok)
pnpm --filter @wizards/web lint        ℹ pass 10  ℹ fail 0  + eslint temiz
pnpm --filter @wizards/web test        <KAPI_TEST>
```

`src/app/api/v1/route-contract.test.ts` iki yeni rotayı da kabul ediyor: ikisi de kimlik
kapısından geçiyor, `POST /users/me/password` gövdeyi `parseJsonBody` ile okuyor, ikisi de
gövdesiz-mutasyon izin listesine **girmedi**.

---

## 8. Sonraki şeritler için notlar

1. **`platform` istemcide türer.** Ş7 oturum satırını çizerken `security-client.ts`'in
   `toAccountSession` dönüşümünü kullanmalı; `clientType`'ı doğrudan okuyup kendi eşlemesini
   yazan ikinci bir yer, `UNKNOWN` dalında sessizce ayrışır.
2. **İki `startTwoFactorSetup` eylemi var.** Ş7 **`beginTwoFactorSetupAction`** çağırır
   (URI + manuel anahtar). Eskisi (`startTwoFactorSetupAction`, `qrCodeDataUrl` döndüren) yalnız
   ölmekte olan `settings-panel.tsx` için duruyor; Ş13 ikisini birlikte siler.
3. **QR istemcide üretilir.** `otpauthUri`'yi bir QR bileşenine verin; sunucudan resim beklemeyin.
4. **`Görüntüle` yalnız yenilemeden sonraki listeyi gösterebilir** (sapma 3). Ekran bunu
   “kodlarınız yalnız bir kez gösterilir” diline çevirmeli, aksi hâlde boş bir sayfa vaat eder.
5. **`passwordChangedAt` güvenlik günlüğünden gelir.** Hiç parola değiştirmemiş hesapta `null`;
   ekran bunu “hiç değiştirilmedi” olarak okumalı, “bilinmiyor” olarak değil.
6. **`WEAK_PASSWORD` yanıtı `failedRules` taşır.** Hata metni tek cümle değil, kural listesi:
   `settings.security.password.rule.length|digit|uppercase|maxLength|reused`. Bu beş anahtar
   Ş7'de sözlüğe girmeli.
7. **`account:recovery-codes` ve `account:security-events`** hız sınırı anahtarları eklendi;
   yeni bir uç aynı bütçeyi paylaşacaksa `API_RATE_LIMITS`'e bakın.
