# Mobil "Güvenli oturum" ayar ekranı — tasarım

Tarih: 2026-07-20 · Dal: `uat`

## Amaç

Mobil Ayarlar > **Güvenli oturum** bölümü hâlâ eski `ScreenShell + SettingsPreferenceSection`
şablonuyla render ediliyor. Bu bölümü 5h (Bildirimler) / 5i (Hakkında) ekranlarıyla aynı tasarım
diline taşımak ve içeriğini web güvenlik merkezi + Discord/Slack/Teams/Zoom mobil güvenlik
ayarlarındaki bize uyan maddelerle doldurmak.

Tasarım kaynağı: `design_handoff_whispr_mobile/DESIGN_SYSTEM.md` (renk/radius/tipografi ölçeği),
`mobile-about-settings-screen.tsx` ve `mobile-notification-settings-screen.tsx` (yapı).

## Ekran

Yeni `apps/mobile/src/app/screens/mobile-security-settings-screen.tsx` + `.styles.ts`.
`settings-screen.tsx` içindeki `resolvedSection === "security"` dalı bu ekranı render eder
(5h/5i ile aynı devir deseni).

Yerleşim: geri chevron + başlık + alt başlık · `sectionHeading` etiketleri (11.5/700, uppercase,
letterSpacing 1.38) · beyaz 24px radius kartlar · 52px satırlar · 38px pastel ikon kutuları.

### Durum kartı (hero)

5i kimlik kartı geometrisi: 76px kalkan ikon kutusu (oturum güvenliyse yeşil, değilse amber),
başlık, gerçek özet alt satırı, "Oturumu yenile" pill butonu (`onRefresh`) ve altında durum metni.

### GİRİŞ GÜVENLİĞİ

| Satır | Veri | Davranış |
| --- | --- | --- |
| E-posta doğrulama | `accountSettings.account.emailVerified` (gerçek) | Rozet |
| İki adımlı doğrulama | `accountSettings.account.twoFactorEnabled` (YENİ alan) | Chevron → `Security` route (mevcut 2FA ekranı) |
| Kurtarma kodları | — | Disabled "Yakında" (kodlar yalnız kurulum anında üretiliyor, yeniden üretme endpoint'i yok) |
| Şifreyi değiştir | — | BottomSheet (mevcut/yeni/tekrar) → YENİ API |

### CİHAZ GÜVENLİĞİ

| Satır | Veri |
| --- | --- |
| Uygulama kilidi | `appLockAvailability` + `appLockEnabled` + `onToggleAppLock` (Toggle; sensör yoksa disabled) |
| Ekran gizliliği | Bilgi satırı "Etkin" (`MobilePrivacyShield` zaten otomatik) |
| Cihaz bütünlüğü | `useMobileAuth().deviceIntegrityStatus` (clean/compromised/emulator/unavailable) |

### OTURUM

| Satır | Veri |
| --- | --- |
| Bu cihaz | `sessionDiagnostics.hasSession && !isExpired`, ipucu `secondsUntilExpiry` |
| Yenileme anahtarı | `sessionDiagnostics.hasRefreshToken` |
| Bu cihazdan çık | Danger satır + onay sheet → `onSignOut` |

### YAKINDA

Aktif cihazlar ve Verilerini indir — ikisi de disabled "Yakında". Web güvenlik merkezinde de
"önizleme" olarak kapalı; mobilde backend yok (veri-boşluğu politikası).

## Backend

### `packages/types`

- `MobilePasswordChangeRequestSchema`: `currentPassword` (1–256), `newPassword` (8–100),
  `confirmPassword`; `newPassword === confirmPassword` ve `newPassword !== currentPassword`
  refine'ları.
- `MobilePasswordChangeResponseSchema`: `{ success: true }`.
- `MobileAccountSettingsResponseSchema.account.twoFactorEnabled: z.boolean().default(false)` —
  UAT mobil build uzak (eski) backend'e vurduğu için YENİ alanlar zorunlu olamaz, `.default()`
  şart.

### `apps/web`

- `app/api/v1/mobile/account/password/route.ts` + `route-logic.ts` + `route-logic.test.ts`:
  1. `requireMobileApiUserId`
  2. `enforceApiRateLimit(userId, "mobile:account:password")` — 5 istek / 15 dk
  3. kullanıcı yükle; `passwordHash` yoksa 409 `PASSWORD_UNAVAILABLE` (OAuth hesabı)
  4. `bcrypt.compare(currentPassword, passwordHash)` başarısızsa 401 `INVALID_CREDENTIALS`
  5. `bcrypt.hash(newPassword, 12)` → `passwordHash` + `sessionsRevokedAfter = now` güncelle,
     `revokeUserSessions(userId, { now })`
  6. `{ success: true }`
- Mobil oturumlar Redis'te (`auth:mobile-session:*`) tutulduğu ve `verifyMobileAccessToken`
  `sessionsRevokedAfter` okumadığı için **kullanıcı mobilde çıkış yemez**; kapanan yalnızca web
  (NextAuth) oturumlarıdır. Diğer mobil cihazların oturumu kapatılamaz (kullanıcı başına indeks
  yok) — bu yüzden "Aktif cihazlar" satırı "Yakında".
- `account/settings/route-logic.ts` select'ine `twoFactorEnabled` eklenir ve yanıta taşınır.
- `api-rate-limit.ts` yeni aksiyon + sayaç testi; `route-contract.test.ts` rota listesi + M1
  eşleme sayacı güncellenir.

## Mobil veri katmanı

- `apps/mobile/src/account/mobile-account-password-client.ts` — `changeMobilePassword(client, input)`.
- `useMobileChangePasswordMutation` — başarıda hesap ayarlarını invalidate eder.
- Ekran verisi: `useMobileAccountSettingsQuery` (email/2FA), `useMobileAuth()`
  (`deviceIntegrityStatus`, `apiClient`), mevcut `ProfileSettingsScreen` props'ları
  (app lock, session diagnostics, onRefresh, onSignOut).
- Tüm metinler `mobile-copy.ts` içinde `securitySettings*` anahtarları, tr + en.

## Doğrulama

`pnpm --filter @wizards/types typecheck` · `@wizards/web` · `@wizards/mobile` typecheck,
types + web (etkilenen) + mobile node & jest suite'leri, `lint:hooks`.
