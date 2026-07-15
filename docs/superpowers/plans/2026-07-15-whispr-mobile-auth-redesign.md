# Whispr Mobil Auth Akışı (Tur 2 / 2a-2d) — Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `design_handoff_whispr_mobile/README_AUTH.md` + HTML `#t2` (`#2a`-`#2d`) akışını — karşılama, giriş, kayıt, şifre sıfırlama — mevcut Whispr mobil mimarisi üzerinde **piksel piksel, dummy verisiz** yeniden inşa etmek. Bugün tek bir `AuthGate` bileşeni içinde `mode` state'i ile yaşayan auth yüzeyi, dört ayrı ekranlı gerçek bir navigasyon yığınına dönüşür; tasarımın gerektirdiği ama backend'de bulunmayan üç yetenek (login'de 2FA, mobilde Turnstile doğrulaması, sıfırlama bağlantısı TTL'i) gerçek API olarak tamamlanır.

**Architecture:** Bu akış Tur 1 redesign'ının (`docs/superpowers/plans/2026-07-14-whispr-mobile-redesign.md`) tasarım sistemi ve görsel kabul makinesi üzerine oturur — font, palet, tema nesneleri, `visual:reference:extract` → `visual:golden:generate` → `visual:capture:*` → `visual:diff`/`visual:gate` zinciri ve `mobile-redesign-semantic-role-gate.ts` uat'ta **hazırdır**; yeniden kurulmaz, genişletilir. Önce FAZ -1 capability gate gerçek auth yeteneklerini üretir (ekran işi yeşil olmadan başlamaz). Ardından auth'a özgü renk/ölçü rolleri tek kaynakta (`palette.ts`/`tokens.ts`/`themes.ts`) tanımlanır, paylaşılan `components/kit/auth/` primitifleri çıkarılır, dört ekran saf sunum bileşeni olarak kurulur ve en son mevcut per-tab/per-route gate noktalarında (`ProtectedTab`/`ProtectedStackRoute` mantığı **değişmeden**) `AuthGate` yerine `MobileAuthNavigator` geçirilir.

**Tech Stack:** Expo 56, React Native 0.85, React 19, React Navigation (native-stack), vendored Plus Jakarta Sans, `expo-linear-gradient` (yeni), `react-native-webview` (yeni — Turnstile için RN SDK'sı yok), TanStack Query, `expo-secure-store`, Zod (`@wizards/types`), Next.js API routes (`apps/web` mobil backend'dir), Redis oturumları, bcryptjs, mevcut TOTP/recovery-code primitifleri, Cloudflare Turnstile, Jest/RNTL, Node test runner, Maestro, Playwright reference renderer.

## Global Constraints

- Kaynak önceliği: HTML (`#2a`-`#2d`) görsel geometri/ikon/font için, `README_AUTH.md` davranış/veri/erişilebilirlik için, PNG yalnız hızlı referans için kanoniktir. Tereddütte kalınan HER değer HTML'den okunur, tahmin edilmez.
- **Runtime UI'ya dummy/sahte/hardcode veri eklenmez.** Sosyal sağlayıcı listesi, PREVIEW profilleri, sistem durumu, sıfırlama bağlantısı süresi — hepsi konfig/API kaynaklıdır. Kaynağı olmayan bilgi **gösterilmez**; uydurulmaz (README_AUTH §0.1).
- **Ekran ve style dosyalarında ham hex/rgba YASAK ve tema ağacında karşılığı olmayan ham sayısal ölçü YASAK.** `mobile-redesign-semantic-role-gate.ts` her ikisini de fail-closed denetler; auth akışının koyu HTML frame'i olmadığı için koyu kabul yalnız bu gate ile alınır (README_AUTH §1: "Koyu tema: bu akış için ayrı mock yoktur").
- Her ekran benzersiz bir `testID` taşır (`mobile-auth-{welcome,login,register,forgot-password}-screen`); görsel extractor anchor→testId eşlemesi ve Maestro akışları buna bağlıdır. Dört ekran ortak testID paylaşamaz.
- Tüm dış yanıtlar shared Zod şemasıyla doğrulanır; yeni/değişen endpoint'ler bearer/anonim ayrımı, rate limit, bounded input ve e-posta varlığı ifşa etmeme kuralını korur.
- Her davranış değişikliği red-green TDD ile başlar; focused test yeşil olmadan uygulama commit'i yapılmaz.
- Metinler Türkçe; tüm yeni string'ler `src/locale/mobile-copy.ts` içine **hem `tr` hem `en`** olarak eklenir (key-parity contract testi zorunlu). Koda literal metin yazılmaz.
- Şifre/token asla loglanmaz; şifre alanları secure text entry, autofill ipuçları (`username`, `password`, `new-password`, `one-time-code`) doğru atanır.
- Tüm dokunma hedefleri ≥44pt; tüm normal metin 2.0 font ölçeğinde içerik/fonksiyon kaybetmeden çalışır; 390×844 piksel kabulü font ölçeği 1.0'da yapılır.
- Her görev PowerShell-safe `corepack pnpm --filter ...` komutlarıyla doğrulanır ve tek cohesive commit üretir.

---

## 0. KAYNAKLAR VE ÇALIŞMA KURALLARI

### Kanonik referanslar

- **`design_handoff_whispr_mobile/Whispr Mobile Redesign.dc.html`** — tek gerçek kaynak. Auth akışı **Tur 2 / `#t2`** bölümüdür: `#2a` Karşılama, `#2b` Giriş, `#2c` Kayıt, `#2d` Şifremi unuttum. Her biri 390×844 div, tüm ölçü/renk/yazı değerleri inline style. Anchor'ların varlığı doğrulandı.
- `design_handoff_whispr_mobile/README_AUTH.md` — görev tanımı, auth token tabloları, ekran spesifikasyonları, kabul kriterleri.
- `design_handoff_whispr_mobile/README.md` — ana uygulama; token seti ve genel kurallar ortaktır.
- `design_handoff_whispr_mobile/screenshots/2{a,b,c,d}-*.png` — hızlı görsel referans (düşük çözünürlük; piksel değeri için HTML esas).

### Kesin kurallar (README_AUTH §0 — ihlali kabul edilmez)

1. **Dummy/sahte/hardcode veri YASAK.** `ornek@eposta.com` bir placeholder'dır, değer değildir. Bir veri kaynağı yoksa ekran boş/iskelet bırakılır, uydurulmaz.
2. Mevcut kod tabanı önce keşfedilir; yeni ekranlar mevcut mimariye entegre edilir (bu plan araştırmayı tamamladı — bulgular aşağıda).
3. Tasarımlar 390×844pt üzerine kuruludur; diğer boyutlarda oranlı ve taşmasız (safe-area dahil).
4. Açık + koyu tema birlikte gelir; karşılamadaki tema anahtarı canlı ve kalıcıdır (mevcut `useThemePreference` mekanizması).
5. Karşılamadaki dil seçici gerçek i18n locale değiştiricisidir.
6. Şifreler/tokenlar loglanmaz; secure entry + doğru autofill ipuçları.

### Çalışma düzeni

- **Dal: `uat`. Ayrı worktree açılmaz; mevcut checkout'ta çalışılır** (kullanıcı kararı). Tur 1 redesign'ı da aynı dalda uçuşta olduğu için her task dar kapsamlı `git add` ile yalnız kendi dosyalarını commit eder; `git add -A` kullanılmaz.
- Her task sonunda commit (mesajlar aşağıda verildi).
- Temel doğrulama komutları repo kökünden çalışır:
  - `corepack pnpm --filter @wizards/types test`
  - `corepack pnpm --filter @wizards/web typecheck` ve `corepack pnpm --filter @wizards/web test`
  - `corepack pnpm --filter @wizards/mobile typecheck`
  - `corepack pnpm --filter @wizards/mobile test` (Node test runner — `scripts/*.test.ts`)
  - `corepack pnpm --filter @wizards/mobile test:components -- --runInBand` (Jest/RNTL — `component-tests/*`)
  - `corepack pnpm --filter @wizards/mobile quality:check`
- **Görsel doğrulama döngüsü (mevcut makine):** açık tema için `visual:reference:extract` HTML `#2a`-`#2d`'den computed-style manifesti + referans PNG üretir, `visual:golden:generate` normalize golden'ı yazar, `visual:capture:android`/`ios` cihaz kanıtı alır, `visual:diff`/`visual:gate` fail-closed karşılaştırır. **Koyu tema için golden üretilmez** — HTML koyu frame'i yoktur; kabul `mobile-redesign-semantic-role-gate` ile alınır.

### Araştırma bulguları ve bilinçli kapsam kararları

Bunlar açık soru değildir; her biri README_AUTH kuralları veya mevcut kod tabanı okunarak karara bağlanmıştır. Uygulama sırasında yeniden tartışılmaz.

1. **Navigasyon yeniden yapılandırması zorunludur.** Bugün auth stack'i yoktur: `mobile-navigator.tsx:248-279` içindeki `ProtectedTab`/`ProtectedStackRoute` blokladığında tek bir `AuthGate` bileşeni `mode` state'i ile inline render edilir. Tasarım dört ayrı ekran ve gerçek geri navigasyonu ister (README_AUTH §4). Gating mantığı (`resolveMobileRoute`, `MOBILE_TABS`) **değişmez**; yalnız bloklandığında render edilen şey değişir.
2. **Login'de 2FA gerçek bir backend eksiğidir, UI eksiği değil.** `MobileAuthPasswordLoginRequestSchema` (`packages/types/src/mobile.ts:109-112`) yalnız `{email, password}` taşır ve `createMobilePasswordSession` (`apps/web/src/lib/mobile/auth.ts:675-741`) `twoFactorEnabled` alanını hiç okumaz — yani 2FA açık bir kullanıcı bugün mobilde ikinci faktör olmadan giriyor. Tasarım "2FA veya yedek kod kullan" kontrolünü "mevcut 2FA altyapısına bağlan" diyerek ister (§3 2b). Web login'i bunu zaten yapıyor (`LoginSchema.twoFactorCode`), 2FA *ayar* ekranı mobilde zaten çalışıyor (`src/account/mobile-two-factor-screen.tsx`). Task A2 aynı `verifyTwoFactorCredential` primitifini login yoluna bağlar — yeni kripto yazılmaz.
3. **Turnstile gerçek widget olmalıdır.** Kabul kriteri §5.4 açık: "Turnstile gerçek widget; doğrulama tamamlanmadan submit edilemiyor." Bugün `auth-gate.tsx`'teki Cloudflare rozeti tamamen dekoratiftir ve mobil login/register route'ları `verifyTurnstileToken`'ı hiç çağırmaz (yalnız web'in kendi server action'ları çağırır). RN Turnstile SDK'sı yoktur → widget `react-native-webview` içinde Cloudflare'in kendi script'iyle gömülür (Task 4), doğrulama sunucuda mevcut `apps/web/src/lib/auth/turnstile.ts` ile yapılır (Task A3).
4. **Sosyal giriş yalnız Google gösterir.** §3 2b: "Liste konfigürasyondan gelir; entegre olmayan sağlayıcı gösterilmez." Bugün mobilde native OAuth SDK'sı yok; dört buton da `openWebSignIn()` çağırıyor (yani mock değil, gerçek tarayıcı hand-off'u — bu korunur). Web'de yalnız Google gerçekten bağlı (`social-login.tsx`: Microsoft/Apple/Discord → `onUnavailable`). Task A4 listeyi tek kaynaklı konfige çevirir; bugün tek giriş Google'dır.
5. **Sistem durumu endpoint'i yoktur.** `apps/web/src/app/api` altında status/uptime şeklinde hiçbir şey yok. §3 2a: "endpoint yoksa yalnız telif satırı gösterilir — sahte 'aktif' gösterme." 2a yalnız telif satırını render eder; `authWelcomeStatusActive` benzeri bir metin **yazılmaz**.
6. **Feature-flag sistemi yoktur.** PREVIEW rozetleri bugün bileşen içinde statik `preview: true` ile duruyor. Gerçek flag altyapısı kurmak kapsam dışıdır (YAGNI); rozet statik kalır, README_AUTH §6.6'daki "flag açıldığında rozet kalkar" kurgusu flag sistemi geldiğinde tek satırlık değişiklik olacak şekilde tek noktada tutulur.
7. **2c'deki "Ad Soyad" alanı "Kullanıcı adı" olarak uygulanır.** Mock serbest metin bir ad alanı gösteriyor; ancak ürünün tamamı — web `RegisterSchema` (`packages/types/src/auth.ts:36-43`) ve `MobileAuthRegisterRequestSchema` — yalnız `username` handle'ı toplar (`/^[a-zA-Z0-9_]+$/`, 2-32). Backend'de serbest ada yazılacak alan yoktur. "Ada Lovelace" yazan kullanıcı anlamsız bir karakter hatası alırdı; bu tam olarak §0.1'in yasakladığı sahte alandır. Input geometrisi/ikonu/konumu mock ile birebir kalır, etiket ve placeholder gerçeğe çevrilir. Ayrı bir display-name alanı isteniyorsa bu bir şema/DB değişikliğidir ve ayrı iş olarak açılır.
8. **Sözleşme linkleri gerçek rotalara gider.** `apps/web/src/app/(auth)/register/page.tsx:366-374` zaten `/terms` ve `/privacy`'ye link veriyor (`(legal)/[legalDocument]/page.tsx` ile karşılanıyor). 2c bunları `Linking.openURL(${webUrl}/terms|/privacy)` ile açar.
9. **Sıfırlama TTL'i 30 değil 60 dakikadır.** Mock "30 dakika" yazıyor; gerçek değer `PASSWORD_RESET_TOKEN_EXPIRY_MINUTES = 60` (`apps/web/src/lib/auth/password-reset.ts:13`). §3 2d bunu zaten öngörmüş: "30 dakika değeri backend konfigürasyonundan okunur — hardcode etme; alınamıyorsa süre cümlesini gösterme." Task A4 değeri response'a taşır; ekran yalnız gelen değeri render eder.
10. **"Beni hatırla" bu turda kalıcılık modu değiştirmez.** Mevcut mimaride oturum her hâlükârda secure storage'da kalıcıdır; "kapanışta çıkış yap" diye bir mod yoktur. Checkbox mock ile birebir render edilir ve seçimi korunur, fakat var olmayan bir davranış vaat eden ek kod yazılmaz. Gerçek bir kalıcılık modu istenirse ayrı iş olarak açılır (README_AUTH §6.2 biyometrik öneri ile birlikte değerlendirilmeli).

