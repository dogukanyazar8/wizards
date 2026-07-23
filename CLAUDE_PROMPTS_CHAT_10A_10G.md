# Whispr Mobil Chat + Medya + Navigasyon — Sıralı Prompt'lar (10a → 10g)

Bu dosya 7 bağımsız prompt içerir. Her birini ayrı bir Claude Code oturumuna tek başına
yapıştırabilirsin; her biri kendi bağlamını taşır.

**Sıra önerisi:** 10a → 10b → 10c → 10d → 10e → 10f → 10g.
Zorunlu bağımlılıklar: **10c, 10b'den sonra** (yeni görsel önizleyici DM'de yeniden
kullanılıyor) ve **10e, 10d'den sonra** (aynı dosyalar; önce bug, sonra menü paritesi).
10a, 10f, 10g birbirinden bağımsızdır.

**Her oturumda ilk mesajdan önce `/caveman ultra` çalıştır** (yanıtlar kısa olsun,
kod ve teknik içerik etkilenmez).

**Her prompt için geçerli ortak kurallar** (her prompt'un içinde de kısaltılmış hali var):
- Branch `uat`. Working tree'de önceki fazların **commit'lenmemiş** işi var (sheet
  redesign, overlay host, 8a-8e, 9a-9d). **Commit atma; revert/stash/checkout yapma**;
  yalnız kendi görevinin dosyalarına dokun.
- Emülatör/cihaz başlatma, Metro açma yok. Doğrulama = typecheck + testler. Gerçek cihaz
  kontrolünü kullanıcı emülatörde kendisi yapacak; raporunun sonunda kısa bir
  "emülatör el-test listesi" ver.
- Tüm kullanıcı metinleri `apps/mobile/src/locale/mobile-copy.ts` üzerinden, **tr + en
  birlikte**. Web tarafına metin gerekirse `apps/web/src/lib/locale/messages/{tr,en}.ts`.
- `apps/mobile/src/app` içinde ham renk yasak (design-contract testi) — renkler
  `apps/mobile/src/design/themes.ts` token'larına gider.
- Overlay'ler RN `Modal` kullanmaz: `kit/overlay-registry` + `OverlaySurface`
  (host `MobileProductApp` içinde). Yeni sheet UI'ları `kit/sheet-primitives`
  bileşenleriyle (SheetHeader/OptionSheet/ActionSheet/SheetOptionRow/SheetActionRow).
- Feature hook içinde doğrudan client send yasak (phase-zero-boundary testi).
- `apps/mobile/src/app/mobile-product-app.tsx` < 520 satır kapağı (mimari test) — oraya
  ekleme yapacaksan bir şey çıkar.
- Yeni davranışa test yaz; davranış değiştiren her şeyde ilgili kontrat testini anlamlı
  güncelle: maestro-testid contract, theme-contract, `route-contract.test.ts` gövdesiz
  mutating route allowlist'i (8c'de bu unutuldu ve regresyon oldu), types fixture testi.
- Gövdesiz/gövdeli yeni her mobil endpoint'e rate-limit anahtarı + yetki kontrolü.

---
---

## PROMPT 1 / 7 — 10a: Kanal mesajlarında @kullanıcı etiketleme + bildirim

Whispr monorepo'sunda (pnpm workspaces; mobil: Expo SDK 56 / RN 0.85, `apps/mobile`;
backend: Next.js, `apps/web`; kontratlar: `packages/types`) sunucu metin kanallarına
@ ile kullanıcı etiketleme özelliğini uçtan uca getir: composer'da @ yazınca üye
önerisi, mesajda etiket vurgusu, etiketlenen kullanıcıya bildirim.

### Bağlam ve kurallar
- Branch `uat`; working tree'de başka fazların commit'lenmemiş işi var — **commit yok,
  revert yok**. Emülatör başlatma; doğrulama typecheck + testler.
- Metinler `apps/mobile/src/locale/mobile-copy.ts` (tr+en); ham renk yasak (tema
  token'ları `src/design/themes.ts`); overlay'ler `kit/overlay-registry`/`OverlaySurface`;
  feature hook'ta doğrudan client send yasak.

### Mevcut durum (keşifle doğrula — backend büyük ölçüde HAZIR)
- `apps/web/src/lib/workspace/message-notification-service.ts`:
  - `extractMentionUsernames` (satır ~11): düz metin içinden `@username` çıkarır —
    regex `(^|[\s([{])@([a-zA-Z0-9_.-]{2,32})`, `everyone`/`here` rezerve.
    **Token formatı düz metindir** (`@username`), `<@id>` gibi özel işaret YOK.
  - `createChannelMentionNotifications` (satır ~27): üye + görünürlük + tercih
    (`shouldReceiveMention`, satır ~123) filtreleri, `messageMention` kayıtları,
    `MENTION` tipli bildirim (dedupe `channel-mention:<messageId>:<userId>`),
    `mentionCount` unread artışı, i18n `chat.mentions.notifyBody/notifyTitle`.
  - Bu servisin kanal mesaj gönderiminde nereden çağrıldığını, thread yanıtlarını
    kapsayıp kapsamadığını ve push/outbox zincirine (`apps/web/src/lib/outbox/service.ts`,
    `apps/web/src/lib/notifications/service.ts`) bağlanıp bağlanmadığını keşfet.
- Kontrat/mobil hazır parçalar: `packages/types/src/mobile.ts` — `"MENTION"` bildirim
  tipi (~218), `mentions` bildirim filtresi (~271), `mentionCount` alanları (~409+);
  `packages/types/src/messages.ts:82` `mentionEveryone` opsiyonel alanı (nerede
  kullanılıyor keşfet). Mobilde `mobile-display-model.ts` `mentionCount > 0 →
  hasMentions` rozetini zaten map'liyor; notifications ekranı MENTION tipini nasıl
  render ediyor kontrol et.
- Yani asıl eksik **mobil UI**: composer autocomplete + mesaj içinde vurgu; artı
  bildirim ucunun doğrulanması.

### Uygulama hedefi
1. **Composer @ autocomplete (yalnız kanal + thread composer; DM kapsam dışı):**
   - `apps/mobile/src/app/composer/mobile-composer.tsx` — imleçten geriye doğru aktif
     `@sorgu` token'ını tespit et (kelime başı kuralı server regex'iyle birebir aynı
     olsun). Öneri listesi composer'ın üstünde kompakt bir panel: avatar + görünen ad +
     `@username`; tap → metne `@username ` yazılır, panel kapanır.
   - Üye kaynağı: sunucu üye listesini mevcut endpoint/query'lerden çöz
     (`mobile-server-members-screen` hangi query'yi kullanıyorsa onu yeniden kullan;
     kanal ekranına server bağlamı prop'larla nasıl geliyor keşfet). Lokal filtre
     (prefix + contains, memoize) yeterli; ayrı arama endpoint'i EKLEME.
   - Panel `MobileChatKeyboardRegion` transform'u ile çakışmamalı (klavye açıkken
     doğru konum); FlashList/scroll üstünde değil composer bölgesinde konumlan.
   - `@everyone`/`@here`: server tarafındaki gerçek davranışı keşfet
     (`mentionEveryone` alanı + yetki kontrolü var mı). Sunucuda gerçek karşılığı
     YOKSA önerme; varsa yalnız yetkili role öner ve alanı send isteğinde geçir.
