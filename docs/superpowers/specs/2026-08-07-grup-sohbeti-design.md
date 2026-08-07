# Grup Sohbeti (Group DM) — Tasarım Spec'i

- **Tarih:** 2026-08-07
- **Dal:** `uat`
- **Kapsam:** Mobil + web/desktop tam parite, backend dahil uçtan uca
- **Durum:** Onaylandı, uygulama planı bekleniyor

---

## 1. Amaç

Kullanıcılar Mesajlar → Sohbetler ekranından çok kişilik grup sohbeti kurabilsin: üyeleri seçer, grup adı (opsiyonel) ve fotoğrafı (opsiyonel) belirler, oluşturur. Kurulduktan sonra grup yönetilebilir olsun: üye ekleme/çıkarma, gruptan ayrılma, ad/foto düzenleme, sessize alma, gizleme. Üyelik değişiklikleri akışta sistem mesajı olarak görünsün.

Referans davranış: WhatsApp ve Instagram grup sohbetleri. Bu üründe karşılığı olmayan özellikler (grup davet linki, topluluk, yönetici rolleri, kaybolan mesaj) kapsam dışı.

---

## 2. Bağlayıcı kararlar

Bu kararlar brainstorming sırasında kullanıcı tarafından onaylandı. Uygulama sırasında değiştirilemez; değişiklik gerekiyorsa spec güncellenip yeniden onaylanır.

| #   | Karar                   | Değer                                                                                                        |
| --- | ----------------------- | ------------------------------------------------------------------------------------------------------------ |
| K1  | Platform kapsamı        | Mobil **ve** web/desktop tam parite, aynı sürümde                                                            |
| K2  | Üye uygunluğu           | **Sadece arkadaşlar.** Ekleyen kişinin arkadaş listesi. Ortak sunucu üyeliği yeterli değil                   |
| K3  | Grup boyut sınırı       | **32 üye** (kurucu dahil)                                                                                    |
| K4  | Yetki modeli            | **Sahip-yönetir.** Ad/foto düzenleme, üye ekleme, üye çıkarma sadece `ownerId`'de. Her üye kendi ayrılabilir |
| K5  | Grup adı                | **Opsiyonel.** Boşsa başlık mevcut fallback ile üye adlarından türer                                         |
| K6  | Oluşturmada minimum üye | **3 kişi** (kurucu + 2 arkadaş). Kurucu + 1 zaten 1:1 DM'dir                                                 |
| K7  | Sistem mesajları        | Var. `unreadCount` artırmaz, push atmaz; `lastMessageAt` günceller ve önizlemede görünür                     |
| K8  | Sessize alma / gizleme  | Var. Mevcut `DMParticipant.muted` / `hiddenAt` alanları ve mevcut rotalar kullanılır, yeni uç açılmaz        |

---

## 3. Mimari yaklaşım

**Seçilen: mevcut `DMConversation` modelini genişletmek.**

`ConversationType` enum'unda `GROUP_DM` zaten var; `DMConversation` zaten `name`, `iconUrl`, `ownerId` taşıyor. Mesaj yazma, ek dosya, tepki, thread, okundu/iletildi tiki, typing, bildirim ve realtime yayını **katılımcı listesi güdümlü** — 2 kişilik ile 32 kişilik arasında yapısal fark yok. Örnek: `createRealtimeDMMessage` (`apps/web/src/lib/dm/realtime-service.ts`) `args.participants` üzerinde dönüp `unreadCount` artırıyor; grup için değişiklik gerekmiyor.

Reddedilen alternatifler:

- **Ayrı `GroupConversation` modeli:** mesaj/ek/tepki/thread/okundu/bildirim yığınının tamamı ikinci kez yazılır, gelen kutusu iki kaynağı birleştirir. ~3 kat iş, ürün kazancı yok.
- **Sistem mesajlarını ayrı tabloda tutmak:** `DMMessage`'a dokunmaz ama sistem satırları mesaj sayfalamasına karışmaz, "son mesaj" önizlemesi olamaz, kronolojik sıra bozulur. WhatsApp/Instagram'da bu satırlar akışın parçası.

