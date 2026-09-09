# Ş8 — Mobil: Giriş · Hesap oluştur · 2FA kodu (Dalga 3)

Yalnız `apps/mobile/src/**`. Web tarafına dokunma.

Oku: `00-ortak-baglam.md`, `PLAN.md` §3 (K1, K4, K6, K13), `SPEC.md` §6, §1, §2, §3.1, §3.4, §3.5,
§9, §11 ve Ş1 raporu (mobil token ve metin eşlemesi) + Ş2 raporu (backend sözleşmesi).

Üç ekran: **Giriş · Hesap oluştur · 2FA kodu.** K1 gereği telefon doğrulama ekranı kurulmaz.

---

## 1. Navigasyon (K4)

- `MobileAuthStackParamList` → `Login` · `Register` · `ForgotPassword` · **`TwoFactor`** ·
  **`BackupCode`**; `Welcome` **kaldırılır**.
- `mobile-auth-navigator.tsx` `initialRouteName="Login"`.
- `Welcome`'a giden her çağrı taranır ve `Login`'e çevrilir (derin bağlantı, `mobile-dev-login`,
  testler, `mobile-auth-navigation.test.tsx`).
- `auth-welcome-screen.tsx`, `auth-welcome-screen.styles.ts`, `auth-welcome-brand-mark.tsx`,
  `auth-welcome-background.tsx` kaldırılır — **önce kullanım taraması**, başka ekran kullanıyorsa
  taşınır, silinmez.
- `MOBILE_AUTH_SCREEN_TEST_IDS` güncellenir:
  `mobile-auth-login-screen` · `mobile-auth-register-screen` ·
  `mobile-auth-forgot-password-screen` · `mobile-auth-two-factor-screen` ·
  `mobile-auth-backup-code-screen`.

---

## 2. Cihaz çerçevesi ve ortak katmanlar (SPEC §6)

Bunlar **gerçek cihazda** çerçeve çizmez; referanstaki 390×844 mockup çerçevesi tasarımın sunum
kabuğudur. Üretimde karşılıkları:

| Referans                                               | Üretim                                                          |
| ------------------------------------------------------ | --------------------------------------------------------------- |
| Cihaz köşesi 44, durum çubuğu 52, home indicator 134×5 | İşletim sisteminin kendisi — çizilmez                           |
| İçerik dolgusu `0 28px`                                | `paddingHorizontal: 28`                                         |
| Durum çubuğu yüksekliği                                | `useSafeAreaInsets().top` + `getMobileShellTopInset` sözleşmesi |
| Home indicator boşluğu                                 | `useSafeAreaInsets().bottom`                                    |

Aurora (SPEC §3.1 mobil): `inset:-25%`, `32% 26% at 50% 26%` `--primary/.22` +
`30% 24% at 62% 74%` `--success/.12`, 16s. Mevcut `auth-screen-background.tsx` bu değerlere
çekilir (RN'de `expo-linear-gradient` + iki radyal katman veya `react-native-svg`; hangisi
kullanılıyorsa **mevcut desen korunur**).
`prefers-reduced-motion` karşılığı: `AccessibilityInfo.isReduceMotionEnabled()` — açıksa aurora
sürüklenmesi, logo ışıması, imleç ve spinner durur; düzen ve renk değişmez.

---

## 3. Ortak mobil ölçüler (SPEC §6)

`mobileAuthMetrics` (Ş1) üzerinden: alan **h48–50** / köşe **14** / **14.5–15px**;
birincil düğme **h52** / köşe **14** / **15px**; sağlayıcı **h48**; onay kutusu **20**;
kod hücresi `flex:1` × **62** / köşe **14** / **24px**; pill h34; dil/tema seçici h34,
segment 30; alt bilgi 10.5px.
**Minimum dokunma hedefi 44** — onay kutusu satırı ve geri satırı `minHeight: 44`.

Logo ölçekleri: başlık `scale(.95)`, satır içi `scale(.72)`; ışıma halkası 74px.

---

## 4. Ekran 1 — Giriş (`auth-login-screen.tsx`)

Sıra (SPEC §6/1):

1. Başlık satırı: sağında `ThemeLanguageControls` mobil varyantı (h34, segment 30).
   Dil menüsü mevcut `auth-language-picker-sheet.tsx` ile açılır — **sheet korunur**, tetikleyici
   SPEC §3.4 görünümüne çekilir.
2. 74px ışıma halkası + `scale(.95)` logo işareti.
3. Başlık **27px** `auth.login.title`, açıklama `auth.login.subtitle`.
4. E-posta alanı, şifre alanı (etiket satırının sağında `auth.login.forgot`).
5. `auth.login.remember` onay kutusu (20px).
6. Birincil düğme `auth.login.cta`.
7. Ayırıcı `auth.field.or`.
8. Üç sağlayıcı — **kısa etiketler**: `Google` · `Microsoft` · `Apple`
   (SPEC §6/1 açıkça kısa etiket istiyor). Microsoft ve Apple devre dışı + `Yakında` rozeti.
9. Alt blok: `auth.login.noAccount` + `auth.login.createAccount`, ardından alt bilgi.

## 5. Ekran 2 — Hesap oluştur (`auth-register-screen.tsx`)