2. **Mesajda vurgu (kanal akışı + thread):**
   - `apps/mobile/src/app/components/message-primitives.tsx` metin render'ına mention
     parse'ı ekle: server regex'inin birebir portu tek bir util'de
     (örn. `apps/mobile/src/app/mobile-mention.ts`) — testle sabitle ki web ile drift
     olmasın. `@username` parçaları accent renkli çip/vurgu (yeni tema token'ları,
     ör. `mention.text`, `mention.background`, `mention.selfRowBackground`).
   - İçinde **kendi username'in** geçen mesaj satırına Discord tarzı ince arka plan
     vurgusu (sol şerit veya soft fill — token'la).
   - Sadece gerçekten sunucu üyesi olan username'leri vurgula (eldeki üye listesiyle
     eşleşenler); eşleşmeyen `@foo` düz metin kalır.
3. **Bildirim ucu:**
   - Etiketlenen kullanıcıya in-app bildirim akışı zaten `MENTION` üretmeli — route
     testi/unit ile kanıtla (yoksa `apps/web` tarafına test ekle).
   - Push: MENTION bildirimi push pipeline'ına giriyor mu doğrula; girmiyorsa mevcut
     mesaj push zincirine uygun şekilde ekle (yeni mimari kurma).
   - Mobil notifications ekranında MENTION satırına tap → ilgili kanala (mümkünse
     mesaja jump — mevcut pin/jump altyapısı `channel-screen`'de var) yönlendir;
     mevcut yönlendirme neyse keşfet, eksikse tamamla.
   - Bildirim tercihleri: `mobile-notification-preferences.ts` mention anahtarını
     zaten içeriyorsa UI-server uyumunu doğrula; içermiyorsa dokunma (server
     `shouldReceiveMention` zaten filtreliyor).

### Korunacak sözleşmeler
- Composer'ın mevcut davranışları: senkron temizleme, failed-send registry, sesli
  mesaj, attachment akışı — regresyon yok.
- `message-primitives.tsx` kanal satır tasarımı (8c flat düzen) bozulmaz; yalnız metin
  render'ı zenginleşir.
- Yeni tema token'ları `themes.ts`'e; design-contract testi geçmeli.

### Kabul kriterleri
1. Kanal composer'ında `@` yazınca öneri paneli geliyor, seçim `@username ` ekliyor.
2. Gönderilen mesajda `@username` vurgulu; etiketlenen kullanıcının istemcisinde satır
   vurgusu var; üye olmayan `@foo` düz metin.
3. Etiketlenen kullanıcıya MENTION bildirimi düşüyor (test kanıtlı), bildirime tap
   ilgili kanalı açıyor; kanal listesinde mention rozeti (hasMentions) çalışıyor.
4. Parser üniti web regex'i ile aynı davranışı test ediyor (aynı örnek seti).
5. Tüm doğrulama komutları yeşil.

### Doğrulama (hepsi geçmeli, commit yok)
```
pnpm --filter @wizards/types test
pnpm --filter @wizards/mobile typecheck
pnpm --filter @wizards/web typecheck
pnpm --filter @wizards/web test
pnpm --filter @wizards/mobile test
pnpm --filter @wizards/mobile test:components
```

### Rapor
Değişen dosyalar, verdiğin kararlar (özellikle @everyone kararı + üye kaynağı),
emülatör el-test listesi (öneri paneli, vurgu, bildirim tap akışı).

---
---

## PROMPT 2 / 7 — 10b: Görsel kartına tam-tap + modern görsel önizleyici (lightbox) redesign

Whispr mobil (Expo SDK 56 / RN 0.85, `apps/mobile`) kanal mesajlarında paylaşılan
fotoğraflar için: (1) yalnız görsele değil attachment kartının TAMAMINA dokununca
önizleme açılsın; (2) görsel önizleyici Discord/Instagram/WhatsApp kalitesinde modern
bir tasarıma kavuşsun. Mevcut önizleyicide sağ üstteki kapatma butonu tasarımdan kopuk
duruyor; bütünleşik, jest-tabanlı bir deneyim hedefleniyor.

### Bağlam ve kurallar
- Branch `uat`; commit yok, revert yok. Emülatör başlatma; doğrulama typecheck + testler.
- Metinler `mobile-copy.ts` (tr+en); ham renk yasak — tema token'ları `themes.ts`;
  overlay'ler `OverlaySurface` üzerinden (RN Modal yasak).
- Animasyonlar `react-native-reanimated` (4.3) + `react-native-gesture-handler` ile,
  hepsi UI thread'de; **layout property animate etme** (9a dersi: padding/height
  per-frame animasyonu yasak, transform kullan).

