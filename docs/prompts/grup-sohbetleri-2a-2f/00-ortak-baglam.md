# 00 — Ortak bağlam (okunur, uygulanmaz)

Bu dosya beş fazın hepsinin paylaştığı zemin. **Kod değişikliği içermez.** Her faz promptunun başında okunur; faz dosyaları buradaki numaralara atıf yapar (ör. "§4.3 tuzağı").

---

## 1. Çalışma kuralları

1. Branch **`uat`**. Yeni branch açma, worktree açma yok.
2. **İzinsiz commit yok.** Faz bitince rapor yazılır, commit için kullanıcıya sorulur.
3. Kararsız kalınan her yerde **kullanıcıya sorulur**. "Muhtemelen böyledir" ile ilerleme yok.
4. **Gerçek cihaz testini kullanıcı yapar.** Faz sonunda numaralı, tek tek doğrulanabilir cihaz test listesi üretilir.
5. **Test önce.** Yeni saf fonksiyon → önce `*.test.ts`. Yeni ekran → önce `component-tests/*.test.tsx` iskeleti.
6. Faz başında `graphify query "<dokunulacak yüzey>"`, faz sonunda `graphify update .`.

### Tasarım kaynağı — tek doğru

| Öncelik | Kaynak                                                                 |
| ------- | ---------------------------------------------------------------------- |
| 1       | `Whispr Mesajlaşma Redesign.dc.html` satır **32–460** — inline stiller |
| 2       | `PROMPT.md` **§11** (satır 253–435) + **§0** token/ölçü tabloları      |
| 3       | `screenshots/2a…2f-*.png` — yalnız gözle karşılaştırma                 |

Çelişki varsa **HTML kazanır**. HTML'de olmayan bir ölçüyü uydurma; §0 ölçeğinden türet, türetemiyorsan sor.

### PROMPT.md'nin pazarlığa kapalı üç kuralı

- **DM balonlu, kanal balonsuz.** Grup sohbeti **DM balon sistemini** kullanır (§11 giriş). Kanalın (1e) düz satır düzeni gruba **sızmaz**.
- **Zaman damgası balonun içinde**, son satırın sağında.
- Yeni renk / gölge / radius / font **uydurulmaz**. §0.1–§0.5 tam kümedir.

---

## 2. Over-engineering yasağı

- Soyutlama, ikinci bir çağıran ortaya çıkınca yazılır. Tek çağıranlı "provider", "factory", "strategy" yok.
- Feature flag yok — bu paket tek sürümde tamamlanır.
- Yeni paket, yeni bağımlılık, yeni state kütüphanesi yok. Sunucu: Prisma + Zod + mevcut socket katmanı. Mobil: mevcut query istemcisi + `useTheme`.
- Mevcut bir şey yeterse **yenisi yazılmaz**: mesaj arama `/messages/search`, medya `mobile-shared-media-service.ts`, ikon yükleme `group-icon-upload.ts`, LiveKit odası `dm:<conversationId>`.
- Ama: **kopyala-yapıştır da yasak.** Aynı kural iki yerde uygulanacaksa `packages/types` içinde saf bir fonksiyona çıkar (web + mobil aynı fonksiyonu çağırır).

---

## 3. Doğrulanmış gerçekler — mevcut kod (2026-08-11)

### 3.1 Veritabanı — `packages/db/prisma/schema.prisma`