---

## 1. DOSYA HARİTASI

### Oluşturulacak

| Dosya                                                                    | Sorumluluk                                                                    |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| `apps/mobile/src/auth/mobile-auth-social-config.ts`                      | Konfigüre sosyal sağlayıcı listesi (bugün yalnız Google)                      |
| `apps/mobile/src/app/components/kit/auth/auth-screen-background.tsx`     | Ortak katmanlı arkaplan + klavye/scroll kabuğu                                |
| `apps/mobile/src/app/components/kit/auth/auth-top-bar.tsx`               | Geri butonu + logo başlığı (2b/2c/2d)                                         |
| `apps/mobile/src/app/components/kit/auth/auth-eyebrow-header.tsx`        | Eyebrow + H1 + açıklama bloğu                                                 |
| `apps/mobile/src/app/components/kit/auth/auth-primary-button.tsx`        | Gradyan hap buton (spinner/disabled dahil)                                    |
| `apps/mobile/src/app/components/kit/auth/auth-secondary-button.tsx`      | Kenarlıklı hap buton                                                          |
| `apps/mobile/src/app/components/kit/auth/auth-text-field.tsx`            | Etiketli input (sol ikon, odak halkası, göz toggle, alan hatası)              |
| `apps/mobile/src/app/components/kit/auth/auth-checkbox.tsx`              | 18px checkbox satırı (özel içerik desteği ile)                                |
| `apps/mobile/src/app/components/kit/auth/auth-profile-type-selector.tsx` | 3 sütun profil seçici + PREVIEW rozetleri                                     |
| `apps/mobile/src/app/components/kit/auth/auth-password-strength-row.tsx` | Canlı şifre kuralı satırı + `isMobileAuthPasswordStrong`                      |
| `apps/mobile/src/app/components/kit/auth/auth-turnstile-card.tsx`        | Gerçek Cloudflare Turnstile widget'ı (WebView) + hata durumu                  |
| `apps/mobile/src/app/components/kit/auth/auth-security-card.tsx`         | Güvenlik/Cloudflare güven kartı (2b/2c)                                       |
| `apps/mobile/src/app/components/kit/auth/auth-info-banner.tsx`           | İkon + paragraf bilgi kartı (2d TTL notu)                                     |
| `apps/mobile/src/app/components/kit/auth/index.ts`                       | Auth kit barrel                                                               |
| `apps/mobile/src/app/screens/auth/auth-welcome-screen.tsx` + `.styles.ts`| 2a Karşılama                                                                  |
| `apps/mobile/src/app/screens/auth/auth-login-screen.tsx` + `.styles.ts`  | 2b Giriş                                                                      |
| `apps/mobile/src/app/screens/auth/auth-register-screen.tsx` + `.styles.ts`| 2c Kayıt                                                                     |
| `apps/mobile/src/app/screens/auth/auth-forgot-password-screen.tsx` + `.styles.ts` | 2d Şifremi unuttum                                                    |
| `apps/mobile/src/app/screens/auth/mobile-auth-screen-containers.tsx`     | Ekranları `useMobileAuth()` + navigasyona bağlayan container'lar              |
| `apps/mobile/src/navigation/mobile-auth-navigation-types.ts`             | Auth stack param list                                                         |
| `apps/mobile/src/navigation/mobile-auth-navigator.tsx`                   | 4 ekranlı native-stack                                                        |
| `apps/mobile/component-tests/auth-welcome-screen.test.tsx`               | 2a davranış/tema testleri                                                     |
| `apps/mobile/component-tests/auth-login-screen.test.tsx`                 | 2b doğrulama/2FA/Turnstile testleri                                           |
| `apps/mobile/component-tests/auth-register-screen.test.tsx`              | 2c doğrulama/sözleşme testleri                                                |
| `apps/mobile/component-tests/auth-forgot-password-screen.test.tsx`       | 2d başarı/cooldown/TTL testleri                                               |
| `apps/mobile/component-tests/mobile-auth-semantic-role-gate.test.tsx`    | 2a-2d koyu tema semantic role gate                                            |
| `apps/mobile/scripts/mobile-auth-screens-contract.ts` + `.test.ts`       | testID + no-dummy-data + locale parity sözleşmesi                             |
| `apps/web/src/lib/mobile/auth-two-factor.test.ts`                        | Login'de 2FA red-green testleri                                               |

### Değiştirilecek

| Dosya                                                                  | Değişiklik                                                                                          |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `packages/types/src/mobile.ts`                                         | Login request'e `turnstileToken` (zorunlu) + `twoFactorCode` (opsiyonel); register'a `turnstileToken`; forgot response'a `resetLinkTtlMinutes` |
| `apps/web/src/lib/mobile/auth.ts`                                      | `createMobilePasswordSession` 2FA kontrolü; `requestMobilePasswordReset` TTL döndürür                |
| `apps/web/src/app/api/v1/mobile/auth/login/route-logic.ts`             | Turnstile doğrulaması (`action: "login"`)                                                            |
| `apps/web/src/app/api/v1/mobile/auth/register/route-logic.ts`          | Turnstile doğrulaması (`action: "register"`)                                                         |
| `apps/web/src/lib/auth/password-reset.ts`                              | `PASSWORD_RESET_TOKEN_EXPIRY_MINUTES` export edilir (zaten tanımlı)                                  |
| `apps/mobile/package.json`                                             | `expo-linear-gradient` + `react-native-webview` eklenir                                              |
| `apps/mobile/src/design/palette.ts`                                    | Auth renk primitifleri (gradyan uçları, profil aksanları, özellik chip noktaları) açık+koyu          |
| `apps/mobile/src/design/tokens.ts`                                     | `mobileLayoutMetrics` içine auth ölçü grubu; auth tipografi rolleri                                  |
| `apps/mobile/src/design/themes.ts`                                     | `MobileTheme`'e auth rolleri (`gradients.authPrimaryAction*`, `authProfile`, `authFeature`) + iki tema değerleri |
| `apps/mobile/src/config/environment.ts`                                | `turnstileSiteKey` alanı (`EXPO_PUBLIC_WHISPR_TURNSTILE_SITE_KEY`)                                   |
| `apps/mobile/scripts/validate-mobile-env.ts`                           | Yeni env değişkeni doğrulaması                                                                       |
| `apps/mobile/src/auth/mobile-auth-exchange.ts`                         | `turnstileToken`/`twoFactorCode` geçişi                                                              |
| `apps/mobile/src/auth/mobile-auth-context.tsx`                         | `signInWithPassword` `requiresTwoFactor` sonucu; `registerWithPassword` Turnstile; forgot TTL geçişi |
| `apps/mobile/src/navigation/mobile-navigator.tsx`                      | `AuthGate` → `MobileAuthNavigator`                                                                   |
| `apps/mobile/src/locale/mobile-copy.ts`                                | Tüm yeni auth string'leri (tr+en)                                                                    |
| `apps/mobile/scripts/mobile-redesign-extract.ts`                       | `referenceAnchors`'a 2a-2d (light) eklenir                                                           |
| `apps/mobile/scripts/mobile-redesign-semantic-role-gate.ts`            | `DARK_SCREEN_SEMANTIC_ROLE_TARGETS`'a 2a-2d; `anchor` tipi genişletilir                              |
| `apps/mobile/scripts/mobile-maestro-testid-contract.test.ts`           | Yeni Karşılama→Giriş navigasyon adımı ve auth testID'leri                                            |
| `.maestro/helpers/login-uat.yml`                                       | Karşılama → Giriş adımı eklenir                                                                      |

### Silinecek

| Dosya                                                | Gerekçe                                                    |
| ---------------------------------------------------- | ---------------------------------------------------------- |
| `apps/mobile/src/app/screens/auth-gate.tsx`          | Dört ayrı ekranla tamamen ikame edilir                     |
| `apps/mobile/src/app/screens/auth-gate.styles.ts`    | Aynı                                                        |
| `apps/mobile/component-tests/auth-gate.test.tsx`     | Yerine dört ekran testi geçer                              |

---

## FAZ -1 — CAPABILITY GATE: 2FA, TURNSTILE, RESET TTL

A1-A4 yeşil olmadan FAZ 0 veya ekran görevleri başlamaz. Tasarımın gösterdiği her kontrol bu fazda gerçek bir yola bağlanır; hiçbiri "API yok" gerekçesiyle dekoratif bırakılamaz.

### Task A1: Auth şemalarını genişlet

**Files:**

- Modify: `packages/types/src/mobile.ts:109-116` (login), `:118-129` (register), forgot-password response bloğu
- Modify: `packages/types/src/mobile.test.ts` (yoksa oluştur — mevcut test dosyası adını `ls packages/types/src` ile doğrula)

**Produces:** `MobileAuthPasswordLoginRequestSchema` `{email, password, turnstileToken, twoFactorCode?}`; `MobileAuthRegisterRequestSchema` `{..., turnstileToken}`; `MobileAuthForgotPasswordResponseSchema` `{..., resetLinkTtlMinutes?}`.

- [ ] **Step 1: Kırmızı şema testleri yaz** — `turnstileToken` eksikken login/register reject; bounded `twoFactorCode` (1-64, trim) accept; boş `twoFactorCode` reject; `resetLinkTtlMinutes` pozitif tamsayı değilse reject.

```ts
assert.equal(
  MobileAuthPasswordLoginRequestSchema.safeParse({ email: "a@b.co", password: "12345678" }).success,
  false,
);
assert.equal(
  MobileAuthPasswordLoginRequestSchema.safeParse({
    email: "a@b.co",
    password: "12345678",
    turnstileToken: "t",
  }).success,
  true,
);
assert.equal(
  MobileAuthForgotPasswordResponseSchema.safeParse({
    email: "a@b.co",
    message: "m",
    resetLinkTtlMinutes: 0,
    status: "accepted",
  }).success,
  false,
);
```

- [ ] **Step 2: Kırmızıyı doğrula**

```powershell
corepack pnpm --filter @wizards/types test
```

Beklenen: yeni alanlar bulunmadığı için FAIL.

- [ ] **Step 3: Şemaları uygula**

```ts
export const MobileAuthPasswordLoginRequestSchema = z.object({
  email: MobileAuthEmailSchema,
  password: MobileAuthPasswordSchema,
  turnstileToken: z.string().min(1, "validation.turnstile.required"),
  twoFactorCode: z.string().trim().min(1).max(64).optional(),
});
```

`MobileAuthRegisterRequestSchema` nesnesine `turnstileToken: z.string().min(1, "validation.turnstile.required")` eklenir (mevcut `.refine` zinciri korunur). `MobileAuthForgotPasswordResponseSchema`'ya `resetLinkTtlMinutes: z.number().int().positive().optional()` eklenir.

> 2FA gereksinimi ayrı bir response şeması DEĞİL, `code: "TWO_FACTOR_REQUIRED"` taşıyan HTTP hatasıdır — mevcut `INVALID_CREDENTIALS` yolu ile aynı; `MobileApiError.serverCode` bunu istemciye zaten taşıyor.

- [ ] **Step 4: Yeşil doğrulama ve commit**

```powershell
corepack pnpm --filter @wizards/types test
corepack pnpm --filter @wizards/types typecheck
git add packages/types/src
git commit -m "feat(types): add mobile auth turnstile, 2FA and reset TTL contracts"
```

### Task A2: Mobil login'de 2FA zorunluluğu

**Files:**