### Mevcut durum
- `apps/mobile/src/app/components/message-image-lightbox.tsx`: `OverlaySurface` +
  `useOverlayPhase`; pinch 1-4x (merkez pivot), serbest pan, |translationY| > 110 →
  kapan; sağ üstte absolute 48px `surface.inverse` yuvarlak X (kopuk duran buton bu);
  arka plan `surface.scrim`; görsel frame %80 yükseklik.
- Tetikleme: `apps/mobile/src/app/components/message-primitives.tsx` ~377-450 —
  `Pressable` yalnız görselin üzerinde (`onPress={() => setLightboxUri(...)}`,
  ~403-405); kartta görsel dışı alan (varsa ad/boyut bölümü) tıklanamıyor. Kart
  yapısını keşfet (görsel + olası meta satırı).
- Görsel bileşeni `MobileCachedImage`; overlay animasyon sabitleri
  `kit/overlay-surface.tsx` (`MOBILE_OVERLAY_OPEN_SPRING` vb.).

### Uygulama hedefi
1. **Tam kart tap:** görsel attachment kartının tamamı tek `Pressable` davranışı —
   tap → lightbox. Satırın uzun-basış menüsü (mesaj menüsü) ve varsa çift-dokunuş
   jestleriyle çakışma yaşatma (tap kartta, long-press üst satır davranışı olarak
   kalır; gesture öncelik sırasını bilinçli kur ve test et).
2. **Lightbox redesign** (`message-image-lightbox.tsx` yeniden yazılabilir; testID
   `mobile-message-image-lightbox` ve `-close` korunmalı ya da bağlı test/kontratlarla
   birlikte güncellenmeli):
   - **Zemin:** tam ekran, saf koyu zemin (yeni token grubu örn. `lightbox.backdrop`,
     `lightbox.chromeGradient`, `lightbox.chromeText` — hem light hem dark temada
     lightbox zemini koyu olur, Instagram/Discord gibi).
   - **Açılış/kapanış:** açılışta fade + scale (0.94→1, mevcut spring sabitleri);
     kapanışta **sürükle-kapat**: görsel parmağı takip eder, zemin opaklığı sürükleme
     mesafesiyle orantılı azalır, eşik aşılınca sürükleme yönünde fling ile kapanır,
     aksi halde spring ile geri oturur. (Karttan büyüyen shared-element açılış
     DENEYEBİLİRSİN — origin ölçümü `measureInWindow` ile; karmaşıklaşırsa fade+scale
     yeterli, kararını raporla.)
   - **Zoom:** çift dokunuş → dokunulan noktaya ~2.5x zoom / tekrar çift dokunuş →
     1x; pinch focal-point'li (merkez pivot değil); zoom > 1 iken pan görsel
     sınırlarında rubber-band ile sınırlı ve dikey sürükle-kapat devre dışı; zoom
     bırakılınca < 1 ise 1'e spring.
   - **Chrome (üst/alt bar):** üstte yukarıdan aşağı zayıflayan gradient içinde
     gönderen adı + zaman + kapat ikonu; altta paylaş eylemi (RN `Share.share` ile
     URL paylaşımı yeterli). Tek tap → chrome fade in/out. Cihaza kaydetme: yalnız
     `expo-media-library` ZATEN kuruluysa ekle; kurulu değilse paket EKLEME, raporda
     "kaydet eklenmedi (paket yok)" de.
   - Durum çubuğu: lightbox açıkken immersive (StatusBar hidden/translucent — mevcut
     edge-to-edge kurulumuyla çakışmadan; `useReducedMotion` desteği korunur).
   - Android donanım geri → kapat (OverlaySurface zaten yapıyor; koru).
3. **Erişilebilirlik:** kapat/paylaş için accessibilityLabel (tr+en copy), chrome
   gizliyken bile kapatılabilirlik (geri tuşu + sürükleme).

### Korunacak sözleşmeler
- Overlay sistemi: `OverlaySurface`/`useOverlayPhase` yaşam döngüsü (closing animasyonu
  bitmeden unmount yok); "image outlives `open` by one fade" davranışı (kapanış
  animasyonu sırasında kaynak URI korunur).
- Kit-overlays/jest testleri: overlay arkasındaki sorgular `includeHiddenElements`
  gerektirebilir (mevcut test kalıbı).
- `mobile-cached-image` cache davranışı.

### Kabul kriterleri
1. Kartın herhangi bir yerine tap → önizleme; uzun basış menüsü hâlâ çalışıyor.
2. Sürükle-kapat parmak takipli + zemin opaklığı bağlı; çift-dokunuş noktaya zoom;
   pinch focal-point'li; rubber-band sınırlar.
3. Chrome: gönderen + zaman + kapat + paylaş; tek tap ile gizle/göster; kopuk X yok.
4. Reduced-motion'da animasyonlar atlanıyor; Android geri kapatıyor.
5. Yeni/güncellenen jest testleri + tüm doğrulama komutları yeşil.

### Doğrulama (hepsi geçmeli, commit yok)
```
pnpm --filter @wizards/mobile typecheck
pnpm --filter @wizards/mobile test
pnpm --filter @wizards/mobile test:components
```

