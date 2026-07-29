# 02 — Mobil temel katman: token'lar, metinler, ortak bileşenler, rotalar, veri bağlama

Önce `00-ortak-baglam.md` oku. Ön koşul: `01-veri-katmani-db-api.md` tamam.
Branch `uat`, commit yok.

Hedef: 13 ekranın tamamının üstüne oturacağı katmanı kurmak. **Bu promptta hiçbir ekran
çizilmez**; bittiğinde token, metin, bileşen, rota, sorgu ve güncelleme denetleyicisi hazırdır
ve testleri yeşildir.

---

## 1. Tema token'ları

### 1.1 `apps/mobile/src/design/palette.ts`

Mevcut `redesignVoiceRoomLight` / `redesignVoiceRoomDark` biçimini birebir izleyerek
`redesignAboutLight` ve `redesignAboutDark` grupları ekle. Değerler
`design_handoff/.../PROMPT.md` §1.1 ve §1.2'den, **alfabetik anahtar** sırasıyla:

Açık tema (§1.1):
`screen #F6F7FB` · `card #FFFFFF` · `cardBorder #E7E9F4` · `hairline #F1F2F9` ·
`headerDivider #ECEEF7` · `control #F1F2F9` · `progressTrack #ECEEF7` ·
`text #1E2235` · `textSecondary #6B7194` · `textTertiary #8A90B0` · `textMuted #9AA0BC` ·
`iconTint #B9BED6` · `accent #4F46E5` · `accentSurface #EEF0FE` ·
`accentCardSurface #F7F6FF` · `accentCardBorder #E7E6FD` · `accentChipSurface #E7E6FD` ·
`successDot #22C55E` · `successText #1B8A55` · `successSurface #E9F9EF` ·
`successChipSurface #E1F5E9` · `warningText #C77A2B` · `warningSurface #FEF0E8` ·
`warningChipSurface #FBE9DC` · `warningNoteText #9A6224` · `star #F5B23D` ·
`starEmpty #DEE1EE` · `toggleOff #D9DCEC` · `timelineDot #C9CDE3` · `grabber #DEE1EE` ·
`scrim rgba(20,23,42,.42)` · `danger #DC4E5F` · `radioBorder #D9DCEC` ·
`spinnerTrail #DDDBFB` · `updateGradientFrom #5A51EA` · `updateGradientTo #4338CA` ·
`updateOnGradient #FFFFFF` · `updateOnGradientMuted rgba(255,255,255,.72)` ·
`updateBadgeSurface rgba(255,255,255,.2)` · `updateGhostSurface rgba(255,255,255,.16)` ·
`updatePrimaryText #4338CA`

Koyu tema (§1.2) — **yalnız §1.2'de tanımlı olanlar değişir**, kalanı açık temadan
mantıklı karşılıkla türetilir ve türetilen her değer için yorum satırı yazılır:
`screen #12141F` · `card #1B1E2C` · `cardBorder rgba(255,255,255,.07)` ·
`hairline rgba(255,255,255,.07)` · `text #F2F3FA` · `textSecondary rgba(255,255,255,.55)` ·
`textTertiary rgba(255,255,255,.45)` · `groupLabel rgba(255,255,255,.42)` ·
`iconTint rgba(255,255,255,.35)` · `accent #A5A8FF` · `accentSurface rgba(124,116,255,.16)` ·
`accentChipSurface rgba(124,116,255,.18)` · `warningText #E0A868` ·
`warningSurface rgba(224,168,104,.16)` · `successText #4ADE80` ·
`successSurface rgba(34,197,94,.14)` · `successDot #22C55E` ·
`toggleOff #2A2F45` · `toggleKnobOff #9AA0BC` · `control rgba(255,255,255,.07)`

Marka logosu gölgesi tema başına: açık `rgba(67,96,255,.24)`, koyu `rgba(47,109,255,.34)`
(§1.5 sonu) → `logoShadow` anahtarı.

### 1.2 `apps/mobile/src/design/themes.ts`

