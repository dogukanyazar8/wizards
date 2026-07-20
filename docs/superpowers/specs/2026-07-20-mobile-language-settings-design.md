# Mobil "Dil" ayar ekranı — tasarım

Tarih: 2026-07-20 · Dal: `uat`

## Amaç

Ayarlar > **Dil** bölümü eski `ScreenShell + SettingsPreferenceSection` + TR/EN pill kontrolüyle
render ediliyordu. Bölümü 5h/5i (ve yeni Güvenli oturum) ekranlarının diline taşımak, içeriği
handoff `README_AUTH.md` §3a dil sheet'i, web dil paneli ve Discord/Slack/Teams/Zoom dil
ayarlarındaki bize uyan maddelerle doldurmak.

## Ekran

Yeni `apps/mobile/src/app/screens/mobile-language-settings-screen.tsx` (+ `.styles.ts`).
`settings-screen.tsx` `resolvedSection === "language"` bu ekranı render eder. Eski
`SettingsLocaleSelector` legacy (tek sayfa) ayar ekranında kullanılmaya devam ediyor.

| Bölüm | İçerik | Veri |
| --- | --- | --- |
| UYGULAMA DİLİ | 3a satır deseni: 38px ISO rozet (`code`), yerel ad (`nativeName`), aktif dildeki karşılığı, sağda 22px radio | `MOBILE_LOCALE_OPTIONS`, yerel ada göre alfabetik |
| CİHAZ | "Cihaz dilini kullan" `Toggle`; açıkken liste %45 opaklık + seçim kilitli | `usingDeviceLocale` / `setUseDeviceLocale` (SecureStore'da kalıcı) |
| BİÇİM ÖNİZLEME | Tarih / Saat / Sayı satırları | Gerçek `Intl.DateTimeFormat` + `Intl.NumberFormat`, `getMobileIntlLocale(locale)` |
| YAKINDA GELİYOR | Mesajları çevir, Saat dilimi (ikisi de disabled "Yakında") | Backend yok — veri-boşluğu politikası |
| Bilgi notu | Seçimin cihazda saklanır + oturum açıkken hesaba uygulanır | — |

Arama alanı yok: handoff §3a "dil sayısı ≤6 ise arama alanını gizle" diyor, desteklenen dil 2.

## Hesap senkronu (yeni)

- `packages/types`: `MobileAccountLocaleSchema` (`en`/`tr`), `MobileLocaleUpdateRequestSchema`,
  `MobileLocaleUpdateResponseSchema`.
- `apps/web/src/app/api/v1/mobile/account/locale/` — `PATCH` → auth →
  `enforceApiRateLimit(userId, "mobile:account:locale")` (30/60sn) → `persistUserLocale`
  (mevcut servis; `user.locale` + `userSettings.locale` yazar) → `{ locale }`.
- Mobil `syncMobileAccountLocale(client, locale, isSignedIn)` **best-effort**: oturum kapalıysa
  hiç çağrılmaz, hata sessizce yutulur — yerel tercih hiçbir koşulda geri alınmaz.
- Cihaz-dili toggle'ı kapatıldığında da çözülmüş dil senkronlanır.

## Doğrulama

types/web/mobile typecheck EXIT 0 · mobile 581 node + 415 jest (61 suite) · web mobile-account +
rate-limit + route-contract 53 · `lint:hooks` temiz.