### Rapor
Değişen dosyalar; shared-element denemesi kararı; kaydet/paylaş kapsam kararı;
emülatör el-test listesi (tap bölgeleri, zoom, sürükle-kapat, chrome, geri tuşu,
reduced-motion).

---
---

## PROMPT 3 / 7 — 10c: DM mesajlaşmaya eksiksiz attachment (dosya/görsel) desteği

Whispr'da DM mesajlaşmasına dosya/görsel ekleme özelliğini EKSİKSİZ hale getir.
Altyapının önemli kısmı hazır; işin özü uçtan uca denetim + boşlukları kapatmak.
(Monorepo: mobil `apps/mobile`, backend `apps/web`, kontratlar `packages/types`.)

### Bağlam ve kurallar
- Branch `uat`; commit yok, revert yok. Emülatör başlatma; doğrulama typecheck + testler.
- Metinler `mobile-copy.ts` (tr+en); ham renk yasak; overlay'ler `OverlaySurface`;
  feature hook'ta doğrudan client send yasak (phase-zero-boundary).
- Bu prompt'tan önce 10b (yeni lightbox) uygulandı — DM görselleri YENİ lightbox'ı
  yeniden kullanacak.

### Mevcut durum (hepsini keşifle doğrula)
- **Kontrat hazır:** `packages/types/src/mobile.ts:603`
  `MobileDMSendMessageRequestSchema = MobileSendMessageRequestSchema` → DM send isteği
  kanalla aynı `attachments` alanını (max 5, `content veya attachments zorunlu`
  refine'ı — `messages.ts:137`) taşıyor. `DMMessagePayload.attachments`
  (`packages/types/src/socket.ts:55`, şema ~126) mevcut.
- **Server:** `apps/web/src/lib/dm/realtime-service.ts` `claimUploadedMessageAttachments`
  kullanıyor (8b sesli mesaj bu yoldan gidiyor). DM send route'unun attachments'ı kabul
  edip payload'da döndürdüğünü, realtime DM event'lerinin attachments taşıdığını doğrula.
- **Mobil composer:** `apps/mobile/src/app/composer/mobile-composer.tsx` —
  `usesUploadedAttachments = variant === "channel" || variant === "dm"` (~116);
  foto + dosya picker'ları `src/media/mobile-message-attachment-picker.ts`;
  upload `mobile-message-attachment-upload-service`; `attachmentsFeature` bootstrap
  feature'ı gating yapıyor (`getMobileAttachmentUploadReadiness`).
- **Muhtemel boşluklar** (denetimin odağı):
  1. DM ekranı (`dm-conversation-screen.tsx` / `dm-screen.tsx`) composer'a
     `attachmentsFeature`'ı geçiyor mu, ataç butonu DM'de görünüyor mu?
  2. DM balonlarında (`dm-chat-primitives`) görsel attachment kartı + dosya kartı
     render'ı var mı? `MessageImageLightbox` yalnız `message-primitives.tsx`'te
     kullanılıyor — DM'de lightbox YOK.
  3. Attachment'lı failed mesaj: `mobile-failed-send-registry` + retry akışında
     attachments korunuyor mu?
  4. Dosya (görsel olmayan) attachment tap davranışı: kanalda ne yapılıyorsa DM'de
     parite (aç/indir — `Linking.openURL` vb.).

### Uygulama hedefi
1. DM composer'da ataç akışı eksiksiz: galeri + dosya seçimi, taslak çipleri, upload
   durumu/hata/iptal, 5 adet sınırı, boyut/tip hataları tr+en kopyayla. Kanal
   composer'ıyla TEK kaynak (variant dallanması); kod kopyalama yok.
2. DM balonlarında render: görsel kartı (tam-kart tap → 10b lightbox), çoklu görsel
   düzeni (kanalda nasılsa aynı kalıp), dosya kartı (ikon + ad + boyut, tap → aç),
   sesli mesaj player'ı regresyonsuz.
3. Send zinciri: `useMobileDMSendMutation` (adını keşfet) attachments'ı geçiriyor,
   optimistic mesajda attachments görünüyor, failed → retry'da attachments kayıpsız.
4. Server boşluk çıkarsa (attachments claim/echo/realtime): kanal davranışıyla parite
   sağlayacak MINİMUM değişiklik + route/unit testi. Rate-limit ve boyut sınırları
   kanalla aynı.
5. Edit modu: attachment'lı mesaj düzenleme kısıtı (composer'daki
   `hasCompletedAttachmentEditConflict` deseni) DM'de de tutarlı.