---

## 4. Halihazırda çalışan (dokunulmayacak)

Bu davranışlar kodda mevcut ve grup farkında. Uygulama sırasında yeniden yazılmamalı:

| Davranış                                              | Yer                                                                              |
| ----------------------------------------------------- | -------------------------------------------------------------------------------- |
| Grup satırı rozeti (`members` ikonu)                  | `apps/mobile/src/app/screens/dm-inbox.tsx:435,492`                               |
| Grup önizlemesinde `"Ad: mesaj"` yazar öneki          | `apps/mobile/src/app/screens/dm-inbox.tsx:457`                                   |
| Adsız grupta başlığın üye adlarından türemesi         | `apps/mobile/src/app/mobile-display-model.ts:193` (`getMobileConversationTitle`) |
| Grup avatar url'inin `iconUrl` önceliğiyle çözülmesi  | `apps/mobile/src/app/mobile-display-model.ts:207`                                |
| `filter === "groups"` gelen kutusu süzgeci            | `apps/mobile/src/app/mobile-display-model.ts:259`                                |
| Sunucuda grup adı çözümü (`type !== "DM"` ise `null`) | `apps/web/src/lib/dm/service.ts:477` (`resolveConversationName`)                 |
| DTO'da `type` alanının normalize edilmesi             | `apps/web/src/lib/dm/service.ts:182`                                             |
| Grupta mesaj yazma / tepki / thread / okundu / typing | Mevcut DM hattının tamamı                                                        |

---

## 5. Veri modeli

### 5.1 Migration

Tek migration: `packages/db/prisma/rebaseline-migrations/20260807120000_group_dm/migration.sql`

> **Dikkat:** Prisma yalnızca `packages/db/prisma/rebaseline-migrations` dizinini okur. `packages/db/prisma/migrations` altına yazılan migration sessizce hiç çalışmaz. Yerel DB `db push` ile yönetiliyor.

```prisma
enum DMSystemMessageType {
  GROUP_CREATED
  MEMBER_ADDED
  MEMBER_REMOVED
  MEMBER_LEFT
  NAME_CHANGED
  ICON_CHANGED
}

model DMMessage {
  // ... mevcut alanlar değişmiyor
  systemType          DMSystemMessageType?
  systemTargetUserIds String[]              @default([])
  systemValue         String?               @db.VarChar(100)
}
```

`DMConversation` ve `DMParticipant` şemaları **değişmiyor**. `name`, `iconUrl`, `ownerId`, `muted`, `hiddenAt`, `unreadCount`, `mentionCount` zaten mevcut.

### 5.2 Sistem mesajı sözleşmesi

| Alan                  | Anlam                                                              |
| --------------------- | ------------------------------------------------------------------ |
| `userId`              | Eylemi yapan (aktör). `GROUP_CREATED` için kurucu                  |
| `content`             | Her zaman `""`. **Sunucu asla metin üretmez**                      |
| `systemType`          | Hangi olay                                                         |
| `systemTargetUserIds` | `MEMBER_ADDED` / `MEMBER_REMOVED` hedefleri. Diğerlerinde boş dizi |
| `systemValue`         | `NAME_CHANGED` için yeni ad. Diğerlerinde `null`                   |

Metin sunucuda üretilmez çünkü locale kullanıcı başına değişir; aynı satır Türkçe kullanıcıya Türkçe, İngilizce kullanıcıya İngilizce görünmeli. İstemci `systemType` + çözülmüş kullanıcı adlarından cümleyi kurar.

Sistem mesajı davranışı (K7):

- `lastMessageAt` güncellenir → sohbet gelen kutusunda yukarı çıkar
- `unreadCount` **artırılmaz** → rozet yanmaz
- Push bildirimi **atılmaz** → `enqueueDMMessageNotificationJob` çağrılmaz
- Gelen kutusu önizlemesinde görünür; `dm:conversation:updated` olayı `preview: ""` ile gider, istemci `systemType`'tan çizer
- `replyToId`, `threadParentId`, ek dosya, tepki alamaz. Düzenlenemez, silinemez

