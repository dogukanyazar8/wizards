# Faz 3 Prompt — UI İşlevleri, Realtime, Navigasyon

`00-ortak-baglam.md`, Faz 1 ve Faz 2 raporlarını oku. Güvenli backend sözleşmesini gevşetmeden kullanıcı
akışlarını tamamla. Yerel kirli `uat`; commit/push/deploy ve WIP temizliği yok.

## Hedef

Mesajlar ekranında bağlı görünmesine rağmen çalışmayan thread, arama, compose, poll/pin realtime ve hata
durumlarını tamamla. Aynı davranış için ikinci paralel component/state sistemi kurma.

## Başlangıç

```powershell
graphify query "Messages channel DM thread side panel global search conversation navigation rail new message group dialog poll pin realtime notification bell"
git status --short --branch
```

İncele:

- `apps/web/src/components/chat/chat-area.tsx`
- `apps/web/src/components/chat/thread-panel.tsx`
- `apps/web/src/components/chat/message-search-panel.tsx`
- `apps/web/src/components/dm/dm-conversation-page.tsx`
- `apps/web/src/components/messages/messages-rail-container.tsx`
- `apps/web/src/components/messages/messages-rail.tsx`
- `apps/web/src/components/messages/messages-empty-view.tsx`
- `apps/web/src/components/messages/message-poll.tsx`
- `apps/web/src/components/messages/pinned-strip.tsx` ve pin panel/sheet
- `apps/web/src/hooks/use-poll.ts`, `use-message-search.ts`, `use-dm-conversations.ts`
- `apps/web/src/components/shared/notification-bell.tsx`
- Güncel route/page sahipleri; silinmiş `dm-sidebar`/`messages-layout` dosyalarını geri getirme.

## 1. Kanal ve DM thread paneli

- Mesaj satırındaki thread aksiyonu hem channel hem DM modunda aynı sağ panel yuvasını açmalı.
- Endpoint/send payload moda göre doğru `channelId` veya `conversationId` kullanmalı.
- Thread kökü conversation/channel değişince kapanmalı; başka konuşmaya taşınmamalı.
- Responsive overlay/backdrop ana sohbeti yanlışlıkla tıklanabilir bırakmamalı.
- Panel açılınca anlamlı heading/close kontrolüne focus gider; composer'a zorla focus yok.
- Mevcut `ThreadPanel` yeniden kullanılır; ikinci thread implementation yok.

Önce channel modunda panelin hiç çizilmediğini kanıtlayan component/contract testi yaz. DM regresyonunu da
aynı test grubunda koru.

## 2. Global DM arama oturumu

- Arama paneli açıkken sonuçtan başka conversation'a gidildiğinde panel ve global query korunur.
- Conversation-scoped thread/reply/editor state taşınmaz.
- Search sahibi `key={conversationId}` altında olmamalı. Kalıcı search state'i en yakın ortak DM page/shell
  sahibine kaldır; uygulama geneli store kurma.
- URL deep-link davranışı varsa bozulmaz; back/forward deterministik çalışır.
- Eski request sonucu yeni query/conversation state'ini ezemez; AbortSignal/generation mevcut hook desenine
  göre kullanılır.

Regresyon: search aç, query gir, conversation A sonucu üzerinden B'ye git, panel açık ve query aynı; B'de
thread/reply kapalı.

## 3. Mesajlar rayı yeni DM/grup aksiyonları

- “Yeni mesaj” gerçek kişi seçiciyi; “Yeni grup” mevcut `GroupCreateDialog` akışını açar.
- Aksiyon her Mesajlar rotasında çalışır; yalnız empty view'a bağlı kalmaz.
- Mevcut picker/dialog componentleri paylaşılır. En küçük ortak owner kullan; ikinci modal kopyası yok.
- URL query intent mevcutsa source of truth olarak tamamla; aç/kapatınca query temizlenir, back çalışır.
- Loading sırasında çift gönderim engellenir. Başarıdan önce dialog kapanmaz.
- API hatası görünür, erişilebilir, retry edilebilir; console-only veya swallow yok.

## 4. Poll ve pin realtime tüketimi

- Faz 1'de seçilen güvenli event sözleşmesini aynen tüket.
- Event yalnız ilgili query key'ini invalidate/update eder; bütün DM cache'i gereksiz refetch etmez.
- Optimistic vote ile server event sırası ters gelse bile final server state kazanır.
- Conversation değişince eski listener temizlenir.
- Pin/unpin başka sekmede/istemcide yapıldığında strip, panel ve count senkronlaşır.
- Unauthorized/404 refetch eski hassas DTO'yu cache'te bırakmaz.

Unit hook testleri listener `on/off` eşleşmesini, query key'i ve stale event davranışını doğrulasın. İki browser
realtime E2E final faza eklenir.

## 5. Eksik ve yanıltıcı kontroller

- Empty/new conversation oluşturma akışlarına mutation loading/error state ekle.
- `Mute friend` mevcut gerçek backend/settings sözleşmesine bağlı değilse menüden kaldır. Yeni mute domain'i
  tasarlama. Gerçek endpoint varsa ancak o zaman onu bağla ve persistence testi ekle.
- `/channels`/Mesajlar üst yüzeyinde bildirimlere erişim kalmalı. Mevcut `NotificationBell`i doğru ortak
  header yuvasına bağla; ikinci bell/dropdown kurma.
- Disabled/loading controls doğru `aria-disabled`/`aria-busy` taşır.

## Testler

Mevcut test konumlarını yeniden kullan veya en yakın davranış testini ekle:

- `chat-area`/thread contract testi
- `dm-conversation-page` search-state testi
- `messages-rail.test.tsx`
- `group-create-dialog.test.tsx`
- `use-poll.test.ts`
- pin strip/list testleri
- `friend-row.test.tsx`
- notification bell event testi

```powershell
pnpm.cmd --filter @wizards/web exec node --import tsx --test --test-force-exit src/hooks/use-poll.test.ts src/components/messages/messages-rail.test.tsx src/components/dm/group-create-dialog.test.tsx src/components/messages/pinned-strip.test.tsx src/components/friends/friend-row.test.tsx src/components/shared/notification-bell-events.test.ts
pnpm.cmd --filter @wizards/web test
pnpm.cmd --filter @wizards/web lint
pnpm.cmd --filter @wizards/web typecheck
graphify update .
```

Yeni test dosyası eklediysen dar komuta dahil et. Fazı yalnız görünür kontrol gerçek davranışa bağlıysa tamamla.

Rapor: `docs/prompts/whispr-home-messages-remediation/raporlar/03-faz3-rapor.md`.