### Korunacak sözleşmeler
- 8b sesli mesaj akışı (bas-konuş, duration, player) bozulmaz.
- Failed-send registry sözleşmesi (`channel:<id>`/`dm:<id>` scope'ları) bozulmaz.
- `route-contract.test.ts` allowlist'i: yeni/değişen mutating route olursa güncelle.
- Types fixture testi: kontrat değişirse fixture'ları güncelle.

### Kabul kriterleri
1. DM'de galeri/dosya seç → gönder → iki uçta da (gönderen optimistic + alıcı realtime)
   kart render; görsele/karta tap → yeni lightbox.
2. Dosya kartı tap → açma davranışı çalışıyor; hata/limit kopyaları tr+en.
3. Attachment'lı failed mesaj retry'da içerik + attachments korunuyor.
4. Sesli mesaj regresyonsuz; kanal attachment akışı regresyonsuz.
5. Tüm doğrulama komutları yeşil.

### Doğrulama (hepsi geçmeli, commit yok)
```
pnpm --filter @wizards/types test
pnpm --filter @wizards/mobile typecheck
pnpm --filter @wizards/web typecheck
pnpm --filter @wizards/web test
pnpm --filter @wizards/mobile test
pnpm --filter @wizards/mobile test:components
```

### Rapor
Denetim bulguları (neler zaten çalışıyordu, neler eksikti), değişen dosyalar,
emülatör el-test listesi (görsel/dosya gönder-al, retry, limit, sesli mesaj).

---
---

## PROMPT 4 / 7 — 10d: Tepki menüsü "anlık gelip kaybolma" bug'ının kök nedeni + kalıcı fix

Whispr mobil (Expo SDK 56 / RN 0.85, `apps/mobile`) BUG: bir mesaja dokununca/uzun
basınca gelen ifade (emoji) bırakma menüsü BAZEN anında kayboluyor — gelip gidiyor,
tepki bırakılamıyor. Kök nedeni kanıtla, kalıcı olarak düzelt, regresyon testiyle kilitle.
**Tahmine dayalı düzeltme yasak: önce repro/kanıt, sonra fix** (systematic-debugging
disipliniyle çalış).

### Bağlam ve kurallar
- Branch `uat`; commit yok, revert yok. Emülatör başlatma; doğrulama typecheck + testler.
- Ham renk yasak; overlay'ler `OverlaySurface`; metinler `mobile-copy.ts` (tr+en).

### Etkilenen yüzeyler (mimarinin haritası)
- **Kanal:** uzun basış → satır vurgusu + yüzen eylem çubuğu (hızlı tepkiler dahil).
  State: `actionBarOpen` — sahibi `apps/mobile/src/app/screens/channel-screen.tsx`,
  render `apps/mobile/src/app/components/message-primitives.tsx` (~609-1045).
- **DM:** uzun basış → `apps/mobile/src/app/components/message-action-menu.tsx`
  (8a tam ekran overlay: hızlı tepki barı + balon önizleme + eylem kartı),
  `OverlaySurface`/overlay-host üzerinden.
- Aynı satırlarda yarışan jestler: çift-dokunuş ❤️ + swipe-yanıt Pan (RNGH, 8b),
  Pressable long-press, FlashList scroll.
- Liste verisi canlı: realtime event'ler `apps/mobile/src/query/mobile-realtime-cache.ts`
  (`upsertMessage` vb.) + react-query invalidation'ları; klavye bölgesi transform'u
  `apps/mobile/src/app/mobile-chat-keyboard-region.tsx`.

### Teşhis planı (sırayla, kanıt toplayarak)
1. **Repro yakala:** component testinde (jest + RNTL) menü/bar açıkken şu olayları
   simüle et ve hangisinin menüyü kapattığını tespit et:
   - realtime yeni mesaj/`upsertMessage` (liste datası değişimi),
   - typing event / read-receipt / reaction güncellemesi,
   - query invalidate + refetch swap,
   - klavye aç/kapa (keyboard region transform).
2. **State kimliği:** `actionBarOpen` ve DM menü state'i **mesaj id** ile mi yoksa satır
   instance/index ile mi bağlı? FlashList recycle/yeniden sıralama durumunda seçim
   yanlış satıra mı kayıyor, null'a mı düşüyor? (Kapanmanın stack trace'ini yakala:
   geçici debug log ile hangi setState kapatıyor bul, sonra logları kaldır.)
3. **Gesture yarışı:** Pressable long-press başladıktan sonra Pan/double-tap
   recognizer'ları cancel tetikliyor mu; `onPressOut`/scroll-begin menüyü kapatan bir
   handler var mı? RNGH `simultaneousHandlers`/`blocksExternalGesture` gerekiyorsa
   bilinçli kur.
4. **Overlay yaşam döngüsü (DM):** `useOverlayPhase` open→closing yarışları; overlay
   host'ta registry kaydının yeniden yazılması (aynı anahtara ikinci open) menüyü
   düşürüyor mu?
5. Kök nedeni **tek cümleyle** raporla (hangi olay + hangi kod yolu) ve kanıtını göster
   (test log/assert).

### Fix ilkeleri
- Menü/bar açıkken liste güncellemeleri menüyü KAPATMAZ: seçim message-id bazlı tutulur;
  seçili mesaj hâlâ listedeyse menü açık kalır; mesaj gerçekten silindiyse kapanır.
- Menü yalnız şu durumlarda kapanır: dışarı tap/scrim, aksiyon seçimi, Android geri,
  ekran değişimi (blur), mesajın silinmesi.
- Fix'i hem kanal çubuğu hem DM menüsü için uygula (ortak neden varsa ortak çöz).
- Regresyon testleri: "bar açıkken yeni mesaj gelirse açık kalır", "typing/reaction
  event menüyü kapatmaz", "aksiyon seçimi kapatır", "silinen mesajın menüsü kapanır".

### Korunacak sözleşmeler
- `mobile-message-actions-<id>-trigger` testID'leri ve `.maestro/phase2-messaging.yml`
  akışı; maestro-testid-contract testi.
- Mevcut menü/bar görsel tasarımı (8a/8c) — bu prompt davranış fix'idir, redesign 10e'de.

### Kabul kriterleri
1. Kök neden kanıtla raporlandı (hangi olay kapatıyordu).
2. Menü/bar artık kendiliğinden kaybolmuyor; emoji bırakma her denemede çalışıyor.
3. Yeni regresyon testleri + mevcut tüm testler yeşil.

### Doğrulama (hepsi geçmeli, commit yok)
```
pnpm --filter @wizards/mobile typecheck
pnpm --filter @wizards/mobile test
pnpm --filter @wizards/mobile test:components
```

### Rapor
Kök neden + kanıt; değişen dosyalar; emülatör el-test listesi (hızlı ardışık mesaj
akarken menü açık tutma, typing sırasında tepki bırakma, klavye açıkken uzun basış).

---
---

## PROMPT 5 / 7 — 10e: DM mesaj menüsündeki TÜM seçenekleri kanal mesajlarına getir (parite)