### 5.3 Sabitler

`apps/web/src/lib/dm/group-constants.ts` (web ve mobil `@wizards/types` üzerinden paylaşır):

```ts
export const GROUP_DM_MAX_PARTICIPANTS = 32;
export const GROUP_DM_MIN_PARTICIPANTS = 3;
export const GROUP_DM_NAME_MAX_LENGTH = 100;
```

---

## 6. Sözleşme boşlukları (önce kapanmalı)

Bu iki eksik kapanmazsa grup fotoğrafı **hiçbir istemciye ulaşmaz**. Uygulama planında ilk adımlar bunlar olmalı.

1. `DMConversationDTOSchema` (`packages/types/src/socket.ts:153`) `iconUrl` alanı taşımıyor. Eklenecek: `iconUrl: z.string().nullable()`. `mapDMConversationDTOWithPresence` (`apps/web/src/lib/dm/service.ts:530`) alanı doldurmalı.
2. Mobil liste rotası `iconUrl: null` sabit yazıyor (`apps/web/src/app/api/v1/mobile/dm/route-logic.ts:135`). Gerçek `conversation.iconUrl` değerine bağlanacak.

---

## 7. Servis katmanı

Yeni modül: `apps/web/src/lib/dm/group-service.ts`

Web ve mobil rotalarının ikisi de bu modülü çağıran ince sarmalayıcı olur. Modül bağımlılıklarını **DI ile** alır (varsayılan nesne + override parametresi), çünkü web test ortamında DB yok — mevcut `route-logic` dosyalarındaki desenin aynısı.

### 7.1 Fonksiyonlar

```ts
createGroupConversation(actorId, input: { userIds: string[]; name?: string; iconUrl?: string }): Promise<DMConversationDTO>
updateGroupConversation(actorId, conversationId, patch: { name?: string | null; iconUrl?: string | null }): Promise<DMConversationDTO>
addGroupMembers(actorId, conversationId, userIds: string[]): Promise<DMConversationDTO>
removeGroupMember(actorId, conversationId, targetUserId): Promise<void>
leaveGroupConversation(actorId, conversationId): Promise<void>
```

`removeGroupMember` kendi id'sini alırsa `leaveGroupConversation`'a delege eder (istemciler tek uç kullanabilsin).

### 7.2 Değişmezler

1. **Uygunluk her istekte sunucuda yeniden doğrulanır.** İstemcinin gönderdiği `userIds` güvenilir girdi değil. Her hedef için: arkadaşlık var mı (K2), engel var mı. `createOrOpenDirectMessage`'daki `getBlockStatus` + `areFriends` kontrolleri yeniden kullanılır. `dmPolicy` grupta uygulanmaz — arkadaşlık zaten daha katı bir koşul.
2. **Her üyelik mutasyonu sistem mesajıyla aynı `prisma.$transaction` içinde yazılır.** Commit olmuş bir üyelik değişikliği duyurulmamış kalamaz. `createRealtimeDMMessage`'ın outbox desenini izler.
3. **Sahiplik devri:** `ownerId` gruptan ayrılırsa sahiplik kalan üyeler arasında en küçük `joinedAt`'e geçer. Eşitlikte `userId` sıralaması tie-break.
4. **Son üye:** ayrılan son üyeyle birlikte `DMConversation` silinir; `onDelete: Cascade` mesajları, katılımcıları, tepkileri temizler.
5. **Boyut kontrolü** `addGroupMembers` içinde mevcut katılımcı sayısı + eklenecek sayısı üzerinden yapılır, transaction içinde okunur (yarış koşulu).
6. **Tekrarlı ekleme** hata değil: zaten üye olan `userIds` sessizce süzülür; hiçbiri yeni değilse sistem mesajı yazılmaz.

---

## 8. API yüzeyi

### 8.1 Web (session auth, `requireApiUserId`)

