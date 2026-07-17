# Whispr Mobile 4A/4B/4C Ekranları Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 4A DM sohbet, 4B Hesap ayarları ve 4C Görünüm ayarları ekranlarını `design_handoff_whispr_mobile/Whispr Mobile Redesign.dc.html` (#4a/#4b/#4c) kaynağına piksel-birebir uygulamak; tüm işlevler gerçek API/store verisiyle çalışacak, emülatörde görsel + fonksiyon doğrulamasıyla kapanacak.

**Architecture:** Mevcut ekran/props mimarisi korunur (ekran bileşenleri `mobile-product-screen-provider`dan veri alır, stiller `useThemedStyles(create*Styles)` fabrikalarıyla temadan türetilir). 4A mevcut `DMConversationScreen` prop sözleşmesi içinde yeniden çizilir (kanal 1b render'ına dokunulmaz — DM'e özgü balon bileşenleri ayrı dosyada). 4B/4C `SettingsDetail` route'unun `account`/`appearance` dallarını yeni ekran dosyalarıyla değiştirir. Vurgu rengi + metin boyutu, tema sağlayıcısına eklenen kompozisyon katmanıyla (base theme → accent override → font-scale) sağlanır; varsayılan accent + scale 1 mevcut temayla bit-eşdeğerdir (1a–1j golden'ları kırılmaz).