`MobileTheme` arayüzüne `readonly about: MobileAboutPalette;` ekle, `lightTheme` ve
`darkTheme` içine `about: redesignAboutLight / redesignAboutDark` yaz.
Diğer grupları **değiştirme**.

### 1.3 Ölçü token'ları

`mobileRadii` kilitli (00 §3). Bunun yerine aynı dosyaya (`design/tokens.ts`) yeni bir sabit:

```ts
export const mobileAboutMetrics = {
  cardRadius: 24,
  rowRadiusInner: 16,
  searchRadius: 16,
  noticeRadius: 20,
  sheetTopRadius: 30,
  sheetBottomRadius: 44,
  headerButton: 36,
  headerButtonRadius: 13,
  stickyHeaderButton: 32,
  stickyHeaderButtonRadius: 11,
  iconBox26: 26,
  iconBox26Radius: 9,
  iconBox30Radius: 11,
  iconBox32Radius: 11,
  iconBox44Radius: 15,
  chipRadiusSmall: 5,
  chipRadiusMedium: 7,
  pillRadius: 11,
  toggleWidth: 44,
  toggleHeight: 26,
  toggleRadius: 13,
  toggleKnob: 20,
  typePillWidth: 62,
  cardMargin: 16,
  cardPadding: 16,
  minRowHeight: 44,
  stickyHeaderThreshold: 12,
  stickyHeaderDurationMs: 160,
  footerButtonBottom: 26,
  footerButtonRadius: 16,
} as const;
```

`mobile-redesign-theme-contract.test.ts` içine bu sabiti kilitleyen bir `assert.deepEqual`
testi ekle (mevcut `mobileRadii` testinin hemen altına, aynı üslupla).

---

## 2. Metinler (`apps/mobile/src/locale/mobile-copy.ts`)

PROMPT.md §6'daki anahtarların tamamı `tr` **ve** `en` altına eklenir. Nokta → camelCase
eşlemesi (bağlayıcı, ekran promptları bu adları kullanır):

| PROMPT.md                                | Repo anahtarı                                                                                                                                                                     |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `about.title`                            | `aboutTitle`                                                                                                                                                                      |
| `about.build`                            | `aboutBuild`                                                                                                                                                                      |
| `about.copyDiagnostics` / `about.copied` | `aboutCopyDiagnostics` / `aboutCopied`                                                                                                                                            |
| `about.update.current                    | available                                                                                                                                                                         | checking` | `aboutUpdateCurrent` / `aboutUpdateAvailable` / `aboutUpdateChecking`            |
| `about.update.sub.*`                     | `aboutUpdateSubCurrent` / `...SubAvailable` / `...SubChecking`                                                                                                                    |
| `about.update.action.check               | update                                                                                                                                                                            | stop`     | `aboutUpdateActionCheck` / `...ActionUpdate` / `...ActionStop`                   |
| `about.section.*`                        | `aboutSectionWhatsNew` / `aboutSectionApp` / `aboutSectionSupport` / `aboutSectionCommunity` / `aboutSectionLegal`                                                                |
| `whatsNew.*`                             | `whatsNewTitle`, `whatsNewNotify`, `whatsNewFilterAll` …                                                                                                                          |
| `release.*`                              | `releaseTitle`, `releaseCurrentBadge`, `releaseGroupNew` …                                                                                                                        |
| `history.*`                              | `historyTitle`, `historySearch`, `historyInstalled`, `historySkipped`, `historyLoadOlder`                                                                                         |
| `channel.*`                              | `channelTitle`, `channelIntro`, `channelSave`, `channelStable`, `channelStableDesc` …                                                                                             |
| `beta.*`                                 | `betaTitle`, `betaIntro`, `betaBenefit`, `betaRisk`, `betaSafety`, `betaConsent`, `betaJoin`, `betaCancel`                                                                        |
| `help.*`                                 | `helpTitle`, `helpSearch`, `helpPopular`, `helpReadMeta`, `helpCategories`, `helpCategoryAccount` …                                                                               |
| `report.*`                               | `reportTitle`, `reportWhere`, `reportCategoryVoice` … `reportSubmit`, `reportTicket`                                                                                              |
| `community.*`                            | `communityTitle`, `communityShare`, `communityOnline` …                                                                                                                           |
| `rate.*`                                 | `rateTitle`, `rateReason`, `rateLabel1`…`rateLabel5`, `rateSubmit`, `rateStoreHint`, `rateStoreAction`, `rateLater`                                                               |
| `update.*`                               | `updateReady`, `updateMeta`, `updateActionNow`, `updateActionWhatsNew`, `updateActionSkip`, `updateInThisRelease`, `updateDownloading`, `updateProgressMeta`, `updateStepDownload | Verify    | Install`, `updatePause`, `updateResume`, `updateBackground`, `updateRestartNote` |