| Yöntem | Yol                                                   | Gövde                                                    | Yetki                           | Yanıt                       |
| ------ | ----------------------------------------------------- | -------------------------------------------------------- | ------------------------------- | --------------------------- |
| POST   | `/api/v1/dm/groups`                                   | `{ userIds: string[], name?: string, iconUrl?: string }` | Herhangi bir oturum             | `201` + `DMConversationDTO` |
| PATCH  | `/api/v1/dm/groups/[conversationId]`                  | `{ name?: string \| null, iconUrl?: string \| null }`    | Sadece sahip                    | `200` + `DMConversationDTO` |
| POST   | `/api/v1/dm/groups/[conversationId]/members`          | `{ userIds: string[] }`                                  | Sadece sahip                    | `200` + `DMConversationDTO` |
| DELETE | `/api/v1/dm/groups/[conversationId]/members/[userId]` | —                                                        | Sahip başkasını; herkes kendini | `204`, gövdesiz             |

`DELETE` her iki durumda da (başkasını çıkarma, kendi ayrılma) `204` döner. Sahibin ekranı güncel listeyi yanıttan değil, `dm:conversation:members_changed` olayı + sorgu invalidation'ından alır — çıkaran ile odadaki diğer üyelerin aynı yoldan güncellenmesi için.

### 8.2 Mobil (bearer auth, `requireMobileApiUserId`)

Aynı dört uç `/api/v1/mobile/dm/groups...` altında. İş mantığı yok — `group-service.ts`'i çağırır, yanıtı `@wizards/types` şemasıyla `parse` eder (mevcut mobil rota deseni).

### 8.3 Yeni uç gerekmeyen davranışlar

- Sessize alma: mevcut `PATCH /api/v1/dm/[conversationId]/mute`
- Gizleme/silme: mevcut `DELETE /api/v1/dm/[conversationId]` (`hideDirectMessage`)
- Okundu: mevcut `/read`, `/unread`
- Mesaj gönderme, ek, tepki, thread, arama: mevcut DM uçları

`setDirectMessageMuted` ve `hideDirectMessage` (`apps/web/src/lib/dm/service.ts:1182,1202`) yalnızca `requireDMParticipant` kontrolü yapıyor — grupta olduğu gibi çalışır.

### 8.4 Rate limit

`apps/web/src/lib/api-rate-limit.ts` içine:

```ts
"dm:group:create":  { limit: 10, windowSeconds: 10 * 60 },
"dm:group:update":  { limit: 30, windowSeconds: 60 },
"dm:group:members": { limit: 30, windowSeconds: 60 },
"mobile:dm:group:create":  { limit: 10, windowSeconds: 10 * 60 },
"mobile:dm:group:update":  { limit: 30, windowSeconds: 60 },
"mobile:dm:group:members": { limit: 30, windowSeconds: 60 },
```

### 8.5 Hata kodları

| Kod               | HTTP | Ne zaman                                |
| ----------------- | ---- | --------------------------------------- |
| `NOT_FRIENDS`     | 403  | Hedeflerden biri aktörün arkadaşı değil |
| `BLOCKED`         | 403  | Aktör ve hedef arasında engel var       |
| `GROUP_FULL`      | 400  | Sonuçtaki üye sayısı 32'yi aşıyor       |
| `GROUP_TOO_SMALL` | 400  | Oluşturmada toplam üye < 3              |
| `NOT_GROUP_OWNER` | 403  | Sahip olmayan üye yönetim eylemi denedi |
| `NOT_A_GROUP`     | 400  | Hedef sohbet `type: "DM"`               |
| `NOT_FOUND`       | 404  | Sohbet yok veya aktör katılımcı değil   |

---

## 9. Realtime

### 9.1 Yeni olaylar

`apps/web/src/lib/socket/events.ts`:

```ts
"dm:conversation:created": (data: { conversation: DMConversationDTO }) => void;
"dm:conversation:members_changed": (data: {
  conversationId: string;
  conversation: DMConversationDTO;
}) => void;
"dm:conversation:removed": (data: { conversationId: string }) => void;
```