- Modify: `apps/web/src/lib/mobile/auth.ts:109-119` (`MobilePasswordAuthUser`, `MobileNativeAuthOptions`), `:421-437` (`loadMobilePasswordAuthUser` select), `:675-741` (`createMobilePasswordSession`)
- Create: `apps/web/src/lib/mobile/auth-two-factor.test.ts`

**Produces:** 2FA açık kullanıcı için `twoFactorCode` yoksa `TWO_FACTOR_REQUIRED` (401), yanlışsa `TWO_FACTOR_INVALID` (401); doğru TOTP **veya** recovery code ile oturum. Mevcut `verifyTwoFactorCredential` (`apps/web/src/lib/auth/two-factor.ts:371`) yeniden kullanılır — yeni kripto/rate-limit yazılmaz (o fonksiyon TOTP + recovery code + attempt tracker'ı zaten kapsıyor).

- [ ] **Step 1: Kırmızı testleri yaz** — mevcut `apps/web` test desenini (`src/lib/mobile/*.test.ts` komşularını oku; injectable `loadUserByEmail`/`comparePassword` deseni mevcut) izleyerek:
  - 2FA açık + kod yok → `MobileNativeAuthError` `TWO_FACTOR_REQUIRED`/401
  - 2FA açık + yanlış kod → `TWO_FACTOR_INVALID`/401
  - 2FA açık + doğru kod (`verifyTwoFactor` stub `{success:true}`) → session döner
  - 2FA kapalı → mevcut davranış aynen (regresyon)
  - Yanlış şifre + 2FA açık → hâlâ `null` (2FA hatası şifre hatasını maskelemez, kullanıcı varlığı ifşa olmaz)
- [ ] **Step 2: Kırmızıyı doğrula**

```powershell
corepack pnpm --filter @wizards/web exec node --import tsx --test src/lib/mobile/auth-two-factor.test.ts
```

- [ ] **Step 3: Kullanıcı tipini, select'i ve enjekte edilebilir bağımlılığı genişlet**

```ts
import { verifyTwoFactorCredential } from "@/lib/auth/two-factor";

interface MobilePasswordAuthUser extends MobileAuthUser {
  email: string;
  locale: string | null;
  passwordHash: string | null;
  twoFactorEnabled: boolean;
  twoFactorSecret: string | null;
}

interface MobileNativeAuthOptions extends MobileAuthOptions {
  comparePassword?: (password: string, passwordHash: string) => Promise<boolean>;
  loadUserByEmail?: (email: string) => Promise<MobilePasswordAuthUser | null>;
  loginAttemptStore?: AttemptStore;
  verifyTwoFactor?: typeof verifyTwoFactorCredential;
}
```

`loadMobilePasswordAuthUser` select'ine `twoFactorEnabled: true, twoFactorSecret: true` eklenir.

- [ ] **Step 4: 2FA kontrolünü şifre doğrulamasından SONRA, `resetMobileLoginAttemptFailures`'tan ÖNCE ekle**

```ts
export async function createMobilePasswordSession(
  input: { email: string; password: string; twoFactorCode?: string },
  options: MobileNativeAuthOptions = {},
) {
  // ...mevcut rate-limit, kullanıcı yükleme ve şifre doğrulama blokları AYNEN korunur...

  if (user.twoFactorEnabled) {
    if (!input.twoFactorCode) {
      throw new MobileNativeAuthError(
        "TWO_FACTOR_REQUIRED",
        401,
        "Two-factor verification is required.",
      );
    }

    const verifyTwoFactor = options.verifyTwoFactor ?? verifyTwoFactorCredential;
    const result = await verifyTwoFactor({
      code: input.twoFactorCode,
      secret: user.twoFactorSecret,
      userId: user.id,
    });

    if (!result.success) {
      throw new MobileNativeAuthError(
        "TWO_FACTOR_INVALID",
        401,
        "The two-factor code is invalid or expired.",
      );
    }
  }

  const redis = getMobileAuthRedis(options);
  const response = MobileAuthPasswordLoginResponseSchema.parse({
    session: await createMobileSessionSnapshot(user, { nowMs, redis }, options),
  });
  await resetMobileLoginAttemptFailures({ email, store: loginAttemptStore });
  return response;
}
```

- [ ] **Step 5: Route-logic'in yeni alanı geçirdiğini doğrula** — `login/route-logic.ts` body'yi olduğu gibi `createPasswordSession(body)`'ye veriyor; `MobileNativeAuthError` zaten `jsonError` ile `code`/`status` taşıyor. Ek değişiklik gerekmiyorsa route-logic testine `TWO_FACTOR_REQUIRED` yanıt gövdesi assertion'ı eklenir.
- [ ] **Step 6: Yeşil doğrulama ve commit**

```powershell
corepack pnpm --filter @wizards/web exec node --import tsx --test src/lib/mobile/auth-two-factor.test.ts
corepack pnpm --filter @wizards/web typecheck
corepack pnpm --filter @wizards/web test
git add apps/web/src/lib/mobile packages/types
git commit -m "feat(web): enforce 2FA at mobile login with existing TOTP verification"
```

### Task A3: Mobil login/register'da Turnstile doğrulaması

**Files:**

- Modify: `apps/web/src/app/api/v1/mobile/auth/login/route-logic.ts`
- Modify: `apps/web/src/app/api/v1/mobile/auth/register/route-logic.ts`
- Modify: ilgili `route-logic.test.ts` dosyaları

**Produces:** Her iki mobil route request-katmanında `verifyTurnstileToken(token, ip, {expectedAction})` çağırır; başarısızlıkta `TURNSTILE_FAILED` (400). Doğrulama kimlik bilgilerinden bağımsız bir istek şartıdır → route katmanında yapılır (web'in kendi `loginAction`/`registerAction`'ı ile aynı yer).

- [ ] **Step 1: `apps/web`'in IP çıkarma ve E2E bypass desenini oku**

```powershell
rg -n "verifyTurnstileToken\(|E2E_TURNSTILE_TOKEN|getClientIp" apps/web/src
```

Mevcut helper AYNEN yeniden kullanılır; yeni IP çıkarma fonksiyonu yazılmaz. E2E bypass token'ı (`turnstile-e2e.ts`) yeni testlerde de kullanılır.

- [ ] **Step 2: Kırmızı route testleri yaz** — token yokken 400 `TURNSTILE_FAILED`; geçersiz token 400; geçerli/E2E token ile mevcut akış; Turnstile başarısızlığının kimlik doğrulamadan ÖNCE çalıştığı (yani `createPasswordSession` hiç çağrılmadığı).
- [ ] **Step 3: Kırmızıyı doğrula**

```powershell
corepack pnpm --filter @wizards/web exec node --import tsx --test src/app/api/v1/mobile/auth/login/route-logic.test.ts src/app/api/v1/mobile/auth/register/route-logic.test.ts
```

- [ ] **Step 4: Doğrulamayı enjekte edilebilir bağımlılık olarak ekle** (mevcut dependencies deseni korunur)

```ts
import { TurnstileVerificationError, verifyTurnstileToken } from "@/lib/auth/turnstile";

export type MobilePasswordLoginRouteDependencies = {
  createPasswordSession: (input: MobileAuthPasswordLoginRequest) => ReturnType<typeof createMobilePasswordSession>;
  enforceIpRateLimit: (request: Request) => Promise<void>;
  parseLoginRequest: (request: Request) => Promise<MobileAuthPasswordLoginRequest>;
  verifyTurnstile: (request: Request, token: string) => Promise<void>;
};
```

`mobilePasswordLoginRoute` içinde, `parseLoginRequest`'ten hemen sonra:

```ts
try {
  await dependencies.verifyTurnstile(request, body.turnstileToken);
} catch (error) {
  if (error instanceof TurnstileVerificationError) {
    throw new ApiError("Human verification failed.", 400, "TURNSTILE_FAILED");
  }
  throw error;
}
```

Default dependency `verifyTurnstileToken`'ı `expectedAction: "login"` (register'da `"register"`) ve Step 1'de bulunan gerçek IP helper'ı ile çağırır.

- [ ] **Step 5: Yeşil doğrulama ve commit**

```powershell
corepack pnpm --filter @wizards/web exec node --import tsx --test src/app/api/v1/mobile/auth/login/route-logic.test.ts src/app/api/v1/mobile/auth/register/route-logic.test.ts
corepack pnpm --filter @wizards/web typecheck
git add apps/web/src/app/api/v1/mobile/auth
git commit -m "feat(web): verify Cloudflare Turnstile on mobile login and register"
```

### Task A4: Sıfırlama TTL'i, sosyal sağlayıcı konfigi ve mobil istemci geçişi

**Files:**

- Modify: `apps/web/src/lib/auth/password-reset.ts:13` (export)
- Modify: `apps/web/src/lib/mobile/auth.ts:871-917` (`requestMobilePasswordReset`)
- Create: `apps/mobile/src/auth/mobile-auth-social-config.ts`
- Modify: `apps/mobile/src/auth/mobile-auth-exchange.ts`
- Modify: `apps/mobile/src/auth/mobile-auth-context.tsx`
- Modify: `apps/mobile/scripts/mobile-auth-context.test.ts`

**Produces:** Forgot-password yanıtı gerçek `resetLinkTtlMinutes` taşır (e-posta varlığı ifşa etmeyen tek tip yanıt korunur); `MOBILE_AUTH_SOCIAL_PROVIDERS`; context `signInWithPassword` `{ok:false, requiresTwoFactor}` sonucu ve `turnstileToken` geçişi.

- [ ] **Step 1: Kırmızı testleri yaz** — `requestMobilePasswordReset` hem kayıtlı hem kayıtsız e-posta için AYNI `resetLinkTtlMinutes: 60` taşır; `signInWithPassword` `TWO_FACTOR_REQUIRED` serverCode'unda `requiresTwoFactor: true` döner; `TWO_FACTOR_INVALID`'de 2FA hata metni döner.
- [ ] **Step 2: TTL'i yanıta taşı**

```ts
import { PASSWORD_RESET_TOKEN_EXPIRY_MINUTES } from "@/lib/auth/password-reset";

const genericResponse = MobileAuthForgotPasswordResponseSchema.parse({
  email,
  message: "password_reset_if_available",
  resetLinkTtlMinutes: PASSWORD_RESET_TOKEN_EXPIRY_MINUTES,
  status: "accepted",
});
```

Fonksiyonun her iki dönüş yolu da bu tek `genericResponse`'u kullanmaya devam eder (enumeration koruması bozulmaz).

- [ ] **Step 3: Sosyal konfig modülünü yaz**

```ts
export type MobileAuthSocialProviderId = "google";

export interface MobileAuthSocialProvider {
  readonly iconName: "logo-google";
  readonly id: MobileAuthSocialProviderId;
  readonly labelCopyKey: "authSocialGoogle";
  readonly testID: string;
}

/**
 * Yalnızca gerçekten çalışan entegrasyonu olan sağlayıcı buraya eklenir
 * (README_AUTH §3 2b: "entegre olmayan sağlayıcı gösterilmez").
 * Bugün mobilde native OAuth SDK'sı yoktur; Google web hand-off'u ile çalışır.
 */
export const MOBILE_AUTH_SOCIAL_PROVIDERS: readonly MobileAuthSocialProvider[] = [
  {
    iconName: "logo-google",
    id: "google",
    labelCopyKey: "authSocialGoogle",
    testID: "mobile-auth-social-google",
  },
];
```

- [ ] **Step 4: Exchange ve context'i geçir**

`mobile-auth-exchange.ts`: `signInMobileWithPassword` input'u `{email, password, turnstileToken, twoFactorCode?}`; `registerMobileWithPassword` input'una `turnstileToken: string`.

`mobile-auth-context.tsx`:

```tsx
import { MobileApiError } from "../api/mobile-api-client";

const signInWithPassword = useCallback(
  async (input: {
    email: string;
    password: string;
    turnstileToken: string;
    twoFactorCode?: string;
  }) => {
    try {
      const session = await signInMobileWithPassword(createUnauthenticatedClient(), input);
      await repository.save(session);
      commitAuthState(createMobileAuthState("signed-in", session));
      return { ok: true } as const;
    } catch (error) {
      const serverCode = error instanceof MobileApiError ? error.serverCode : null;
      const requiresTwoFactor = serverCode === "TWO_FACTOR_REQUIRED";
      const invalidTwoFactor = serverCode === "TWO_FACTOR_INVALID";
      commitAuthState(createMobileAuthState("signed-out", null, "Giris tamamlanamadi."));
      return {
        message: invalidTwoFactor
          ? activeMobileCopy.authTwoFactorInvalidCode
          : activeMobileCopy.authInvalidCredentials,
        ok: false,
        requiresTwoFactor,
      } as const;
    }
  },
  [commitAuthState, createUnauthenticatedClient, repository],
);
```

