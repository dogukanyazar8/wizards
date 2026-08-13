# 18 — Mobil: liste ve satır render maliyeti

`00-ortak-baglam.md` oku. Caveman ultra. `uat`. Commit yok.

**Ön koşul:** 17 landed. Provider kimlik kaçakları duruyorken satır memo'larını ölçmek anlamsız.

## Sorun

Liste ekranlarında aynı üç hata tekrar ediyor: `data` render gövdesinde yeniden kuruluyor, `renderItem` satır içi ok, satır prop'u her render taze literal. Üçü de `memo`/FlashList optimizasyonunu iptal ediyor. Ayrıca üç liste hiç sanallaştırılmıyor.

## Kapsam

### Kimlik kaçakları

| Yer                                                   | Sorun                                                                                                                                                                                                                               | Yap                                                                                         |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `app/screens/dm-inbox.tsx:506`                        | `typingNames={typingByConversationId[id] ?? []}` — satır başına taze dizi; `DirectMessageConversationCard` memo'sunu (`:580`) tamamen öldürüyor. Repo bu tuzağı `dm-conversation-screen.tsx:67`'de `EMPTY_PARTICIPANTS` ile çözmüş. | Modül düzeyinde dondurulmuş boş dizi.                                                       |
| `app/screens/dm-inbox.tsx:519`, `:486`                | FlashList `style` her render yeni spread nesnesi; `renderItem` satır içi.                                                                                                                                                           | Stilleri styles hook'unda bir kez birleştir; `renderItem`'ı `useCallback`'e al.             |
| `app/screens/dm-conversation-screen.tsx:475`          | `onDeleteMessage` satır içi ok; `dm-chat-primitives.tsx:1442`'de `renderItem` bağımlılığı, `:955`'te memo karşılaştırıcısı ona bakıyor. Kanal ekranı (`channel-screen.tsx:478`) doğru yapıyor.                                      | `useCallback`.                                                                              |
| `app/screens/workspace-channel-section-list.tsx:68`   | FlashList `data` render gövdesinde `flatMap` ile kuruluyor — çağıranın (`workspace-browser.tsx:363`) referans kararlılığı için yazdığı memo boşa gidiyor.                                                                           | `useMemo(..., [sections])`.                                                                 |
| `app/screens/workspace-channel-section-list.tsx:88`   | `renderItem` satır içi.                                                                                                                                                                                                             | `useCallback`.                                                                              |
| `app/screens/workspace-channel-section-list.tsx:96`   | Satır başına `voiceStates.find(...)` — O(kanal × ses durumu). 60 kanal × 15 oda = render başına 900 karşılaştırma, üstelik presence tick'inde render olan bir liste.                                                                | `useMemo` ile `Map<channelId, participants>`; desen `server-profile-screen.tsx:203`'te var. |
| `app/components/message-primitives.tsx:954`           | `MessageStream` `renderItem` satır içi; `MemoizedMessagePreviewRow` (`:1865`) her görünür satır için baypas ediliyor. DM listesi (`dm-chat-primitives.tsx:1359`) doğru yapıyor ve yorumunda nedenini yazıyor.                       | `useCallback`.                                                                              |
| `app/screens/group-create/group-create-screen.tsx:95` | `selectedFriends` render gövdesinde iç içe lineer arama; `member-step.tsx:83` aynı işi `friendsById` Map'iyle doğru yapıyor.                                                                                                        | Memoize edilmiş Map'i paylaş.                                                               |
| `app/screens/group-create/member-step.tsx:121`        | `state.selectedUserIds.includes(friend.id)` satır başına lineer. 400 arkadaş × 31 seçim ≈ tuş başına 12.000 karşılaştırma.                                                                                                          | `useMemo` ile `Set`, `has`.                                                                 |
| `social/mobile-profile-edit-screen.tsx:91`            | `JSON.stringify(serverBaseline)` her render — her tuş vuruşunda.                                                                                                                                                                    | `useMemo`.                                                                                  |
| `social/profile-badges/mobile-badges-screen.tsx:284`  | İki memoize edilmemiş `filter`, memoize edilmiş gruplamayı besliyor (`:182`) → memo ölü.                                                                                                                                            | İki `useMemo`.                                                                              |

### Sanallaştırılmayan listeler