- Üstte **satır içi logo** (`scale(.72)`) + `Whispr` 19px; sağında dil/tema seçici.
- Başlık `auth.register.title`, açıklama `auth.register.subtitle`.
- **Dört alan alt alta** (web'in iki kolonlu gridi mobilde tek kolona iner):
  Ad Soyad · Kullanıcı adı · E-posta · Şifre.
- Kullanıcı adı ipucu satırı, e-posta algılama satırı, güç çubuğu + kural listesi,
  Turnstile satırı, şartlar onayı, birincil düğme, `auth.register.haveAccount` + `Giriş yap`.
- **Alt bilgi vardır** (K13).
- Klavye davranışı: `KeyboardAvoidingView` yerine projedeki mevcut çözüm kullanılır
  (`MobileChatKeyboardRegion` deseni varsa auth'a uyarlanır); alan odaklanınca güç göstergesi
  ve kural listesi görünür kalır.

## 6. Ekran 3 — 2FA kodu (`auth-two-factor-screen.tsx`, yeni)

SPEC §6/3:

1. **Geri satırı**: 36px kare düğme + `auth.common.backToLogin` metni, satır `minHeight: 44`.
2. 74px halka + logo.
3. `AuthEyebrow` `auth.twoFactor.eyebrow`.
4. Başlık + açıklama.
5. **Altı eşit hücre** (`flex:1` × 62, köşe 14, rakam 24px) — web'deki `CodeInput` davranışının
   RN karşılığı: tek `TextInput` (`keyboardType="number-pad"`,
   `textContentType="oneTimeCode"`, Android `autoComplete="sms-otp"`) + görsel hücreler;
   yapıştırma altı haneyi dağıtır, Backspace bir önceki hücreye döner.
6. `auth.twoFactor.rememberDevice` onay kutusu.
7. Birincil düğme `auth.twoFactor.cta`.
8. `auth.twoFactor.useBackup` bağlantısı → `BackupCode` ekranı.
9. Alt bilgi.

**`BackupCode` ekranı** (referansta mobil çizimi yok): 2FA ekranının kabuğunu ve web §4.3
içeriğini kullanır — tek alan h52/köşe 14, `600 18px Outfit`, `letter-spacing:.14em`,
maskeli giriş, birincil düğme, `Giriş ekranına dön`. Bu, SPEC §5'in masaüstü için koyduğu
"aynı kabuk + web muadilinin içeriği" kuralının mobil karşılığıdır; kararı rapora yaz.

---

## 7. Kit güncellemeleri

`app/components/kit/auth/` içinde eksik olanlar eklenir, var olanlar SPEC ölçülerine çekilir:
`auth-code-cells.tsx` (yeni) · `auth-password-strength-row.tsx` (Ş1'in
`evaluatePasswordStrength` sonucunu alacak şekilde) · `auth-suggestion-chip.tsx` (yeni) ·
`auth-countdown-pill.tsx` (yeni) · `auth-status-banner.tsx` (üç seviye, `↻` success varyantı
dahil) · `auth-theme-language-controls.tsx` (yeni, K6).
`auth-profile-type-selector.tsx` **kaldırılır** (K4 — kitle seçici tasarımda yok).

---

## 8. Tema ve dil (K6)

- Auth yüzeyinde tema seçimi `redesignAuthLight` / `redesignAuthDark` arasında geçer ve
  `expo-secure-store`/`AsyncStorage` (projede hangisi kullanılıyorsa) içinde saklanır.
  Kullanıcının global tema tercihi **yazılmaz**; oturum açılınca devralır.
- Dil seçimi mevcut `mobile-locale` altyapısını kullanır (auth'a özel dil deposu **açılmaz**).

---

## 9. Testler

- `component-tests/mobile-auth-navigation.test.tsx` güncellenir: `Welcome` yok, ilk rota `Login`,
  `TwoFactor` ve `BackupCode` erişilebilir.
- `component-tests/mobile-auth-screens.test.tsx` (yeni): üç ekranın alan sırası, kısa sağlayıcı
  etiketleri, kayıt ekranında dört alanın alt alta olması, alt bilginin **üç ekranda da** olması.
- `scripts/mobile-auth-metrics.test.ts`: her dokunulabilir öğenin `minHeight >= 44` olması;
  sabit sayı taraması (ölçüler yalnız `mobileAuthMetrics`'ten).
- `scripts/mobile-auth-copy.test.ts`: ekranlarda sabit dize yok, tüm metinler `mobileCopy`'den,
  TR/EN anahtar kümeleri eş.
- `mobile-font-contract.test.ts` güncellenir: auth ekranları Outfit (başlık/rakam) ve Figtree
  (gövde/form) kullanıyor.

## 10. Bitirme

`pnpm --filter @wizards/mobile test` yeşil; mobil typecheck (`reference_mobile_verify_commands`
notundaki komut) yeşil.
Rapor: `raporlar/s8-mobil.md` — SPEC §6'nın üç ekranı için satır satır doğrulama, `Welcome`
kaldırmanın dokunduğu yerler, `BackupCode` ekranı kararı, K1 nedeniyle kurulmayan telefon
ekranının tam listesi.