`MobileAuthContextValue` arayüzünde `signInWithPassword` dönüşü `{ok:true} | {message:string; ok:false; requiresTwoFactor:boolean}` olarak güncellenir; `registerWithPassword` input'una `turnstileToken: string` eklenir; `requestPasswordReset` dönüşü `{email, ok:true, resetLinkTtlMinutes?:number}` taşır.

- [ ] **Step 5: Yeşil doğrulama ve commit**

```powershell
corepack pnpm --filter @wizards/web test
corepack pnpm --filter @wizards/mobile test
corepack pnpm --filter @wizards/mobile typecheck
git add apps/web/src/lib apps/mobile/src/auth apps/mobile/scripts/mobile-auth-context.test.ts
git commit -m "feat(mobile): thread turnstile, 2FA and reset TTL through auth context"
```

**Gate:** A1-A4'ün types/web/mobile typecheck+test komutları yeşil değilse FAZ 0'a geçilmez.

---

## FAZ 0 — ZEMİN: AUTH TOKEN ROLLERİ VE PAYLAŞILAN KIT

Semantic role gate ekran/style kaynağında ham hex'i ve tema ağacında karşılığı olmayan ham sayısal ölçüyü reddeder. Bu yüzden **önce** her auth rengi ve ölçüsü token/tema rolü olur; ekranlar yalnız rolleri tüketir (README_AUTH §6.1: "auth'a özel kopya oluşturma").

### Task 1: Auth renk rolleri (palette + theme)

**Files:**

- Modify: `apps/mobile/src/design/palette.ts`
- Modify: `apps/mobile/src/design/themes.ts:36-139` (arayüz), lightTheme ve darkTheme nesneleri
- Modify: `apps/mobile/scripts/mobile-redesign-theme-contract.test.ts`

**Produces:** `theme.gradients.authPrimaryAction`, `theme.gradients.authPrimaryActionMuted`, `theme.authProfile.{personal,gamer,corporate}.{icon,iconSoft,badgeText,badgeSoft,badgeBorder}`, `theme.authFeature.{encryption,realtime,community,fileShare,voice}` — iki temada da tanımlı.

- [ ] **Step 1: Değerleri kanonik HTML'den oku**

```powershell
rg -n 'id="2a"' -A 400 "design_handoff_whispr_mobile/Whispr Mobile Redesign.dc.html" | rg -n "linear-gradient|#[0-9A-Fa-f]{6}" | head -60
```

README_AUTH §2'deki değerler başlangıç noktasıdır; HTML ile çelişirse **HTML kazanır**.

- [ ] **Step 2: Palette primitiflerini ekle**

```ts
/** README_AUTH §2 + HTML #2a-#2d inline değerleri — birebir. */
export const redesignAuthLight = {
  gradientFrom: "#7C6CF6",
  gradientTo: "#4F46E5",
  gradientMutedFrom: "#6D5DF6",
  gradientMutedTo: "#4338CA",
  profileGamerFg: "#D6318C",
  profileGamerSoft: "#FCE7F1",
  profileGamerBorder: "#F5C8DF",
  profileCorporateFg: "#2373D6",
  profileCorporateSoft: "#E3F0FD",
  profileCorporateBorder: "#C7E0FA",
  featureEncryption: "#22A366",
  featureRealtime: "#8A46E5",
  featureCommunity: "#E0529C",
  featureFileShare: "#4F9CF6",
  featureVoice: "#E5A346",
} as const;
```

Koyu tema: README_AUTH §2 yalnız yüzey/kenarlık/metin rollerini yeniden tanımlar ve birincil gradyanın "aynı kaldığını" açıkça söyler. Bu yüzden `redesignAuthDark` gradyan ve özellik/profil aksan hue'larını **aynı** tutar, yalnız rozet zeminlerini koyu yüzeye taşır:

```ts
export const redesignAuthDark = {
  ...redesignAuthLight,
  profileGamerSoft: redesignDark.card,
  profileGamerBorder: redesignDark.border,
  profileCorporateSoft: redesignDark.card,
  profileCorporateBorder: redesignDark.border,
} as const;
```

- [ ] **Step 3: `MobileTheme` arayüzüne rolleri ekle** (mevcut roller korunur)

```ts
export interface MobileAuthProfileAccent {
  readonly badgeBorder: string;
  readonly badgeSoft: string;
  readonly badgeText: string;
  readonly icon: string;
  readonly iconSoft: string;
}

export interface MobileTheme {
  // ...mevcut alanlar aynen...
  readonly authFeature: {
    readonly community: string;
    readonly encryption: string;
    readonly fileShare: string;
    readonly realtime: string;
    readonly voice: string;
  };
  readonly authProfile: {
    readonly corporate: MobileAuthProfileAccent;
    readonly gamer: MobileAuthProfileAccent;
    readonly personal: MobileAuthProfileAccent;
  };
  readonly gradients: {
    readonly appBackground: readonly [string, string];
    readonly authPrimaryAction: readonly [string, string];
    readonly authPrimaryActionMuted: readonly [string, string];
    readonly primaryAction: readonly [string, string];
    readonly softSurface: readonly [string, string];
  };
}
```

`personal` aksanı yeni hex getirmez; mevcut `accent.default`/`accent.soft` rollerinden beslenir.

- [ ] **Step 4: İki temayı doldur ve contract testini genişlet** — theme key-parity testi `lightTheme`/`darkTheme` anahtar kümelerinin özdeşliğini zaten kontrol ediyor; auth rolleri için de geçmeli. `satisfies MobileTheme` eksik alanı derleme zamanında yakalar.
- [ ] **Step 5: Doğrula ve commit**

```powershell
corepack pnpm --filter @wizards/mobile exec node --test --import tsx scripts/mobile-redesign-theme-contract.test.ts
corepack pnpm --filter @wizards/mobile typecheck
git add apps/mobile/src/design/palette.ts apps/mobile/src/design/themes.ts apps/mobile/scripts/mobile-redesign-theme-contract.test.ts
git commit -m "feat(mobile): add auth color roles to shared theme"
```

### Task 2: Auth ölçü ve tipografi rolleri

**Files:**

- Modify: `apps/mobile/src/design/tokens.ts:61+` (`mobileLayoutMetrics`), `mobileTypography`
- Modify: `apps/mobile/scripts/mobile-redesign-theme-contract.test.ts`

**Produces:** `mobileLayoutMetrics.auth.*` ve auth tipografi rolleri — böylece ekran style'larındaki her sayısal ölçünün tema ağacında karşılığı olur (semantic gate şartı).

- [ ] **Step 1: Ölçüleri HTML'den oku ve `mobileLayoutMetrics`'e adlandırılmış grup olarak ekle**

```ts
export const mobileLayoutMetrics = {
  // ...mevcut border/fixed/opacity grupları aynen...
  /**
   * README_AUTH §2-§3 ölçüleri. Auth akışının koyu HTML frame'i yoktur; bu
   * ölçüler semantic role gate'in doğrulayabilmesi için adlandırılmış kalır.
   */
  auth: {
    backButton: 42,
    backButtonRadius: 15,
    ctaHeight: 56,
    ctaRadius: 28,
    featureChipRadius: 18,
    featureDot: 7,
    fieldRadius: 16,
    focusRingRadius: 3,
    heroGap: 22,
    heroPadding: 30,
    iconCard: 72,
    iconCardRadius: 26,
    inputPaddingVertical: 13,
    labelGap: 7,
    logoSquircle: 56,
    logoSquircleRadius: 18,
    profileCheck: 18,
    profileIcon: 30,
    profileRadius: 18,
    themePillRadius: 20,
    topBarLogo: 32,
  },
} as const;
```

> Değerler README_AUTH'tan türetilmiştir; her biri HTML'deki karşılığıyla doğrulanır ve fark varsa HTML değeri yazılır. Aralık verilen ölçülerde (ör. "54–56px") HTML'in ölçtüğü tek değer alınır.

- [ ] **Step 2: Auth tipografi rollerini ekle**

```ts
export const mobileTypography = {
  // ...mevcut roller aynen...
  authEyebrow: {
    fontFamily: "WhisprJakarta_700Bold",
    fontSize: 11,
    letterSpacing: 1.98, // .18em × 11px
    lineHeight: 14,
  },
  authHeroTitle: {
    fontFamily: "WhisprJakarta_800ExtraBold",
    fontSize: 40,
    letterSpacing: -1.2, // -.03em × 40px
    lineHeight: 44.8, // 1.12
  },
  authHeroBody: { fontFamily: "WhisprJakarta_400Regular", fontSize: 16, lineHeight: 24.8 },
  authTitle: {
    fontFamily: "WhisprJakarta_800ExtraBold",
    fontSize: 29,
    letterSpacing: -0.58, // -.02em × 29px
    lineHeight: 36,
  },
  authSubtitle: { fontFamily: "WhisprJakarta_400Regular", fontSize: 13.5, lineHeight: 19 },
  authFieldLabel: { fontFamily: "WhisprJakarta_700Bold", fontSize: 13, lineHeight: 18 },
  authInput: { fontFamily: "WhisprJakarta_400Regular", fontSize: 14.5, lineHeight: 20 },
  authCta: { fontFamily: "WhisprJakarta_700Bold", fontSize: 16, lineHeight: 22 },
} as const;
```

- [ ] **Step 3: Doğrula ve commit**

```powershell
corepack pnpm --filter @wizards/mobile exec node --test --import tsx scripts/mobile-redesign-theme-contract.test.ts
corepack pnpm --filter @wizards/mobile typecheck
git add apps/mobile/src/design/tokens.ts apps/mobile/scripts/mobile-redesign-theme-contract.test.ts
git commit -m "feat(mobile): add auth layout and typography roles"
```

### Task 3: Bağımlılıklar ve Turnstile env'i

**Files:**

- Modify: `apps/mobile/package.json`, `pnpm-lock.yaml`
- Modify: `apps/mobile/src/config/environment.ts`
- Modify: `apps/mobile/scripts/validate-mobile-env.ts` ve ilgili env contract testi

**Produces:** `expo-linear-gradient`, `react-native-webview`; `runtimeConfig.turnstileSiteKey`.

- [ ] **Step 1: Expo-uyumlu sürümlerle kur**

```powershell
corepack pnpm --filter @wizards/mobile exec expo install expo-linear-gradient react-native-webview
```

- [ ] **Step 2: Env alanını ekle**

`MobileEnvironmentConfig`'e `turnstileSiteKey: string | null`; `BuildMobileEnvironmentConfigInput`'a `publicTurnstileSiteKey?: string`; `buildMobileEnvironmentConfig` dönüşüne `turnstileSiteKey: input.publicTurnstileSiteKey?.trim() || null`; `getMobileRuntimeConfig`'e `publicTurnstileSiteKey: process.env.EXPO_PUBLIC_WHISPR_TURNSTILE_SITE_KEY`.

- [ ] **Step 3: `validate-mobile-env.ts` desenini oku ve yeni değişkeni mevcut listeye ekle** — release ortamlarında site key'in zorunlu olduğu doğrulanır (dev'de opsiyonel; anahtarsız durumda widget hata durumunu gösterir, sahte "doğrulandı" göstermez).
- [ ] **Step 4: Doğrula ve commit**

```powershell
corepack pnpm --filter @wizards/mobile exec expo install --check
corepack pnpm --filter @wizards/mobile typecheck
corepack pnpm --filter @wizards/mobile test
git add apps/mobile/package.json apps/mobile/src/config/environment.ts apps/mobile/scripts pnpm-lock.yaml
git commit -m "chore(mobile): add gradient/webview deps and turnstile site key config"
```

### Task 4: Paylaşılan auth kit

**Files:**

- Create: `apps/mobile/src/app/components/kit/auth/` altındaki 12 bileşen + `index.ts` (bkz. Dosya Haritası)
- Create: `apps/mobile/component-tests/mobile-auth-kit.test.tsx`

**Produces:** `AuthScreenBackground`, `AuthTopBar`, `AuthEyebrowHeader`, `AuthPrimaryButton`, `AuthSecondaryButton`, `AuthTextField`, `AuthCheckbox`, `AuthProfileTypeSelector`, `AuthPasswordStrengthRow` + `isMobileAuthPasswordStrong`, `AuthTurnstileCard`, `AuthSecurityCard`, `AuthInfoBanner`.

**Ortak kurallar (hepsi için):** `useThemedStyles(createXStyles)` + `createXStyles = (theme: MobileTheme) => ({...})` deseni (mevcut kit ve `auth-gate.styles.ts` ile aynı); **hiç ham hex/rgba yok**; her sayısal ölçü `theme.layout.auth.*`/`theme.radii.*`/`theme.sizing.*`/`theme.typography.*`'ten gelir; her ikon butonu `accessibilityLabel` + `accessibilityRole` taşır; dokunma hedefleri ≥`theme.sizing.minTouchTarget`.

