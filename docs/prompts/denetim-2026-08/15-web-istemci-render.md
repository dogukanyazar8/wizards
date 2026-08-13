# 15 — Web istemci: ölü memo'lar ve kaçan kimlikler

`00-ortak-baglam.md` oku. Caveman ultra. `uat`. Commit yok.

**Ön koşul:** yok.

## Sorun

Sohbet ekranı için yazılmış optimizasyonların çoğu, bir bağımlılığın her render yeniden üretilmesi yüzünden çalışmıyor. Kod optimize görünüyor, davranış optimize değil.

**Uyarı — bu prompt bir tuzak taşıyor.** İki madde (`handleReply` + memo karşılaştırıcısı) **birlikte** düzeltilmeli. Tek başına performans düzeltmesi arayüzü bayatlatır: bugün her render yeniden çizildiği için gizlenen eksik karşılaştırma alanları ortaya çıkar.

## Kapsam

### 1. `handleReply` `useCallback`'siz — memo karşılaştırıcısı ölü

`apps/web/src/components/chat/chat-area.tsx:314` · `message-list.tsx:392` · `message-item.tsx:1350`

`onReply`, `MessageItem` memo karşılaştırıcısının kimlikle baktığı **tek** prop. `ChatAreaContent` yazma göstergesi tick'inde ve on `useState` değerinin herhangi birinde render oluyor; her render yeni `onReply` üretiyor; karşılaştırıcı her satır için `false` dönüyor; her satır `ReactMarkdown`'u yeniden çalıştırıyor.

Yap: `useCallback` ile sar (`setReplyTo` dışında bağımlılığı yok, `[]` yeter).

### 2. Memo karşılaştırıcısı dört alanı atlıyor

`apps/web/src/components/chat/message-item.tsx:1328` · `wizards-shell.tsx:120` · `message-list.tsx:489`

Karşılaştırıcı `author.status` ve `author.customStatus`'a bakıyor ama `avatarUrl`, `displayName`, `authorColor`, `mode` ve `readReceipt` alanlarına bakmıyor. Bugün bunlar kazara güncelleniyor — çünkü `onReply` zaten her render değişiyor.

Yap: eksik alanları karşılaştırıcıya ekle. **#1 ile aynı commit'te.**

### 3. `queryKey` her render yeniden üretiliyor

`apps/web/src/hooks/use-messages.ts:375`, `:27`, `:405`, `:528`

`getMessagesQueryKey` her çağrıda yeni dizi döndürüyor ve iki `useEffect`'in bağımlılığı. Sonuç: her render **11 soket dinleyicisi** sökülüp takılıyor (kanal 6 veya DM 5 + `presence:update`). Aynı dosyanın üçüncü effect'i kararlı bağımlılıklar kullanıyor; `chat-area.tsx:313` aynı çağrıyı doğru şekilde memoize ediyor.

Yap: `useMemo(() => getMessagesQueryKey(mode, conversationId), [mode, conversationId])`.

### 4. `allMessages` render gövdesinde

`apps/web/src/components/chat/message-list.tsx:279`, `:330`, `:353`, `:306`, `:289`

Her render yeni dizi → ona bağlı iki `useMemo` ve bir `useEffect` sessizce ölü. `groupedMessages` tüm döküm için mesaj başına nesne ve `Date` üretiyor; effect her render filtreleyip sıralayıp yeni `setTimeout` kuruyor. 500 mesajlık dökümde render başına ~1500 `new Date()`.

Yap: `useMemo(..., [data?.pages, deletedNoticeNow])`.

### 5. Dokuz zorlanmış scroll geçişi

`apps/web/src/components/chat/message-list.tsx:110`, `:108`, `:79`, `:240`