Kurallar:

- Türkçe metinler HTML'deki **birebir** metinlerdir (tırnak işaretleri `“ ”` dahil).
- Yer tutucular mevcut biçimi kullanır: `{count}`, `{version}`, `{date}`, `{size}`, `{n}`.
- Mevcut `aboutSettings*` anahtarları **silinmez** (başka ekranlar da okuyor olabilir);
  yeni ekran yeni anahtarları kullanır, kullanılmayanları prompt 15'te temizleyeceğiz.
- Sayı biçimleyici: `apps/mobile/src/locale/` altına `mobile-number-format.ts` ekle —
  `formatMobileBytes(bytes, locale)` → `48,2 MB` / `48.2 MB`;
  `formatMobileCompactCount(n, locale)` → `12,4B` / `12.4K`. Node testi yaz.

---

## 3. Ortak bileşenler

Yeni klasör: `apps/mobile/src/app/screens/about/`

- `about-primitives.tsx` + `about-primitives.styles.ts` — 00 §6'daki 11 bileşen.
- `about-icons.tsx` — tasarımdaki stroke ikonlarının `react-native-svg` karşılıkları.
  **Ionicons kullanma**: HTML'deki `path` verileri (kıvılcım, yukarı ok, anahtar, kalkan,
  deney tüpü, uyarı üçgeni, büyüteç, zil, pano, paylaş, zincir, kanal `#`, hoparlör,
  doğrulama rozeti, yıldız) birebir taşınır; `stroke-width` 1.9–2.2, `strokeLinecap="round"`.
  Her ikon `size` + `color` prop'u alır.

Bileşen davranış notları:

- `AboutRow` dokunulabilir olduğunda `Pressable` + `accessibilityRole="button"`;
  yalnız bilgi taşıyorsa `View`. `pressed` durumunda mevcut `styles.pressed` deseni.
- `AboutCard` çocuklarına hairline'ı **kendisi** koymaz; satırlar `isFirst` bilgisiyle
  `borderTopWidth` uygular (mevcut `AboutLegalRow` deseni).
- `AboutStickyHeader` animasyonu Reanimated ile UI thread'inde; `useAnimatedStyle` +
  `withTiming(160, Easing.out(...))`. `AccessibilityInfo.isReduceMotionEnabled` true ise
  anında geçiş.
- `AboutBrandLogo`, `AuthWelcomeBrandMark`'ı sarar ve `animated` davranışını
  `reduceMotion` ile kapatır. Bar yükseklikleri kanonik geometriden ölçeklenir; ekstra
  bar çizimi yapılmaz.

Bileşen testi: `apps/mobile/component-tests/mobile-about-primitives.test.tsx`

- `AboutRow` alt metinli/altsız padding farkı, min 44px yükseklik.
- `AboutTypePill` 62px sabit genişlik ve üç varyantın renk eşleşmesi.
- `AboutStickyFooterButton` `disabled` iken `onPress` çağrılmıyor.
- `AboutSearchField` placeholder rengi ve `onChangeText` akışı.

---

## 4. Rotalar

`MobileRootStackParamList`'e ekle (`mobile-navigation-types.ts`):

