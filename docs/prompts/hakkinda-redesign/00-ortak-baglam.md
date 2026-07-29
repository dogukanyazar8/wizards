# 00 — Ortak bağlam (her prompt bunu önce okur)

Bu dosya uygulanmaz; 01–15 arasındaki her prompt bu kuralları veri kabul eder.

---

## 1. Çalışma kuralları

- Branch `uat`. **Commit yok, push yok, rebase yok.** İş çalışma ağacında bırakılır.
- Tasarım kaynağı: `design_handoff/design_handoff_whispr_hakkinda/`
  - `PROMPT.md` — 743 satır, token/ölçü/davranış/i18n/kabul kriteri sözleşmesi
  - `Whispr Hakkında Ekranı.dc.html` — 1247 satır; ekran bloklarının satır aralıkları:
    `2a` 35–111 · `2b` 114–208 · `2c` 211–282 · `2d` 285–350 · `2e` 353–443 ·
    `2f` 446–518 · `2g` 521–607 · `2h` 610–684 · `1a` 694–815 · `1b` 816–918 ·
    `1c` 919–1018 · `1d` 1019–1106 · `1e` 1107–1246
  - `screenshots/*.png` — @2x (780×1688), ölçü doğrulaması için
- Çelişkide sıra: ekran görüntüsü > HTML inline stil > PROMPT.md metni.
- **Uydurma yasak:** dokümanda ve HTML'de olmayan renk, gölge, yarıçap, boşluk, metin üretilmez.

---

## 2. Repo gerçekleri (doğrulanmış)

### Mobil uygulama

- Ekranlar: `apps/mobile/src/app/screens/`, stil dosyaları `<ekran>.styles.ts` olarak ayrı.
- Mevcut Hakkında ekranı: `apps/mobile/src/app/screens/mobile-about-settings-screen.tsx`
  (232 satır) + `.styles.ts` (168 satır). Bu ekran **tamamen yeniden yazılacak**.
- Ekran şu an `settings-screen.tsx:2260` içinde `resolvedSection === "about"` dalından
  render ediliyor; rota `SettingsDetail` + `{ section: "about" }`.