**Tech Stack:** Expo 56 / RN 0.85, React Navigation, FlashList, TanStack Query, AsyncStorage, zod (`@wizards/types`), Next.js API routes (apps/web, mobil endpoint'ler), Jest + @testing-library/react-native.

**Kanonik referans:** `design_handoff_whispr_mobile/Whispr Mobile Redesign.dc.html` `#4a` (satır 34–127), `#4b` (129–233), `#4c` (235–325). Tüm px değerleri oradan; tereddütte HTML açılıp ölçülür.

---

## Dosya Haritası

| Dosya | İşlem | Sorumluluk |
|---|---|---|
| `packages/types/src/mobile.ts` | Modify | `MobileAccountSettings*` şemaları; `MobileVoiceTokenRequestSchema`'ya `conversationId`; DM konuşma yanıtına `participantReadStates` |
| `apps/web/src/app/api/v1/mobile/account/settings/route.ts` (+`route-logic.ts`, test) | Create | GET/PATCH: email, emailVerified, bio, customStatus, dmPolicy, friendRequestPolicy |
| `apps/web/src/app/api/v1/mobile/voice/token/route.ts` | Modify | `conversationId` passthrough → `dm:{id}` odası |
| `apps/web/src/app/api/v1/mobile/dm/[conversationId]/messages/route-logic.ts` | Modify | Yanıta katılımcı `lastReadAt` map'i (okundu çift-tiki için) |
| `apps/mobile/src/account/mobile-account-settings-client.ts` (+test) | Create | Yeni endpoint istemcisi + TanStack query/mutation |
| `apps/mobile/src/design/mobile-appearance-preferences.ts` (+test) | Create | Accent id + font-scale tipleri, normalize, AsyncStorage anahtarları, `composeMobileTheme(base, accent, fontScale)` |
| `apps/mobile/src/app/providers/mobile-theme-provider.tsx` | Modify | accent + fontScale state; compose edilmiş tema; `useAppearancePreferences()` |
| `apps/mobile/src/app/screens/dm-conversation-screen.tsx` | Rewrite | 4A ekranı (header, akış, composer kompozisyonu) |
| `apps/mobile/src/app/components/dm-chat-primitives.tsx` (+`.styles.ts`) | Create | E2E rozeti, DM balonları (gelen/giden, grup köşe kuralları), tepki pill'i, typing dots, tarih ayırıcı |
| `apps/mobile/src/app/composer/mobile-dm-composer-redesign.tsx` yoksa mevcut `mobile-composer.tsx` | Modify | 4A composer görünümü: `+` buton, input pill + emoji, mic↔send morph, sesli kayıt UI |
| `apps/mobile/src/app/screens/mobile-account-settings-screen.tsx` (+`.styles.ts`) | Create | 4B ekranı |
| `apps/mobile/src/app/screens/mobile-appearance-settings-screen.tsx` (+`.styles.ts`) | Create | 4C ekranı |
| `apps/mobile/src/app/screens/settings-screen.tsx` | Modify | `account`/`appearance` dallarını yeni ekranlara delege et |
| `apps/mobile/src/voice/use-mobile-voice-room.ts` | Modify | `joinDirectCall({conversationId, title, video})` — voice-state API'siz LiveKit bağlantısı |
| `apps/mobile/src/locale/mobile-copy.ts` | Modify | Tüm yeni string'ler (tr + en) |
| `apps/mobile/component-tests/mobile-dm-conversation-redesign.test.tsx` | Create | 4A geometri + davranış testleri |
| `apps/mobile/component-tests/mobile-account-settings-redesign.test.tsx` | Create | 4B testleri |
| `apps/mobile/component-tests/mobile-appearance-settings-redesign.test.tsx` | Create | 4C + accent/font-scale testleri |

**Spec sapmaları (bilinçli, gerekçeli):**
- 4B "Profil görünürlüğü" ve "Çevrimiçi durum" tercihlerinin backend alanı yok → cihazda persist edilen gerçek tercih (AsyncStorage), diğer iki satır (`dmPolicy`, `friendRequestPolicy`) sunucuya yazılır (spec de yalnız bu ikisi için sunucu şart koşuyor).
- 4B Güvenlik Merkezi satırları tasarım gereği `YAKINDA` rozetiyle disabled (backend 2FA hazır olsa da tasarım kanonik).
- Sesli mesaj kaydı: mic basılı tutma → kayıt süresi + kaydırarak iptal UI'ı; kayıt `expo-audio` ile alınır, mevcut attachment pipeline'ı audio kabul ediyorsa gönderilir; etmiyorsa kayıt UI'ı tamam ama gönderim ek menüsündeki dosya akışına düşer (raporda belirtilecek).

---

### Task 1: Görünüm tercihleri altyapısı (accent + font scale)

**Files:**
- Create: `apps/mobile/src/design/mobile-appearance-preferences.ts`
- Create: `apps/mobile/component-tests/mobile-appearance-settings-redesign.test.tsx` (ilk testler)
- Modify: `apps/mobile/src/app/providers/mobile-theme-provider.tsx`

- [ ] **Step 1: Failing test yaz** — `composeMobileTheme(lightTheme, "indigo", 1) === lightTheme` (kimlik); `composeMobileTheme(lightTheme, "violet", 1).accent.default === "#8B5CF6"`; `composeMobileTheme(lightTheme, "indigo", 1.15).typography.body.fontSize` ≈ 15×1.15; normalize fonksiyonları bilinmeyen değerde varsayılana döner.
- [ ] **Step 2: `jest mobile-appearance-settings-redesign` → FAIL doğrula**
- [ ] **Step 3: Implement** —

```ts
export const MOBILE_ACCENT_PREFERENCE_KEY = "whispr.mobile.accent-preference";
export const MOBILE_FONT_SCALE_PREFERENCE_KEY = "whispr.mobile.font-scale-preference";
export const MOBILE_ACCENT_OPTIONS = [
  { id: "indigo", color: "#4F46E5" },
  { id: "violet", color: "#8B5CF6" },
  { id: "blue", color: "#3B82F6" },
  { id: "green", color: "#22A366" },
  { id: "pink", color: "#E0527E" },
  { id: "amber", color: "#C77A2B" },
] as const;
export type MobileAccentId = (typeof MOBILE_ACCENT_OPTIONS)[number]["id"];
export const MOBILE_FONT_SCALE_STEPS = [0.85, 0.925, 1, 1.075, 1.15] as const;
export type MobileFontScaleStep = 0 | 1 | 2 | 3 | 4; // index; 2 = varsayılan
```

`composeMobileTheme`: `accent==="indigo" && step===2` → base döndür (referans eşitliği, golden güvence). Aksi halde yeni obje: accent.default/action = renk; accent.strong = renk (light'ta koyu ton map'i: violet #7C3AED, blue #2563EB, green #1B8A55, pink #C2185B, amber #A85F1B; dark'ta renk aynı); accent.soft = `rgba(renk,0.10)` hex8, softBorder = `rgba(renk,0.20)` hex8; gradients.primaryAction = [renk, strong]; elevation.primaryAction.shadowColor = renk; border.focus = renk. Font scale: typography'nin tüm `fontSize/lineHeight` değerleri çarpılır (deepFreeze'li kopya, `letterSpacing` sabit). Sonuç memoize edilir (Map key: `${base.id}:${accent}:${step}`).
- [ ] **Step 4: Provider'ı genişlet** — `MobileThemeProvider` accent+scale state'i AsyncStorage'dan yükler, `setAccent`/`setFontScaleStep` persist eder, `theme = composeMobileTheme(getMobileTheme(mode, systemScheme), accent, step)`. Yeni hook: `useMobileAppearancePreferences()` → `{ mode, setMode, resolvedTheme, accent, setAccent, fontScaleStep, setFontScaleStep }`. Mevcut `useThemePreference` bozulmaz.
- [ ] **Step 5: Testleri koştur → PASS**; `npm run typecheck` temiz.

### Task 2: Backend — mobil hesap ayarları + DM okundu + DM call token

**Files:**
- Modify: `packages/types/src/mobile.ts` (+`mobile.test.ts`)
- Create: `apps/web/src/app/api/v1/mobile/account/settings/route.ts`, `route-logic.ts`, `route-logic.test.ts`
- Modify: `apps/web/src/app/api/v1/mobile/voice/token/route.ts`
- Modify: `apps/web/src/app/api/v1/mobile/dm/[conversationId]/messages/route-logic.ts` (+test)

- [ ] **Step 1: Tipler (failing testlerle)** —

```ts
export const MobileAccountPrivacyPolicySchema = z.enum(["EVERYONE", "FRIENDS", "NO_ONE"]);
export const MobileAccountSettingsResponseSchema = z.object({
  account: z.object({
    bio: z.string().nullable(),
    customStatus: z.string().nullable(),
    email: z.string().email(),
    emailVerified: z.boolean(),
  }),
  privacy: z.object({
    dmPermission: MobileAccountPrivacyPolicySchema,
    friendRequests: MobileAccountPrivacyPolicySchema,
  }),
});
export const MobileAccountSettingsUpdateSchema = z.object({
  dmPermission: MobileAccountPrivacyPolicySchema.optional(),
  friendRequests: MobileAccountPrivacyPolicySchema.optional(),
}).refine((v) => Object.keys(v).length > 0);
```

`MobileVoiceTokenRequestSchema` → `channelId` VEYA `conversationId` (tam biri). `MobileDMMessagesResponseSchema`'ya `participantReadStates: z.array(z.object({ userId, lastReadAt: z.string().datetime().nullable() })).optional()`.
- [ ] **Step 2: Settings route** — `requireMobileApiUserId` + rate limit `mobile:account:settings`; GET prisma `user.findUnique` (email, emailVerified, bio, customStatus, settings.dmPolicy, settings.friendRequestPolicy); PATCH `userSettings.update` (enum map: `EVERYONE/FRIENDS/NO_ONE` ↔ `DmPolicy`/`FriendRequestPolicy` — `@wizards/db` enum adlarını implementasyonda doğrula, farklıysa map yaz). Route-logic testleri dependency-injection kalıbıyla (bkz. `account/profile/route-logic.ts`).
- [ ] **Step 3: Voice token route** — body'den `conversationId` geçir: `createLiveKitToken(userId, { channelId: body.channelId, conversationId: body.conversationId })`; yanıt şemasına `conversationId` opsiyonel.
- [ ] **Step 4: DM messages route** — yanıt objesine `participantReadStates` ekle (`dMParticipant.findMany({ where: { conversationId }, select: { userId, lastReadAt } })`).
- [ ] **Step 5: `pnpm --filter @wizards/types test` + web route testleri PASS; typecheck.**

### Task 3: 4A — DM sohbet ekranı redesign

**Files:**
- Create: `apps/mobile/src/app/components/dm-chat-primitives.tsx` + `.styles.ts`
- Rewrite: `apps/mobile/src/app/screens/dm-conversation-screen.tsx`
- Modify: `apps/mobile/src/app/composer/mobile-composer.tsx` (DM varyantı), `apps/mobile/src/dm/mobile-dm-client.ts` (readStates), `mobile-copy.ts`
- Test: `apps/mobile/component-tests/mobile-dm-conversation-redesign.test.tsx`

- [ ] **Step 1: Failing geometri/davranış testleri** — stil fabrikasından: gelen balon `{borderRadius: 18, borderBottomLeftRadius: 6, backgroundColor: theme.surface.card, borderColor: theme.border.subtle}`, giden `{backgroundColor: theme.accent.action, borderBottomRightRadius: 6}`, header avatar 44/r16, buton 44/r15, E2E rozeti `{backgroundColor: theme.accent.soft, borderColor: theme.accent.softBorder, borderRadius: 14}`; davranış: draft yazınca send butonu görünür (testID `mobile-dm-send-button`), boşken mic (`mobile-dm-voice-record-button`); balon uzun basınca tepki menüsü; typing satırı "yazıyor…" durumu.
- [ ] **Step 2: FAIL doğrula.**
- [ ] **Step 3: `dm-chat-primitives` implement** — HTML #4a değerleri: E2E (kilit 13px, metin 11.5/600 `accent.strong`, padding 7×13); tarih ayırıcı 11.5/700 ls .1em `text.visualFaint`; gelen: beyaz kart, 1px border, `18/18/18/6`, padding 11×14, metin 14/1.45, 30px/r11 mini avatar (grup ilk mesaj), saat 10.5 `text.placeholder`; giden: `accent.action` zemin, beyaz metin, ilk `18/18/6/18` devam `18/6/18/18`, gölge `0 4px 12px rgba(79,70,229,.22)` (accent'ten türet), çift-tik SVG 14px — iletildi `#9AA0BC`, okundu accent (karşı `lastReadAt >= createdAt`); tepki pill absolute `right:10,bottom:-11`, beyaz, r11, padding 2×7, gölge; typing: 3 nokta 6px (`#B7BCD6/#9AA0BC/#DDE0F0` token eşlenikleri), sıralı opacity animasyonu (Reanimated); gruplama: aynı yazar + 60sn içi.
- [ ] **Step 4: Ekranı yeniden yaz** — mevcut prop sözleşmesi AYNEN korunur. Header: geri (40px, şeffaf, chevron 2.2 stroke), avatar+presence (13px dot, 2.5 beyaz ring), ad 16/800, durum satırı: typingLabel varsa "yazıyor…" (accent değil, 12/600 `#22A366`→success token) / partner presence ONLINE ise "Çevrimiçi" / değilse "Son görülme {relative}" (`lastMessageAt`dan; participants presence gerçek); sağda tel + kamera butonları (`onStartVoiceCall/onStartVideoCall` yeni opsiyonel proplar). Liste: FlashList `inverted`, en yeni altta; E2E rozeti + tarih ayırıcılar `getMobileMessageStreamItems` üzerine DM item builder. Composer: `+` 44/r15 soft zemin → mevcut ek menüsü; input pill r16 soft zemin, placeholder "Mesaj yaz…", içinde emoji butonu (mevcut emoji picker); sağ buton: draft boş → mic (basılı tut: kayıt süresi + "iptal için kaydır" bandı), draft dolu → send morph (LayoutAnimation/Reanimated); alt safe-area `use-mobile-bottom-system-spacing`.
- [ ] **Step 5: Ekran testleri PASS + snapshot yok (geometri assertleri).**
- [ ] **Step 6: Eski stiller** — `dm-screen.styles.ts` içinde artık kullanılmayan conversation-screen stillerini temizle (inbox 1c stillerine DOKUNMA).

### Task 4: DM sesli/görüntülü arama (4A butonları)

**Files:**
- Modify: `apps/mobile/src/voice/mobile-voice-client.ts` (`fetchMobileVoiceToken` conversationId), `use-mobile-voice-room.ts` (`joinDirectCall`), `mobile-product-screen-provider.tsx` (DM ekranına handler'lar), voice room ekranı başlık fallback
- Test: mevcut voice contract test dosyasına ek

- [ ] **Step 1: Failing test** — `joinDirectCall` çağrısı token'ı `{conversationId}` ile ister, voice-state POST atmaz, roomState `serverId: null, channelName: conversationTitle` olur.
- [ ] **Step 2: Implement** — `joinDirectCall({ conversationId, title, video })`: mikrofon izni → token fetch (`conversationId`) → LiveKit connect (mevcut connect yolu yeniden kullanılır; heartbeat/voice-state atlanır — `sessionMode: "dm-call"` flag'i); video=true ise kamera track publish (mevcut kamera contract). VoiceRoom ekranı `serverId===null` iken sunucu adı yerine DM başlığı gösterir.
- [ ] **Step 3: DM ekranından bağla** — provider'da `onStartVoiceCall/onStartVideoCall` → `joinDirectCall` + `navigate("VoiceRoom")`.
- [ ] **Step 4: Testler + typecheck PASS.**

### Task 5: 4B — Hesap ayarları ekranı

**Files:**
- Create: `apps/mobile/src/account/mobile-account-settings-client.ts` (+`scripts/mobile-account-settings-client.test.ts` node testi)
- Create: `apps/mobile/src/app/screens/mobile-account-settings-screen.tsx` + `.styles.ts`
- Modify: `settings-screen.tsx` (account dalı delegasyonu), `mobile-copy.ts`
- Test: `apps/mobile/component-tests/mobile-account-settings-redesign.test.tsx`

- [ ] **Step 1: İstemci + query** — `fetchMobileAccountSettings` / `updateMobileAccountSettings` (endpoint `/api/v1/mobile/account/settings`), TanStack `useMobileAccountSettingsQuery` + optimistic mutation. Failing node testi → implement → PASS.
- [ ] **Step 2: Failing ekran testleri** — başlık "Hesap" 22/800; profil kartı r24; avatar 58/r20; ÇEVRİMİÇİ pill `{backgroundColor: theme.status.successSoft, color: successText}` 10/800; alan pill'i r14 soft zemin, etiket 10/700 ls 1.2; kopyala butonuna basınca `Clipboard.setStringAsync` + toast; gizlilik satır yüksekliği ≥44, ikon kutusu 38/r13; seçenek sheet'i üç seçenek; YAKINDA rozeti disabled satır.
- [ ] **Step 3: Ekran implement** — HTML #4b birebir: header (geri 40px beyaz kart), profil özeti (ad 17/800 + pill; @kullanıcı 12.5 secondary; GÖRÜNEN AD/KULLANICI ADI (+kopyala)/E-POSTA (+Doğrulandı yeşil rozet veya turuncu "Doğrula" — `emailVerified` gerçek)); alan pill'ine dokun → inline düzenleme `BottomSheet` (displayName/username → mevcut profil PATCH; e-posta salt-okunur); profil tamamlanma: `[avatarUrl, displayName, bio, customStatus, emailVerified]` doluluk oranı, bar 7px `#EDEEF6` track + `#7C6CF6→#4F46E5` LinearGradient (accent'e bağlı); GİZLİLİK grubu: 4 satır (Profil görünürlüğü + Çevrimiçi durum → AsyncStorage tercihi `whispr.mobile.privacy-visibility.*`; DM izinleri + Arkadaşlık istekleri → sunucu mutation), değer etiketi Herkes/Arkadaşlar/Hiç kimse, `BottomSheet` seçenek listesi; GÜVENLİK MERKEZİ: 2 satır YAKINDA disabled. Loading: gerçek geometrili `Skeleton`; error: retry bandı. testID: `mobile-account-settings-screen`.
- [ ] **Step 4: settings-screen.tsx dalını değiştir** — `resolvedSection === "account"` → yeni ekran (`useMobileSettingsScreenProps` bootstrap'ı + locale geçirilir).
- [ ] **Step 5: Testler PASS; typecheck.**

### Task 6: 4C — Görünüm ayarları ekranı

**Files:**
- Create: `apps/mobile/src/app/screens/mobile-appearance-settings-screen.tsx` + `.styles.ts`
- Modify: `settings-screen.tsx` (appearance dalı), `mobile-copy.ts`
- Test: `mobile-appearance-settings-redesign.test.tsx` (Task 1 dosyasına ekran testleri)

- [ ] **Step 1: Failing testler** — TEMA: 3 kart, seçili kart `{borderWidth: 2, borderColor: theme.accent.default}` + onay rozeti; `setMode` çağrısı; VURGU: 6 swatch 38px daire, seçilide tik, `setAccent` çağrısı; YERLEŞİM: 2 kart, `setLayout("compact")` çağrısı; METİN BOYUTU: slider 5 kademe `setFontScaleStep`.
- [ ] **Step 2: Implement** — HTML #4c birebir: bölüm başlıkları 11.5/700 ls .12em faint, padding 18×24→8; tema kartları r20 padding 10, preview 64px r13 (açık `#F6F7FB`, koyu `#141625` + `#7C6CF6` çubuk, sistem yarım-yarım), seçili gölge `0 6px 16px rgba(79,70,229,.15)`; swatch satırı beyaz kart r20 padding 14×16, seçili: 3px beyaz iç border + `0 0 0 2.5px renk` ring (RN: iç içe View halkaları) + beyaz tik; yerleşim kartları preview 88px (sol rail mini-mock: 18px rail sütunu; sekmeli: 16px alt bar) + alt etiketler ("Varsayılan · hızlı geçiş" / "Rail gizli · sheet ile geçiş"); metin boyutu: küçük A 12/700 faint — track 6px r3 `#EDEEF6`, dolgu accent, thumb 22px beyaz `2px accent` (PanResponder/Slider, 5 snap) — büyük A 19/800. Tüm seçimler ANINDA uygulanır (provider) + persist. testID: `mobile-appearance-settings-screen`.
- [ ] **Step 3: settings-screen.tsx dalı → yeni ekran; eski `SettingsAppearanceSelector/SettingsWorkspaceLayoutSelector` yalnız legacy/hub akışında kalır.**
- [ ] **Step 4: Testler PASS; typecheck.**

### Task 7: Kalite kapıları

- [ ] `apps/mobile`: `npm run typecheck` → 0 hata
- [ ] `npm run test:components` → tümü yeşil (mevcut redesign testleri dahil — 1b/1c kırılmamış olmalı)
- [ ] `npm run test` (node script testleri) → yeşil
- [ ] `npm run quality:check` → yeşil
- [ ] `packages/types` + web route testleri → yeşil

### Task 8: Emülatör görsel + fonksiyon doğrulama döngüsü

- [ ] HTML `#4a/#4b/#4c` çerçevelerinin 390×844 referans PNG'lerini üret (browser + crop)
- [ ] Uygulamayı emülatörde başlat (`npm run android` / UAT build), UAT hesabıyla gir
- [ ] Uygulama İÇİNDEN navige: Mesajlar→konuşma (4A), Profil→Hesap (4B), Profil→Görünüm (4C); `adb exec-out screencap -p` ile yakala
- [ ] Yan yana + pixel-diff karşılaştır (pixelmatch/sharp; status bar maskesi) — fark → düzelt → tekrarla
- [ ] Fonksiyon listesi (prompt'taki 6. madde) fiilen dokunularak doğrulanır; koyu tema turu; rapor: ekran çifti + diff + checklist

## Kabul Kriterleri (prompt'tan)

1. Üç ekran HTML referansla piksel uyumlu (diff temiz; fark yalnız status bar/gerçek veri)
2. Fonksiyon testleri emülatörde geçti; typecheck+testler+quality yeşil
3. Gerçek veri, TR i18n, loading/empty/error, açık+koyu tema, ≥44px hedefler, anında uygula+persist
4. Commit YOK — kullanıcı onayı beklenir