| Yer                                                                | Sorun                                                                                                                                                                                                                                                                                                      | Yap                                                                                                                                                                     |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app/screens/notifications-screen.tsx:120`, `:335`, `:308`, `:382` | Besleme render gövdesinde `flatMap` + `new Date()` ile yeniden gruplanıyor (memo yok) **ve** sanallaştırma gün grupları üzerinde: her hücre kendi grubunu `.map()` ile çiziyor, `onEndReached` aynı üç etikete daha fazla bildirim ekliyor. Satır bileşeni memoize değil ve satır içi ok prop'ları alıyor. | Gruplama ve düzleştirmeyi `useMemo`'ya al; grup başlıklarını ve bildirimleri **tek heterojen dizi**ye düzleştirip `getItemType` ile FlashList'e ver; satırı memoize et. |
| `notifications-screen-model.ts:123`                                | Dün'den eski her bildirim için yeni `Intl.DateTimeFormat` — Hermes'te pahalı.                                                                                                                                                                                                                              | Modül düzeyinde locale başına formatter cache'i.                                                                                                                        |
| `social/friends-hub.tsx:1040`, `:741`                              | Tüm arkadaş listesi (sunucu sayfalamıyor) düz `ScrollView`'da; iki `filter` her render; satır başına `ContextMenu` + 3 elemanlı taze `actions` dizisi + ağ görseli. Bu dilimdeki diğer tüm listeler FlashList kullanıyor.                                                                                  | Grupları `useMemo`; satırları `getItemType` ile FlashList.                                                                                                              |
| `app/screens/group-create/member-step.tsx:280`, `:264`             | Tüm roster `.map()` ile düz `ScrollView`'da, canlı arama alanının arkasında.                                                                                                                                                                                                                               | Bölüm + satır dizisini düzleştirip FlashList.                                                                                                                           |
| `app/screens/message-thread-screen.tsx:268`, `:232`, `:34`         | Tüm thread yanıtları `.map()` ile `ScrollView`'da; satır memoize değil. Yanıt yazarken gecikme olarak hissediliyor.                                                                                                                                                                                        | Kanal/DM dökümlerinin kullandığı FlashList deseni.                                                                                                                      |

### Gereksiz tick ve render

| Yer                                                                                                     | Sorun                                                                                                                                                                                                                                                        | Yap                                                                                                  |
| ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `app/screens/voice-screen.tsx:194`, `:172`, `:303`, `:850`, `:895`                                      | Ekranın tepesinde 1 Hz saat; çağrı boyunca tüm sahne ızgarasını, her video karosunu ve seyirci rayını saniyede bir render ediyor — yalnız `m:ss` etiketi için. Sahne ve karo bileşenleri memoize değil.                                                      | `now`'ı yalnız süre etiketini çizen bileşene taşı.                                                   |
| `app/screens/mobile-screen-containers.tsx:459` · `use-mobile-messaging-feature.ts:1088`, `:176`, `:401` | Kanal ekranının focus effect'i koşulsuz `openWorkspaceRoute` çağırıyor; setter her seferinde yeni nesne alıyor → ürün kökü render oluyor ve rota uzlaştırma effect'i yeniden koşuyor. Thread'den, profilden, ayarlardan geri dönüşte rota hiç değişmemişken. | Effect'i (veya setter'ı) mevcut niyetle eşleşiyorsa no-op yap.                                       |
| `app/components/dm-chat-primitives.tsx:328`, `:386`                                                     | Reaksiyon çipi mount'ta "yeni eklendi" pop animasyonunu oynatıyor; FlashList penceresine giren her eski çip patlıyor. `message-entrance.ts` bu sınıf hatayı satırlar için çözmüş.                                                                            | Hangi reaksiyonun yeni olduğuna liste karar versin; çipe `animate` prop'u geçsin, varsayılan kapalı. |
| `app/components/dm-chat-primitives.tsx:1247` · `message-entrance.ts:89`                                 | Giriş izleyicisi render gövdesinde tüm döküm üzerinde O(n) geçiş + iki `Set` ayırıyor.                                                                                                                                                                       | `useMemo(..., [messages])` — izleyici zaten kararlı bir mutasyona uğramış `Set` döndürüyor.          |

## Yapılmayacak

- Ekran tasarımını değiştirmek.
- Yeni liste kütüphanesi eklemek — FlashList zaten var.
- Sunucu sayfalaması eklemek (arkadaş listesi için gerekli olabilir; **not düş**, bu promptta yapma).
- Provider katmanına dokunmak — 17'nin işi.

## Kabul kriterleri

1. Bir gelen mesaj, envanterde yalnız ilgili satırı render ediyor.
2. Presence tick'i kanal listesinde hiçbir hücreyi render etmiyor.
3. Bildirimler, arkadaşlar, üye seçici ve thread listeleri sanallaştırılmış.
4. Çağrı sırasında 1 Hz tick yalnız süre etiketini render ediyor.
5. Zaten açık bir kanala geri dönmek ürün kökünü render etmiyor.
6. Geçmişe kaydırırken eski reaksiyon çipleri animasyon oynatmıyor.

## Testler

- Kimlik testleri: aynı girdiyle iki render sonrası prop referansının aynı olduğu.
- Satır render sayımı: memoize edilmiş satıra sahte bir sayaç prop'u ver, alakasız parent render'ında artmadığını iddia et.
- Liste tipi: FlashList'e verilen `data`'nın düzleştirilmiş ve `getItemType`'ın tanımlı olduğu.
- `notifications-screen-model`: aynı locale için formatter'ın yeniden kurulmadığı.

RNTL kuralı: her `it` bloğunda tek `render`.

## Doğrulama

```bash
pnpm --filter @wizards/mobile typecheck
```

```bash
cd apps/mobile && npx jest component-tests
```

```bash
pnpm --filter @wizards/mobile test
```
