# Whispr Mobil UX Performans + İstekler Yenileme — Sıralı Prompt'lar (9a → 9d)

Bu dosya 4 bağımsız prompt içerir. Her birini ayrı bir Claude Code oturumuna tek başına
yapıştırabilirsin; her biri kendi bağlamını taşır.

**Sıra önerisi:** 9a → 9b → 9c → 9d. 9b ve 9c nav-bar tarafında örtüşür (9b sheet
yüzeyleri, 9c ekranlar); 9a ve 9d bağımsızdır.

**Her oturumda ilk mesajdan önce `/caveman ultra` çalıştır** (yanıtlar kısa olsun,
kod ve teknik içerik etkilenmez).

---
---

## PROMPT 1 / 4 — 9a: Klavye açılış performansı (Instagram/WhatsApp hissi)

Whispr mobil uygulamasında (Expo SDK 56 / RN 0.85, `apps/mobile`) metin kanalı ve DM
ekranında composer'a dokununca klavye gecikmeli/janklı geliyor. Kök nedeni düzelt:
klavye IME animasyonuyla piksel-senkron, 60fps, Instagram/WhatsApp akıcılığında açılsın.

### Bağlam ve kurallar
- Branch: `uat`. **Commit atma.** Emülatör doğrulamasını ben yapacağım; sen emülatör
  başlatmaya çalışma, sadece typecheck + testleri koştur.
- Kütüphaneler hazır: `react-native-keyboard-controller` 1.22 (root'ta `KeyboardProvider`,
  `App.tsx:33`), `react-native-reanimated` 4.3, FlashList 2.

### Teşhis (doğrula, sonra düzelt)
- **Ana kök neden:** `apps/mobile/src/app/mobile-app-shell.tsx` (satır ~27-36) klavye
  yüksekliğini `useAnimatedStyle` ile **`paddingBottom`** olarak animate ediyor.
  `paddingBottom` layout property'dir: klavye animasyonunun HER frame'inde Yoga layout
  yeniden hesaplanır ve tüm ağaç (header + FlashList mesaj listesi + composer) yeniden
  yerleşir. Mesaj listesi doluyken bu frame düşürür — "klavye yavaş geliyor" hissi budur.
  Instagram/WhatsApp bu işi transform (compositing) ile yapar, layout ile değil.
- İkincil kontroller:
  - `KeyboardProvider`'a Android edge-to-edge için `statusBarTranslucent` /
    `navigationBarTranslucent` prop'ları gerekiyor mu (keyboard-controller dokümantasyonuna
    göre edge-to-edge'de ölçüm doğruluğu) — incele, gerekiyorsa ekle.
  - Composer TextInput odaklanınca tetiklenen state güncellemeleri / re-render zinciri
    (`apps/mobile/src/app/composer/mobile-composer.tsx`) — odak anında ağır iş varsa kaldır.
  - `app.config.js`'te `android.softwareKeyboardLayoutMode` set edilmemiş — SDK 56
    edge-to-edge'de doğru davranışın hangisi olduğunu araştır; keyboard-controller ile
    çakışmayacak şekilde bırak/ayarla.

### Uygulama hedefi
- Klavye animasyonu **süresince** layout property animate edilmeyecek; kaydırma yalnız
  `transform: translateY` ile yapılacak (UI thread, layout tetiklemez). Animasyon
  bittiğinde kalıcı yerleşim (padding/height) **tek seferde** uygulanıp transform
  sıfırlanabilir — re-layout maliyeti tek frame'e iner. Alternatif olarak
  keyboard-controller'ın `KeyboardStickyView` bileşenini composer için değerlendir.
  İki deseni de dene, akıcı olanı seç; seçimini kısa gerekçeyle raporla.