| Olay                               | Hedef oda                                                        | Ne zaman                                                                     |
| ---------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `dm:conversation:created`          | Her katılımcının `user:<id>` odası                               | Grup kurulduğunda. Davet edilenin gelen kutusuna satır refetch olmadan düşer |
| `dm:conversation:members_changed`  | `dm:<conversationId>` + eklenen/çıkarılanların `user:<id>` odası | Üye eklendiğinde/çıkarıldığında/ayrıldığında                                 |
| `dm:conversation:removed`          | **Sadece** çıkarılan/ayrılan kişinin `user:<id>` odası           | O kişi artık üye değil                                                       |
| `dm:conversation:updated` (mevcut) | Katılımcıların `user:<id>` odaları                               | Ad/foto değişimi. `preview: ""`                                              |

Sistem mesajının kendisi mevcut `dm:message:new` ile `dm:<conversationId>` odasına gider — akıştaki sıralaması böyle korunur.

### 9.2 Kritik: çıkarılan üyenin soketi

`dm:join` handler'ı katılımı kapıda `isDMParticipant` ile kontrol ediyor (`apps/web/src/lib/socket/handlers/dm.ts:179`), ama **zaten katılmış bir soketi odadan atmıyor.** Çıkarılan üyenin soketi `dm:<id>` odasında kalırsa gruptan sonraki tüm mesajları almaya devam eder.

Çözüm: `removeGroupMember` / `leaveGroupConversation` sonrası sunucu `io.in("user:<targetId>").socketsLeave("dm:<conversationId>")` çağırır. Bu spec'in en kritik güvenlik kalemi; testi zorunlu.

### 9.3 İstemci tarafı

**Mobil** (`apps/mobile/src/realtime/realtime-query-bridge.ts`):

- `dm:conversation:created` → `mobileQueryKeys.dmConversations()` invalidate + bootstrap invalidate
- `dm:conversation:members_changed` → `dmConversations()` + o sohbetin detay anahtarı invalidate
- `dm:conversation:removed` → satır cache'ten düşürülür; o sohbet açıksa gelen kutusuna geri navigasyon + bilgilendirme

`dmConversations` invalidation atlanırsa mobil gelen kutusu bayat kalır — daha önce yaşanmış bir hata sınıfı.

**Web** (`apps/web/src/hooks/use-messages.ts` ve DM sidebar sorguları): aynı üç olay için karşılık gelen invalidation.

---

## 10. Mobil UI

### 10.1 Gelen kutusu başlığı

`DMInboxHeader` (`apps/mobile/src/app/screens/dm-inbox.tsx:70`) mevcut kalem butonunun **soluna** ikinci bir buton alır:

- İkon: `+`
- `testID="mobile-dm-create-group-button"`
- `accessibilityLabel`: `copy.dmCreateGroupAction`
- Yalnızca `segment === "conversations"` iken görünür. Arkadaşlar/İstekler sekmelerinde render edilmez
- Basınca `GroupCreate` rotasına gider

Mevcut kalem butonunun davranışı, `testID`'si ve konumu **değişmez**.

### 10.2 Grup oluşturma ekranı

Yeni dosya: `apps/mobile/src/app/screens/group-create-screen.tsx`
Rota: `MobileRootStackParamList`'e `GroupCreate: undefined`
Deep link: `channels/@me/new-group` (`apps/mobile/src/navigation/mobile-linking.ts`)

Modal değil, tam ekran rota — klavye davranışı `MobileChatKeyboardRegion` deseniyle zaten ekran seviyesinde çözülmüş durumda.

**Aşama 1 — üye seçimi**

- Arkadaş listesi (`useMobileFriendsQuery`), arama alanı
- Çoklu seçim, seçilenler üstte yatay çip şeridi (çipten çarpıyla çıkarma)
- Sayaç: `{seçili + 1}/32`
- 31 seçili arkadaştan sonra seçim kilitlenir, kalan satırlar sönük
- "İleri" butonu en az 2 seçimle açılır (K6)