Whispr mobil'de DM mesajına uzun basınca gelen zengin menü (hızlı tepkiler + balon
önizleme + eylem listesi: yanıtla/kopyala/ilet/düzenle/sil/tepki detayı) kanal
mesajlarında birebir yok: kanalda mini yüzen çubuk var (👍❤️/emoji/yanıt/thread/⋯) ve
diğer eylemler ⋯ altında saklı. Kanalda da DM ile aynı kalitede, eksiksiz menü deneyimi
kur. (NOT: 10d bug fix'i bu prompt'tan ÖNCE uygulandı — aynı dosyalar.)

### Bağlam ve kurallar
- Branch `uat`; commit yok, revert yok. Emülatör başlatma; doğrulama typecheck + testler.
- Metinler `mobile-copy.ts` (tr+en); ham renk yasak; overlay'ler `OverlaySurface`;
  yeni sheet UI'ları `kit/sheet-primitives`.

### Mevcut durum
- `apps/mobile/src/app/components/message-action-menu.tsx` (8a): DM+kanal tek kaynak
  (`scope` prop); kontrollü mod (`open`/`onClose`/`showQuickBar`) 8c'de eklendi.
  Kanalda 8c mini çubuğu getirdi: satır vurgusu (`theme.messageMenu.rowHighlight`) +
  yüzen çubuk; ⋯ → MessageActionMenu. State `actionBarOpen`
  (`channel-screen.tsx` + `message-primitives.tsx` ~609-1045).
- Var olan kanal yetenekleri: pin (`useMobileChannelMessagePinMutation`), thread
  başlat, forward sheet (`message-forward-sheet.tsx` + `useMobileMessageForwardMutation`),
  tepki detay sheet'i (`message-reaction-detail-sheet.tsx`), düzenle/sil mutation'ları
  (`use-mobile-message-mutations.ts`).

### Uygulama hedefi (önerilen yön — farklı karar verirsen gerekçele)
1. **Discord davranışı:** kanalda uzun basış DOĞRUDAN tam `MessageActionMenu`'yü açar
   (scope="channel", hızlı tepki barı üstte). Mini yüzen çubuğu kaldır ya da tek
   dokunuşluk kısayol olarak menü İÇİNE eritin — iki adımlı "⋯'ya bas, sonra menü"
   akışı kalkar.
2. **Eylem paritesi (kanal menüsünde bulunması gerekenler):**
   - Yanıtla (composer reply intent), Kopyala, İlet (forward sheet), Düzenle (yalnız
     kendi mesajı), Sil (kendi mesajı; başkasının mesajı için rol yetkisi — web'deki
     kural neyse UI koşulunu ona bağla, server zaten koruyor), Thread başlat
     (yalnız kanal), Sabitle/Sabitlemeyi kaldır (pin mutation), Tepki detayları.
   - DM'de olup kanalda anlamsız olanlar (ör. DM-özel bir şey varsa) bilinçli dışarıda;
     kararları raporla.
3. **Yetki görünürlüğü:** yetkisiz eylem ya hiç görünmez ya disabled + kısa açıklama —
   web davranışıyla tutarlı olanı seç; koşulları props'tan besle (feature hook'ta
   yetki hesabı varsa yeniden kullan, yoksa bootstrap/rol verisinden türet).
4. **Erişilebilirlik + kopya:** yeni/az kullanılan eylem etiketleri tr+en; menü
   erişilebilirlik etiketleri tam.

### Korunacak sözleşmeler
- `mobile-message-actions-<id>-trigger` testID'leri KORUNUR. `.maestro/phase2-messaging.yml`
  "Diğer eylemler|More actions" adımı mini çubukla birlikte değişiyorsa maestro dosyası +
  maestro-testid-contract testi BİRLİKTE ve tutarlı güncellenir.
- 10d'nin regresyon testleri geçmeye devam eder (menü kararlılığı).
- Kanal satır tasarımı (8c flat) ve tepki çipleri değişmez; bu prompt menü akışını
  değiştirir, satırı değil.