- [ ] **Step 1: Kırmızı kit testini yaz** — `mobile-auth-kit.test.tsx`:
  - `AuthPrimaryButton` `busy` iken spinner gösterir, `onPress` çağrılmaz, `accessibilityState.busy` true
  - `AuthTextField` `secureTextEntry` iken göz toggle'ı `secureTextEntry`'yi çevirir ve label erişilebilirlik adı olur
  - `AuthTextField` `errorMessage` verildiğinde hata metnini ve hata kenarlığını gösterir
  - `AuthCheckbox` `accessibilityRole="checkbox"` + `accessibilityState.checked` taşır
  - `isMobileAuthPasswordStrong` sınır durumları: 7 karakter → false; harf+rakam+özel+≥8 → true; yalnız harf → false
  - `AuthProfileTypeSelector` seçili seçenekte `accessibilityState.selected` true, PREVIEW rozetleri yalnız preview seçeneklerinde
- [ ] **Step 2: Kırmızıyı doğrula**

```powershell
corepack pnpm --filter @wizards/mobile test:components -- mobile-auth-kit --runInBand
```

- [ ] **Step 3: Arkaplan, top bar, header, butonlar**

`AuthScreenBackground`: mevcut `auth-gate.tsx`'teki `AuthScreenLayout`'un glow+dot yaklaşımı taşınır (RN'de `radial-gradient` yoktur; README_AUTH §2 katmanlı arkaplanı bu şekilde yaklaşıklanır — Tur 1'de kabul edilmiş desen). Props: `{centered?, children, scrollable?, testID}`. `scrollable` 2b/2c için `ScrollView` + `keyboardShouldPersistTaps="handled"`, diğerlerinde `View`. `KeyboardAvoidingView` iOS'ta `padding`.

`AuthPrimaryButton` props: `{busy?, disabled?, gradient?, iconName?, label, onPress, testID}`; `LinearGradient` `colors={gradient ?? theme.gradients.authPrimaryAction}`, `start={{x:0,y:0}} end={{x:1,y:0}}` (90deg); yükseklik `theme.layout.auth.ctaHeight`, radius `theme.layout.auth.ctaRadius`, gölge `theme.elevation.primaryAction`; `busy` iken `ActivityIndicator`, değilse `label` + sağda ikon.

`AuthSecondaryButton`: aynı ölçüler, `theme.surface.card` + `theme.border.subtle`, opsiyonel sol ikon (2a "Hesap Oluştur" kişi+ ikonu).

`AuthTopBar`: sol 42px geri butonu, orta 32px logo + "Whispr", sağda 42px denge boşluğu.

`AuthEyebrowHeader`: `theme.typography.authEyebrow` + `authTitle` + `authSubtitle`, ortalanmış.

- [ ] **Step 4: Alan, checkbox, profil seçici, şifre gücü**

`AuthTextField`: etiket (`authFieldLabel`, altında `theme.layout.auth.labelGap`), shell (`theme.surface.card`, `theme.border.subtle`, `theme.layout.auth.fieldRadius`), sol 18px ikon `theme.text.placeholder`, odakta `theme.border.focus` + halka, `errorMessage` varken `theme.status.danger` kenarlık + `theme.typography` ile 12.5px hata metni. Odak state'i bileşen içinde tutulur.

`AuthPasswordStrengthRow` + saf `isMobileAuthPasswordStrong`: README_AUTH §3 2c — "harf + rakam + özel karakter, ≥8"; kurallar karşılanana dek ikon `theme.text.placeholder`, karşılanınca `theme.status.success`. Tek satır (ikon + cümle); Tur 1'deki çok durumlu bar/etiket UI'ı kullanılmaz.

```ts
export function isMobileAuthPasswordStrong(password: string): boolean {
  return (
    password.length >= 8 &&
    /[a-zA-Z]/.test(password) &&
    /\d/.test(password) &&
    /[^A-Za-z0-9]/.test(password)
  );
}
```

`AuthProfileTypeSelector`: 3 eşit sütun; seçili → `theme.accent.soft` zemin + `theme.accent.default` 1.5px kenarlık + sağ-alt taşan onay rozeti; preview seçenekler → sağ-üstte `theme.authProfile.{gamer,corporate}` rozet rolleri. Seçenek listesi ve `preview` bayrağı tek noktada (bkz. kapsam kararı 6).

- [ ] **Step 5: Turnstile kartı — gerçek widget**

`AuthTurnstileCard` props: `{action: "login" | "register", onVerify: (token: string|null) => void}`. `runtimeConfig.turnstileSiteKey` yoksa veya widget hata verirse: hata ikonu + `copy.authTurnstileError` gösterilir ve `onVerify(null)` çağrılır (sahte "doğrulandı" durumu YOKTUR). WebView `source={{html}}` ile Cloudflare'in kendi `api.js`'ini yükler; `success`/`error`/`expired` callback'leri `window.ReactNativeWebView.postMessage` ile JSON taşır; `onMessage` token'ı yukarı verir. Kart geometrisi: `theme.surface.card`, `theme.layout.auth.fieldRadius`, solda 22px widget, ortada 13px etiket, sağda Cloudflare rozeti.

- [ ] **Step 6: Güvenlik kartı ve bilgi bandı** — `AuthSecurityCard` mevcut `auth-gate.tsx`'teki `SecurityCard`'ın rol-temizlenmiş portu; `AuthInfoBanner` props `{iconColor?, iconName, testID?, text}`.
- [ ] **Step 7: Barrel'ı yaz ve yeşil doğrula**

```powershell
corepack pnpm --filter @wizards/mobile test:components -- mobile-auth-kit --runInBand
corepack pnpm --filter @wizards/mobile typecheck
```

- [ ] **Step 8: Commit**

```powershell
git add apps/mobile/src/app/components/kit/auth apps/mobile/component-tests/mobile-auth-kit.test.tsx
git commit -m "feat(mobile): add shared auth component kit"
```

---

## FAZ 1 — i18n STRING'LERİ VE EKRANLAR (2a-2d)

Ekranlar önce saf sunum bileşeni olarak kurulur ve component testleriyle izole doğrulanır; navigasyona bağlanmaları FAZ 2'dedir.

### Task 5: Auth copy (tr + en)

**Files:**

- Modify: `apps/mobile/src/locale/mobile-copy.ts`

**Produces:** Aşağıdaki anahtarlar **hem `tr` hem `en`** altında; `mobile-locale-preferences.test.ts` key-parity contract'ı zorunlu tutar.

- [ ] **Step 1: Yeni anahtarları ekle**

| Key | tr | en |
| --- | --- | --- |
| `authBackAction` | Geri | Back |
| `authWelcomeHeroTitleLine1` | Güvenli iletişim, | Secure communication, |
| `authWelcomeHeroTitleLine2` | herkes için. | for everyone. |
| `authWelcomeHeroSubtitle` | Uçtan uca şifreli mesajlaşma ile sevdiklerinle ve ekibinle güvenle bağlantıda kal. | Stay securely connected with the people and teams you care about, with end-to-end encrypted messaging. |
| `authWelcomeFeatureEncryption` | Uçtan Uca Şifreleme | End-to-End Encryption |
| `authWelcomeFeatureRealtime` | Gerçek Zamanlı | Real-Time |
| `authWelcomeFeatureCommunity` | Topluluk Odaları | Community Rooms |
| `authWelcomeFeatureFileShare` | Dosya & Ekran | Files & Screen |
| `authWelcomeFeatureVoice` | Sesli & Görüntülü | Voice & Video |
| `authWelcomeSignInAction` | Giriş Yap | Sign In |
| `authWelcomeCreateAccountAction` | Hesap Oluştur | Create Account |
| `authWelcomeCopyrightTemplate` | © {year} Whispr | © {year} Whispr |
| `authThemeToggleLight` | Açık | Light |
| `authThemeToggleDark` | Koyu | Dark |
| `authLoginEyebrow` | GÜVENLİ ERİŞİM | SECURE ACCESS |
| `authTwoFactorLinkAction` | 2FA veya yedek kod kullan | Use 2FA or a backup code |
| `authTwoFactorFieldLabel` | Doğrulama kodu | Verification code |
| `authTwoFactorFieldPlaceholder` | 6 haneli kod veya yedek kod | 6-digit code or backup code |
| `authTwoFactorRequiredNotice` | Hesabın iki adımlı doğrulama ile korunuyor. Kodunu gir. | Your account is protected by two-factor authentication. Enter your code. |
| `authTwoFactorInvalidCode` | Kod geçersiz veya süresi dolmuş. | That code is invalid or expired. |
| `authTurnstileLabel` | Gerçek kişi olduğunuzu doğrulayın | Verify you're human |
| `authTurnstileBrand` | CLOUDFLARE | CLOUDFLARE |
| `authTurnstileError` | Doğrulama yüklenemedi. Tekrar dene. | Verification failed to load. Try again. |
| `authSocialDividerLabel` | veya şununla devam et | or continue with |
| `authNoAccountPrompt` | Hesabınız yok mu? | Don't have an account? |
| `authFreeRegisterAction` | Ücretsiz oluşturun | Create one free |
| `authRegisterEyebrow` | GÜVENLİ BAŞLANGIÇ | SECURE START |
| `authUsernameFieldLabel` | Kullanıcı adı | Username |
| `authUsernameFieldPlaceholder` | Benzersiz kullanıcı adınızı girin | Enter a unique username |
| `authPasswordFieldLabel` | Şifre | Password |
| `authConfirmPasswordFieldLabel` | Şifre Tekrar | Confirm Password |
| `authPasswordMinLengthPlaceholder` | En az 8 karakter | At least 8 characters |
| `authLegalTermsLink` | Kullanım Şartları'nı | the Terms of Use |
| `authLegalAnd` | ve | and |
| `authLegalPrivacyLink` | Gizlilik Politikası'nı | the Privacy Policy |
| `authLegalSuffix` | okudum, kabul ediyorum. | — I have read and accept them. |
| `authForgotEyebrow` | ŞİFRE SIFIRLAMA | PASSWORD RESET |
| `authForgotScreenDescription` | E-postanı gir, sana bir sıfırlama bağlantısı gönderelim. | Enter your email and we'll send you a reset link. |
| `authForgotInfoTtlTemplate` | Bağlantı {minutes} dakika geçerlidir; hesabının uçtan uca şifreli verileri etkilenmez. | The link is valid for {minutes} minutes; your end-to-end encrypted data is never affected. |
| `authForgotSuccessTitle` | Bağlantı gönderildi — gelen kutunu kontrol et | Link sent — check your inbox |
| `authForgotResendAction` | Tekrar gönder | Resend |
| `authForgotResendCooldownTemplate` | Tekrar gönder ({seconds}sn) | Resend ({seconds}s) |
| `authBackToSignInAction` | Girişe dön | Back to sign in |

- [ ] **Step 2: Mevcut iki değeri mock'un birebir metnine çek** (tek tüketicisi Task 11'de silinecek `auth-gate.tsx`; güvenli)

```
authNativeForgotAction (tr): "Sıfırlama Bağlantısı Gönder"
authJoinDescription (tr): "Profilinizi seçin, hesabınızı oluşturun ve kaldığınız yerden başlayın."
```

- [ ] **Step 3: Key-parity contract'ını doğrula ve commit**

```powershell
corepack pnpm --filter @wizards/mobile exec node --test --import tsx scripts/mobile-locale-preferences.test.ts
git add apps/mobile/src/locale/mobile-copy.ts
git commit -m "feat(mobile): add auth flow copy in tr and en"
```

### Task 6: 2a — Karşılama

**Referans:** HTML `#2a`, `screenshots/2a-karsilama.png`, README_AUTH §3 2a.

**Files:**

- Create: `apps/mobile/src/app/screens/auth/auth-welcome-screen.tsx`, `auth-welcome-screen.styles.ts`
- Create: `apps/mobile/component-tests/auth-welcome-screen.test.tsx`

**Props:** `{onOpenLanguagePicker: () => void, onSignIn: () => void, onSignUp: () => void}`. Ekran `testID="mobile-auth-welcome-screen"`.

- [ ] **Step 1: Kırmızı testleri yaz**
  - light/dark `mobile-auth-welcome-screen` zemini `theme.surface.base`
  - `mobile-auth-welcome-sign-in` → `onSignIn` bir kez
  - `mobile-auth-welcome-sign-up` → `onSignUp` bir kez
  - tema segmentine dokunmak `useThemePreference` mode'unu değiştirir (provider ile render edilir)
  - **sahte sistem durumu yok:** `queryByText(/Tüm sistemler aktif|All systems active/)` null (kapsam kararı 5 regresyon testi)
- [ ] **Step 2: Kırmızıyı doğrula**

```powershell
corepack pnpm --filter @wizards/mobile test:components -- auth-welcome-screen --runInBand
```