Her yeni mesaj beş rAF + dört timeout (700 ms'e kadar) scroll planlıyor; her biri yaz-oku-yaz ile senkron layout zorluyor. Sanallaştırılmamış, markdown render eden yüzlerce satır üzerinde.

Yap: tek rAF geçişi + bir yerleşme timeout'u. Kullanıcı zaten dipte değilse tamamen atla.

### 6. Profil güncellemesi tüm mesaj cache'ini yeniden inşa ediyor

`apps/web/src/components/shell/wizards-shell.tsx:790`, `:110` · `hooks/use-messages.ts:338`

`setQueriesData({ queryKey: ["messages"] })` bu oturumda açılmış **her** konuşmayı eşliyor ve `patchMessageAuthors` hiç eşleşme olmasa bile yeni nesne döndürüyor. Her `data.pages` kimliği değişiyor, mount edilmiş liste `useLayoutEffect`'i yeniden tetikliyor ve türetmeler yeniden koşuyor — genellikle sıfır mesaja dokunan bir olay için.

Yap: gerçekten eşleşme olup olmadığını izle; yoksa `current`'ı **değiştirmeden** döndür. İki yerde aynı düzeltme.

### 7. Bildirim zili her olayda ağa gidiyor

`apps/web/src/components/shared/notification-bell.tsx:183`, `:106`, `:84`

İyimser artıştan bir satır sonra `invalidateQueries(unreadCount)` çağrılıyor; sorgu her zaman aktif olduğundan gerçek bir GET tetikliyor — bildirim başına, açık sekme başına. `staleTime: 30_000` işe yaramıyor.

Yap: soket yolundan sayaç invalidasyonunu kaldır, iyimser artışa güven; uzlaşmayı popup açılışında yap.

### 8. Capture fazı scroll dinleyicileri

`apps/web/src/components/chat/chat-area.tsx:341`, `:330`, `:179` · `message-search-panel.tsx:129` · `message-toolbar.tsx:139`

Capture fazı, **herhangi** bir elemanın scroll'unda tetikleniyor — mesaj listesinin kendisi dâhil. Her karede senkron layout okuyup `setState` çağırıyor ve 1275 satırlık `ChatAreaContent`'i yeniden render ediyor. `message-toolbar` aynı kalıbı satır başına bir kez kuruyor.

Yap: handler'ı tek `requestAnimationFrame`'de birleştir; ölçülen konum değişmediyse erken dön.

## Yapılmayacak

- Sanallaştırma — 16 no'lu promptun işi.
- Paket bölme — 16'nın işi.
- Sohbet ekranını yeniden yapılandırma.
- Yeni state yönetimi kütüphanesi.
- Stil/tasarım değişikliği.

## Kabul kriterleri

1. `MessageItem` memo karşılaştırıcısı gerçekten devrede: yazma göstergesi tick'i mount edilmiş satırları yeniden render etmiyor.
2. Aynı anda, avatar/görünen ad/renk/mod/okundu bilgisi değişince satır **güncelleniyor** (yani #1 ve #2 birlikte).
3. Bir render `socket.off`/`socket.on` çağrısı üretmiyor.
4. `groupedMessages` yalnız veri değişince yeniden hesaplanıyor.
5. Bir mesaj bir scroll geçişi tetikliyor, dokuz değil.
6. Sıfır mesaja dokunan profil güncellemesi mesaj cache kimliğini değiştirmiyor.
7. Gelen bildirim ağ isteği üretmiyor.

## Testler

Bu maddelerin çoğu render sayımıyla test edilir. Web'de React test kurulumu varsa kullan; yoksa **saf birim seviyesinde** test et:

- `patchMessageAuthors`: eşleşme yoksa `current` referansının aynen döndüğü.
- `getMessagesQueryKey` memoizasyonu: aynı girdide aynı referans.
- Karşılaştırıcı: her alan için değişince `false`, değişmeyince `true` — tablo testi.
- Scroll planlayıcı: bir çağrının bir geçiş planladığı.

Render sayımı testi kurmak için yeni altyapı **kurma**. Test edilemiyorsa değişikliği yorumla belgele ve kabul kriterini manuel doğrula.

## Doğrulama

```bash
pnpm --filter @wizards/web typecheck
```

```bash
pnpm --filter @wizards/web test
```