- Mimari not: bugün klavye kaydırmasını app-shell (tek merkez) sahipleniyor. Bu tek
  merkezlilik korunabilir (shell transform'a geçer) ya da sorumluluk chat ekranlarına
  inebilir (`channel-screen.tsx:258` civarı yorum + `dm-conversation-screen.tsx`).
  Hangisini seçersen seç: **auth formları dahil hiçbir ekranda input klavye altında
  kalmayacak** — bugünkü davranış (shell her ekranı küçültüyor) regresyona uğramamalı.
- Chat ekranında klavye açılırken: composer IME üst kenarıyla senkron hareket eder,
  mesaj listesi son mesajı görünür tutar (inverted FlashList), açılış/kapanışta beyaz
  boşluk/sıçrama olmaz.
- Klavye açıkken ekran değiştirme, emoji/GIF sheet açma (composer'daki), reply moduna
  girme akışlarında regresyon olmamalı.

### Korunacak sözleşmeler
- `apps/mobile/scripts/mobile-navigation-contract.test.ts` → `KeyboardAvoidingView`
  yasak (satır 207-208), `<KeyboardProvider>` şart (satır 198). Bu testler geçmeye
  devam etmeli; davranış değiştiyse testi anlamlı şekilde güncelle.
- `resolveMobileKeyboardLift` / `resolveMobileBottomKeyboardSpacing`
  (`apps/mobile/src/app/mobile-bottom-system-inset.ts`) worklet'leri bottom-sheet de
  kullanıyor — imza bozma; davranış değişirse birim testlerini güncelle.

### Kabul kriterleri
1. Klavye açılış/kapanışında animasyon frame'lerinde layout property animate edilmiyor
   (kodda `useAnimatedStyle` → padding/height per-frame animasyonu kalmadı).
2. Kanal + DM ekranında composer klavyeyle senkron; son mesaj görünür kalıyor.
3. Auth ekranları dahil hiçbir input klavye altında kalmıyor.
4. Kontrat testleri + mevcut jest/node testleri yeşil.

### Doğrulama (hepsi geçmeli, commit yok)
```
pnpm --filter @wizards/mobile typecheck
cd apps/mobile && node --test --import tsx scripts/*.test.ts
pnpm --filter @wizards/mobile test:components
```
Bittiğinde: değişen dosyalar, seçilen desen (transform-commit mi KeyboardStickyView mi)
ve emülatörde neyi doğrulamam gerektiği (hangi ekran, hangi jest) — kısa özet.

---
---

## PROMPT 2 / 4 — 9b: Bottom sheet'ler — hızlı açılış, kapanış animasyonu, nav bar uyumu

Whispr mobilde (`apps/mobile`) alttan açılan tüm sheet'ler (emoji seçici, bildirimleri
temizle onayı, context menü, GIF seçici, forward sheet, sunucu değiştirici…) geç ve
garip açılıyor. Tek sheet primitive'i `apps/mobile/src/app/components/kit/bottom-sheet.tsx`
olduğu için düzeltme merkezden yapılacak.

### Bağlam ve kurallar
- Branch: `uat`. **Commit atma.** Emülatörü ben doğrularım; sen typecheck + testler.
- Prompt 9a uygulandıysa klavye kaydırma deseni değişmiş olabilir — `resolveMobileKeyboardLift`
  kullanımını mevcut haliyle koru/uyarla.

### Teşhis (doğrula, sonra düzelt)
`kit/bottom-sheet.tsx` bugün:
1. **Açılış gecikmesi:** `if (!open) return null` → açılışta RN `Modal` (Android'de yeni
   native window) + içinde **yeni bir `KeyboardProvider`** mount ediliyor; spring ancak
   mount sonrası `useEffect`'te başlıyor. Native window oluşturma + provider mount +
   effect zinciri = dokunuş ile görsel arasında hissedilir gecikme.
2. **Kapanış animasyonu YOK:** `onClose` parent'ta `open=false` yapınca bileşen anında
   `null` dönüyor — sheet pat diye kayboluyor. "Garip animasyon" hissinin ana parçası.
3. **Backdrop animasyonsuz:** panel spring ile inerken karartma aniden beliriyor/yok oluyor.
4. **Spring gevşek:** `damping 24 / stiffness 240` — yavaş hissettiriyor.
5. **Sheet → sheet geçişi:** uzun basış menüsü (`message-action-menu.tsx`, ayrı Modal)
   kapanıp emoji seçici (BottomSheet Modal) açılırken iki native window değişimi var —
   arada boş frame'ler.

### Uygulama hedefi
- **Öncelikli mimari:** `Modal`'ı kaldırıp sheet'leri uygulama ağacının en üstünde bir
  host/portal katmanında (absolute fill, `GestureHandlerRootView` içinde) render etmeyi
  değerlendir — açılış anında native window maliyeti sıfırlanır, root'taki tek
  `KeyboardProvider` yeterli olur, iç içe `KeyboardProvider` silinir. Android geri tuşu
  (`BackHandler`), accessibility (`accessibilityViewIsModal`), status/nav bar üstüne
  çizim (edge-to-edge'de absolute katman zaten pencerenin tamamını kaplar) korunmalı.
  Bu geçiş riskli/karmaşık çıkarsa B planı: Modal kalsın ama ilk frame'den animasyon
  başlat (mount öncesi `translateY` hazır, `onShow`'da değil layout'ta tetikle) ve
  Modal'ı sheet kapandıktan SONRA kaldır.
- **Kapanış animasyonu ekle:** `open=false` olduğunda önce panel `translateY` snapPoint'e
  animate olur + backdrop söner, animasyon bitince unmount (`runOnJS` ile). Sürükleyerek
  kapatmada da aynı çıkış animasyonu.
- **Backdrop:** opacity'yi panelin `translateY`'sinden türet (`interpolate`), giriş/çıkışta
  yumuşak fade.
- **Hız:** açılış ~250ms hissiyatı — spring'i sıkılaştır (ör. `stiffness 420-520,
  damping 34-38` bandında dene) ya da `withTiming` ~240ms `Easing.out(cubic)` + kapanış
  ~200ms `Easing.in(cubic)`. Fiziksel/yumuşak duran kombinasyonu seç, değerleri raporla.
  `useReducedMotion` desteği korunmalı.
- **Nav bar uyumu (bu prompt'un ikinci yarısı):**
  - Panel bugün `paddingBottom: theme.spacing.page + bottomSystemInset` alıyor
    (`useMobileBottomSystemSpacing`) — 3-button nav bar açıkken sheet içeriği barın
    üstünde kalmalı, gesture modda safe-area kadar boşlukla. İki modda da doğru
    çalıştığını inset mantığı testleriyle sabitle.
  - `message-action-menu.tsx` Modal'ı (uzun basış menüsü + hızlı tepki çubuğu) ve
    `message-image-lightbox.tsx` gibi Modal tabanlı yüzeylerde de alt inset/nav bar
    uyumunu kontrol et — eylem kartı 3-button barın altına taşmamalı.
  - Sheet açıkken nav bar bölgesi: karartma nav bar'ın üzerine de düşmeli (kesik/iki
    renkli görünmemeli). Modal'sız host mimarisinde bu kendiliğinden gelir; Modal
    kalırsa `navigationBarTranslucent` davranışını koru.
- Tüm tüketiciler otomatik kazanmalı: `message-emoji-picker`, `mobile-gif-picker`,
  `kit/context-menu`, `kit/destructive-confirmation-sheet` (bildirimler → tümünü temizle
  sheet'i buradan geliyor, `notifications-screen.tsx:320`), `message-forward-sheet`,
  `message-reaction-detail-sheet`, `mobile-workspace-server-switcher-sheet`,
  `mobile-voice-settings-sheet`, workspace editor sheet'leri. API (props) değişecekse
  tüm kullanım yerlerini güncelle; mümkünse props sabit kalsın.

### Kabul kriterleri
1. Sheet dokunuşla algılanabilir gecikme olmadan açılıyor (native window/provider mount
   maliyeti açılış yolundan çıktı veya ilk frame'e alındı).
2. Kapanışta panel aşağı kayarak + backdrop sönerek kapanıyor (sürükleme dahil);
   `reducedMotion`'da animasyonsuz.
3. Backdrop fade panel hareketiyle senkron.
4. 3-button nav bar ve gesture modda sheet/menü içerikleri doğru hizada; karartma tam.
5. Tüm sheet tüketicileri çalışır durumda; bottom-sheet ve etkilenen bileşen testleri
   güncel ve yeşil.

### Doğrulama (hepsi geçmeli, commit yok)
```
pnpm --filter @wizards/mobile typecheck
cd apps/mobile && node --test --import tsx scripts/*.test.ts
pnpm --filter @wizards/mobile test:components
```
Bittiğinde: seçilen mimari (portal host mu Modal-korumalı mı), animasyon değerleri,
değişen dosyalar ve emülatörde doğrulanacaklar (hangi sheet'ler, hangi nav modu) — kısa özet.

---
---

## PROMPT 3 / 4 — 9c: Android 3-button navigation bar — tüm ekranların audit'i ve düzeltmesi

Whispr mobil (Expo SDK 56, edge-to-edge zorunlu, `apps/mobile`): cihazda Android
ayarlarından 3-button navigation bar açıksa, uygulamanın **var olan tüm ekranları**
içeriğini bu barın üstünden başlatmalı — hiçbir etkileşimli öğe veya içerik barın
altında kalmamalı. Gesture modda mevcut görünüm bozulmamalı.

### Bağlam ve kurallar
- Branch: `uat`. **Commit atma.** Emülatörü ben doğrularım (3-button + gesture iki modda);
  sen typecheck + testler.
- Prompt 9b sheet/menü yüzeylerini hallettiyse onları yeniden yapma; bu prompt ekranlar
  ve kalan overlay'ler.

### Mevcut altyapı (önce incele)
- `apps/mobile/src/app/mobile-bottom-system-inset.ts` —
  `resolveMobileBottomSystemSpacing(systemInset, minimumSpacing)` worklet'i +
  `apps/mobile/src/app/use-mobile-bottom-system-spacing.ts` hook'u. Politika bu; yeni
  ekran-başı ad-hoc inset hesabı yazma, bunları kullan.
- `apps/mobile/src/app/mobile-app-shell.tsx` — alt kenarın tek sahibi. Satır ~26:
  `systemBottomInset = isSignedIn ? insets.bottom : 0` → **auth ekranları (welcome,
  login, register, forgot-password, language picker) 3-button barın altında kalıyor.**
  Bilinen ilk bug bu; auth'ta da inset uygula (tasarımdaki mevcut alt boşlukla ÇİFT
  boşluk oluşturmadan — `resolveMobileBottomSystemSpacing` max mantığı tam bunun için).
- `apps/mobile/src/app/providers/mobile-theme-system-surfaces.tsx` — `expo-navigation-bar`
  `<NavigationBar style>` yalnız ikon rengini yönetiyor. `themes.ts`'te
  `systemBars.androidNavigationBar` renk token'ları tanımlı ama bar arka planına
  uygulanmıyor gibi — SDK 56 edge-to-edge'de 3-button barın arka planı nasıl davranıyor
  (sistem şeffaf mı çiziyor, kontrast bandı mı basıyor) araştır; tema ile uyumlu, karanlık/
  aydınlık modda doğru görünen davranışı sağla. Edge-to-edge'de deprecated API kullanma.

### Audit kapsamı (hepsini tek tek gez)
Alt kenara içerik yerleştiren veya tam ekran çizen her yüzey:
1. Shell içindeki tüm tab/stack ekranları — bottom nav zaten inset'li olabilir; asıl
   riskliler kendi alt aksiyon çubuğunu çizenler: composer'lı ekranlar (kanal, DM,
   thread), settings ekranlarının alt butonları, friends-hub, notifications footer'ı
   ("Tümünü temizle" satırı), voice-screen alt kontrolleri.
2. Shell DIŞINDA render olan tam ekran yüzeyler (Modal veya absolute):
   `mobile-direct-call-screen`, `mobile-direct-video-call-screen`,
   `mobile-outgoing-call-screen`, `mobile-incoming-call-overlay`,
   `mobile-voice-invite-overlay`, `mobile-voice-room-panel`, `voice-screen`,
   `message-image-lightbox`, `mobile-app-lock-screen`, `mobile-privacy-shield`,
   `mobile-device-integrity-warning`, kamera/görüntü ekranları (`mobile-camera-grid`).
   Bunlar shell padding'ini almaz — her biri kendi `useMobileBottomSystemSpacing`
   uygulamalı (alt kontrol çubuğu olanlarda kontroller barın üstünde; salt-görsel
   arkaplanlar tam ekran kalabilir, etkileşimli öğeleri inset'li olmalı).
3. Klavye etkileşimi: 3-button barda IME açıkken `resolveMobileKeyboardLift` mantığı
   (bar inseti klavyeyle ÇAKIŞMAZ, üst üste eklenmez) bozulmamalı — 9a/9b sonrası
   desen neyse onunla tutarlı kal.
- Audit çıktısını raporda tablo olarak ver: yüzey → durum (zaten doğru / düzeltildi /
  değişiklik gerekmiyor-nedeni).

### Test beklentisi
- Inset politikası worklet'lerine (varsa yeni yardımcılara) birim test.
- Ekran bazlı düzeltmeler için mevcut jest component test desenine uygun test güncelle/ekle
  (safe-area mock'u `component-tests/jest.setup.ts`'te mevcut — 3-button senaryosunu
  temsil eden bottom inset değeriyle render edip kritik yüzeylerin padding'ini doğrula).

### Kabul kriterleri
1. Auth dahil tüm ekranlar 3-button barda içeriği barın üstünden başlatıyor; gesture
   modda görünüm bugünkünden farksız.
2. Shell dışı tam ekran yüzeylerin etkileşimli öğeleri barın altında kalmıyor.
3. Nav bar arka planı/ikon stili her iki temada sistemle uyumlu; deprecated API yok.
4. Klavye + 3-button bar kombinasyonunda çift boşluk/eksik boşluk yok.
5. Audit tablosu raporlandı; tüm testler yeşil.

### Doğrulama (hepsi geçmeli, commit yok)
```
pnpm --filter @wizards/mobile typecheck
cd apps/mobile && node --test --import tsx scripts/*.test.ts
pnpm --filter @wizards/mobile test:components
```
Bittiğinde: audit tablosu + değişen dosyalar + emülatörde iki nav modunda gezmem gereken
ekran listesi — kısa özet.

---
---

## PROMPT 4 / 4 — 9d: Mesajlar → İstekler bölümü — tasarım + içerik + arkadaş ekleme yenileme

Whispr mobil Mesajlar ekranındaki "İstekler" segmentini (`apps/mobile`) Discord/
Instagram/WhatsApp/Slack desenlerinden bize uyanlarla yeniden tasarla ve işlevsel
olarak zenginleştir. Bugünkü hali minimal: kullanıcı adı input'u + "İstek gönder" +
gelen/giden listeleri.

### Bağlam ve kurallar
- Branch: `uat`. **Commit atma.** Emülatörü ben doğrularım; sen typecheck + testler.
- Kod çapaları:
  - UI: `apps/mobile/src/social/friends-hub.tsx` (embedded `mode="requests"` — Mesajlar
    ekranından `dm-screen.tsx:206` ile geliyor; standalone modu da var, iki mod da
    çalışmaya devam etmeli). Stiller aynı dosyada `createFriendsHubStyles`.
  - Segment sekmeleri + badge: `dm-inbox.tsx` (`DMInboxSegmentTabs`,
    `incomingRequestCount`).
  - Query/mutation: `apps/mobile/src/social/mobile-social-query.ts`,
    istemci: `mobile-social-client.ts`.
  - Contract: `packages/types/src/mobile-social.ts` —
    `MobileFriendsOverviewResponse` = `{friends, pending: {incoming, outgoing}, blocked}`.
    İstek objelerinde `createdAt` var mı kontrol et; yoksa contract + server'a ekle
    (relative time için).
  - Server: `apps/web/src/app/api/v1/mobile/friends/` (route + route-logic + testleri).
    Mevcut: GET overview, POST `requests` (username), POST `requests/[id]/accept|reject`,
    DELETE `friends/[userId]`, PUT/DELETE `blocks/[userId]`.
  - Metinler: `friends-hub.tsx` içindeki `socialCopy` (tr/en) — yeni metinler oraya;
    ekran dışına taşan genel metinler `apps/mobile/src/locale/mobile-copy.ts`'e.
  - Kit: `Avatar`, `Icon`, `EmptyState`, `Skeleton`, `Button`, `ContextMenu`
    (`apps/mobile/src/app/components/kit`). Tasarım token'ları `src/design/themes.ts`.

### Server tarafı — eksik yetenekler (önce mevcut desenleri incele, aynı auth/permission/
test desenleriyle ekle)
1. **Kullanıcı arama:** `GET /api/v1/mobile/friends/search?q=` (veya `users/search` —
   mevcut route adlandırma desenine uy). Davranış: min 2 karakter, username +
   displayName üzerinde arama, sonuçlarda `relationship` alanı
   (`none | friend | incoming | outgoing | blocked`), makul limit (~20), auth'lu,
   engellenmişler hariç. Contract şeması `packages/types/src/mobile-social.ts`'e,
   zod + test.
2. **Giden isteği iptal:** endpoint yok — `DELETE /api/v1/mobile/friends/requests/[id]`
   (yalnız isteği gönderen iptal edebilir) ekle.
3. İstek `createdAt`'i response'larda yoksa ekle (yukarıda).

### Tasarım/İçerik spesifikasyonu (Whispr tasarım diliyle — token'lar `themes.ts`,
mevcut kart/satır desenleri korunur)
- **Arkadaş ekle (üst blok, Discord + Instagram karışımı):**
  - Arama alanı: mevcut `searchShell` stilinde, placeholder "Kullanıcı adı ile ara…",
    `@` öneki toleranslı, debounce ~300ms, 2+ karakterde canlı arama.
  - Sonuç satırı: Avatar + displayName + `@username`; sağda duruma göre eylem:
    `none` → dolgulu "Ekle" butonu (accent, `theme.accent.action`); `outgoing` →
    kontur "İptal et"; `incoming` → "Kabul et"; `friend` → pasif "Arkadaşsınız" +
    mesaj ikonu (DM aç); `blocked` → gösterme.
  - İstek gönderilince satır optimistic `outgoing`'e döner + kısa toast
    (`ToastProvider` mevcut). Hata (kullanıcı yok, zaten istek var) toast ile.
  - Arama boşken bu blokta kısa yönlendirme metni (EmptyState değil, tek satır ipucu).
- **Gelen istekler bölümü:** başlık "Gelen — N". Satır: Avatar + ad + `@username` +
  relative time ("2 sa önce" — mevcut TR relative-time yardımcıları). Sağda iki 44×44
  yuvarlak ikon buton (Discord deseni): ✓ dolgulu accent (kabul), ✗ kontur/soft
  (reddet). Optimistic: kabulde satır kaybolur, arkadaş listesi cache'i güncellenir,
  segment badge'i düşer.
- **Giden istekler bölümü:** başlık "Gönderilen — N". Satır: Avatar + ad + username +
  relative time; sağda kontur "İptal et" (yeni endpoint'e bağlan, optimistic).
- **Engellenenler bölümü:** overview'daki `blocked` listesi bugün UI'da hiç yok.
  Varsayılan katlanmış bölüm başlığı "Engellenenler — N" (dokununca açılır); satırda
  Avatar + ad + "Engeli kaldır" (kontur, `unblockFriend` mevcut istemcide — mutation'a
  bağla; mutation yoksa `mobile-social-query.ts`'e ekle).
- **Davet linki (WhatsApp/Slack deseni, hafif versiyon):** listelerin üstünde tek satır
  kart: paylaş ikonu + "Whispr'a davet et" + chevron → RN `Share.share` ile kullanıcının
  kendi `@username`'ini içeren kısa davet metni paylaşır (`socialCopy`'ye şablon;
  kendi username'i bootstrap/profile verisinden). Sunucu tarafı davet altyapısı GEREKMEZ.
- **Boş durumlar:** gelen istek yokken `EmptyState` kiti (ikon + "Bekleyen istek yok" +
  alt metin "Kullanıcı adıyla arayıp arkadaş ekleyebilirsin"). Arama sonuçsuzsa
  "Kullanıcı bulunamadı" satırı.
- **Yükleme:** arama sırasında input sağında küçük spinner; bölümler için mevcut
  `Skeleton` deseni.
- Dokunma hedefleri ≥44px; hardcoded renk yok (token), hardcoded metin yok
  (`socialCopy`/`mobile-copy`). Karanlık tema otomatik doğru olmalı (token kullandıkça).
- `mode="friends"` ve standalone `FriendsHub` görünümleri bozulmamalı; segment
  badge davranışı (`dm-inbox.tsx`) aynen çalışmalı.

### Kabul kriterleri
1. Canlı arama → duruma duyarlı eylem butonları uçtan uca çalışıyor (yeni endpoint dahil).
2. Gelen isteklerde ✓/✗ optimistic; badge + arkadaş listesi cache tutarlı.
3. Giden istek iptali uçtan uca (yeni endpoint + UI).
4. Engellenenler bölümü + engel kaldırma çalışıyor.
5. Davet paylaşımı native share sheet açıyor.
6. Relative time'lar doğru; boş/yükleme durumları spesifikasyondaki gibi.
7. tr + en metinler eksiksiz; typecheck web + types + mobile temiz.

### Doğrulama (hepsi geçmeli, commit yok)
```
pnpm --filter @wizards/types typecheck
pnpm --filter @wizards/web typecheck
pnpm --filter @wizards/mobile typecheck
cd apps/mobile && node --test --import tsx scripts/*.test.ts
pnpm --filter @wizards/mobile test:components
```
Yeni endpoint'ler için web tarafında mevcut route-logic test desenine uygun testler,
UI için friends-hub component testleri ekle/güncelle. Bittiğinde değişen dosyalar +
eklenen endpoint'ler + emülatörde doğrulanacak akışlar — kısa özet.