- [ ] **Step 3: Üst bar** — sağa hizalı iki pill (8px gap): tema anahtarı (beyaz kapsül radius `theme.layout.auth.themePillRadius`, padding 4, iki segment: aktif `theme.accent.soft` zemin + `theme.accent.default` 12px/700 + güneş ikonu; pasif `theme.text.muted` 12px/600 + ay ikonu) → dokunma `useThemePreference().setMode` ile **anında** değişir ve kalıcı saklanır (mevcut AsyncStorage mekanizması). Dil seçici pill: küre ikonu (`theme.accent.default`) + aktif locale adı 12px/700 + aşağı ok → `onOpenLanguagePicker`, `testID="mobile-auth-language-picker"`.
- [ ] **Step 4: Hero** (dikey ortalanmış, `theme.layout.auth.heroPadding` yatay, `heroGap` gap):
  - Logo satırı: `logoSquircle` squircle (radius `logoSquircleRadius`) + `theme.gradients.authPrimaryAction` + `theme.elevation.primaryAction`, içinde beyaz logo; yanında "Whispr" 30px/800.
  - Başlık: `theme.typography.authHeroTitle`; satır 1 `theme.text.primary`, satır 2 `theme.accent.default`. **Not:** RN'de `background-clip: text` yoktur; mock'un gradyan metni satır 2 için tek renk aksanla yaklaşıklanır (gradyanın orta hue'su, uygulamanın diğer aksan kullanımlarıyla tutarlı). Bu bilinçli ve kabul edilen tek sapmadır; `visual:diff` eşiği aşarsa `MaskedView` ile gerçek gradyan metne geçilir.
  - Alt metin: `theme.typography.authHeroBody`, `theme.text.secondary`.
  - Özellik chip'leri (wrap, 8px gap): beyaz pill radius `featureChipRadius`, padding 8×13, 12.5px/600, solda `featureDot` renkli nokta → `theme.authFeature.*`. Beş chip sabittir (ürün özelliği, veri değil — README_AUTH §3 2a açıkça belirtir).
- [ ] **Step 5: Alt CTA ve durum satırı** — birincil "Giriş Yap →" + ikincil "Hesap Oluştur" (kişi+ ikonu). Durum satırı **yalnız** telif: `copy.authWelcomeCopyrightTemplate.replace("{year}", String(new Date().getFullYear()))`. Sistem durumu endpoint'i yoktur → yeşil onay + "Tüm sistemler aktif" **render edilmez** (kapsam kararı 5).
- [ ] **Step 6: Yeşil doğrulama**

```powershell
corepack pnpm --filter @wizards/mobile test:components -- auth-welcome-screen --runInBand
corepack pnpm --filter @wizards/mobile typecheck
```

- [ ] **Step 7: Commit** — `git commit -m "feat(mobile): add welcome auth screen (2a)"`

### Task 7: 2b — Giriş

**Referans:** HTML `#2b`, `screenshots/2b-giris.png`, README_AUTH §3 2b.

**Files:**

- Create: `apps/mobile/src/app/screens/auth/auth-login-screen.tsx`, `auth-login-screen.styles.ts`
- Create: `apps/mobile/component-tests/auth-login-screen.test.tsx`

**Props:** `{onBack, onForgotPassword, onOpenWebSignIn, onRegister, onSignIn}` — `onSignIn(input: {email, password, turnstileToken, twoFactorCode?}): Promise<{ok:true} | {message:string; ok:false; requiresTwoFactor?:boolean}>`. Ekran `testID="mobile-auth-login-screen"`.

- [ ] **Step 1: Kırmızı testleri yaz**
  - boş submit → `copy.authNativeMissingFields`
  - geçersiz e-posta → `copy.authNativeInvalidEmail`
  - Turnstile token'ı gelmeden submit → `copy.authTurnstileError` ve `onSignIn` **çağrılmaz** (kabul kriteri §5.4)
  - `onSignIn` `{ok:false, requiresTwoFactor:true}` dönerse 2FA alanı görünür olur ve hata mesajı gösterilir
  - 2FA alanı görünürken girilen kod `onSignIn`'e `twoFactorCode` olarak geçer
  - submit sırasında buton `busy` ve ikinci basış `onSignIn`'i tekrar çağırmaz
  - `mobile-auth-social-google` görünür; entegre olmayan sağlayıcı butonu yok (kapsam kararı 4 regresyonu)
  - Jest `react-native-webview` mock'u: `component-tests/__mocks__/react-native-webview.js` (önce `jest-expo` preset'inin çözüp çözmediğini dene; gerekiyorsa stub `View` döndüren mock ekle ve `AuthTurnstileCard`'ın `onVerify`'ını test kontrolünde tetikle)
- [ ] **Step 2: Kırmızıyı doğrula**

```powershell
corepack pnpm --filter @wizards/mobile test:components -- auth-login-screen --runInBand
```

- [ ] **Step 3: Üst bar + başlık + profil seçici** — `AuthTopBar` (geri → `onBack`); `AuthEyebrowHeader` (`authLoginEyebrow`, `authWelcomeBackTitle`, `authWelcomeBackDescription`); `AuthProfileTypeSelector`. Seçili profil tipi `onSignIn` payload'ına **eklenmez** — backend'de böyle bir parametre yoktur (§3 2b "login isteğine parametre olarak gider" ancak `MobileAuthPasswordLoginRequestSchema` bunu taşımaz ve uydurma alan §0.1 ihlalidir). Seçim UI state'i olarak korunur; gerçek bir profil-tipi parametresi istenirse şema/route değişikliği olarak ayrı iş açılır.
- [ ] **Step 4: Alanlar ve satırlar** — e-posta (`mail-outline`, email klavye, `textContentType="emailAddress"`), şifre (`lock-closed-outline`, `secureTextEntry`, göz toggle, `textContentType="password"`). Şifre etiket satırının sağında "Şifremi unuttum?" → `onForgotPassword`. Alt satır: solda "2FA veya yedek kod kullan" (kalkan ikonu, `testID="mobile-auth-login-two-factor-link"`) → 2FA alanını açar/kapatır; sağda "Beni hatırla" checkbox (kapsam kararı 10: seçim korunur, ek davranış vaat edilmez).
- [ ] **Step 5: 2FA alanı** — yalnız link açıldığında veya sunucu `requiresTwoFactor` döndüğünde görünür: `copy.authTwoFactorRequiredNotice` + `AuthTextField` (`key-outline`, `textContentType="oneTimeCode"`, `autoComplete="one-time-code"`, `testID="mobile-auth-login-two-factor-code"`).
- [ ] **Step 6: Turnstile + submit + hata** — `AuthTurnstileCard action="login"`; token yoksa submit engellenir. Birincil buton `busy` iken spinner + disabled; hata `theme.status.danger` bandı ile input'ların üstünde.
- [ ] **Step 7: Sosyal ayraç ve butonlar** — ince çizgiler arasında `copy.authSocialDividerLabel`; `MOBILE_AUTH_SOCIAL_PROVIDERS.map(...)` ile 48px kartlar (bugün yalnız Google), her biri `onOpenWebSignIn`. Alt satır: `copy.authNoAccountPrompt` + `copy.authFreeRegisterAction` → `onRegister`.
- [ ] **Step 8: Yeşil doğrulama ve commit**

```powershell
corepack pnpm --filter @wizards/mobile test:components -- auth-login-screen --runInBand
corepack pnpm --filter @wizards/mobile typecheck
git commit -m "feat(mobile): add login auth screen with 2FA and turnstile (2b)"
```

### Task 8: 2c — Kayıt

**Referans:** HTML `#2c`, `screenshots/2c-kayit.png`, README_AUTH §3 2c.

**Files:**

- Create: `apps/mobile/src/app/screens/auth/auth-register-screen.tsx`, `auth-register-screen.styles.ts`
- Create: `apps/mobile/component-tests/auth-register-screen.test.tsx`

**Props:** `{onBack, onRegister, onSignIn}` — `onRegister(input: {confirmPassword, email, password, turnstileToken, username}): Promise<{email:string; ok:true} | {message:string; ok:false}>`. Ekran `testID="mobile-auth-register-screen"`.

- [ ] **Step 1: Kırmızı testleri yaz**
  - sözleşme onaylanmadan birincil buton `accessibilityState.disabled` true ve `onRegister` çağrılmaz (kabul kriteri §5.5)
  - şifre uyuşmazlığı → `copy.authNativePasswordMismatch`
  - zayıf şifre → `copy.authNativePasswordTooShort`
  - geçersiz kullanıcı adı → `copy.authNativeUsernameInvalid`
  - **kullanıcı adı alanının erişilebilirlik adı `copy.authUsernameFieldLabel`'dır** ve kaynakta "Ad Soyad"/"Full Name" geçmez (kapsam kararı 7 regresyonu)
  - başarı → `copy.authNativeVerificationNotice` e-posta ile render edilir
- [ ] **Step 2: Kırmızıyı doğrula**

```powershell
corepack pnpm --filter @wizards/mobile test:components -- auth-register-screen --runInBand
```

