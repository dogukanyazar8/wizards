# 19 — Mobil: realtime invalidasyon ve cache anahtarları

`00-ortak-baglam.md` oku. Caveman ultra. `uat`. Commit yok.

**Ön koşul:** 17 landed.

## Sorun

Cache zaten doğru yamalanmışken yine de ağır bir okuma invalidate ediliyor; bir olay hiçbir kaynak setinde olmadığı için catch-all'a düşüp bootstrap'i yeniden çektiriyor; bir yazma navigasyonu refetch'e bekletiyor; bir anahtar hiç okunmuyor.

Kök neden: **"bu yazma neyi taşıdı" tablosu ile gerçekte okunan anahtarlar birbirinden kaymış.**

## Kapsam

### 1. `presence:update` workspace detayını invalidate ediyor

`apps/mobile/src/realtime/realtime-query-bridge.ts:328`, `:348`, `:209` · `apps/mobile/src/query/mobile-workspace-query.ts:15` · `apps/web/src/lib/friends/service.ts:397`

Sunucu presence'ı **her üyeye** yayıyor. Köprü, kişi arkadaş değilse `friendsPatched` false olduğu için fallback'e giriyor ve `mobileQueryKeys.workspace(serverId)`'yi — "backend'in servis ettiği en ağır okuma" — invalidate ediyor. Oysa `workspacePatched` başarılı; sonucu 348. satırda `void` ile atılıyor.

Yap: fallback'i `friendsPatched || workspacePatched` ile kapıla ve `void` atmayı kaldır. Yalnız gerçekten ıskalayan cache'leri planla.

### 2. `dm:conversation:delivered` bootstrap çektiriyor

`apps/mobile/src/realtime/mobile-realtime-contract.ts:142`, `:144`, `:436` · `realtime-query-bridge.ts:1359`, `:1370` · `apps/mobile/src/app/features/mobile-resume-refresh.ts:12`

Olay `DM_REFRESH_EVENTS` içinde değil, bu yüzden `sources.size === 0` catch-all'ına düşüp `"bootstrap"` planlıyor. Köprünün `patched` bayrağı yalnız `"dm"` kaynağını bastırıyor. Gönderilen her mesajın teslim makbuzu ~21 KB bootstrap'i JS thread'inde yeniden parse ettiriyor.

Yap: `"dm:conversation:delivered"`'ı `DM_REFRESH_EVENTS`'e ekle — envanter satırı zaten yamalandığı için `dmConversationsPatched` kapısı onu tamamen bastıracak.

**Ayrıca:** catch-all'ın kendisi tehlikeli. Bilinmeyen bir olayın en pahalı okumayı tetiklemesi yanlış varsayılan. Sözleşmeye "her olay bir kaynak setinde olmalı" testi ekle — yeni olay eklenip unutulunca test kırılsın.

### 3. Tek bildirim okuması tüm workspace önekini invalidate ediyor

`apps/mobile/src/notifications/mobile-notification-query.ts:107`, `:110`, `:121` · `app/screens/notifications-screen.tsx:351`, `:371`

Dört invalidasyon `Promise.all` ile döndürülüyor, biri `workspaceRoot()` öneki: her cache'lenmiş sunucunun detayı, üyeleri, rolleri, rol genel bakışı, davetleri. `onSuccess` promise döndürdüğü için React Query mutasyonu tüm refetch'ler oturana kadar açık tutuyor. N satıra dokunmak N kez.

Yap:

- Workspace invalidasyonunu bildirimin ait olduğu sunucuya daralt (olay `server` taşıyor).
- `return`'ü kaldır — `onSuccess` refetch'leri beklemesin.

### 4. Davetle katılma navigasyonu refetch'i bekliyor

`apps/mobile/src/dm/mobile-group-client.ts:519`, `:485`, `:371`, `:385`, `:404` · `app/screens/mobile-screen-containers.tsx:1108`, `:1105`

`joinViaInvite.onSuccess` invalidasyon promise'ini döndürüyor; çağıran `.then` içinde navigasyon yapıyor. Katılım başarılı olduktan sonra düğme `busy` kalıyor ve kullanıcı DM envanteri turu boyunca davet önizlemesinde bekliyor. Aynı şekil `addMembers`/`setMuted`/`update`'te. Dosya bu tehlikeyi yalnız çıkarma dalı için belgelemiş (`:347`).

Yap: navigasyon yapan dallarda invalidasyonu `void` ile ateşle. Bu, bu oturumda `removeMember` için zaten yapılan düzeltmenin aynısı — deseni yaz ve dosyanın yorumunda genelleştir.

### 5. Okunmayan cache anahtarı

`apps/mobile/src/dm/mobile-group-client.ts:469`, `:471`, `:445` · `realtime-query-bridge.ts:460`

