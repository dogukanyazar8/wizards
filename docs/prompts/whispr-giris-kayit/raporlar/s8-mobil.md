# Ş8 — Mobil kimlik yığını

**Durum:** landed (uncommitted) · 2026-08-27 · dal `uat`
**Kapsam:** SPEC-GIRIS-KAYIT §6 (mobil), §4.2/§4.3 (iki adımlı doğrulama + yedek kod), §4.4 (parola politikası)

## 1. Ne yapıldı

### 1.1 API katmanı (web tarafındaki mobil uçlar)

| Dosya                                                                              | Değişiklik                                                                                                                                                                                                                                                                                                                            |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/types/src/mobile.ts`                                                     | `MobileAuthPasswordLoginResponseSchema` artık `z.union([{session}, {challengeId, twoFactorRequired: true}])`. Yeni `MobileAuthTwoFactorRequestSchema`, `MobileAuthBackupCodeRequestSchema`, `MobileAuthTwoFactorResponseSchema`. Kayıt isteğine opsiyonel `displayName`. `MobileAuthNewPasswordSchema` paylaşılan politikaya sıkıldı. |
| `apps/web/src/lib/mobile/auth.ts`                                                  | Parola girişinde challenge dalı, `completeMobileTwoFactorChallenge`, `loadMobilePasswordAuthUserById`.                                                                                                                                                                                                                                |
| `apps/web/src/app/api/v1/mobile/auth/two-factor/route.ts` + `backup-code/route.ts` | Yeni uçlar; ortak `route-logic.ts`.                                                                                                                                                                                                                                                                                                   |

Sahadaki eski sürümleri kırmamak için sözleşme **opt-in**: istemci `supportsTwoFactorChallenge: true` göndermezse uç eski davranışta kalır.

### 1.2 İstemci katmanı

- `mobile-auth-exchange.ts` — `MobilePasswordSignInOutcome`, `completeMobileTwoFactor`, `completeMobileBackupCode`.
- `mobile-auth-context.tsx` — `completeTwoFactorChallenge({backupCode?, challengeId, code?, rememberDevice?})`; parola girişi challenge dalında `{challengeId, ok:false, requiresTwoFactor:true}` döndürür.
- `mobile-auth-navigation-types.ts` — `Welcome` silindi, `TwoFactor`/`BackupCode` `{challengeId}` parametresiyle eklendi.
- `mobile-auth-navigator.tsx` — `initialRouteName="Login"`, beş ekran.

### 1.3 Ekranlar

| Ekran                | Dosya                         | Not                                                                                                                  |
| -------------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Giriş                | `auth-login-screen.tsx`       | Üst geri satırı ve profil tipi seçici kalktı; başlıkta dil tetikleyici. Satır içi 2FA alanı tamamen kaldırıldı (K2). |
| Hesap oluştur        | `auth-register-screen.tsx`    | Ad Soyad alanı eklendi, şifre tekrar alanı kaldırıldı (K10). Parola kapısı paylaşılan politikaya bağlandı.           |
| İki adımlı doğrulama | `auth-two-factor-screen.tsx`  | **yeni** — altı hücreli kod, "bu cihazı hatırla", yedek koda geçiş.                                                  |
| Yedek kod            | `auth-backup-code-screen.tsx` | **yeni**                                                                                                             |
| Karşılama            | ~~`auth-welcome-screen.tsx`~~ | **silindi** (K4)                                                                                                     |

Yeni kit bileşeni: `auth-code-cells.tsx` — altı hücre tek gizli `TextInput` üzerinden sürülür (`oneTimeCode` + `sms-otp`), böylece iOS/Android otomatik doldurma çalışır; altıncı hane otomatik göndermez.

## 2. Yol boyunca kapanan gerçek hatalar

1. **Mobil parola kuralı sunucudan gevşekti.** `isMobileAuthPasswordStrong` 8 karakter + 3 sınıf istiyordu; sunucu şeması ise SPEC §4.4 politikasını (10 karakter + dört kuraldan üçü) uyguluyor. Ekranın kabul ettiği parolayı sunucu reddediyordu. Helper artık `meetsPasswordPolicy` çağırıyor; `authNativePasswordTooShort` metni de tr/en'de düzeltildi ("en az 8 karakter" yalanıydı).
2. **`rememberDevice` ekranda toplanıp yolda düşüyordu.** Kutu işaretleniyor, konteyner değeri atıyordu. Artık uca kadar taşınıyor. _(Sunucu bugün bu alanı yok sayıyor — bkz. §4 borç.)_
3. **Maestro akışı silinmiş ekranı yürüyordu.** `.maestro/phase2-auth-navigation.yml` ve `helpers/login-uat.yml` Karşılama→Giriş yolunu geziyordu; ikisi de yeni köke taşındı.

## 3. Sözleşme testleri — neyin ne olduğu

| Test                                           | Değişiklik                                                                                                                                                                           |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `mobile-auth-screen-contract.test.ts`          | Beş kök ekran, birebir tuple.                                                                                                                                                        |
| `mobile-auth-maestro-testid-contract.test.ts`  | Karşılama kimlikleri düştü; iki adımlı/yedek kod kökleri akışta **bulunmamalı** (kimlik bilgisi girmeyen akış oraya ulaşamaz).                                                       |
| `mobile-maestro-testid-contract.test.ts`       | Faz 0 yardımcı akış iddiaları yeni köke taşındı.                                                                                                                                     |
| `mobile-design-contract.test.ts`               | Beş ekran + `AuthCodeCells`; `initialRouteName="Login"`; K1/K10 için negatif iddia eklendi.                                                                                          |
| `mobile-redesign-semantic-role-gate.ts`        | `2a` hedefi silindi, `2e` (iki adımlı) ve `2f` (yedek kod) eklendi; yapısal geometri istisnası marka işaretini çizen `2e`'ye taşındı ve "tek hedefte kalmalı" iddiasıyla kilitlendi. |
| `mobile-redesign-theme-contract.test.ts`       | Değişmedi; yeni ekranlardaki `maxFontSizeMultiplier` değerleri 2.0 kuralına çekildi (14 nokta).                                                                                      |
| `component-tests/auth-welcome-screen.test.tsx` | **silindi**                                                                                                                                                                          |

## 4. Açık borç (Ş9'a devir)

1. **`rememberDevice` sunucuda karşılıksız.** Hem web hem mobil alanı gönderiyor, `two-factor-login.ts` onu okumuyor: güvenilir cihaz kaydı yok. Kutu bugün hiçbir şey yapmıyor. Ürün kararı gerekiyor — ya cihaz kaydı yazılacak ya kutu kaldırılacak.
2. **`AuthSecurityCard` ölü.** Karşılama ekranıyla birlikte tek tüketicisini kaybetti. Silinmedi çünkü `mobile-redesign-theme-contract.test.ts` onu `successSoft`/`successText` kontrast çiftinin tek örneği olarak kullanıyor; silmek o kapıyı zayıflatır. Ş9 ölü kod temizliğinde kontrast örneği taşınıp bileşen silinmeli.
3. **Karşılama metin anahtarları** (`authWelcome*`, `authSecurityStatus/Description/Badge`) sözlükte duruyor. Ş9 temizliğinde taranmalı.
4. **Canlı cihaz doğrulaması yapılmadı.** Maestro akışı güncellendi ama koşulmadı (cihaz/emülatör bu oturumda yok).

## 5. Ölçüm

| Koşum                                                            | Sonuç                     |
| ---------------------------------------------------------------- | ------------------------- |
| `pnpm --filter @wizards/mobile test` (node, `scripts/*.test.ts`) | **1980 / 1980**           |
| `pnpm --filter @wizards/mobile test:components` (jest)           | **1371 / 1371**, 141 süit |
| `pnpm --filter @wizards/mobile typecheck`                        | temiz                     |
| `pnpm --filter @wizards/types typecheck`                         | temiz                     |