- [ ] **Step 3: Üst bar, başlık, profil seçici** — 2b ile birebir aynı bileşenler; eyebrow `authRegisterEyebrow`, başlık `authJoinTitle`, açıklama `authJoinDescription`.
- [ ] **Step 4: Alanlar** — sırayla: **Kullanıcı adı** (kişi ikonu; kapsam kararı 7) → **E-posta** → **Şifre / Şifre Tekrar** (yan yana 2 sütun, 10px gap; her ikisinde kilit + göz; placeholder `authPasswordMinLengthPlaceholder`; dar sütunda ellipsis kabul). `testID`: `mobile-auth-register-{username,email,password,confirm-password}`.
- [ ] **Step 5: Şifre gücü + Turnstile** — `AuthPasswordStrengthRow password={password}` (canlı, submit'te değil); `AuthTurnstileCard action="register"`.
- [ ] **Step 6: Sözleşme onayı** — `AuthCheckbox` (`testID="mobile-auth-register-terms"`) içinde iç içe `Text` linkleri: `authLegalTermsLink` → `Linking.openURL(`${webUrl}/terms`)`, `authLegalPrivacyLink` → `${webUrl}/privacy` (kapsam kararı 8; `webUrl` = `getMobileRuntimeConfig().webUrl`). Checkbox işaretsizken birincil buton disabled.
- [ ] **Step 7: Submit ve alt satır** — "Hesap Oluştur →"; başarıda mevcut e-posta doğrulama akışına bağlanır (`registerMobilePasswordAccount` zaten `verification-required` döndürüyor → doğrulama bildirimi gösterilir). Alt satır: `authAlreadyHaveAccount` + `authModeSignIn` → `onSignIn`. İçerik 844pt'e sığmazsa `AuthScreenBackground scrollable` ile dikey scroll (üst bar sabit).
- [ ] **Step 8: Yeşil doğrulama ve commit**

```powershell
corepack pnpm --filter @wizards/mobile test:components -- auth-register-screen --runInBand
corepack pnpm --filter @wizards/mobile typecheck
git commit -m "feat(mobile): add register auth screen (2c)"
```

### Task 9: 2d — Şifremi unuttum

**Referans:** HTML `#2d`, `screenshots/2d-sifre-sifirlama.png`, README_AUTH §3 2d.

**Files:**

- Create: `apps/mobile/src/app/screens/auth/auth-forgot-password-screen.tsx`, `auth-forgot-password-screen.styles.ts`
- Create: `apps/mobile/component-tests/auth-forgot-password-screen.test.tsx`

**Props:** `{onBack, onRequestPasswordReset}` — `onRequestPasswordReset(input:{email}): Promise<{email:string; ok:true; resetLinkTtlMinutes?:number} | {message:string; ok:false}>`. Ekran `testID="mobile-auth-forgot-password-screen"`.

- [ ] **Step 1: Kırmızı testleri yaz**
  - başarı → ikon yeşile döner + `copy.authForgotSuccessTitle`
  - TTL bandı **yalnız** mock'lanan `resetLinkTtlMinutes` değeriyle render edilir; kaynakta "30 dakika"/"30 minutes" literali yok (kapsam kararı 9 regresyonu)
  - `resetLinkTtlMinutes` gelmezse süre cümlesi hiç gösterilmez (§3 2d)
  - tekrar gönder cooldown'u: başarıdan sonra sayaç aktif, `onRequestPasswordReset` tekrar çağrılmaz; sayaç bitince çağrılabilir (fake timers)
  - **e-posta varlığı ifşa edilmez:** kayıtlı/kayıtsız ayrımı yapan hiçbir dal yok — her `ok:true` aynı başarı durumunu üretir
- [ ] **Step 2: Kırmızıyı doğrula**

```powershell
corepack pnpm --filter @wizards/mobile test:components -- auth-forgot-password-screen --runInBand
```

- [ ] **Step 3: İkon kartı ve başlık** — `theme.layout.auth.iconCard` (72), radius `iconCardRadius` (26), `theme.accent.soft` zemin + `theme.accent.softBorder`, içinde 32px anahtar ikonu (`theme.accent.default`); ortalanmış. Eyebrow `authForgotEyebrow` + H1 `authForgotTitle` + açıklama `authForgotScreenDescription`.
- [ ] **Step 4: Form** — e-posta alanı (2b ile aynı); birincil buton `copy.authNativeForgotAction` + uçak ikonu + `gradient={theme.gradients.authPrimaryActionMuted}` (§3 2d: bu ekranda gradyan hafif koyu uç); altında ortalanmış `copy.authBackToSignInAction` → `onBack`.
- [ ] **Step 5: Başarı durumu** — aynı düzen; ikon yeşil onay; `authForgotSuccessTitle`; "Tekrar gönder" gerçek cooldown sayacıyla (`authForgotResendCooldownTemplate`); `resetLinkTtlMinutes` geldiyse `AuthInfoBanner` ile TTL cümlesi (`testID="mobile-auth-forgot-ttl-banner"`). TTL değeri yalnız API yanıtından gelir; gelmezse banner render edilmez.
- [ ] **Step 6: Yeşil doğrulama ve commit**

```powershell
corepack pnpm --filter @wizards/mobile test:components -- auth-forgot-password-screen --runInBand
corepack pnpm --filter @wizards/mobile typecheck
git commit -m "feat(mobile): add forgot password auth screen (2d)"
```

---

## FAZ 2 — NAVİGASYON, ENTEGRASYON VE ESKİ GATE'İN KALDIRILMASI

### Task 10: Auth stack ve container'lar

**Files:**

- Create: `apps/mobile/src/navigation/mobile-auth-navigation-types.ts`
- Create: `apps/mobile/src/navigation/mobile-auth-navigator.tsx`
- Create: `apps/mobile/src/app/screens/auth/mobile-auth-screen-containers.tsx`

**Produces:** `MobileAuthStackParamList` (`Welcome | Login | Register | ForgotPassword`); `MobileAuthNavigator`; dört container.

- [ ] **Step 1: Param list**

```ts
export type MobileAuthStackParamList = {
  ForgotPassword: undefined;
  Login: undefined;
  Register: undefined;
  Welcome: undefined;
};
```

- [ ] **Step 2: Navigator** — `createNativeStackNavigator<MobileAuthStackParamList>()`, `initialRouteName="Welcome"`, `headerShown: false` (her ekran kendi `AuthTopBar`'ını render eder; 2a'da geri butonu yoktur), `animation: reducedMotion ? "none" : "slide_from_right"` (platform varsayılanı — §4: "ekstra süs yok"). `reason === "checking"` iken mevcut `AuthGate`'teki kontrol-ediliyor kartının rol-temizlenmiş karşılığı gösterilir (oturum kontrolü sırasında Karşılama flaşlamaz).
- [ ] **Step 3: Container'lar** — `useMobileAuth()` değerini alır ve ekran prop'larına bağlar:
  - Welcome: `onSignIn → navigation.navigate("Login")`, `onSignUp → navigate("Register")`, `onOpenLanguagePicker → ` **mevcut** dil seçici sheet'i. `apps/mobile/src/app/screens/settings-screen.tsx` içindeki dil satırının açtığı bileşeni bul (`rg -n "MOBILE_LOCALE_OPTIONS|selectLocale" apps/mobile/src`) ve AYNI bileşeni yeniden kullan; ikinci bir sheet yazma.
  - Login: `onSignIn → auth.signInWithPassword`, `onForgotPassword → navigate("ForgotPassword")`, `onRegister → navigate("Register")`, `onOpenWebSignIn → void auth.openWebSignIn()`, `onBack → navigation.goBack()`.
  - Register: `onRegister → auth.registerWithPassword`, `onSignIn → navigate("Login")`.
  - ForgotPassword: `onRequestPasswordReset → auth.requestPasswordReset`.
- [ ] **Step 4: Dev-login autofill'i Login ekranına taşı** — eski `auth-gate.tsx` sign-in modunda `getMobileDevLoginCredentials()` ile "Geliştirme hesabını doldur" butonu gösteriyordu ve **Maestro UAT helper'ı buna bağlı**. `auth-login-screen.tsx`'e eklenir:

```tsx
const devLoginCredentials = getMobileDevLoginCredentials();

const handleFillDevCredentials = () => {
  if (!devLoginCredentials) {
    return;
  }
  setEmail(devLoginCredentials.email);
  setPassword(devLoginCredentials.password);
};
```

Birincil butonun hemen üstünde: `{devLoginCredentials ? <AuthSecondaryButton label={copy.authNativeDevFillAction} onPress={handleFillDevCredentials} /> : null}`. (Yalnız dev'de görünür — `mobile-dev-login.ts` prod'da `null` döner.)

- [ ] **Step 5: Doğrula ve commit**

```powershell
corepack pnpm --filter @wizards/mobile typecheck
corepack pnpm --filter @wizards/mobile test:components -- auth- --runInBand
git add apps/mobile/src/navigation/mobile-auth-navigation-types.ts apps/mobile/src/navigation/mobile-auth-navigator.tsx apps/mobile/src/app/screens/auth
git commit -m "feat(mobile): add auth navigation stack and screen containers"
```

### Task 11: Gate'i değiştir ve eski `AuthGate`'i kaldır

**Files:**

- Modify: `apps/mobile/src/navigation/mobile-navigator.tsx:11` (import), `:265-279` (`MobileAuthGate`)
- Delete: `apps/mobile/src/app/screens/auth-gate.tsx`, `auth-gate.styles.ts`, `apps/mobile/component-tests/auth-gate.test.tsx`

- [ ] **Step 1: Import ve gate gövdesini değiştir** — gating mantığı (`ProtectedTab`, `ProtectedStackRoute`, `resolveMobileRoute`) **değişmez**:

```tsx
import { MobileAuthNavigator } from "./mobile-auth-navigator";

function MobileAuthGate({ reason }: { readonly reason: "auth-required" | "checking" | null }) {
  return <MobileAuthNavigator reason={reason ?? "auth-required"} />;
}
```

Eski gövdedeki `useMobileAuth()` çağrısı ve tekil prop enjeksiyonu kaldırılır (navigator context'i kendi okur).

- [ ] **Step 2: Artık referans kalmadığını doğrula**

```powershell
rg -n "screens/auth-gate|AuthGate" apps/mobile/src apps/mobile/component-tests apps/mobile/scripts
```

Beklenen: yalnız `MobileAuthGate` (navigator içindeki yerel fonksiyon).

- [ ] **Step 3: Sil**

```powershell
git rm apps/mobile/src/app/screens/auth-gate.tsx apps/mobile/src/app/screens/auth-gate.styles.ts apps/mobile/component-tests/auth-gate.test.tsx
```

- [ ] **Step 4: Tam mobil süiti**

```powershell
corepack pnpm --filter @wizards/mobile typecheck
corepack pnpm --filter @wizards/mobile test
corepack pnpm --filter @wizards/mobile test:components -- --runInBand
```

- [ ] **Step 5: Commit** — `git commit -m "refactor(mobile): replace combined auth gate with four-screen auth stack"`

### Task 12: Maestro akışı ve testID sözleşmesi

**Files:**

- Modify: `.maestro/helpers/login-uat.yml`
- Modify: `apps/mobile/scripts/mobile-maestro-testid-contract.test.ts:76-111`

Eski helper `mobile-bottom-tab-overview`'a dokunup doğrudan `mobile-auth-screen`'de giriş formu bekliyordu. Artık bloklanan sekme **Karşılama**'yı gösterir → forma ulaşmak için bir dokunuş daha gerekir.

- [ ] **Step 1: Helper'ı güncelle** (yalnız `runFlow` bloğu; dosyanın kalanı aynen kalır)

```yaml
- runFlow:
    when:
      visible:
        id: "mobile-settings-web-sign-in-action"
    commands:
      - tapOn:
          id: "mobile-bottom-tab-overview"
      - extendedWaitUntil:
          visible:
            id: "mobile-auth-welcome-screen"
          timeout: 15000
      - tapOn:
          id: "mobile-auth-welcome-sign-in"
      - extendedWaitUntil:
          visible:
            id: "mobile-auth-login-screen"
          timeout: 15000
      - tapOn: "Geliştirme hesabını doldur|Fill dev account"
      - tapOn: "Giriş yap|Sign in"
      - extendedWaitUntil:
          visible:
            id: "mobile-overview-screen"
          timeout: 30000
```

- [ ] **Step 2: Contract testinin sıralama regex'ini güncelle**

```ts
assert.match(
  loginHelperSource,
  /id:\s*"mobile-bottom-tab-overview"[\s\S]*?id:\s*"mobile-auth-welcome-screen"[\s\S]*?id:\s*"mobile-auth-welcome-sign-in"[\s\S]*?id:\s*"mobile-auth-login-screen"[\s\S]*?tapOn:\s*"Geliştirme hesabını doldur\|Fill dev account"[\s\S]*?tapOn:\s*"Giriş yap\|Sign in"[\s\S]*?id:\s*"mobile-overview-screen"[\s\S]*?id:\s*"mobile-bottom-tab-settings"/,
);
```

`testIdSources` tablosuna yeni ID'ler ve kaynakları eklenir (`mobile-auth-welcome-screen` → `src/app/screens/auth/auth-welcome-screen.tsx`, `mobile-auth-login-screen` → `.../auth-login-screen.tsx`). Eski `id: "mobile-auth-screen"` assertion'ı kaldırılır.

- [ ] **Step 3: Doğrula ve commit**

```powershell
corepack pnpm --filter @wizards/mobile exec node --test --import tsx scripts/mobile-maestro-testid-contract.test.ts
git add .maestro/helpers/login-uat.yml apps/mobile/scripts/mobile-maestro-testid-contract.test.ts
git commit -m "test(mobile): update UAT login flow for welcome to login navigation"
```

---

## FAZ 3 — SÖZLEŞME, ERİŞİLEBİLİRLİK VE KOYU TEMA GATE'İ

### Task 13: Auth ekran sözleşmesi (testID + no-dummy-data)

**Files:**

- Create: `apps/mobile/scripts/mobile-auth-screens-contract.ts`, `mobile-auth-screens-contract.test.ts`

Repo'nun yerleşik `mobile-<feature>-contract.ts` + `.test.ts` desenini izler.

- [ ] **Step 1: Sözleşme modülü**

```ts
export const MOBILE_AUTH_SCREEN_TEST_IDS = [
  "mobile-auth-welcome-screen",
  "mobile-auth-welcome-sign-in",
  "mobile-auth-welcome-sign-up",
  "mobile-auth-language-picker",
  "mobile-auth-login-screen",
  "mobile-auth-login-email",
  "mobile-auth-login-password",
  "mobile-auth-login-two-factor-link",
  "mobile-auth-login-two-factor-code",
  "mobile-auth-login-submit",
  "mobile-auth-turnstile-card",
  "mobile-auth-social-google",
  "mobile-auth-register-screen",
  "mobile-auth-register-username",
  "mobile-auth-register-email",
  "mobile-auth-register-password",
  "mobile-auth-register-confirm-password",
  "mobile-auth-register-terms",
  "mobile-auth-register-submit",
  "mobile-auth-forgot-password-screen",
  "mobile-auth-forgot-email",
  "mobile-auth-forgot-submit",
  "mobile-auth-forgot-resend",
] as const;

export const MOBILE_AUTH_SCREEN_SOURCES = [
  "src/app/screens/auth/auth-welcome-screen.tsx",
  "src/app/screens/auth/auth-login-screen.tsx",
  "src/app/screens/auth/auth-register-screen.tsx",
  "src/app/screens/auth/auth-forgot-password-screen.tsx",
  "src/app/components/kit/auth/auth-turnstile-card.tsx",
] as const;
```

- [ ] **Step 2: Sözleşme testi** — mevcut `readFileSync`/`assert.match` desenini izleyerek:
  - her testID en az bir kaynakta geçer
  - kayıt ekranında `Ad Soyad|Full Name` **geçmez** (kapsam kararı 7)
  - şifre sıfırlama ekranında `30\s*dakika|30\s*minutes` **geçmez** (kapsam kararı 9)
  - karşılama ekranında `Tüm sistemler aktif|All systems active` **geçmez** (kapsam kararı 5)
  - hiçbir auth ekran/kit kaynağında ham hex/rgba **geçmez** (semantic gate ön kontrolü — hızlı geri bildirim)
  - `MOBILE_AUTH_SOCIAL_PROVIDERS` yalnız gerçekten entegre sağlayıcı içerir (bugün 1)
- [ ] **Step 3: Doğrula ve commit**

```powershell
corepack pnpm --filter @wizards/mobile exec node --test --import tsx scripts/mobile-auth-screens-contract.test.ts
git add apps/mobile/scripts/mobile-auth-screens-contract.ts apps/mobile/scripts/mobile-auth-screens-contract.test.ts
git commit -m "test(mobile): add auth screens testID and no-dummy-data contract"
```

### Task 14: Koyu tema semantic role gate'i

**Files:**

- Modify: `apps/mobile/scripts/mobile-redesign-semantic-role-gate.ts:8-56`
- Create: `apps/mobile/component-tests/mobile-auth-semantic-role-gate.test.tsx`
- Modify: `apps/mobile/scripts/mobile-redesign-semantic-role-gate.test.ts`

Auth akışının koyu HTML frame'i yoktur (README_AUTH §1). Kabul, uydurma piksel golden'ı ile DEĞİL, mevcut semantic role gate ile alınır — Tur 1'de 1c/1d/1f/1g için kurulan aynı mekanizma.

- [ ] **Step 1: Anchor tipini genişlet ve hedefleri ekle**

```ts
export interface DarkScreenSemanticRoleTarget {
  readonly anchor: "1c" | "1d" | "1f" | "1g" | "2a" | "2b" | "2c" | "2d";
  readonly sourcePaths: readonly string[];
  readonly testId: string;
}
```

`DARK_SCREEN_SEMANTIC_ROLE_TARGETS`'a dört hedef eklenir; her birinin `sourcePaths`'ı kendi ekranı + `.styles.ts`'i + tükettiği auth kit dosyalarını kapsar. Örnek:

```ts
{
  anchor: "2b",
  testId: "mobile-auth-login-screen",
  sourcePaths: [
    "src/app/screens/auth/auth-login-screen.tsx",
    "src/app/screens/auth/auth-login-screen.styles.ts",
    "src/app/components/kit/auth/auth-screen-background.tsx",
    "src/app/components/kit/auth/auth-top-bar.tsx",
    "src/app/components/kit/auth/auth-eyebrow-header.tsx",
    "src/app/components/kit/auth/auth-primary-button.tsx",
    "src/app/components/kit/auth/auth-secondary-button.tsx",
    "src/app/components/kit/auth/auth-text-field.tsx",
    "src/app/components/kit/auth/auth-checkbox.tsx",
    "src/app/components/kit/auth/auth-profile-type-selector.tsx",
    "src/app/components/kit/auth/auth-turnstile-card.tsx",
    "src/app/components/kit/auth/auth-security-card.tsx",
    "src/app/styles/shared-styles.ts",
  ],
},
```

- [ ] **Step 2: Component gate testini yaz** — mevcut `mobile-redesign-semantic-role-gate.test.tsx` desenini birebir izle: her hedef için `assertSemanticStyleSource(target, darkTheme)` ve çözümlenmiş style ağacı ile `assertSemanticStyleTree(target, styles, darkTheme)`.
- [ ] **Step 3: Çalıştır ve KIRMIZI çıktıyı düzelt**

```powershell
corepack pnpm --filter @wizards/mobile test:components -- mobile-auth-semantic-role-gate --runInBand
corepack pnpm --filter @wizards/mobile exec node --test --import tsx scripts/mobile-redesign-semantic-role-gate.test.ts
```

Gate her ham renk ve rolsüz ölçü için dosya:satır:anahtar raporlar. **Her ihlal, değeri Task 1/Task 2'deki token grubuna adlandırılmış rol olarak ekleyip kaynağı role çevirerek düzeltilir** — gate gevşetilmez, hedef listeden çıkarılmaz.

- [ ] **Step 4: Commit** — `git commit -m "test(mobile): gate auth screens dark theme through semantic roles"`

### Task 15: Erişilebilirlik ve 2.0 ölçek denetimi

**Files:**

- Create: `apps/mobile/component-tests/mobile-auth-accessibility.test.tsx`
- Modify: gerekiyorsa auth kit/ekran dosyaları

- [ ] **Step 1: Testleri yaz** (kabul kriteri §5.6)
  - tüm dokunma hedefleri ≥44pt (tema pill segmentleri, göz toggle'ı, sosyal butonlar, metin linkleri dahil)
  - tüm ikon butonları `accessibilityLabel` + `accessibilityRole` taşır
  - 2.0 font ölçeğinde dört ekranda kesme/örtüşme yok; uzun `tr` metinleri (özellikle `authWelcomeHeroSubtitle`, `authLegalSuffix`, `authForgotInfoTtlTemplate`) sarar
  - şifre alanları `secureTextEntry` ve doğru `textContentType`/`autoComplete` ipuçları
  - hata bantları `accessibilityLiveRegion`/`accessibilityRole="alert"` ile duyurulur
- [ ] **Step 2: Klavye davranışı** — e-posta/şifre alanları klavye tarafından örtülmez (`AuthScreenBackground`'ın `KeyboardAvoidingView` + `scrollable` davranışı; §4 klavye kuralı).
- [ ] **Step 3: Doğrula ve commit**

```powershell
corepack pnpm --filter @wizards/mobile test:components -- mobile-auth-accessibility --runInBand
corepack pnpm --filter @wizards/mobile quality:check
git commit -m "test(mobile): auth flow accessibility and dynamic type pass"
```

---

## FAZ 4 — KABUL

### Task 16: Açık tema görsel gate'i (2a-2d)

**Files:**

- Modify: `apps/mobile/scripts/mobile-redesign-extract.ts:33-44` (`referenceAnchors`)
- Modify: ilgili reference/golden/diff contract testleri
- Create: `apps/mobile/visual-baselines/whispr-mobile-redesign/v1/2{a,b,c,d}.png` (üretilmiş, gözden geçirilmiş golden'lar)

Mevcut deterministik makine genişletilir; yeni renderer/diff yazılmaz.

- [ ] **Step 1: Anchor'ları ekle**

```ts
const referenceAnchors = [
  // ...mevcut 1a-1j aynen...
  { anchor: "2a", testId: "mobile-auth-welcome-screen", theme: "light" },
  { anchor: "2b", testId: "mobile-auth-login-screen", theme: "light" },
  { anchor: "2c", testId: "mobile-auth-register-screen", theme: "light" },
  { anchor: "2d", testId: "mobile-auth-forgot-password-screen", theme: "light" },
] as const;
```

- [ ] **Step 2: Referansı çıkar ve doğrula**

```powershell
corepack pnpm --filter @wizards/mobile visual:reference:extract
corepack pnpm --filter @wizards/mobile visual:reference:verify
```

Beklenen: `#2a`-`#2d` için 390×844 @ DPR3 referans PNG'leri ve computed-style manifesti; eşleşmeyen renk/selector/hash/geometri fail eder.

- [ ] **Step 3: Golden üret ve gözden geçir**

```powershell
corepack pnpm --filter @wizards/mobile visual:golden:generate
```

Üretilen `2a`-`2d` golden'ları **incelenerek** commit edilir (mock'un telefon çerçevesi süsü uygulamada yoktur; normalize transform'un bunu nasıl ele aldığını 1a-1j golden'larıyla karşılaştırarak doğrula).

- [ ] **Step 4: Cihaz kanıtı ve diff**

```powershell
corepack pnpm --filter @wizards/mobile visual:capture:android
corepack pnpm --filter @wizards/mobile visual:diff
corepack pnpm --filter @wizards/mobile visual:gate
```

Auth ekranlarını yakalamak için cihazın **oturumsuz** olması gerekir; capture harness'ının auth yüzeyine nasıl ulaştığını (`WHISPR_DEVICE_CAPTURE_DIRECTORY` akışı) `mobile-redesign-device-capture.ts`'i okuyarak bağla — gerekiyorsa capture öncesi `signOut` adımı eklenir.

- [ ] **Step 5: Fark varsa düzelt** — "yaklaşık aynı" kabul edilmez (README kabul kriteri 6). Gradyan metin yaklaşıklaması (Task 6 Step 4) eşiği aşarsa `MaskedView` ile gerçek gradyan metne geçilir.
- [ ] **Step 6: Commit**

```powershell
git add apps/mobile/scripts/mobile-redesign-extract.ts apps/mobile/visual-baselines apps/mobile/scripts/*contract*.test.ts
git commit -m "test(mobile): add deterministic visual acceptance for auth screens"
```

### Task 17: Tam kabul ve devir

- [ ] **Step 1: Taze otomatik gate'ler**

```powershell
corepack pnpm --filter @wizards/types test
corepack pnpm --filter @wizards/web typecheck
corepack pnpm --filter @wizards/web test
corepack pnpm --filter @wizards/mobile typecheck
corepack pnpm --filter @wizards/mobile test
corepack pnpm --filter @wizards/mobile test:components -- --runInBand
corepack pnpm --filter @wizards/mobile quality:check
corepack pnpm --filter @wizards/mobile exec expo install --check
corepack pnpm --filter @wizards/mobile visual:gate
corepack pnpm audit --audit-level moderate
```

- [ ] **Step 2: README_AUTH kabul oracle'ı** (§5) — tek tek doğrula:
  1. Dört ekran 390pt'de referans HTML/PNG ile örtüşüyor (Task 16 kanıtı).
  2. Açık/koyu tema tam eşlemeyle çalışıyor; karşılamadaki anahtar canlı ve kalıcı (Task 6 + Task 14).
  3. Hiçbir ekranda dummy veri yok: sosyal sağlayıcılar (konfig), PREVIEW (statik ürün etiketi), sistem durumu (yok → gösterilmiyor), link süresi (API'den) — Task 13 sözleşmesi.
  4. Turnstile gerçek widget; doğrulama tamamlanmadan submit edilemiyor (Task A3 + Task 7).
  5. Şifre gücü canlı; sözleşme onayı olmadan kayıt disabled; şifre sıfırlamada e-posta varlığı ifşa edilmiyor (Task 8, 9, A4).
  6. Dokunma hedefleri ≥44px; klavye örtmüyor; VoiceOver/TalkBack etiketleri tam (Task 15).
- [ ] **Step 3: Cihazda manuel akış** — Karşılama → tema anahtarı (kalıcılığı uygulama yeniden başlatarak doğrula) → dil seçici → Giriş → şifremi unuttum → geri → Kayıt → sözleşmesiz submit engeli → gerçek kayıt → doğrulama bildirimi → giriş → **2FA açık test hesabıyla** 2FA adımı → başarılı giriş → sekme çubuğu. Turnstile'ın gerçek site key ile yüklendiğini ve çözülmeden submit'i engellediğini doğrula (anahtarsız hata durumu ayrıca test edilir).
- [ ] **Step 4: Graph ve kapsam diff'i**

```powershell
graphify update .
git diff --check
git status --short
```

- [ ] **Step 5: Devir**

`superpowers:verification-before-completion`, ardından `superpowers:requesting-code-review` kullanılır. `uat` üzerinde çalışıldığı için `finishing-a-development-branch` yerine doğrudan gözden geçirme uygulanır; **push yalnız kullanıcı onayıyla**.

---

## SELF-REVIEW NOTLARI (README_AUTH kapsama kontrolü)

| README_AUTH bölümü                                  | Karşılayan task(lar)                                                        |
| --------------------------------------------------- | --------------------------------------------------------------------------- |
| §0 Mutlak kurallar 1-6                              | Global Constraints + A1-A4 + Task 13 sözleşmesi + Task 15                   |
| §1 Paket içeriği / koyu tema mock'u yok             | Task 14 (semantic role gate) + Task 16 (yalnız açık golden)                 |
| §2 Tokenlar (ortak/açık/koyu)                       | Task 1 (renk rolleri), Task 2 (ölçü/tipografi rolleri)                      |
| §3 2a Karşılama                                     | Task 6 (+ sistem durumu: kapsam kararı 5)                                   |
| §3 2b Giriş                                         | Task 7 (+ 2FA: A2/A4; Turnstile: A3/Task 4; sosyal: A4/kapsam kararı 4)     |
| §3 2c Kayıt                                         | Task 8 (+ Ad Soyad → kullanıcı adı: kapsam kararı 7; linkler: kapsam 8)     |
| §3 2d Şifremi unuttum                               | Task 9 (+ TTL: A4/kapsam kararı 9)                                          |
| §4 Akış & durumlar (navigasyon, disabled→loading→hata→başarı, klavye) | Task 10, 11 + her ekranın state makinesi + Task 15         |
| §5 Kabul kriterleri 1-6                             | Task 16, 17                                                                 |
| §6.1 Token'ları ortakla                             | Task 1, 2 (auth'a özel kopya yok; semantic gate zorunlu tutuyor)            |
| §6.6 PREVIEW profilleri flag arkasında              | Kapsam kararı 6 — flag sistemi yok; rozet tek noktada statik                |
| §6.7 Karşılama fade+rise animasyonu                 | Uygulanmıyor — §4 "ekstra süs yok" ile çelişir; reduce-motion riski (YAGNI) |

**Bilinçli kapsam sınırları:** README_AUTH §6'daki öneriler — biyometrik hızlı giriş (2), magic link (3), rate-limit cooldown UX'i (4), derin bağlantılar (5) — bu turda **uygulanmaz**; hiçbiri §3 ekran spesifikasyonunun veya §5 kabul kriterlerinin parçası değildir ve her biri kendi backend/UX işini gerektirir. Mevcut deep-link altyapısı zaten çalışmaktadır. "Beni hatırla" kalıcılık modu (kapsam kararı 10), profil-tipi login parametresi (Task 7 Step 3) ve serbest display-name alanı (kapsam kararı 7) şema değişikliği gerektirdiği için ayrı iş olarak açılır. §3'teki hiçbir görünür yetenek "API yok" gerekçesiyle çıkarılmamıştır; A1-A4 gerçek yolu üretir.
