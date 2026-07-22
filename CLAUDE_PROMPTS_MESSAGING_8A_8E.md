# Whispr Mobil Mesajlaşma Yenileme — Sıralı Uygulama Prompt'ları (8a → 8e)

Bu dosya, `design_handoff_whispr_mobile/` içindeki Turn 8 tasarımlarını (8a–8e) sırayla
uygulamak için hazırlanmış 5 bağımsız prompt içerir. Her prompt'u ayrı bir Claude Code
oturumuna tek başına yapıştırabilirsin; her biri kendi bağlamını taşır.

**Sıra önemli:** 8a → 8b → 8c → 8d → 8e. Her prompt bir öncekinin çıktısına dayanır.

---
---

## PROMPT 1 / 5 — 8a: Mesaj Etkileşim Menüsü (uzun basış)

Whispr mobil uygulamasında (Expo / React Native, `apps/mobile`) mesaj uzun basış
etkileşim menüsünü tasarıma birebir uygula.

### Bağlam ve kurallar
- Branch: `uat`. **Commit atma.** Emülatör doğrulamasını ben yapacağım; sen emülatör
  başlatmaya çalışma, sadece typecheck + testleri koştur.
- Tasarım kaynakları (önce bunları eksiksiz incele):
  - `design_handoff_whispr_mobile/Whispr Mobile Redesign.dc.html` → `id="8a"` bölümü (satır ~34–85)
  - `design_handoff_whispr_mobile/screenshots/8a-mesaj-etkilesim-menusu.png`
  - `design_handoff_whispr_mobile/CLAUDE_CODE_PROMPT_MESSAGING.md` → "1) Mesaj etkileşim menüsü" bölümü
  - `design_handoff_whispr_mobile/DESIGN_SYSTEM.md` (token'lar)
- Kod tabanı çapaları:
  - DM mesaj satırı: `apps/mobile/src/app/components/dm-chat-primitives.tsx` (`DMChatMessageRow`, `DMChatMessageList`)
  - Kanal mesaj satırı: `apps/mobile/src/app/components/message-primitives.tsx` (`MessageStream`, `MessagePreviewRow`)
  - Ekranlar: `apps/mobile/src/app/screens/dm-conversation-screen.tsx`, `channel-screen.tsx`
  - Mutation'lar (optimistic pattern hazır): `apps/mobile/src/query/use-mobile-message-mutations.ts`
    (send/reaction/edit/delete hem kanal hem DM için mevcut)
  - Emoji seçici (tam sheet): `apps/mobile/src/app/components/message-emoji-picker.tsx`
  - Bottom sheet kiti: `apps/mobile/src/app/components/kit/bottom-sheet.tsx`, context menu kiti: `kit/context-menu.tsx`
  - Türkçe metinler: `apps/mobile/src/locale/mobile-copy.ts` (yeni metinleri buraya key olarak ekle)
  - Stiller ilgili `.styles.ts` dosyalarına gider.

### Tasarım spesifikasyonu (birebir)
- Uzun basışta tam ekran overlay: `rgba(20,23,42,.44)` + hafif blur (blur yoksa
  yarı saydam koyu katman yeterli). Arka plandaki liste soluklaşır; seçili mesaj
  balonu öne çıkar, gölge `0 16px 40px rgba(20,23,42,.35)`.
- Seçili mesajın ÜSTÜNDE **hızlı tepki çubuğu**: beyaz pill, radius 24, padding `6px 8px`,
  gölge `0 12px 32px rgba(20,23,42,.28)`. 6 emoji: **👍 ❤️ 😂 😮 😢 🙏** + sonda "+"
  butonu. Her emoji 40×40 dairesel, font 22. Kullanıcının o mesajda zaten bıraktığı
  emoji `#EEF0FE` arka planla vurgulu. "+" 40×40, `#F6F7FB` zemin, `1px #E7E9F4`
  kenarlık, plus ikonu `#6B7194` — tam emoji seçiciyi (`message-emoji-picker`) açar.
  - Not: mevcut `MOBILE_MESSAGE_REACTION_EMOJIS` sabiti `["👍","❤️","😂","🎉","😮","👀"]`;
    tasarıma göre **👍 ❤️ 😂 😮 😢 🙏** olarak güncelle, testlere yansıt.
- Seçili mesajın ALTINDA **eylem kartı**: genişlik 248, beyaz, radius 20, padding 6,
  gölge `0 16px 44px rgba(20,23,42,.32)`. Satırlar: sol etiket 14px/600 `#1E2235`,
  sağ ikon 17px `#6B7194`, satır padding `11px 12px`, radius 14, basılıda hafif vurgu.
  Sıra: **Yanıtla · Thread başlat · İlet · Kopyala · Sabitle · [ayraç] · Sil**.
  Ayraç: 1px `#EEF0F7`, margin `4px 8px`. Sil satırı ve ikonu `#E5484D`.
- Koşullu satırlar:
  - Kendi mesajında ayrıca **Düzenle** (Yanıtla'nın altına).
  - **Thread başlat** yalnız kanal mesajlarında görünür (DM'de yok).
- Çubuk/kart, balonun hizasına göre konumlanır (gelen mesajda solda, avatar hizasından
  ~39px içeride; giden mesajda sağa yaslı). Ekran taşmalarında görünür alana sıkıştır.
- Dokunma hedefleri ≥44px. Overlay'e dokunma / geri tuşu menüyü kapatır.
- Haptic: uzun basışta hafif titreşim (expo-haptics zaten kullanılıyorsa aynı desen).

### Davranışlar
- Hızlı emoji'ye dokunma → mevcut reaction mutation'ı ile toggle (optimistic), menü kapanır.
- **Yanıtla** → composer üstünde yanıt modunu başlatır (contract'ta `replyToId` hazır;
  composer yanıt çubuğunun tam görsel spesifikasyonu Prompt 2'de — burada işlevsel
  minimum yeterli: state + gönderimde `replyToId`).
- **Thread başlat** → mevcut `message-thread-screen.tsx` ekranına yönlendirir.
- **Kopyala** → mesaj metnini panoya (expo-clipboard), kısa toast/feedback.
- **Düzenle** → mevcut edit akışını tetikler (`useMobile*MessageEditMutation`).
- **Sil** → onay diyaloğu + mevcut delete mutation.
- **İlet** ve **Sabitle** bu fazda **pasif placeholder**: satır görünür ama basınca
  "yakında" tarzı kısa bilgi verir (kalıcı metin `mobile-copy.ts`'e). İlet Prompt 2'de,
  Sabitle Prompt 3'te gerçek işleve bağlanacak — bunu kod içinde TODO ile değil, bu
  dosyalardaki mevcut akışlara temiz genişleme noktası bırakarak yap.
- Menü hem DM hem kanal ekranında aynı bileşenden türesin (tek kaynak; koşullu satırlar
  prop'la). Öneri: `apps/mobile/src/app/components/message-action-menu.tsx` + `.styles.ts`.

### Kabul kriterleri
1. Uzun basış menüsü 8a ekran görüntüsüyle piksel-piksel eşleşiyor (renk, radius,
   gölge, tipografi, boşluklar).
2. Hızlı tepki toggle optimistic çalışıyor; basılı emoji vurgulu.
3. Kendi mesajı/karşı mesajı, DM/kanal koşullu satırları doğru.
4. Kopyala, Yanıtla (işlevsel minimum), Düzenle, Sil, Thread başlat çalışıyor.
5. Yeni metinler `mobile-copy.ts` üzerinden; hardcoded Türkçe string yok.

### Doğrulama (hepsi geçmeli, commit yok)
```
pnpm --filter @wizards/mobile typecheck
cd apps/mobile && node --test --import tsx scripts/*.test.ts
pnpm --filter @wizards/mobile test:components
```
İlgili component testlerini güncelle/ekle (`apps/mobile/component-tests/`), emoji sabiti
değişikliğini kapsayan testleri düzelt. Bittiğinde değişen dosyaların listesiyle kısa özet ver.

---
---

## PROMPT 2 / 5 — 8b: DM — yanıt alıntısı, tepki çipleri, sesli mesaj, link önizleme, düzenlendi/iletildi, okundu

Whispr mobil DM sohbet ekranını (`apps/mobile`) 8b tasarımına birebir getir. Prompt 1'de
uzun basış menüsü ve hızlı tepki çubuğu eklendi; bu faz DM balon zenginleştirmeleri.

### Bağlam ve kurallar
- Branch: `uat`. **Commit atma.** Emülatörü ben doğrularım; sen sadece typecheck + testler.
- Tasarım kaynakları (önce eksiksiz incele):
  - `design_handoff_whispr_mobile/Whispr Mobile Redesign.dc.html` → `id="8b"` bölümü (satır ~87–199)
  - `design_handoff_whispr_mobile/screenshots/8b-dm-yanit-tepkiler.png`
  - `design_handoff_whispr_mobile/CLAUDE_CODE_PROMPT_MESSAGING.md` → 2, 3 ve 7 numaralı bölümler
- Kod çapaları:
  - `apps/mobile/src/app/components/dm-chat-primitives.tsx` + `.styles.ts` (balonlar, satırlar, typing)
  - `apps/mobile/src/app/composer/mobile-composer.tsx` + `.styles.ts`
  - `apps/mobile/src/app/screens/dm-conversation-screen.tsx`
  - Mutation/cache: `apps/mobile/src/query/use-mobile-message-mutations.ts`,
    `mobile-message-cache.ts`; başarısız gönderim overlay'i `mobile-failed-send-registry` deseni korunmalı.
  - Contract: `packages/types/src/messages.ts` — `ChatMessage.replyTo`, `reactions`
    (`userIds` + `users`), `attachments` (`duration`, `contentType`), `editedAt`,
    `deliveryStatus` mevcut. `SendMessageInput.replyToId` mevcut.
  - Realtime: `apps/mobile/src/realtime/mobile-realtime-contract.ts` —
    `dm:typing:update`, `dm:conversation:read` event'leri mevcut.
  - Link önizleme endpoint'i **hazır**: `apps/web/src/app/api/v1/mobile/link-preview/`
    (davranışını oku, mobil istemciden kullan).
  - Ses kaydı: `expo-audio` (~56) kurulu. Upload: `v1/mobile/uploads` + attachment akışı
    (`media-primitives.tsx`'teki mevcut attachment render desenine bak).

### Tasarım spesifikasyonu (birebir)
- **Balonlar** (mevcutları spesifikasyona çek): gelen beyaz, `1px #E7E9F4`, radius
  `18/18/18/6`, padding `11px 14px`, metin 14px/1.45. Giden `#4F46E5`, beyaz metin,
  radius `18/18/6/18`, gölge `0 4px 12px rgba(79,70,229,.22)`. Saat 10.5px `#9AA0BC`.
- **Yanıt alıntı bloğu** (balon içi, üstte): `#EEF0FE` zemin, `border-left:3px #4F46E5`,
  radius 10, padding `7px 10px`, alt boşluk 7. Yazar 11px/800 `#4F46E5` (kendi mesajınsa
  "Sen"), alıntı 12px `#5A5F82`, tek satır ellipsis (max ~210px). Alıntıya dokununca
  liste orijinal mesaja kayar ve mesaj kısa süre vurgulanır.
- **Tepki çipleri (DM)**: balonun sol-alt köşesine bindirilmiş (`bottom:-12px`,
  `left:12px`), yatay gap 4. Kendi tepkin: `#EEF0FE` zemin, `1px #4F46E5`, sayaç
  10.5px/700 `#4F46E5`; diğerleri beyaz, `1px #E7E9F4`, gölge `0 2px 6px rgba(30,34,53,.08)`,
  sayaç `#6B7194`. Emoji 11px, radius 11, padding `2px 7px`. Çip altta kaldığı için
  balonun altındaki zaman etiketi ~10px ekstra üst boşluk alır.
  - Çipe dokunma = toggle. Çipe uzun basış = tepki detay sheet'i (Prompt 5'te gelecek;
    şimdilik genişleme noktası bırak, davranış boş kalabilir).
  - **Çift dokunuş** balona = ❤️ toggle (Instagram davranışı).
- **Composer üstü aktif yanıt çubuğu**: `#F6F7FB` kart, `1px #E7E9F4` + sol `3px #4F46E5`
  şerit, radius 12, padding `8px 12px`, içinde 15px yanıt ikonu `#4F46E5`,
  "ogi_uat kişisine yanıt" 11px/800 `#4F46E5`, altında alıntı 12px `#6B7194` tek satır,
  sağda X (15px `#9AA0BC`, dokunma alanı ≥44). Gönderimde `replyToId` gider, çubuk temizlenir.
- **Swipe-yanıt**: DM'de mesajı sağa kaydırma yanıt modunu başlatır (WhatsApp davranışı;
  hafif haptic + geri yaylanma animasyonu, react-native-gesture-handler).
- **Sesli mesaj**:
  - Composer'da metin boşken mikrofon butonuyla kayıt (expo-audio): basılı tut → kayıt,
    bırak → gönder; kayıt sırasında süre göstergesi, yukarı/iptal jesti şart değil —
    minimum: bas-kaydet, bırak-gönder, kısa kayıtları (<1sn) at.
  - Gönderim: ses dosyası `v1/mobile/uploads` ile attachment olarak yüklenir,
    `duration` set edilir, mesaj attachment'lı gönderilir.
  - Render (8b): balon içinde 36px `#4F46E5` daire play butonu (beyaz üçgen), yanında
    dalga formu — 3px genişlik, radius 2, değişken yükseklik (7–18px) çubuklar; çalınan
    kısım `#4F46E5`, kalan `#B7BCD6` — sağda süre 11.5px/700 `#6B7194` (`0:42` formatı).
    Dalga çubuk yükseklikleri attachment id'den deterministik üretilebilir. Oynatma
    expo-audio ile; oynatırken ilerleme dalga renginde yansır, ikinci basış durdurur.
- **Düzenlendi etiketi**: `editedAt` doluysa saatin yanında italik "düzenlendi"
  10.5px `#9AA0BC`.
- **İletildi (forward)**:
  - Contract'ta forward alanı yok — `packages/types/src/messages.ts`'e opsiyonel
    `forwardedAt: z.string().datetime().nullable().optional()` ekle; `SendMessageInputSchema`'ya
    opsiyonel `forwardOfMessageId` ekle; web API'nin mobil DM/kanal send handler'larında
    bu alanı yaz, mesaj yanıtlarında geri döndür (server tarafını incele:
    `apps/web/src/app/api/v1/mobile/.../messages/route.ts`). Migration gerekiyorsa
    `packages/db/prisma/schema.prisma`'ya nullable kolon ekle (mevcut migration desenine uy).
  - UI: Prompt 1'deki "İlet" menü satırı artık hedef seçim sheet'i açar (DM konuşmaları +
    erişilebilir kanallar listesi, arama şart değil), seçilen hedefe mesaj içeriği
    forward olarak gönderilir. Balon içinde üstte 12px ilet ikonu + italik "İletildi"
    10.5px/700 `#8A90B0`.
- **Link önizleme**: mesaj metnindeki ilk URL için `v1/mobile/link-preview`'dan veri
  çek (React Query, URL bazlı key, cache'li; hata durumunda sessizce kartsız render).
  Kart: balon içinde `#F6F7FB` zemin, `1px #E7E9F4`, radius 12, padding `9px 11px`,
  üst boşluk 7, max genişlik 230: SİTE ADI 10.5px/700 harf aralığı .08em `#8A90B0`
  (büyük harf), başlık 12.5px/700, açıklama 11.5px `#6B7194` 1.4 satır aralığı,
  1-2 satır ellipsis. Karta dokunma linki açar.
- **Okundu bilgisi (DM)**: giden mesajda saat yanında çift tik — karşı taraf okuduysa
  `#4F46E5`, sadece iletildiyse gri (`#9AA0BC`). Okundu durumu konuşma seviyesinde:
  `dm:conversation:read` realtime event'i + DM details/read endpoint'lerinden karşı
  tarafın son okuma zamanını al; `createdAt <= lastReadAt` olan giden mesajlar okundu
  sayılır. Mevcut read altyapısını incele (`useMobileDMReadMutation`,
  `dm-conversation-screen.tsx`), karşı tarafın okuma zamanı response'larda yoksa
  server tarafında details endpoint'ine ekle.
- **Yazıyor göstergesi**: mevcut `DMChatTypingIndicator` görselini 8b/8d'deki 3 nokta
  balonuna çek (beyaz balon, `1px #E7E9F4`, radius 14, padding `11px 13px`, 6px noktalar
  `#B7BCD6/#9AA0BC/#DDE0F0`, yumuşak animasyon).

### Kabul kriterleri
1. Yanıt alıntı bloğu + composer yanıt çubuğu + swipe-yanıt + alıntıya-dokun-kaydır 8b ile birebir.
2. Tepki çipleri balon köşesine bindirilmiş, toggle + kendi-tepki vurgusu doğru, çift dokunuş ❤️.
3. Sesli mesaj kayıt → yükleme → gönderme → oynatma uçtan uca; görsel 8b ile birebir.
4. Link önizleme kartı, düzenlendi/İletildi etiketleri, okundu tikleri 8b ile birebir.
5. İlet akışı çalışıyor (contract + server + UI); typecheck web + types dahil temiz.
6. Yeni metinler `mobile-copy.ts`'te; dokunma hedefleri ≥44px; failed-send overlay bozulmadı.

### Doğrulama (hepsi geçmeli, commit yok)
```
pnpm --filter @wizards/types typecheck
pnpm --filter @wizards/web typecheck
pnpm --filter @wizards/mobile typecheck
cd apps/mobile && node --test --import tsx scripts/*.test.ts
pnpm --filter @wizards/mobile test:components
```
Contract değişikliği için `packages/types` testlerini de koştur/güncelle. Bittiğinde
değişen dosyalar + eklenen endpoint alanlarıyla kısa özet ver.

---
---

## PROMPT 3 / 5 — 8c: Metin kanalı — sabitleme, tepki satırı, thread özeti, yüzen eylem çubuğu, YENİ ayracı

Whispr mobil kanal ekranını (`apps/mobile`) 8c tasarımına birebir getir. Prompt 1'de uzun
basış menüsü, Prompt 2'de tepki/yanıt/forward altyapısı geldi; bu faz kanal akışı.

### Bağlam ve kurallar
- Branch: `uat`. **Commit atma.** Emülatörü ben doğrularım; sen typecheck + testler.
- Tasarım kaynakları (önce eksiksiz incele):
  - `design_handoff_whispr_mobile/Whispr Mobile Redesign.dc.html` → `id="8c"` bölümü (satır ~201–305)
  - `design_handoff_whispr_mobile/screenshots/8c-kanal-thread-sabitleme.png`
  - `design_handoff_whispr_mobile/CLAUDE_CODE_PROMPT_MESSAGING.md` → 5 ve 6 numaralı bölümler
- Kod çapaları:
  - `apps/mobile/src/app/components/message-primitives.tsx` + `.styles.ts`
    (`MessageStream`, `MessagePreviewRow`, `MessageReactionList`, `MessageDateSeparator`)
  - `apps/mobile/src/app/screens/channel-screen.tsx` + `.styles.ts`
  - Contract: `ChatMessage.isPinned/pinnedAt/pinnedById` ve
    `threadSummary {replyCount, lastReplyAt, recentRepliers}` **zaten mevcut**
    (`packages/types/src/messages.ts`).
  - **Pin endpoint'leri mobil API'de YOK.** Web'de var:
    `apps/web/src/app/api/v1/channels/[channelId]/messages/[messageId]/pin/` ve
    `v1/channels/[channelId]/pins/`. Bunları incele; `v1/mobile/channels/[channelId]/...`
    altına eşdeğer pin/unpin + pins-list route'ları ekle (mevcut mobil route auth/permission
    desenini birebir izle) ve mobil istemciye bağla.
  - Okunmamış sınır verisi: `channel-screen` / unread altyapısını incele
    (`v1/mobile/channels/[channelId]/read`, `server:unread:update`); YENİ ayracı için son
    okunan mesaj konumunu kullan.

### Tasarım spesifikasyonu (birebir)
- **Kanal mesaj satırı** (Discord/Slack düz satır düzeni): 38px avatar (radius 14, renkli
  tint + baş harfler — mevcut avatar deseni), ad 14px/800 + saat 10.5px `#9AA0BC` aynı
  baseline'da gap 7, metin 14px/1.45. Satır arası dikey boşluk 14.
- **@mention**: mesaj metninde `@kullanıcı` parçaları vurgu renginde (`#4F46E5`, 600+).
- **Tepki satırı (kanal)**: mesajın altında satır olarak (DM'deki bindirmenin aksine),
  üst boşluk 3, gap 5. Çip: emoji 12px + sayaç 11px/700, radius 11, padding `3px 8px`;
  kendi tepkin `#EEF0FE` + `1px #4F46E5` + sayaç `#4F46E5`; diğeri beyaz + `1px #E7E9F4`.
  Satır sonunda **"+" ekleme çipi**: beyaz, `1px dashed #C9CDE4`, radius 11, padding
  `3px 9px`, 13px plus ikonu `#8A90B0` — tam emoji seçiciyi açar.
- **Thread özeti kartı** (threadSummary'li mesajın altında): beyaz, `1px #E7E9F4`,
  radius 13, padding `8px 11px`, üst boşluk 5, max genişlik 270. İçerik: üst üste binen
  3 avatar (`recentRepliers`, 22px, radius 8, `2px` beyaz kenarlık, -7px overlap),
  "5 yanıt" 12px/800 `#4F46E5`, "Son yanıt 12 dk önce" 11px `#9AA0BC` (relative time,
  mevcut TR relative-time yardımcıları), sağda 14px chevron `#9AA0BC`. Dokununca thread
  ekranına gider.
- **Sabitlenmiş mesaj bandı** (header'ın hemen altında, akışın üstünde sabit):
  `#EEF0FE` zemin, alt kenarlık `1px #DFE2FC`, padding `9px 16px`. Sol: 15px pin ikonu
  `#4F46E5`. Orta: "Sabitlenmiş · aysegul_dev" 11px/800 `#4F46E5` + altında mesaj
  içeriği 12px `#5A5F82` tek satır ellipsis. Sağ: "3 sabit" 11px/800 `#4F46E5` +
  15px chevron. En son sabitlenen gösterilir; kanalda sabit yoksa bant render edilmez.
  - Banda dokunma → akışta o mesaja kaydır + vurgula.
  - "N sabit + chevron" → tüm sabitlenmişler listesi (bottom sheet yeterli: her satır
    yazar + içerik + saat; satıra dokun → mesaja atla; kendi yetkinse satırdan çöz).
  - Prompt 1'deki "Sabitle" menü satırını gerçek pin/unpin mutation'ına bağla
    (sabitliyse "Sabitlemeyi kaldır" göster; optimistic + cache güncelleme,
    `createMobileOptimisticMutationOptions` desenleri).
- **Uzun basış (kanal)**: 8a'daki tam ekran menü DM'de kalır; kanalda uzun basışta satır
  `#EEF0FE66` zeminle vurgulanır (radius 16, padding `8px 10px`, -10px yatay negatif
  margin) ve satırın sağ üstünde **yüzen eylem çubuğu** belirir (`top:-16px, right:8px`):
  beyaz, `1px #E7E9F4`, radius 14, padding `4px 6px`, gölge `0 6px 18px rgba(30,34,53,.12)`.
  Butonlar 32×32 radius 10, sırayla: 👍 (15px) · ❤️ · emoji-seçici ikonu · yanıtla ·
  thread · ⋯. Emoji butonları anında toggle; ⋯ → 8a eylem kartını (İlet/Kopyala/
  Sabitle/Düzenle/Sil) bottom sheet ya da aynı yüzen kart olarak açar. Dışarı dokunma kapatır.
  - Not: 8a menüsü kanal için "Thread başlat" içeriyordu; kanalda birincil desen artık
    bu eylem çubuğu. Çubuktaki yanıtla → composer yanıt modu (kanal gönderiminde
    `replyToId`), thread → thread ekranı.
- **Kanal yanıt satırı**: `replyTo`'lu kanal mesajının üstünde küçük satır:
  13px yanıt ikonu `#9AA0BC` + "**mkaya** kişisine yanıt: Mobilde uzun basınca eylem…"
  — ad bold `#4F46E5`, kalan 11.5px `#6B7194`, alıntı `#9AA0BC` ellipsis. Dokununca
  orijinal mesaja kaydırır.
- **YENİ ayracı**: son okunan konumdan sonraki ilk mesajın üstünde; iki yanda 1px
  `#E5484D55` çizgi, ortada "YENİ" 10.5px/800, harf aralığı .1em, `#E5484D`. Ekrana
  girince mevcut read akışı bozulmadan çalışmaya devam eder.
- Composer'daki sağ buton: metin boşken mikrofon (8c'deki gibi — Prompt 2'deki sesli
  mesaj kaydı kanalda da çalışır), metin doluyken gönder.

### Kabul kriterleri
1. Kanal satırı, tepki satırı + dashed "+", thread özeti kartı 8c ile birebir.
2. Sabit bandı + pins listesi + pin/unpin (mobil endpoint'ler dahil) uçtan uca çalışıyor.
3. Uzun basışta satır vurgusu + yüzen eylem çubuğu 8c ile birebir; tüm eylemler işlevsel.
4. Kanal yanıt satırı ve YENİ ayracı doğru konumda, doğru görselle.
5. @mention vurgusu çalışıyor; dokunma hedefleri ≥44px; metinler `mobile-copy.ts`'te.

### Doğrulama (hepsi geçmeli, commit yok)
```
pnpm --filter @wizards/web typecheck
pnpm --filter @wizards/mobile typecheck
cd apps/mobile && node --test --import tsx scripts/*.test.ts
pnpm --filter @wizards/mobile test:components
```
Yeni pin route'ları için web tarafında mevcut test desenine uygun test ekle (varsa).
Bittiğinde değişen dosyalar + eklenen endpoint'lerle kısa özet ver.

---
---

## PROMPT 4 / 5 — 8d: Thread ekranı — kök mesaj, yanıt listesi, "kanala da gönder"

Whispr mobil thread ekranını (`apps/mobile/src/app/screens/message-thread-screen.tsx`)
8d tasarımına birebir yeniden yaz. Prompt 3'te thread özeti kartı ve giriş noktaları geldi.

### Bağlam ve kurallar
- Branch: `uat`. **Commit atma.** Emülatörü ben doğrularım; sen typecheck + testler.
- Tasarım kaynakları (önce eksiksiz incele):
  - `design_handoff_whispr_mobile/Whispr Mobile Redesign.dc.html` → `id="8d"` bölümü (satır ~307–394)
  - `design_handoff_whispr_mobile/screenshots/8d-thread-gorunumu.png`
  - `design_handoff_whispr_mobile/CLAUDE_CODE_PROMPT_MESSAGING.md` → 4 numaralı bölüm
- Kod çapaları:
  - Mevcut ekran: `apps/mobile/src/app/screens/message-thread-screen.tsx` (davranışını
    ve veri akışını önce incele — thread endpoint'i:
    `v1/mobile/channels/[channelId]/messages/[messageId]/thread`).
  - Contract: `SendMessageInput.threadParentId`, `ChatMessage.threadParentId`,
    `threadSummary` mevcut.
  - Realtime: `typing:update` event'i mevcut — thread ekranındaki yazıyor göstergesi
    için kanal typing verisini kullan (thread-spesifik typing yoksa kanal seviyesi kabul).
  - Composer: `apps/mobile/src/app/composer/mobile-composer.tsx` yeniden kullanılmalı.
- **Thread yalnız kanallarda.** DM'de thread giriş noktası yok (DM'de yanıt zinciri var);
  DM thread endpoint'i mevcut olsa da UI açma.

### Tasarım spesifikasyonu (birebir)
- **Header**: sol blokta "Thread" 16px/800 + altında "# genel · 5 yanıt" 12px/600
  `#6B7194` (kanal adı + canlı yanıt sayısı); sağda 44×44 kapat (X) butonu
  (`#F6F7FB` zemin, `1px #E7E9F4`, radius 15, 17px ikon `#6B7194`). Geri değil kapat
  paradigması: ekrandan çıkınca kanala döner.
- **Kök mesaj kartı**: beyaz, `1px #E7E9F4`, radius 18, padding `13px 14px` — içinde
  38px avatar, ad 14px/800 + saat, metin 14px/1.45 ve mesajın tepki çipleri (kanal
  çip stiliyle; toggle burada da çalışır).
- **Ayraç**: "5 YANIT" 11px/800, harf aralığı .08em, `#8A90B0` + sağa uzanan 1px
  `#E7E9F4` çizgi; margin `12px 2px 10px`.
- **Yanıt listesi**: soldan `2px #DFE2FC` dikey çizgi (margin-left 8, padding-left 6),
  her yanıt padding-left 8, gap 12. Yanıt satırı: 34px avatar (radius 12), ad
  13.5px/800 + saat 10.5px `#9AA0BC`, metin 13.5px/1.45; yanıtların kendi tepki çipleri
  olabilir (küçük boy: emoji 11px, padding `2px 7px`).
  - Uzun basış → 8a eylem menüsü (thread içinde "Thread başlat" satırı yok).
  - Sondaki **yazıyor göstergesi**: avatar + beyaz balon (`1px #E7E9F4`, radius 14,
    padding `11px 13px`), 3 nokta 6px (`#B7BCD6`, `#9AA0BC`, `#DDE0F0`), animasyonlu.
- **Composer**: üstünde onay satırı — 19×19 checkbox (işaretliyken `#4F46E5` dolgu,
  radius 6, beyaz tik; işaretsizken boş kutu `1px #C9CDE4`), yanında
  "Ayrıca #genel kanalına gönder" 12.5px/600 `#6B7194` (kanal adı dinamik). Placeholder:
  "Thread'e yanıt yaz…". Varsayılan işaretsiz; işaretliyken gönderilen yanıt thread'e
  yazılır **ve** kanal akışında da görünür (Slack davranışı — server tarafında bu
  davranış yoksa: thread send handler'ına opsiyonel `alsoSendToChannel` bayrağı ekle,
  `SendMessageInputSchema`'ya opsiyonel alan + web handler güncellemesi; mevcut thread
  yanıtının kanala nasıl yansıdığını önce incele, gerekmiyorsa dokunma).
- Gönderim mevcut optimistic + failed-send desenleriyle; thread yanıtı kanal akışındaki
  thread özet kartını (replyCount, recentRepliers, lastReplyAt) optimistic günceller —
  bu davranış bugün varsa koru, yoksa cache güncellemesini ekle.
- Boş thread durumu (0 yanıt): ayraç "0 YANIT" yerine kibar boş durum metni
  (`mobile-copy.ts`'e key) + composer odaklı açılış.

### Kabul kriterleri
1. Ekran 8d ile piksel-piksel: header, kök kart, ayraç, girintili yanıt listesi,
   yazıyor göstergesi, checkbox'lı composer.
2. "Ayrıca kanala gönder" uçtan uca çalışıyor; kapalıyken yanıt yalnız thread'de.
3. Kök ve yanıt tepkileri toggle çalışıyor; uzun basış menüsü thread içinde doğru satırlarla.
4. Yanıt sayısı header'da ve kanal thread özet kartında canlı güncelleniyor.
5. DM'de thread UI'sına hiçbir giriş yolu yok; metinler `mobile-copy.ts`'te.

### Doğrulama (hepsi geçmeli, commit yok)
```
pnpm --filter @wizards/types typecheck
pnpm --filter @wizards/web typecheck
pnpm --filter @wizards/mobile typecheck
cd apps/mobile && node --test --import tsx scripts/*.test.ts
pnpm --filter @wizards/mobile test:components
```
Bittiğinde değişen dosyalar + varsa contract/server değişiklikleriyle kısa özet ver.

---
---

## PROMPT 5 / 5 — 8e: Tepki detay sheet'i — kim hangi ifadeyi bıraktı

Whispr mobilde tepki detay alt sheet'ini 8e tasarımına birebir uygula. Prompt 1-4'te
tepki çipleri DM, kanal ve thread'de çalışır durumda; bu faz detay görünümü.

### Bağlam ve kurallar
- Branch: `uat`. **Commit atma.** Emülatörü ben doğrularım; sen typecheck + testler.
- Tasarım kaynakları (önce eksiksiz incele):
  - `design_handoff_whispr_mobile/Whispr Mobile Redesign.dc.html` → `id="8e"` bölümü (satır ~396–458)
  - `design_handoff_whispr_mobile/screenshots/8e-tepki-detay-sheet.png`
  - `design_handoff_whispr_mobile/CLAUDE_CODE_PROMPT_MESSAGING.md` → 2 numaralı bölüm (sheet kısmı)
- Kod çapaları:
  - Bottom sheet kiti: `apps/mobile/src/app/components/kit/bottom-sheet.tsx`
  - Tepki verisi: `MessageReactionSchema` — `emoji`, `count`, `userIds`, opsiyonel
    `users[{id, username, displayName, avatarUrl}]` (`packages/types/src/messages.ts`).
    Mobil reactions endpoint'lerinin `users` dizisini doldurup doldurmadığını kontrol et
    (`apps/web/src/app/api/v1/mobile/.../reactions/`); doldurmuyorsa server tarafında
    doldur — kişi listesi ad + avatar ister. Tepki bırakılma saati contract'ta yoksa
    saat alanını server'dan ekle (`reactedAt`); eklenemiyorsa satırda saat yerine
    kullanıcı adı ikincil satırı göster ve bunu özette belirt.
  - Tetikleyiciler: DM/kanal/thread'deki tepki çipine **uzun basış** (Prompt 2'de
    genişleme noktası bırakılmıştı) — tek paylaşılan bileşen:
    öneri `apps/mobile/src/app/components/message-reaction-detail-sheet.tsx` + `.styles.ts`.

### Tasarım spesifikasyonu (birebir)
- Alt sheet: beyaz, üst radius 28, üstte sürükleme tutamacı 44×5 radius 3 `#DDE0F0`
  (margin `10px 0 6px`), arkada `rgba(20,23,42,.4)` karartma; aşağı sürükleme/karartmaya
  dokunma kapatır. Alt safe-area padding'i korunur.
- Başlık: "Tepkiler · 9" 16px/800, padding `4px 20px 10px` — sayı toplam tepki adedi.
- **İfade sekmeleri**: yatay satır, gap 7, padding `0 20px 14px`, altında `1px #EEF0F7`
  çizgi. Sekme: emoji 15px + sayaç 12.5px, radius 14, padding `7px 13px`. Aktif:
  `#EEF0FE` zemin, `1.5px #4F46E5`, sayaç 800 `#4F46E5`; pasif: `#F6F7FB`,
  `1px #E7E9F4`, sayaç 700 `#6B7194`. Sekmeye dokunma listeyi o emojiye filtreler.
  Açılışta uzun basılan çipin emojisi aktif gelir.
- **Kişi listesi**: padding `8px 20px 0`, satır padding `9px 0`, gap 12. Satır: 42px
  avatar (radius 15, renkli tint + baş harfler / avatarUrl), ad 14px/700, altı 11.5px
  `#9AA0BC` saat; sağda 18px emoji.
- **Kendi satırın**: ad yerine "Sen", ikincil satır "13:58 · kaldırmak için dokun";
  satıra dokunma tepkiyi kaldırır (optimistic), sayaçlar/sekmeler anında güncellenir;
  o emojide başka tepki kalmadıysa sekme düşer, hiç tepki kalmadıysa sheet kapanır.
- Liste güncel veriyle açılır (cache'teki mesajdan başla, gerekiyorsa arka planda tazele).

### Kabul kriterleri
1. Sheet 8e ile piksel-piksel: tutamaç, başlık, sekmeler, kişi satırları, "Sen" satırı.
2. Sekme filtreleme + açılışta doğru emoji aktif.
3. "Sen" satırından kaldırma optimistic çalışıyor; sayaç/sekme/sheet durumları tutarlı.
4. DM, kanal ve thread'de çip uzun basışı aynı sheet'i açıyor.
5. `users` verisi server'dan eksiksiz geliyor; metinler `mobile-copy.ts`'te;
   dokunma hedefleri ≥44px.

### Doğrulama (hepsi geçmeli, commit yok)
```
pnpm --filter @wizards/types typecheck
pnpm --filter @wizards/web typecheck
pnpm --filter @wizards/mobile typecheck
cd apps/mobile && node --test --import tsx scripts/*.test.ts
pnpm --filter @wizards/mobile test:components
```
Sheet için component testi ekle. Bittiğinde değişen dosyalarla kısa özet ver; tüm
8a-8e akışının uçtan uca durumunu (neyin emülatörde doğrulanması gerektiğini) listele.