**Aşama 2 — grup kimliği**

- Grup adı alanı: opsiyonel, max 100 karakter, ipucu metni adsız başlığın nasıl görüneceğini açıklar (K5)
- Grup fotoğrafı: opsiyonel, dokunmatik daire, mevcut görsel seçici hattı
- Seçilen üyelerin özeti
- "Oluştur" → başarıda yeni sohbete `navigate("DirectMessage", { conversationId })`, gelen kutusuna geri düşmeden

**Geri davranışı:** Aşama 2'den geri, seçimi koruyarak Aşama 1'e döner. Aşama 1'den geri gelen kutusuna döner.

### 10.3 Grup fotoğrafı yükleme

İki ayrı an var ve ikisi farklı çalışır, çünkü **oluşturma anında henüz `conversationId` yok** — sahiplik doğrulanamaz.

**Oluşturma anında (conversationId yok):** `apps/web/src/app/api/uploadthing/core.ts` içine yeni `groupIconUploader` eklenir. Şekli mevcut `serverIconUploader` ile birebir aynı: yalnızca oturum + kullanıcı başına yükleme rate limit'i (`rate:upload:group-icon:${userId}`, 10/300sn), `onUploadComplete` sadece `{ url }` döner, DB'ye hiçbir şey yazmaz. İstemci dönen URL'i `POST /groups` gövdesinde `iconUrl` olarak gönderir; `createGroupConversation` URL'in `https:` olduğunu ve UploadThing host'undan geldiğini doğrular.

**Sonradan düzenlemede (conversationId var):** `MobileMediaUploadPurposeSchema` (`packages/types/src/mobile-workspace-management.ts:32`) `"group-icon"` değeri alır. Intent `conversationId` taşır, `authorizeMobileMediaUpload` yükleyenin o grubun **sahibi** olduğunu doğrular. Değişiklik `PATCH /groups/[id]` ile kalıcılaşır.

Web ve mobil aynı iki yolu kullanır; mobil sadece kendi intent'li uçları üzerinden geçer.

### 10.4 Grup detay ekranı

Mevcut DM detay ekranı grup kolu alır. Grupta:

- **Gösterilir:** grup adı + foto (sahipse düzenlenebilir), üye listesi (avatar + ad + sahip rozeti), "Üye ekle" (sahip), üye satırında çıkar (sahip), "Gruptan ayrıl" (herkes), sessize al, sohbeti gizle, ortak medya
- **Gizlenir:** ortak sunucular bloğu, 1:1 profil blokları, sesli/görüntülü arama düğmeleri (grup araması kapsam dışı)

**Zorunlu düzeltme:** `getMobileDMDetails` (`apps/web/src/lib/dm/mobile-details-service.ts:29`) bugün "aktör olmayan tek katılımcı"yı arıyor ve bulamazsa `PARTICIPANT_NOT_FOUND` (404) atıyor — grupta **her zaman** patlar. Grup kolu tekil `participant` yerine `participants[]` + `ownerId` döner; `MobileDMDetailsResponseSchema` buna göre genişler. 1:1 kolu bire bir korunur.

### 10.5 Sistem mesajı satırı

`dm-conversation-screen` akışında ortalanmış, sönük gri hap. Balon değil, avatar yok, zaman damgası yok, uzun basma menüsü açılmaz, tepki alamaz.

Metin `mobile-copy.ts`'ten `systemType` + çözülmüş adlarla kurulur:

| `systemType`     | Örnek metin                                            |
| ---------------- | ------------------------------------------------------ |
| `GROUP_CREATED`  | `{aktör} grubu oluşturdu`                              |
| `MEMBER_ADDED`   | `{aktör}, {hedefler} kişisini ekledi`                  |
| `MEMBER_REMOVED` | `{aktör}, {hedefler} kişisini çıkardı`                 |
| `MEMBER_LEFT`    | `{aktör} gruptan ayrıldı`                              |
| `NAME_CHANGED`   | `{aktör} grup adını "{systemValue}" olarak değiştirdi` |
| `ICON_CHANGED`   | `{aktör} grup fotoğrafını değiştirdi`                  |