- Tema: `apps/mobile/src/design/palette.ts` (grup grup token'lar) →
  `apps/mobile/src/design/themes.ts` (`lightTheme` / `darkTheme` içinde `messaging`,
  `voiceRoom`, `profile`, `toast` gibi ekran grupları) → `useTheme()`
  (`apps/mobile/src/app/providers/mobile-theme-provider.tsx`).
- Ölçü token'ları: `apps/mobile/src/design/tokens.ts`
  (`mobileRadii`, `mobileSpacing`, `mobileSizing`, `mobileTypography`, `mobileLayoutMetrics`).
- Metinler: `apps/mobile/src/locale/mobile-copy.ts` — tek dosya, `{ tr: {...}, en: {...} }`,
  düz camelCase anahtarlar (`aboutSettingsTitle` gibi), 4001 satır.
- Marka logosu: `apps/mobile/src/app/screens/auth/auth-welcome-brand-mark.tsx`
  (`AuthWelcomeBrandMark`, props: `size`, `cornerRadius`, `testID`). 52px kanonik
  geometri, bar yükseklikleri `[17,25,34,24,18]`, react-native-svg + Reanimated.
- Kit bileşenleri: `apps/mobile/src/app/components/kit/`
  (`bottom-sheet.tsx`, `sheet-primitives.tsx`, `toggle.tsx`, `button.tsx`, `toast.tsx`,
  `list-row.tsx`, `overlay-host.tsx`, `destructive-confirmation-sheet.tsx`, `index.ts`).
- Overlay/sheet mimarisi: tek pencere `overlay-host.tsx` + `overlay-registry.ts`;
  yeni sheet'ler bu host üzerinden açılır (ayrı Modal açılmaz).
- Toast: `useToast()` (`kit/toast.tsx:569`), haptik: `useMobileHaptics()`
  (`providers/mobile-haptics-provider.tsx`, `selection()` mevcut).
- Ağ istemcisi: `apps/mobile/src/api/mobile-api-client.ts` (`client.requestJson<T>(path, init)`).
  Örnek sözleşme dosyası: `apps/mobile/src/legal/mobile-legal-client.ts` — yol üreten saf
  fonksiyon + zod ile `parse` eden çağrı. Aynı desen kullanılacak.
- Query katmanı: `apps/mobile/src/query/mobile-query-keys.ts` (`mobileQueryKeys.*`),
  React Query v5, AsyncStorage persist.
- Kalıcı tercihler: `@react-native-async-storage/async-storage`; tema sağlayıcısı
  `MOBILE_*_PREFERENCE_KEY` sabitleriyle okuyup yazıyor, aynı desen izlenir.
- Sürüm/kanal kaynağı: bootstrap payload `app.version`, `app.releaseChannel`, `app.buildId`
  (`packages/types/src/mobile.ts:561`) ve `apps/mobile/src/config/environment.ts`
  (`releaseChannel: "development" | "uat" | "canary" | "production"`).
  `apps/mobile/package.json.version` = `0.8.15`, `app.config.js` bunu `version` olarak veriyor.
- `expo-updates` bağımlılığı kurulu (`~57.0.10`) ama `app.config.js` içinde **`updates`
  anahtarı yok** → OTA yapılandırılmamış, `Updates.isEnabled === false`. Bu iş kapsamında
  yapılandırma **eklenmez**.
- Kurulu ilgili paketler: `expo-clipboard`, `expo-device`, `expo-application` yok
  (`expo-device` var), `expo-store-review` **yok** ve eklenmeyecek.

### Navigasyon

- Param listesi: `apps/mobile/src/navigation/mobile-navigation-types.ts`
  (`MobileRootStackParamList`, `MobileNavigationRouteIntent`).
- Ekran kaydı: `apps/mobile/src/navigation/mobile-navigator.tsx`.
- Container'lar: `apps/mobile/src/app/screens/mobile-screen-containers.tsx`.
- Derin bağlantı eşlemesi: `apps/mobile/src/navigation/mobile-linking.ts`
  (`screens` haritası + `resolveMobileRoutePathIntent`).
- Imperatif gezinme: `apps/mobile/src/navigation/mobile-navigation-ref.ts`.
- **Yeni rota eklerken bu beş dosyanın hepsi güncellenir**, aksi hâlde derin bağlantı ve
  `mobile-deep-link-contract.test.ts` kırmızıya düşer.

### Web / veri

- Prisma şeması: `packages/db/prisma/schema.prisma` (`generator client` → `../src/generated/prisma`).
- **Migration'lar yalnız `packages/db/prisma/rebaseline-migrations/` altından okunur.**
  `migrations/` klasörüne yazılan dosya sessizce hiç çalışmaz.
  İsim biçimi: `YYYYMMDDHHmmss_snake_case_ad` (en son: `20260729090000_client_health_percentiles`).
- Mobil API rotaları: `apps/web/src/app/api/v1/mobile/<alan>/route.ts` +
  `route-logic.ts` ayrımı. `route.ts` yalnız HTTP metodunu `route-logic`e devreder.
- `route-logic.ts` deseni: `MobileXRouteDependencies` tipi + `defaultDependencies` sabiti
  (DI zorunlu — web testlerinde DB yok, bağımlılıklar enjekte edilerek test edilir).
- Kimlik: `requireMobileApiUserId(request)` (`@/lib/auth/api`).
- Hız sınırı: `enforceApiRateLimit(userId, action)` (`@/lib/api-rate-limit`); `action`
  **kapalı union** — yeni eylem eklenmeden çağrı tip hatası verir.
- Gövde ayrıştırma: `parseJsonBody(request, schema)`, hata: `jsonError` (`@/lib/api`).
- Paylaşılan tipler: `packages/types/src/mobile.ts` — zod şeması + `z.infer` tipi;
  `@wizards/types` kaynaktan çözülür (build adımı yok).

### Yeni web rotası eklerken zorunlu üç kayıt (üçü de kırmızıya düşer)

1. `apps/web/src/app/api/v1/route-contract.test.ts` — gövdesiz mutasyon ise
   `BODYLESS_MUTATING_METHOD_PATHS`, kimliksiz erişilebiliyorsa `UNAUTHENTICATED_ROUTE_PATHS`.
2. `apps/web/src/lib/api-rate-limit.ts` — `API_RATE_LIMITS` union'ına yeni eylem.
3. Admin rotası ise `admin-route-capability.test.ts` → `ROUTE_CAPABILITY_PINS`.

---

## 3. Tema ve ölçü kuralları

- Bu iş için **yeni bir token grubu** açılır: `redesignAboutLight` / `redesignAboutDark`
  (`palette.ts`) → `themes.ts` içinde `about` alanı. Diğer grupların (`messaging`,
  `voiceRoom`, `profile`) token'ları **değiştirilmez**.
- Bileşen dosyalarında ham renk literali (`"#4F46E5"`) yazılmaz; tümü `theme.about.*`.
- `mobileRadii` **kilitli**: `mobile-redesign-theme-contract.test.ts` bu nesneyi
  `assert.deepEqual` ile birebir doğruluyor. Tasarımın ihtiyaç duyduğu ek yarıçaplar
  (`r5, r6, r9, r11, r12, r13, r15, r16, r18, r20`) `mobileRadii`'ye **eklenmez**;
  `about` metrik grubuna konur.
- `maxFontSizeMultiplier` kullanılan her yerde **literal ve ≥ 2** olmak zorunda
  (aynı test dosyası, `findDynamicTypeViolationsInSource`). Rozet/çip metinlerinde dinamik
  ölçekleme kapatılacaksa `allowFontScaling={false}` kullanılır, düşük multiplier değil.
- Tasarımdaki 9–10.5px rozet punto değerleri korunur; ancak PROMPT.md §8 gereği
  **gövde metni 11px altına inmez**.

## 4. Metin (i18n) kuralları

- Tüm metinler `mobile-copy.ts` içine, `tr` ve `en` **birlikte** eklenir.
  `scripts/mobile-copy-parity.test.ts` iki dilin anahtar kümesini karşılaştırır.
- `mobile-design-contract.test.ts`, ürün ekranlarında `mobileCopy.tr` doğrudan erişimini
  yasaklıyor — daima `const copy = mobileCopy[locale]` (`useMobileLocaleRuntime()`).
- PROMPT.md §6'daki noktalı anahtarlar (`about.update.current`) bu repoda camelCase'e
  çevrilir: `aboutUpdateCurrent`. Eşleme tablosu prompt 02'de sabitlenir.
- Türkçe sayı biçimi: `48,2 MB`, `12,4B üye`, `1,2B çevrimiçi`. İngilizcede `48.2 MB`, `12.4K`.
- Üslup: ikinci tekil şahıs, samimi ("kullanıyorsun", "dene"). Rozetler ve grup etiketleri
  büyük harf.

## 5. Test ve doğrulama komutları

Tümü `apps/mobile` veya `apps/web` **paket dizininden** çalıştırılır (repo kökünden `tsx`
çözülmüyor).

```bash
pnpm --filter @wizards/mobile typecheck
```

```bash
pnpm --filter @wizards/web typecheck
```

Mobil node testleri (`apps/mobile` içinden):

```bash
node --test --import tsx scripts/<ad>.test.ts
```

Mobil bileşen testleri (`apps/mobile` içinden):

```bash
npx jest component-tests/<ad>.test.tsx
```

Web node testleri (`apps/web` içinden):

```bash
node --test --import tsx src/app/api/v1/mobile/<alan>/route-logic.test.ts
```

Tuzaklar:

- `typecheck` **pnpm ile** çalıştırılmalı; `npm run typecheck` altında runner
  `+ '11.16.0' - 'Version 7.0.2'` diyerek daha derlemeye başlamadan ölür.
- RNTL 14 asenkron: `render()` ve `fireEvent.*` promise döner, **await edilmezse** aynı
  dosyadaki sonraki testler bozuk ağaç render eder.
- Prisma migration eklendiğinde `pnpm --filter @wizards/db exec prisma generate` çalıştır;
  UAT veritabanına dışarıdan bağlanılamaz, migration yalnız deployment'ta uygulanır.

## 6. Ortak bileşen sözleşmesi

Prompt 02 aşağıdaki bileşenleri **tek dosyada** kurar:
`apps/mobile/src/app/screens/about/about-primitives.tsx` (+ `.styles.ts`)

| Bileşen                   | Sorumluluk                                                                                                                                                      |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AboutScreenHeader`       | 36×36 geri butonu + 21/800 başlık + opsiyonel sağ aksiyon (ikon butonu veya etiketli buton). `variant="close"` X ikonu verir (2f).                              |
| `AboutStickyHeader`       | 1b daraltılmış başlık: beyaz blok, `#ECEEF7` alt çizgi, 32px `r11` geri butonu, 15.5/800 başlık, sağda sürüm. `scrollY > 12` ile 160ms `ease-out` görünür.      |
| `AboutGroupLabel`         | 10.5/700 `ls .1em` grup etiketi, `padding` prop'u ile sıkıştırılabilir.                                                                                         |
| `AboutCard`               | `r24` kart, `padding` prop'u; kart içi hairline'lar `-16px` negatif marjinle tam genişlik.                                                                      |
| `AboutRow`                | Liste satırı: başlık 14/600, opsiyonel alt metin 11/500, sağda değer metni / pill / toggle / chevron. Tek satır `13px 16px`, alt metinli `11px 16px`, min 44px. |
| `AboutToggle`             | 44×26 `r13`, knob 20px, açık `#4F46E5`. `kit/toggle.tsx` ölçüleri tutmuyorsa bu dosyada ayrı yazılır.                                                           |
| `AboutTypePill`           | Tür çipi. `width` prop'u (1c'de **62px sabit**), `variant: new                                                                                                  | improved | fixed`. |
| `AboutSearchField`        | 2b ve 2e'de **aynı bileşen**: `r16`, `padding 11–12px 14px`, 16px büyüteç `#B9BED6`, placeholder 13.5/500 `#9AA0BC`.                                            |
| `AboutStickyFooterButton` | `left/right:16, bottom:26`, `r16`, `padding:14px 0`, 14/800 beyaz, gölge `0 10px 24px rgba(79,70,229,.24)`; `disabled` → `opacity .45` + dokunma kapalı.        |
| `AboutConsentSheetShell`  | 2d/2h ortak sheet iskeleti: grabber 38×4 `r2`, `padding:10px 20px 30px`, üst köşe `r30`, alt köşe cihaz köşesine oturur.                                        |
| `AboutBrandLogo`          | `AuthWelcomeBrandMark` sarmalayıcısı; `size` → `cornerRadius` eşlemesi tablo ile (60→15, 52→13, 50→14, 46→11.5).                                                |

Kural: bir ekran promptu bu bileşenlerden birine ihtiyaç duyup imzası yetmiyorsa,
bileşeni **genişletir** (prop ekler), kopyasını çıkarmaz.

## 7. Yapılmayacaklar (PROMPT.md §8)

- Her satıra ikon koymak (ikon yalnız değişiklik maddelerinde ve kategori karolarında).
- Yeni gradyan, yeni renk, emoji, sol kenar aksanlı kart.
- Bir ekranda ikinci bir indigo dolgulu birincil buton.
- `#B9BED6`'yı metin rengi olarak kullanmak (yalnız ikon/kenar tint'i).
- Kartları gölgeyle ayırmak — gölge yalnız 1d güncelleme kartı, 2g davet kartı,
  sabit alt butonlar ve sheet'lerde.
- Puanlama akışında ≤4 yıldızı mağazaya yönlendirmek.
- Sorun bildir formunda ne gönderildiğini gizlemek.