| Model            | Bugün var olan alanlar                                                                                                                                        |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DMConversation` | `id`, `type` (`ConversationType.DM \| GROUP_DM`), `name?`, `iconUrl?`, `ownerId?`, `lastMessageAt`, `createdAt` (satır 1360)                                  |
| `DMParticipant`  | `joinedAt`, `lastReadAt?`, `lastDeliveredAt?`, `mentionCount`, `muted`, `hiddenAt?`, `unreadCount`; `@@unique([conversationId,userId])`                       |
| `DMMessage`      | `content`, `replyToId?`, `threadParentId?`, `forwardedAt?`, `editedAt?`, `deletedAt?`, `clientNonce?`, `systemType?`, `systemTargetUserIds[]`, `systemValue?` |
| `DMReaction`     | `emoji`, `emojiName?`, `isCustom`; `@@unique([messageId,userId,emoji])`                                                                                       |

Enum `DMSystemMessageType` (satır 298): `GROUP_CREATED`, `MEMBER_ADDED`, `MEMBER_REMOVED`, `MEMBER_LEFT`, `NAME_CHANGED`, `ICON_CHANGED`.

**Bugün olmayan on üç şey:** rol, dört izin, bildirim kademesi (yalnız `muted` boolean var), sabitlenen sohbet, sabitlenmiş mesaj, açıklama, grup rengi, üye adı rengi, geçmiş penceresi, davet bağlantısı, kaybolan mesaj penceresi, okundu yığını verisi, filtre durumu.

`ServerInvite` (satır 1064) davet modeli için **birebir örnek**: `code @unique @db.VarChar(8)`, `maxUses?`, `uses`, `expiresAt?`, `@@index([code])`.

### 3.2 Sunucu servisleri — `apps/web/src/lib/dm/`

| Dosya                            | İçerik                                                                                                                                                                                                                      |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `group-service.ts` (582 sat)     | `createGroupConversation`, `addGroupMembers`, `leaveGroupConversation`, `removeGroupMember`, `updateGroupConversation`, `requireGroupOwner`, `resolveNextGroupOwner`, `assertGroupMembersEligible`, `toGroupEligibilityMap` |
| `group-presentation.ts`          | Grup adı/ikon sunumu (114 satır)                                                                                                                                                                                            |
| `group-realtime.ts`              | Grup olaylarının fan-out'u (51 satır)                                                                                                                                                                                       |
| `group-icon-upload.ts`           | Grup ikonu yükleme                                                                                                                                                                                                          |
| `delivery-receipts.ts`           | `lastReadAt`/`lastDeliveredAt` → tik durumu (satır 87 `lastReadAt` serileştirme)                                                                                                                                            |
| `mobile-shared-media-service.ts` | `listMobileDMAttachments` — 2e medya şeridinin kaynağı                                                                                                                                                                      |
| `call-state.ts`                  | `DMCallSession`, `DMCallStatus` (`ringing-in/out`, `connecting`, `connected`), `DM_CALL_RING_TTL_MS = 45_000`                                                                                                               |

`requireGroupOwner` **tek yetki kavramı** — bugün "yönetici" diye bir şey yok, yalnız `ownerId` var.

### 3.3 API yüzeyi

```
apps/web/src/app/api/v1/dm/groups/route.ts                                  POST oluştur
apps/web/src/app/api/v1/dm/groups/[conversationId]/route.ts                 PATCH ad/ikon, DELETE ayrıl
apps/web/src/app/api/v1/dm/groups/[conversationId]/members/route.ts         POST üye ekle
apps/web/src/app/api/v1/dm/groups/[conversationId]/members/[userId]/route.ts DELETE üye çıkar
apps/web/src/app/api/v1/dm/[conversationId]/mute/route.ts                   PATCH sessiz (boolean)
apps/web/src/app/api/v1/dm/[conversationId]/read|unread|messages|messages/search
```

Aynı beş grup ucu `/api/v1/mobile/dm/groups/...` altında birebir aynalanır. **Yeni bir uç eklerken mobil aynası aynı fazda eklenir** — bu depoda mobil, web uçlarını çağırmaz.

### 3.4 Çağrı altyapısı — grup için hazır olan kısım

- `apps/web/src/lib/livekit/server.ts:190` `resolveDMRoomName()` oda adını `dm:${conversation.id}` olarak üretir ve **katılımcı sayısına bakmaz** — grup konuşmaları için bugün de token verir.
- `apps/web/src/lib/socket/handlers/dm.ts:229` `dm:call:start` zaten **konuşmanın diğer tüm katılımcılarına** `dm:call:incoming` yollar ve hepsine push atar (satır 250–268). Yani halka fan-out'u 2 kişiye özel değil.
- Eksik olan: konuşma başına **aktif çağrı durumu** (kim içeride), **süregelen çağrıya katılma**, çok kişili UI.
- Mobil ekranlar: `mobile-direct-call-screen.tsx`, `mobile-outgoing-call-screen.tsx`, paylaşılan `voice-screen.tsx`.

### 3.5 Tipler — `packages/types/src/`

- `group-dm.ts`: `GROUP_DM_MAX_PARTICIPANTS = 32`, `GROUP_DM_MIN_PARTICIPANTS = 3`, `GROUP_DM_NAME_MAX_LENGTH = 100`, `GroupDMCreateRequestSchema`, `GroupDMUpdateRequestSchema`, `GroupDMAddMembersRequestSchema`.
- `group-dm-selection.ts`: `createInitialGroupCreateState`, `toggleGroupMember`, `canAdvanceToIdentity`, `canSubmitGroup`, `toGroupCreateRequest`, `isGroupSelectionFull`, `GROUP_SELECTABLE_MAX`.
- `dm-system-message.ts`: sistem mesajı tipleri.
- `@wizards/types` **kaynaktan çözülür** (`exports → ./src/index.ts`); build adımı yok.

### 3.6 Mobil yüzey

| Dosya                                  | Satır | Rol                                                                      |
| -------------------------------------- | ----- | ------------------------------------------------------------------------ |
| `screens/dm-screen.tsx`                | 242   | Mesajlar kabuğu; `mobileNavigationRef.navigate("GroupCreate")` satır 174 |
| `screens/dm-inbox.tsx`                 | 756   | Sohbet listesi; grup rozeti satır 549, sistem mesajı cümlesi satır 484   |
| `screens/dm-conversation-screen.tsx`   | 433   | Sohbet ekranı kabuğu                                                     |
| `screens/group-create-screen.tsx`      | 275   | Tek rotada iki adım (mevcut, 2b/2c ile **değiştirilecek**)               |
| `screens/dm-screen.styles.ts`          | 936   | DM stil sayfası                                                          |
| `components/dm-chat-primitives.tsx`    | —     | Balon/liste ilkelleri                                                    |
| `components/message-primitives.tsx`    | —     | Ortak mesaj gövdesi                                                      |
| `components/dm-system-message-row.tsx` | —     | Sistem mesajı satırı                                                     |
| `features/use-mobile-typing-labels.ts` | —     | "yazıyor" etiketleri                                                     |
| `features/use-mobile-dm-row-typing.ts` | —     | Liste satırında yazıyor durumu                                           |
| `dm/group-system-message-copy.ts`      | —     | `buildGroupSystemMessageSentence`, `toGroupSystemMessageLabels`          |

### 3.7 Tema ve kopya

- `apps/mobile/src/design/themes.ts` (1893 satır): bölüm başına token grubu deseni — `theme.messaging` (+ `messagingMetrics`), `theme.voiceRoom`, `theme.about`, `theme.workspace`, `theme.serverProfile`. **Grup ekranları kendi grubunu alır: `theme.groupChat`.**
- `apps/mobile/src/locale/mobile-copy.ts` (4993 satır): düz camelCase anahtarlar, önce `tr` sonra `en` bloğu (ör. satır 228 `dmCreateGroupAction: "Grup oluştur"`, satır 2727 İngilizcesi).
- `apps/mobile/src/app` içinde **hex literal yasak** — renk `useTheme()`'den gelir.

### 3.8 Arka plan işleri

- `apps/web/server.ts:92` `startOutboxWorker()` — worker başlatmanın **tek yeri ve deseni**. Kaybolan mesaj purge worker'ı buraya, aynı biçimde takılır (`apps/web/src/lib/outbox/worker.ts:43` imza örneği).
- Origin çözümü: `apps/web/src/lib/app-origin.ts` → `resolveAppOrigin()` / `resolveAppOriginDisplayHost()`. Davet bağlantısı **bunu** kullanır; `whispr.gg` tasarım metnindeki örnektir, sabit yazılmaz.

---

## 4. Kırılgan noktalar — önden sayıldı

1. **Prisma migration dizini.** Prisma bu depoda `packages/db/prisma/rebaseline-migrations/` okur; `packages/db/prisma/migrations/` **eski/ölü**. Yanlış dizine yazılan migration sessizce hiç koşmaz. Son örnek: `20260810180000_message_content_trgm_index`.
2. **`muted` kolonu 1186 yerde geçiyor** (çoğu alakasız Tailwind sınıfı, ama okuyucular gerçek). Kolonu **silme**. `notifyLevel` otorite olur, `muted` aynı transaction içinde `notifyLevel === NONE` olarak yazılan **türev ayna** kalır. Bu bir değişmez: iki alanı ayrı ayrı yazan kod incelemede reddedilir.
3. **`GROUP_DM_NAME_MAX_LENGTH = 100` ile tasarımdaki `18/32` sayacı çelişiyor.** Bkz. §5 varsayım V1.
4. **Grup adı boşken türetme zaten var** (`group-presentation.ts`, `resolveConversationName`). 2c'nin canlı ipucu metni ile oluşturulan grubun adı **aynı fonksiyondan** gelmeli; ikinci bir "isimleri birleştir" yazılırsa iki yüzey farklı isim gösterir.
5. **Okundu bilgisi N+1 üretir.** "4 kişi okudu" her giden mesaj için değil, **yalnız giden grubun son balonu** için hesaplanır ve katılımcı listesi zaten çekilmiş olan konuşma nesnesinden gelir. Mesaj başına sorgu atan çözüm reddedilir.
6. **Jest `gcTime` sızıntısı** ve **RNTL 14 async** tuzağı: `render()` ve `fireEvent.*` promise döner, `await` şart. Awaitsiz bir `fireEvent.press` sonraki testleri de bozar.
7. **Node test koşucusu React Native import edemez.** `apps/mobile/scripts/*.test.ts` yalnız saf modül test eder; ekran testi `component-tests/*.test.tsx` (jest).
8. **`typecheck`/`lint` pnpm üzerinden koşmalı** — `npm run` ile koşarsa derlemeden önce sürüm kontrolünde ölür.
9. **CRLF.** Depo dosyalarının bir kısmı CRLF; `Edit` yaparken eşleşen metni dosyadan kopyala, elle yazma.
10. **Kaybolan mesaj = geri alınamaz silme.** Purge worker'ı yazarken: yalnız `expiresAt IS NOT NULL AND expiresAt <= now()` satırları, batch limitli, konuşma başına değil global tarama, ve **önce realtime olay sonra silme** değil — **önce silme sonra olay** (aksi hâlde istemci var olmayan mesajı geri yükleyebilir).
11. **Davet kodu tahmin edilebilir olmamalı.** `ServerInvite.code` 8 karakter; grup kodu için aynı üreteç kullanılır, `Math.random` değil `crypto.randomBytes`.
12. **İzin guard'ı yalnız uçta değil serviste.** `sendMessage` izni mesaj gönderme **servisinde** kontrol edilir; socket yolu ile HTTP yolu aynı guard'ı çağırmalı, yoksa socket üzerinden izin atlanır.

---

## 5. Alınmış bağlayıcı kararlar (kullanıcı, 2026-08-11)

| No  | Karar                                                                                                                                                                                                                                                                                                                                                                                                             |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| K1  | **Grup çağrısı tam yapılır.** LiveKit çok kişili oda, halka fan-out, süregelen çağrıya katılma, 2e'deki "Görüntülü" tek görüntülü giriş noktası.                                                                                                                                                                                                                                                                  |
| K2  | **Davet bağlantısı tam yapılır.** Kod üretimi, aç/kapa, yenileme, public önizleme, deep link ile katılma. Varsayılan **kapalı**; açılmadan kod üretilmez.                                                                                                                                                                                                                                                         |
| K3  | **Kaybolan mesajlar tam yapılır.** Konuşma penceresi (Kapalı/24 saat/7 gün/90 gün), `expiresAt`, purge worker, realtime silme olayı, istemci filtresi.                                                                                                                                                                                                                                                            |
| K4  | **İzinler ve geçmiş penceresi sunucuda zorlanır.** Dört izin kolonu + tüm yazma yollarında guard; yeni üyenin geçmiş tabanı mesaj sorgusunda filtrelenir.                                                                                                                                                                                                                                                         |
| K5  | **Web tam parite alır.** Grup ayarları, izinler, rol yönetimi, davet bağlantısı, kaybolan mesajlar, sabitlenmiş mesaj web'de de yönetilir. Web arayüzü **mobil tasarımı piksel piksel kopyalamaz** — mevcut web tasarım dilini (`packages/ui`) kullanır, davranış ve kurallar aynıdır. İş Faz 2 (`/g/[code]` sayfası), Faz 4 (kurma diyaloğu), Faz 5 (yönetim paneli) arasına dağıtılmıştır; altıncı faz açılmaz. |
| K6  | **2a'da çevrimiçi şeridi kalkar.** HTML kazanır: arama pill'i → filtre çipleri → liste. 1a/1b/1c'deki şerit dokunulmaz.                                                                                                                                                                                                                                                                                           |

### Varsayımlar (itiraz gelmezse geçerli)

| No  | Varsayım                                                                                                                                                                                             |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V1  | `GROUP_DM_NAME_MAX_LENGTH` **32**'ye iner (tasarımdaki `18/32`). Mevcut daha uzun adlar okunmaya devam eder; yalnız yeni yazmalar kısıtlanır. Web dialogu da 32 gösterir.                            |
| V2  | Üye adı rengi **`DMParticipant.nameColor` kolonunda saklanır**; üyelik açılırken konuşmada **en az kullanılan** renk seçilir, eşitlikte `userId` sırası. Üye kaldığı sürece değişmez.                |
| V3  | 2a'daki **SABİTLENEN** = kullanıcı başına sabitlenmiş konuşma (`DMParticipant.pinnedAt`). DM'ler için de geçerli, gruba özel değil.                                                                  |
| V4  | Filtre çipleri (Tümü/Okunmamış/Gruplar/Sessiz) **istemci tarafı** filtredir; seçim kullanıcı başına kalıcıdır (`use-mobile-workspace-filter.ts` deseni).                                             |
| V5  | 2e'deki **"Ara"** grup içi mesaj aramasıdır — mevcut `/messages/search` ucu, yeni altyapı yok.                                                                                                       |
| V6  | Kaybolan mesaj penceresi değişince **geçmişe uygulanmaz**; yalnız o andan sonraki mesajlar damgalanır. Değişiklik bir sistem mesajı bırakır.                                                         |
| V7  | Grup avatarı özel görsel yoksa **iki üye avatarının çapraz kompozisyonu**; 3+ üyede ikinci karo `+N`. Karo seçimi `joinedAt` sırasına göre ilk iki **diğer** üye.                                    |
| V8  | Sahiplik devri: son yönetici ayrılırken zorunlu; `resolveNextGroupOwner` mevcut mantığı korunur, üstüne açık devir eklenir.                                                                          |
| V9  | 2b'deki **SIK MESAJLAŞTIKLARIN** mevcut sohbet listesinden türetilir: son 30 günde mesajlaşılmış, en yeni **5 birebir DM**'in karşı tarafı. Yeni sayım ucu açılmaz; liste 3'ten azsa bölüm çizilmez. |

Bir faz bu varsayımlardan birine dokunmadan ilerleyemiyorsa **durur ve sorar**.

---

## 6. Faz sırası ve kapılar

```
Faz 1  veri + yetki        → şema, guard, DTO, uçlar, web paritesi
   ↓   kapı: migration koştu, izin guard'ı 4 yazma yolunda, DTO alanları tipte
Faz 2  davet + kaybolan + çağrı → üç ağır arka uç özelliği
   ↓   kapı: kod üretimi/katılma testli, purge worker testli, aktif çağrı durumu testli
Faz 3  mobil temel katman  → token, kopya, saf model, istemci, rota
   ↓   kapı: 0 ekran dosyası değişti, model testleri yeşil, typecheck temiz
Faz 4  2a + 2b + 2c        → liste ve kurma akışı
   ↓   kapı: eski group-create-screen.tsx silindi, component testleri yeşil
Faz 5  2d + 2e + 2f        → sohbet, bilgi, ayarlar + çağrı girişi
       kapı: §11.3'ün 10 maddesi + paket kabul listesi
```

Bir faz kendi kapısını geçmeden sonraki faz başlamaz.

---

## 7. Doğrulama komutları

```bash
pnpm --filter @wizards/types test
```

```bash
pnpm --filter @wizards/web test
```

```bash
pnpm --filter @wizards/mobile typecheck
```

```bash
pnpm --filter @wizards/web typecheck
```

Mobil saf model testi (paket dizininden koşulur, kök dizinden koşulmaz):

```bash
cd apps/mobile && node --test --import tsx scripts/mobile-group-chat-model.test.ts
```

Mobil bileşen testi:

```bash
cd apps/mobile && npx jest component-tests/mobile-group-2d-2f.test.tsx
```

Tüm mobil paketi:

```bash
pnpm --filter @wizards/mobile test
```

Migration (yalnız Faz 1; kullanıcı onayıyla):

```bash
pnpm --filter @wizards/db exec prisma migrate dev --name group_dm_v2
```

Grafiği güncelle (her faz sonunda):

```bash
graphify update .
```

---

## 8. Rapor formatı

Her faz `docs/prompts/grup-sohbetleri-2a-2f/raporlar/<no>-rapor.md` yazar:

```markdown
# Faz <no> raporu — <başlık>

## Yapılanlar

- <dosya>: <ne değişti, neden>

## Bağlayıcı kararlar

- <sonraki fazı kısıtlayan her karar>

## Sapmalar

- <tasarımdan/ plandan sapma + gerekçe + kullanıcıya soruldu mu>

## Kapı sonucu

| Komut | Sonuç |
| ----- | ----- |

## Cihaz test listesi (kullanıcı koşacak)

1. <adım> → <beklenen>

## Bilinen boşluklar

- <sonraki faza devredilen>
```