Aktör mevcut kullanıcıysa adı yerine "Sen" kullanılır.

### 10.6 Dokunulmayan mobil yüzeyler

Bölüm 4'teki liste. Grup satırı, başlığı, avatarı, rozeti ve önizleme öneki zaten çalışıyor.

---

## 11. Web / desktop UI

Web'de grup farkındalığı sıfır — dört yüzey de yeni yazılır.

### 11.1 `dm-sidebar.tsx`

- Mevcut yeni-DM kontrolünün yanına `+` butonu → grup oluşturma diyaloğu
- Grup satırı: ad (yoksa üye adları fallback), `iconUrl` yoksa avatar yığını, üye sayısı rozeti
- Grup önizlemesinde yazar öneki (mobildeki kuralın aynısı)
- Arama grup adı ve üye adları üzerinde çalışır

### 11.2 `group-create-dialog.tsx` (yeni)

Mevcut `workspace-modals.tsx` diyalog desenini izler. Tek diyalog, iki aşama; içerik mobil ekranla birebir aynı kurallar (min 2 seçim, 32 sınırı, opsiyonel ad, opsiyonel foto).

### 11.3 `dm-details-panel.tsx`

Grup kipi: üye listesi, üye ekleme, üye çıkarma, gruptan ayrılma, ad ve foto düzenleme. 1:1 kipi değişmez.

### 11.4 `dm-conversation.tsx`

- Sistem mesajı satırı (mobildeki görsel dilin web karşılığı)
- Başlık: grup adı + üye sayısı; 1:1'deki presence göstergesi grupta gizlenir

---

## 12. Hata ve kenar durumları

| Durum                                               | Davranış                                                                                                      |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Seçili kullanıcı, istek anında arkadaşlıktan çıkmış | `NOT_FRIENDS` 403, istemci o kişiyi seçimden düşürüp hatayı gösterir                                          |
| Sahip gruptan ayrılır                               | Sahiplik en eski `joinedAt` üyeye geçer; `MEMBER_LEFT` sistem mesajı yazılır                                  |
| Son üye ayrılır                                     | `DMConversation` silinir, cascade temizler                                                                    |
| Çıkarılan kullanıcının sohbeti açık                 | `dm:conversation:removed` ile ekran kapanır, gelen kutusuna döner, bilgilendirme gösterilir                   |
| Çıkarılan kullanıcı yeniden eklenir                 | Aynı `DMParticipant` satırı yeniden yaratılır (`@@unique([conversationId, userId])`); geçmiş mesajlar görünür |
| İstemci 32'den fazla gönderir                       | Sunucu `GROUP_FULL` 400; istemci zaten kilitler ama sunucu son otorite                                        |
| Aynı kullanıcı iki kez gönderilir                   | Sunucu tekilleştirir                                                                                          |
| Aktör kendi id'sini `userIds`'e koyar               | Süzülür, hata değil                                                                                           |
| Grup fotoğrafı URL'i UploadThing dışı               | 400, kabul edilmez                                                                                            |
| Ad yalnızca boşluktan oluşur                        | `null` olarak normalize edilir (adsız grup)                                                                   |
| 1:1 sohbete grup ucu çağrılır                       | `NOT_A_GROUP` 400                                                                                             |

---

## 13. Test planı

### 13.1 node (`--test`)

- `group-service.test.ts` — DI ile, DB'siz: uygunluk süzgeci, 32 sınırı, min 3 kuralı, sahip-yalnız kurallar, sahiplik devri sırası, son üye silme, tekrarlı ekleme süzgeci, kendi id'si süzgeci
- Her yeni rota için `route-logic.test.ts` (web + mobil, 8 dosya): auth, rate limit, gövde doğrulama, hata kodu eşlemesi
- `packages/types` şema testleri: `DMConversationDTOSchema.iconUrl`, grup istek/yanıt şemaları, `"group-icon"` upload purpose
- Realtime test: çıkarılan üyenin `dm:<id>` odasından **gerçekten** atıldığı (9.2)
- `mobile-details-service` grup kolu: 404 atmadığı ve `participants[]` döndürdüğü