Rol değişimi `groupMembers(conversationId)` anahtarını invalidate ediyor ve köprü onu patch'liyor, ama hiçbir `useQuery`/`prefetchQuery` bu anahtarı okumuyor. Roster'ı ekranlar `groupDetails(...).participants`'tan alıyor. `MOBILE_GROUP_INVALIDATIONS` tablosu "bir yazma neyi taşıdı"nın tek kaynağı olarak belgelenmiş — hiç kullanılmamış bir giriş o sözleşmeyi yalancı yapıyor.

Yap: anahtarı ve iki referansı **düşür**. (Alternatif: üye ekranını o anahtara bağla — ama gerçek bir ihtiyaç yoksa kod ekleme.)

### 6. Prefetch set'leri oturum silmede temizlenmiyor

`apps/mobile/src/query/mobile-message-prefetch.ts:128`, `:168` · `apps/mobile/src/state/reset-mobile-session-state.ts:8` · karşılaştır `mobile-message-stream-source.ts:40`

Üç modül düzeyi `Set` süreç ömrü boyunca büyüyor; tek sıfırlama test amaçlı. `runMobileSessionWipe` sonrası cihaz, çıkış yapmış hesabın konuşma id'lerini bellekte tutuyor — silmenin kaldırmak için var olduğu artık kalıntının aynısı.

Yap: test-dışı bir sıfırlama ekle ve `resetMobileSessionState`'ten çağır. Kardeş akışın yaptığı gibi bir tavan da koy (`MOBILE_MESSAGE_STREAM_ORIGIN_CAP` deseni).

### 7. Realtime istemcisi teardown yarışı

`apps/mobile/src/realtime/mobile-realtime-client.ts:161`, `:171`, `:177`, `:181`

`connect()` token beklemeden **önce** `disposed` kontrol ediyor, sonra kontrol etmiyor. Bekleme sırasında bir teardown gelirse tüm dinleyicileri sökülmüş, referansı bırakılmış ama **bağlı** bir soket kalıyor: kullanıcı çevrimiçi görünüyor, presence ve ses odaları onu sayıyor, uygulama hiç olay almıyor. Connect effect'i görünürlük, retry nonce, durum ve handler kimliği değişince yeniden koşuyor — arka plandan öne dönüş bunu tetiklemeye yeter.

Yap: `await` sonrası `disposed`'ı ve `socket === nextSocket` eşitliğini yeniden kontrol et.

### 8. Banner cache yaması yanlış şekli okuyor

`apps/mobile/src/query/mobile-profile-cache.ts:344`, `:343` · `apps/mobile/src/social/mobile-social-client.ts:175` · `mobile-social-query.ts:114` · `packages/types/src/mobile-social.ts:706` · test: `scripts/mobile-profile-cache.test.ts:186`

Güncelleyici cache'i **sarmalanmış** yanıt şekli olarak okuyor (`current.profile.user.id`), ama anahtar sarmalanmamış profili saklıyor. `setQueriesData` kendi filtresi olmadan her `["mobile","user-profile",…]` girdisine uygulandığından, kullanıcı herhangi bir profil kartı açtıysa `current.profile` `undefined` ve `.user` fırlatıyor — banner kaydetme başarı toast'ını ve sonrasını atlıyor. Testin fixture'ı yanlış şekli besliyor, o yüzden yakalanmıyor.

Yap: güncelleyiciyi `MobileUserProfile` olarak yaz ve oku; test fixture'ını gerçek şekle düzelt. Realtime köprüsü (`:353`) aynı anahtarı **doğru** okuyor — referans o.

## Yapılmayacak

- Yeni cache katmanı veya normalizasyon.
- Sorgu anahtarı şemasını yeniden tasarlamak.
- Sunucu tarafı olay sözleşmesini değiştirmek.

## Kabul kriterleri

1. Arkadaş olmayan birinin presence'ı workspace detayını invalidate etmiyor.
2. Teslim makbuzu bootstrap'i çektirmiyor; bilinmeyen bir olay eklenirse sözleşme testi kırılıyor.
3. Bildirim okuma yalnız ilgili sunucunun cache'ini invalidate ediyor ve mutasyon refetch beklemiyor.
4. Davetle katılma sonrası navigasyon anında.
5. Okunmayan anahtar kalmadı.
6. Oturum silme prefetch set'lerini de temizliyor.
7. Teardown sırasında çözülen bir connect canlı soket bırakmıyor.
8. Banner kaydetme, açık profil kartı cache'i varken fırlatmıyor.

## Testler

- Köprü: patch başarılıyken fallback planlanmadığı.
- Sözleşme: her realtime olayı en az bir kaynak setinde (tablo testi).
- Bildirim invalidasyonu: yalnız beklenen anahtarların çağrıldığı.
- `joinViaInvite`: `mutateAsync`'in invalidasyonu beklemeden çözüldüğü (asılı sorgu deseni — bu oturumdaki `mobile-group-leave.test.tsx` referans).
- Profil cache: sarmalanmamış fixture ile yamanın çalıştığı, sarmalanmışla değil.

## Doğrulama

```bash
pnpm --filter @wizards/mobile typecheck
```

```bash
pnpm --filter @wizards/mobile test
```

```bash
cd apps/mobile && npx jest component-tests
```