```ts
AboutWhatsNew: undefined;
AboutReleaseNote: { readonly version: string };
AboutReleaseHistory: undefined;
AboutUpdateChannel: undefined;
HelpCenter: undefined;
BugReport: { readonly category?: string } | undefined;
CommunityInvite: { readonly slug?: string } | undefined;
```

Sheet olan iki yüzey (2d beta onayı, 2h puanlama) **rota değildir**; overlay host üzerinden
açılır (`kit/overlay-registry.ts`). 1d indirme sayfası da overlay'dir.

Ayrıca:

- `mobile-navigator.tsx` — altı yeni `RootStack.Screen`.
- `mobile-screen-containers.tsx` — altı container, `onBack={() => navigation.goBack()}`.
- `mobile-linking.ts` — `screens` haritası + `resolveMobileRoutePathIntent`:
  `settings/about/whats-new`, `settings/about/releases`, `settings/about/releases/:version`,
  `settings/about/channel`, `help`, `help/report`, `invite/:slug`.
  **Dikkat:** `settings/:section` regex'i `^\/settings\/([^/]+)$` — iki segmentli about
  yolları buna takılmaz, ayrı eşleşme yazılmalı ve `settings/about/...` kalıbı
  `settings/:section`ten **önce** denenmeli.
- `mobile-navigation-ref.ts` — yeni `MobileNavigationRouteIntent` dalları.
- `mobile-deep-link-contract.test.ts` — yedi yeni yol için testler.

---

## 5. Veri bağlama

`apps/mobile/src/about/` (yeni klasör):

- `mobile-about-client.ts` — `01`'deki 9 uç için yol üreten saf fonksiyonlar + zod parse
  eden çağrılar (`mobile-legal-client.ts` deseni).
- `mobile-about-model.ts` — saf dönüştürücüler:
  - `resolveAboutUpdatePresentation(update, copy)` → §4.2 tablosundaki üç durumun
    (`current` / `available` / `checking`) kutu zemini, başlık, alt metin, buton etiketi.
    Ağ yoksa dördüncü durum: "Bağlantı yok · denetlenemedi" (PROMPT.md §9.5).
  - `groupReleaseChangesByType(changes)` → 2a'nın üç grubu, boş grup üretmez.
  - `groupReleasesByYear(releases)` → 2b yıl grupları.
  - `filterReleaseChanges(changes, filter)` → 1c çip filtresi; boş sonuçta
    `whatsNewEmpty` metnini işaret eden bayrak döner.
  - `buildDiagnosticsText(appInfo, device, locale, userId)` → §4.1 pano metni;
    kullanıcı kimliği **kısaltılmış** (ilk 8 karakter), token/e-posta asla girmez.
- `mobile-about-preferences.ts` — AsyncStorage anahtarları ve okuma/yazma:
  `whispr.about.seenVersion`, `whispr.update.skippedVersion`, `whispr.settings.autoUpdate`,
  `whispr.settings.channel`, `whispr.settings.betaConsentAt`, `whispr.rate.snoozedUntil`,
  `whispr.rate.submittedVersion`. Okuma tek `multiGet` ile paralel yapılır.
- `mobile-update-controller.ts` — **kritik parça**:

```ts
export type MobileUpdateStep = "download" | "verify" | "install";

export interface MobileUpdateProgress {
  readonly step: MobileUpdateStep;
  /** null = ilerleme ölçülemiyor (expo-updates yüzde vermiyor) */
  readonly percent: number | null;
  readonly downloadedBytes: number | null;
  readonly totalBytes: number | null;
  readonly etaSeconds: number | null;
  readonly network: "wifi" | "cellular" | "unknown";
}

export interface MobileUpdateController {
  readonly capabilities: {
    readonly canPause: boolean; // expo-updates: false
    readonly reportsPercent: boolean; // expo-updates: false
    readonly isEnabled: boolean; // Updates.isEnabled
  };
  check(): Promise<MobileUpdateState>;
  download(): Promise<void>;
  install(): Promise<void>;
  subscribe(listener: (snapshot: MobileUpdateSnapshot) => void): () => void;
}
```