### 13.2 RNTL (mobil jest)

- `DMInboxHeader`: `+` butonu yalnızca `conversations` sekmesinde; mevcut kalem butonunun testID'si ve davranışı bozulmamış
- `group-create-screen`: seçim/çıkarma, 32 kilidi, min 2 kuralıyla "İleri" durumu, aşama geçişi, geri davranışı, oluşturma sonrası navigasyon
- Grup detay: sahip görünümü vs üye görünümü, üye çıkarma, ayrılma onayı
- Sistem mesajı satırı: her `systemType` için metin, "Sen" ikamesi, balon olmadığı
- `dm:conversation:removed` geldiğinde açık grubun kapanması

### 13.3 Web bileşen testleri

Web'de vitest **yok**. `apps/web/src` altındaki tüm `*.test.ts` ve `*.test.tsx` dosyaları `node --import tsx --test` ile koşar (`apps/web/scripts/run-node-tests.mjs`). Yeni web bileşen testleri de aynı runner'a yazılır.

- Sidebar grup satırı: ad fallback, avatar yığını, üye rozeti, yazar önekli önizleme
- `group-create-dialog`: aynı kurallar
- `dm-details-panel` grup kipi
- `dm-conversation` sistem mesajı + grup başlığı

### 13.4 Doğrulama komutları

Uygulama sonunda tümü yeşil olmalı:

```bash
pnpm --filter @wizards/types test
pnpm --filter @wizards/web test
pnpm --filter @wizards/mobile test
pnpm --filter @wizards/mobile test:components
pnpm --filter @wizards/types typecheck
pnpm --filter @wizards/web typecheck
pnpm --filter @wizards/mobile typecheck
```

`typecheck` ve `lint` **pnpm üzerinden** çalıştırılmalı; `npm run` ile launcher sürüm kontrolü derleme başlamadan patlar.

---

## 14. Uygulama sırası (öneri)

Aşağıdaki sıra bağımlılık zinciridir; uygulama planı bunu esas alır.

1. Sözleşme boşlukları (Bölüm 6) — `iconUrl` uçtan uca
2. Migration + Prisma şeması (Bölüm 5)
3. `@wizards/types` şemaları + sabitler
4. `group-service.ts` + testleri
5. Web API rotaları + testleri
6. Mobil API rotaları + testleri
7. Realtime olayları + soket odasından atma + testleri
8. `mobile-details-service` grup kolu
9. Mobil: header `+` butonu → oluşturma ekranı → grup detay → sistem mesajı satırı
10. Web: sidebar → oluşturma diyaloğu → detay paneli → sistem mesajı
11. i18n metinleri (`mobile-copy.ts` + web karşılığı)
12. Tam doğrulama (13.4)

---

## 15. Kapsam dışı

Bu sürümde yapılmayacaklar, ileri faz adayları:

- Grup sesli/görüntülü araması
- Grup davet linki
- Yönetici rolleri (çoklu admin) — `DMParticipant.role` migration'ı gerektirir
- Grup içi @everyone
- Grup sabitlenmiş mesajları
- Grup açıklaması / kuralları
- Kaybolan mesaj, mesaj süresi
- Gruptan çıkarılanın geçmişi görememesi (bugün geçmiş görünür kalır)

---

## 16. Bilinen tuzaklar

- Migration `packages/db/prisma/rebaseline-migrations` altına yazılmalı; `migrations` altındaki dosyalar hiç çalışmaz
- Yerel DB `db push` ile yönetiliyor; UAT'a giden tek yol migration
- Mobil cache'te `dmConversations` invalidation atlanırsa gelen kutusu bayat kalır
- Web test ortamında DB yok; servis çağıran her rota testi DI kullanmak zorunda
- Dosyalar CRLF; satır sonu karıştırılırsa diff şişer
