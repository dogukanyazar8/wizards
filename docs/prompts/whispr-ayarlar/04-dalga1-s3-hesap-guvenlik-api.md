# Dalga 1 · Ş3 — Hesap ve güvenlik: parola, 2FA, oturumlar, güvenlik günlüğü, veri

**Ön koşul:** Ş0 kapısı yeşil. **Paralel:** Ş1, Ş2, Ş4.

Hesabım bölümünün `Hesap` · `Güvenlik` · `Verilerim` sekmelerini besleyen katman. Üç satır içi
riskli bloğun (parola · 2FA · hesap silme) sunucu tarafı burada biter.

**Güvenlik şeridi.** Bu şeritteki her uç kimlik doğrulama, hız sınırı ve yeniden kimlik
doğrulama (reauth) kurallarına tabidir; hiçbiri "sonra eklenir" diye bırakılmaz.

Önce `00-ortak-baglam.md` okunur.

---

## Sahiplenilen dosyalar

- `apps/web/src/lib/account/password-service.ts` (yeni — mobil `route-logic`'ten çıkarılan ortak servis) + `.test.ts`
- `apps/web/src/app/api/v1/mobile/account/password/route-logic.ts` (**düzenlenir** — ortak servisi çağırır)
- `apps/web/src/app/api/v1/users/me/password/route.ts` + `route-logic.ts` + `.test.ts` (yeni)
- `apps/web/src/lib/security/security-event-service.ts` (yeni) + `.test.ts`
- `apps/web/src/app/api/v1/users/me/security-events/route.ts` + `route-logic.ts` + `.test.ts` (yeni)
- `apps/web/src/lib/settings/security-client.ts` (yeni — fetch + query key)
- `apps/web/src/lib/auth/session-revocation.ts` (**düzenlenir** — olay yazımı)
- `apps/web/src/lib/auth/two-factor.ts` (**düzenlenir** — olay yazımı + kurtarma kodu sayacı)
- `apps/web/src/lib/account/actions.ts` (**düzenlenir** — olay yazımı)
- `apps/web/src/lib/account/service.ts` (**düzenlenir** — e-posta/telefon satır verisi)

**Okunur, yazılmaz:** `api/v1/users/me/sessions/*`, `data-export`, `deletion` (hazır uçlar),
`lib/auth/reauth.ts`, `lib/auth/totp.ts`.

---

## İş

### 1. Parola değiştirme — ortak servis

`api/v1/mobile/account/password/route-logic.ts` içindeki doğrulama ve değiştirme mantığı
`lib/account/password-service.ts`'e **çıkarılır**; mobil uç bu servisi çağırır ve davranışı
**değişmez** (mevcut mobil testleri dokunulmadan yeşil kalmalı).

Web ucu: `POST /api/v1/users/me/password`

```ts
{
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}
```

Kurallar (tasarımın yardım metni **birebir** bunu söylüyor):
`En az 10 karakter, bir sayı ve bir büyük harf gerekir.`

- Mevcut parola yanlış → `400 INVALID_CURRENT_PASSWORD`, **hız sınırı sayacı artar**.
- Yeni parola ile tekrarı uyuşmuyor → `400 PASSWORD_MISMATCH`.
- Politikaya uymuyor → `400 WEAK_PASSWORD` + hangi kuralın düştüğü.
- Başarı → tüm **diğer** oturumlar kapatılır (`sessionsRevokedAfter`), mevcut oturum **kalır**
  (tuzak #13), `SecurityEvent.PASSWORD_CHANGED` yazılır.

Hız sınırı: `lib/auth/request-rate-limits.ts` deseni, anahtar `account:password`.

### 2. İki aşamalı doğrulama

Mevcut server action'lar (`startTwoFactorSetupAction`, `confirmTwoFactorSetupAction`,
`disableTwoFactorAction`) **korunur**. Satır içi bloğun ihtiyaç duyduğu iki eksik:

- **Kurulum yanıtı** QR için `otpauth://` URI **ve** manuel anahtarı (`K4XP 9QF2 7MRT 1DVB`
  biçiminde 4'lü gruplama) döner. QR görüntüsü **istemcide** üretilir; sunucu resim göndermez.
- **Kurtarma kodları** sayacı: `TwoFactorRecoveryCode` üzerinden `{ total, unused }`
  (`10 kod · 8 tanesi kullanılmadı` satırı bunu okur). `Görüntüle` reauth ister,
  `İndir` metin dosyası üretir, `Yenile` eski kodları geçersiz kılar +
  `SecurityEvent.RECOVERY_CODES_REGENERATED`.

`TWO_FACTOR_ENABLED` / `TWO_FACTOR_DISABLED` olayları yazılır.
Devre dışı bırakma **reauth** ister (mevcut `AccountReauthChallenge` akışı).

### 3. Güvenlik günlüğü (K5)

`security-event-service.ts`:

```ts
export async function recordSecurityEvent(input: {
  userId: string;
  kind: SecurityEventKind;
  ip?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void>;
export async function listSecurityEvents(userId: string, limit = 10): Promise<SecurityEvent[]>;
```

- **Ham IP saklanmaz.** `ipHash` = `AdminAuditLog.ipHash` ile **aynı** tuzlu hash şeması;
  tuz ortam değişkeninden gelir ve kod içine gömülmez.
- `location` IP'den kaba tahmin (mevcut oturum listesindeki türetme yeniden kullanılır);
  tahmin olduğu satır açıklamasında yazılı (`Konum bilgisi IP adresine göre tahmin edilir`).
- Yazma **hiçbir zaman** ana akışı düşürmez: `recordSecurityEvent` kendi hatasını yutar ve
  loglar; giriş akışı güvenlik günlüğü yazılamadı diye başarısız olmaz.

Sekiz olay yazılır: yeni cihazdan giriş, parola değişimi, başarısız giriş, 2FA aç/kapat,
oturum kapatma, kurtarma kodu yenileme, e-posta değişimi.

`GET /api/v1/users/me/security-events` son **10** kaydı döner; her satır
`{ kind, createdAt, location, device }` taşır. Metin istemcide kurulur (`settings.security.event.*`).

### 4. Oturumlar

Mevcut `GET/DELETE /api/v1/users/me/sessions` + `revoke-others` **yeniden kullanılır**.
Eklenen tek şey: yanıt satırı `current: boolean` **ve** `platform: "web" | "desktop"` taşır
(tasarım `Bu cihaz` pilini ve `Masaüstü` / `Web` ayrımını çiziyor).

`revoke-others` çağrıldığında `SecurityEvent.SESSION_REVOKED` yazılır ve mevcut oturum
**kapanmaz** (tuzak #13 — regresyon testi zorunlu).

### 5. E-posta, telefon, dışa aktarma, silme

| Satır                                    | Uç                                   | Not                                                             |
| ---------------------------------------- | ------------------------------------ | --------------------------------------------------------------- |
| `E-posta adresi` + `Doğrulandı` pili     | `GET /users/me`                      | `Değiştir` reauth akışına gider                                 |
| `Doğrulama e-postası` + `Son gönderim …` | mevcut `EmailVerificationToken`      | Hız sınırı: 5 dk                                                |
| `Telefon numarası`                       | —                                    | **`TODO(api):` `disabled`** (K5) — kolon var, SMS sağlayıcı yok |
| `Hesap verilerimi dışa aktar`            | `POST /users/me/data-export` (hazır) | Son arşiv zamanı + boyut yanıtta                                |
| `Hesabı sil`                             | `POST /users/me/deletion` (hazır)    | Parola + doğrulama cümlesi `hesabımı kalıcı olarak sil`         |

Hesap silme doğrulama cümlesi **sunucuda** da denetlenir; yalnız istemci kontrolü yeterli değil.

### 6. Bağlı hesaplar (K5)

`GET /api/v1/users/me/connections` **yazılmaz**. `lib/settings/security-client.ts` içinde tipli
bir adapter durur:

```ts
// TODO(api): GitHub / Spotify / Steam / Xbox OAuth uygulamaları kurulunca gerçek uca bağlanır.
export function fetchConnections(): Promise<AccountConnection[]> {
  return Promise.resolve(STATIC_CONNECTIONS);
}
```

`STATIC_CONNECTIONS` dört servisi `connected: false` ile döner; Ş7 satırları `disabled` çizer.
**Uydurma endpoint çağrılmaz.**

---

## Kabul

- [ ] Mobil parola ucunun davranışı **değişmedi**; mevcut testleri dokunulmadan yeşil.
- [ ] Web parola ucu üç hata dalını ayrı kodla döndürüyor; hız sınırı yanlış denemede artıyor.
- [ ] Parola değişince **diğer** oturumlar kapanıyor, **mevcut oturum kalıyor**.
- [ ] `revoke-others` sonrası mevcut oturum hâlâ geçerli (tuzak #13 regresyon testi).
- [ ] 2FA kurulum yanıtı `otpauth://` URI + 4'lü gruplanmış manuel anahtar taşıyor; sunucu
      **resim göndermiyor**.
- [ ] 2FA devre dışı bırakma reauth istiyor.
- [ ] Kurtarma kodu sayacı `{ total, unused }` doğru; `Yenile` eski kodları geçersiz kılıyor.
- [ ] Sekiz `SecurityEvent` türü de gerçekten yazılıyor (her biri için test).
- [ ] `SecurityEvent` **ham IP saklamıyor**; `ipHash` tuzlu ve tuz ortam değişkeninden.
- [ ] `recordSecurityEvent` hatası ana akışı düşürmüyor.
- [ ] `GET /security-events` en çok 10 kayıt, sunucu **Türkçe metin göndermiyor**.
- [ ] Oturum satırı `current` ve `platform` taşıyor.
- [ ] Hesap silme doğrulama cümlesi **sunucuda** denetleniyor.
- [ ] `connections` için uydurma endpoint çağrısı **yok**; adapter `TODO(api):` taşıyor.

## Kapı

```
pnpm --filter @wizards/web typecheck && pnpm --filter @wizards/web lint && pnpm --filter @wizards/web test
```

Rapor: `docs/prompts/whispr-ayarlar/raporlar/04-s3-rapor.md`