### Kabul kriterleri
1. Kanalda uzun basış → tam menü (tek adım); DM'deki her uygulanabilir eylem kanalda.
2. Kendi/başkasının mesajı ve rol yetkisine göre eylem görünürlüğü doğru.
3. Pin/thread/forward/edit/delete/reply/copy/tepki-detayı akışlarının hepsi menüden
   uçtan uca çalışıyor (jest ile eylem callback'leri, mevcut test kalıplarıyla).
4. Maestro + testid kontratları tutarlı; tüm doğrulama komutları yeşil.

### Doğrulama (hepsi geçmeli, commit yok)
```
pnpm --filter @wizards/mobile typecheck
pnpm --filter @wizards/mobile test
pnpm --filter @wizards/mobile test:components
```

### Rapor
Menü akış kararı (mini çubuk kalktı mı), eylem listesi + yetki koşulları tablosu,
emülatör el-test listesi.

---
---

## PROMPT 6 / 7 — 10f: Arka plandan dönüşte "boş ekran flash" sorununun kök nedeni + performanslı çözüm

Whispr mobil (Expo SDK 56 / RN 0.85, `apps/mobile`) BUG: uygulama arka plandayken /
başka uygulamaya geçilmişken geri dönüldüğünde veya ekran kapanıp açıldığında arayüz
bir an BOŞ (düz renk) görünüp geri geliyor — "ekran yenileniyor" hissi. Kök nedeni
kanıtla, güvenlik gereksinimini KORUYARAK en performanslı şekilde çöz.

### Bağlam ve kurallar
- Branch `uat`; commit yok, revert yok. Emülatör başlatma; doğrulama typecheck + testler.
- **Bu bir güvenlik davranışına dokunuyor — sessizce zayıflatma yok**; davranış
  değişiyorsa quality-gate açıklaması ve testler birlikte, gerekçeli güncellenir.

### Ana şüpheli (kanıtla, varsayma)
- `apps/mobile/App.tsx:55` → `MobilePrivacyShield`
  (`src/app/components/mobile-privacy-shield.tsx`): AppState `active` değilken TÜM
  ekranı opak `theme.surface.base` ile kaplıyor (zIndex/elevation 10000).
  Karar fonksiyonu `src/security/mobile-privacy-shield.ts`
  (`shouldShowMobilePrivacyShield`). Dönüşte JS'e `active` event'i gelene kadar shield
  görünür kalır → kullanıcının gördüğü "boş ekran" büyük olasılıkla bu.
- Güvenlik sözleşmesi: `src/quality/mobile-quality-gate.ts:382` — "Inactive and
  background AppState values cover DM and voice content with an opaque privacy shield
  before app-switcher capture, independently of optional biometric lock." Yani hedef:
  **app-switcher önizlemesinde içerik görünmesin.** Bu KORUNACAK.
- İkincil şüpheliler (ölç, katkısı varsa ayrıca çöz):
  - `src/app/providers/mobile-query-provider.tsx:25-26` — resume'da
    `focusManager.setFocused(true)` → refetch dalgası ekranları loading/boş state'e
    düşürüyor mu? (staleTime/refetch ayarları; cache'ten göster, arkada tazele.)
  - Realtime provider resume reconnect'i (`mobile-realtime-provider.tsx:331+`)
    render'ı kilitliyor mu?
  - `freezeOnBlur` (navigator) + react-native-screens etkileşimi.

### Teşhis planı
1. Shield görünürlüğünü ve AppState geçişlerini zaman damgalı logla (geçici debug);
   emülatör olmadan: birim/component test + kod okuma ile geçiş sırasını çıkar,
   flash süresinin neye bağlı olduğunu belirle (event gecikmesi mi, refetch mi).
2. Platform davranış matrisi yaz: Android'de home→dönüş `background→active`;
   ekran kapat/aç; iOS'ta app-switcher `inactive`. Hangi geçişte shield gerçekten
   GEREKLİ (güvenlik) ve hangisinde sadece gecikmeden ötürü görünüyor?

### Çözüm yönü (araştır, en iyisini SEÇ ve gerekçele)
- **Seçenek A (tercih edilen — araştır):** Android'de OS-seviyesi çözüm:
  `expo-screen-capture` `preventScreenCaptureAsync` (FLAG_SECURE) recents
  önizlemesini native karartır → Android'de JS shield tamamen kalkar, dönüşte overlay
  hiç olmaz = flash kökten biter. Trade-off: FLAG_SECURE ekran görüntüsünü de engeller —
  bunu quality-gate metni ve kullanıcı beklentisiyle tart; paket zaten kuruluysa ya da
  Expo SDK'da hazırsa kullan, yeni ağır bağımlılık EKLEME.
- **Seçenek B (A uymuyorsa):** shield'i yalnız arka plana GİRERKEN göster; dönüşte
  (`background→active`) İLK frame'de kaldır + çok kısa (≤150ms) fade-out ile algıyı
  yumuşat; iOS `inactive` (app-switcher) davranışı aynen kalır. `useSyncExternalStore`
  veya senkron state ile event→render gecikmesini minimize et.
- Her iki durumda: refetch kaynaklı içerik boşalması varsa ayrıca düzelt (loading'e
  düşme yerine eldeki cache gösterilir).

### Korunacak sözleşmeler
- App-switcher/recents önizlemesinde DM/voice içeriği GİZLİ kalır (kanıtla: hangi
  mekanizma sağlıyor).
- `component-tests/mobile-privacy-shield.test.tsx` + `shouldShowMobilePrivacyShield`
  birim testleri + `mobile-quality-gate.ts` açıklaması: davranış değişimiyle TUTARLI
  şekilde güncellenir (silinmez, zayıflatılmaz — yeni davranışı doğru anlatır).
- Geçici debug logları merge öncesi temizlenir.

### Kabul kriterleri
1. Kök neden raporda kanıtlı (shield mi, refetch mi, ikisi mi; hangi geçişte).
2. Dönüşte içerik anında görünür — opak boş kare yok (B seçildiyse yalnız kısa fade).
3. App-switcher gizliliği korunuyor; quality-gate + testler yeni davranışı doğruluyor.
4. Tüm doğrulama komutları yeşil.

### Doğrulama (hepsi geçmeli, commit yok)
```
pnpm --filter @wizards/mobile typecheck
pnpm --filter @wizards/mobile test
pnpm --filter @wizards/mobile test:components
```

### Rapor
Seçilen çözüm + gerekçe + trade-off; emülatör el-test listesi (home'a çık/dön,
recents önizlemesi içerik gizli mi, ekran kapat/aç, başka uygulamadan dönüş,
hızlı arka arkaya geçişler).

---
---

## PROMPT 7 / 7 — 10g: Geri tuşu / geri gelme akışını modernleştir (Discord/WhatsApp normu)

Whispr mobil (Expo SDK 56 / RN 0.85, `apps/mobile`; react-navigation native-stack +
bottom-tabs) BUG+İYİLEŞTİRME: ekranlar arasında gezinirken geri tuşuna basınca bazen
"ekranlar karışıyor". Navigasyon geri akışını denetle, hedef davranışı Discord/
Instagram/WhatsApp/Teams normlarına göre TANIMLA ve uygula.

### Bağlam ve kurallar
- Branch `uat`; commit yok, revert yok. Emülatör başlatma; doğrulama typecheck + testler.
- Davranış değişiklikleri bilinçli ve raporlanmış olmalı; "sessiz" akış değişikliği yok.

### Mevcut mimari
- `apps/mobile/src/navigation/mobile-navigator.tsx`: RootStack (native-stack,
  `slide_from_right`, `freezeOnBlur`, header yok) — `MainTabs` + 14 detay ekranı DÜZ
  liste (ChannelChat, DirectMessage, MessageThread, VoiceRoom, SettingsDetail,
  ServerSettings, ... satır 105-149). `MobileBottomTabs` (satır 183+):
  **`backBehavior="history"`**, `lazy`, `tabBarHideOnKeyboard`.
- `mobile-navigation-ref.ts`: global `navigateMobileRouteIntent` (deep link + bildirim
  tap buradan route basıyor; `mobile-linking.ts` deep link haritası).
- Ekran-özel geri: `mobile-screen-containers.tsx:199-217` voice BackHandler +
  150-197'de `replace` zincirleri (voice→DM/overview dönüşleri).
- Overlay geri davranışı DOĞRU ve KORUNACAK: `kit/overlay-surface.tsx:135-137` —
  BackHandler newest-first, geri önce en üstteki overlay'i kapatır.

### Denetim (önce envanter, sonra karar)
1. Tüm `navigate/push/replace/goBack/popToTop/reset` çağrılarının envanterini çıkar
   (ekranlar + navigation-ref intent'leri + linking). Her biri için: hangi ekrandan,
   hangi hedefe, stack'e ne yapıyor.
2. "Karışma" şüphelilerini test/kod okumayla doğrula:
   - Aynı route'a param'la `navigate` (native-stack ekranı yeniden kullanır):
     ChannelChat A → (bir yol ile) ChannelChat B geçişinde geri beklenmedik yere
     düşüyor mu? Param değişiminde ekran içi state (draft, scroll) sızıyor mu?
   - Bildirim/deep-link ile açılan ekranda geri: stack altında MainTabs var mı, yoksa
     uygulamadan mı çıkıyor? (cold start + warm start ikisi de)
   - `backBehavior="history"`: tab gezintileri geri tuşuna yığılıyor — Android geri
     tuşu tab geçmişinde dolaşıyor; modern uygulamalar bunu yapmaz.
   - Voice `replace` zincirlerinin araya girdiği akışlar.
3. Android predictive back durumu: `app.config.js`/manifest'te
   `enableOnBackInvokedCallback` ne durumda; RN sürümü + BackHandler kullanımıyla
   uyumu; güvenle açılabiliyorsa aç, açılamıyorsa nedenini raporla (kod değişikliği
   zorlamadan).

### Hedef davranış matrisi (bunu uygula; sapman gerekirse gerekçele)
| Durum | Geri tuşu davranışı |
|---|---|
| Detay ekranı (ChannelChat, DM, Thread, ayar detayları) | Geldiği ekrana döner (stack pop) |
| Kanal → kanal geçişi (aynı route, farklı param) | Stack büyümez; geri her zaman kanal listesine/geldiği yere |
| Overlay/sheet/lightbox açık | Yalnız overlay kapanır (mevcut — koru) |
| Klavye açık (Android) | Klavye kapanır, ekran değişmez (platform default'u — bozma) |
| Tab kökünde, aktif tab ≠ overview | overview tab'ına döner (`backBehavior="initialRoute"` yönünde karar ver) |
| overview kökünde | Uygulamadan çıkar (Discord/WhatsApp normu; "çıkmak için tekrar bas" EKLEME) |
| Bildirim/deep-link ile açılan detay | Geri → MainTabs (uygulama içinde kalır), çıkışa düşmez |
| Voice ekranı | Mevcut özel davranış (minimize) korunur |
| Thread → kanal → ... zinciri | Her adım tek tek geri sarar; `getId` gerekiyorsa bilinçli kullan |

### Uygulama notları
- `backBehavior` kararını ve deep-link stack kurulumunu (`mobile-linking.ts`
  `getStateFromPath`/initial state) hedef matrise göre düzelt.
- Aynı-route geçişlerinde ekran içi state sızıntısı varsa (draft/scroll/selection),
  ekranın param değişiminde state'ini resetle ya da `getId` ile ayrı instance'a geç —
  ölçüp seç (instance sayısı bellek maliyeti getirir; gerekçele).
- Ekran-özel BackHandler eklemek gerekirse voice'taki `useFocusEffect` kalıbını izle;
  global dinleyici EKLEME.
- Navigasyon davranışını mümkün olan her yerde birim/component testle sabitle
  (intent reducer'ları, BackHandler handler'ları, linking state üretimi);
  tam akışlar emülatör el-test listesine.

### Korunacak sözleşmeler
- Overlay newest-first geri davranışı; voice minimize akışı; maestro akışları
  (`.maestro/*.yml` navigasyon adımları değişiyorsa maestro + testid kontratı birlikte).
- Deep link komutları (`mobile-linking.ts` haritası) çalışmaya devam eder.
- `freezeOnBlur`/`lazy` performans ayarları korunur (gerekçesiz kaldırma yok).

### Kabul kriterleri
1. Denetim envanteri + hedef matris raporda; sapmalar gerekçeli.
2. Geri tuşu her ekranda deterministik; tab history yığılması yok; bildirimden gelen
   ekranda geri uygulama içinde kalıyor.
3. Aynı-route param geçişlerinde state sızıntısı yok.
4. Yeni testler + mevcut tüm testler yeşil.

### Doğrulama (hepsi geçmeli, commit yok)
```
pnpm --filter @wizards/mobile typecheck
pnpm --filter @wizards/mobile test
pnpm --filter @wizards/mobile test:components
```

### Rapor
Envanter özeti, uygulanan matris, predictive back kararı, emülatör el-test listesi
(tab gezintisi + geri, bildirimden açılış + geri, kanal→kanal→geri, thread zinciri,
overlay açıkken geri, voice minimize).