- `createExpoUpdateController()` — `Updates.checkForUpdateAsync`, `fetchUpdateAsync`,
  `reloadAsync`. `canPause: false`, `reportsPercent: false`.
  `Updates.isEnabled === false` iken `check()` anında "OTA kapalı" durumu döner ve
  ekran bunu "Bu yapıda otomatik güncelleme kapalı" alt metniyle gösterir.
- `createFakeUpdateController(script)` — **yalnız testler ve Storybook benzeri
  geliştirme için**; ürün kodunda kullanılmaz.
- §4.3 kuralı burada uygulanır: `check()` en az 800 ms `checking` durumunda kalır.

- `mobile-about-queries.ts` — React Query hook'ları; anahtarlar
  `mobile-query-keys.ts` içine eklenir:
  `aboutUpdate()`, `aboutReleases()`, `aboutRelease(version)`, `aboutStatus()`,
  `helpArticles(params)`, `helpSearch(query)`.
  - `aboutStatus` 60 sn `staleTime`, arka planda yenilenir.
  - `aboutReleases` `useInfiniteQuery` (20'lik sayfalama).
  - `helpSearch` 300 ms debounce (§4.14/§4.17) — debounce hook'u ekrana değil, buraya.

---

## 6. Testler

`apps/mobile` içinden node testleri:

- `scripts/mobile-about-model.test.ts` — `resolveAboutUpdatePresentation` dört durum,
  `groupReleaseChangesByType` boş grup üretmiyor, `groupReleasesByYear` sıralaması,
  `filterReleaseChanges` boş sonuç bayrağı, `buildDiagnosticsText` içinde token/e-posta yok.
- `scripts/mobile-update-controller.test.ts` — 800 ms `checking` alt sınırı (sahte zamanlayıcı),
  `isEnabled=false` yolunda `download()` çağrılmıyor, `subscribe` aboneliği sızdırmıyor.
- `scripts/mobile-about-preferences.test.ts` — anahtar adları, `multiGet` paralelliği,
  bozuk değerlerde varsayılana düşme.
- `scripts/mobile-number-format.test.ts` — `48,2 MB` / `48.2 MB`, `12,4B` / `12.4K`.
- `scripts/mobile-deep-link-contract.test.ts` — yedi yeni yol (mevcut dosyaya ekleme).
- `scripts/mobile-redesign-theme-contract.test.ts` — `mobileAboutMetrics` kilidi +
  `about` grubunun iki temada da aynı anahtar kümesine sahip olması.
- `scripts/mobile-copy-parity.test.ts` — otomatik geçer, ama çalıştırılıp doğrulanır.

Bileşen testi: `component-tests/mobile-about-primitives.test.tsx` (§3).

---

## 7. Doğrulama

```bash
pnpm --filter @wizards/mobile typecheck
```

`apps/mobile` içinden:

```bash
node --test --import tsx scripts/mobile-about-model.test.ts
```

```bash
npx jest component-tests/mobile-about-primitives.test.tsx
```

## 8. Bitiş kriterleri

1. `theme.about` iki temada da eksiksiz; bileşenlerde ham renk literali yok.
2. `mobileAboutMetrics` kilitli testle korunuyor; `mobileRadii` **değişmedi**.
3. §2 tablosundaki tüm anahtarlar `tr` ve `en` altında; copy parity yeşil.
4. 11 ortak bileşen + ikon seti yazıldı, bileşen testi yeşil.
5. Altı rota + yedi derin bağlantı çalışıyor, sözleşme testi yeşil.
6. `MobileUpdateController` arayüzü + expo adaptörü + fake adaptör hazır; **hiçbir yerde
   sahte yüzde üretilmiyor**.
7. Mobil typecheck 0 hata, yeni testlerin tamamı yeşil.
8. **Commit atılmadı.**
