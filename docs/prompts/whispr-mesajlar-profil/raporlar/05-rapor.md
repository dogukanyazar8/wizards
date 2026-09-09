# Dalga 1 · Ş4 — Gizlilik tercihi, süreli sessize alma, bildirme ucu · rapor

**Tarih:** 2026-08-27 · **Dal:** `uat` · **Durum:** şerit bitti, kapı yeşil. Commit atılmadı.

## Kapı

| Komut                                                                             | Sonuç               |
| --------------------------------------------------------------------------------- | ------------------- |
| Şeridin testleri + dokunulan mevcut testler + `route-contract.test.ts` (18 dosya) | **189 / 189** geçti |
| `pnpm --filter @wizards/web typecheck`                                            | temiz               |
| `npx eslint` (dokunulan dosyalar)                                                 | temiz               |
| `npx prettier` (dokunulan dosyalar)                                               | temiz               |

Tam süit koşulmadı (kardeş şeritler paralel).

---

## Ş8 arayüzünün bilmesi gereken üç yol

### 1. Okundu bilgisi bayrağı — nerede uygulanıyor

**Tek karar noktası:** `apps/web/src/lib/messages/typing-visibility.ts`
→ `canPublishReadReceipt(userId)` / `canPublishTypingIndicator(userId)` /
`createMessagePrivacyCache()` / saf `resolveMessagePrivacy(columns)`.

**Kapı iki yayımcıya da kondu** (ikisi de aynı yardımcıyı çağırır):

| Yol                                       | Dosya                                                                     | Ne yapıyor                        |
| ----------------------------------------- | ------------------------------------------------------------------------- | --------------------------------- |
| Web `PATCH /api/v1/dm/[id]/read`          | `apps/web/src/lib/dm/delivery-receipts.ts` → `broadcastDirectMessageRead` | Bayrak kapalıysa **hiç emit yok** |
| Mobil `PATCH /api/v1/mobile/dm/[id]/read` | `apps/web/src/app/api/v1/mobile/dm/[conversationId]/read/route-logic.ts`  | Aynı; yanıt gövdesi değişmez      |

**Davranış:** `readReceipts: false` iken `dm:conversation:read` olayı **tamamen**
bastırılır — yalnız karşı tarafa giden bacak değil. Gerekçe: fan-out'un ilk bacağı
`dm:<conversationId>` odası ve o oda karşı tarafı içeriyor, dolayısıyla herhangi bir emit
damgayı ağa koyar. Viewer'ın kendi okunmamış sayacı bir **kolon** (`unreadCount`), bu
olaydan etkilenmez; mobil ucun yanıtı da (`participantReadStates`) aynen döner.

Kapı katılımcı okumasının **önünde**: kapalı tercihte katılımcı sorgusu bile koşmaz.

### 2. Yazıyor göstergesi bayrağı — nerede uygulanıyor

**Dosya:** `apps/web/src/lib/socket/handlers/typing.ts`.

- `dm:typing:start` **ve** `typing:start` (kanal) — kapalı tercihte Redis'e yazılmaz,
  hiçbir olay yayılmaz, rate limit bile danışılmaz.
- `dm:typing:stop` / `typing:stop` **bilerek kapısız**: yalnız durum temizler.
  Tercihi cümlenin ortasında kapatan birinin ekranda bıraktığı noktayı silen şey bu.
- Handler `createMessagePrivacyCache()` ile **60 sn** önbellekli okur (aynı dosyadaki
  `DM_PARTICIPANT_CACHE_TTL_MS` emsali). Tuş başına ayar sorgusu atılmıyor; anahtar
  çevrildiğinde etki en geç bir dakika içinde.

**Karar:** kanal (sunucu) yazıyor göstergesi de kapatılıyor. Kolon `UserSettings`
üzerinde hesap geneli; yalnız DM'de uygulanan bir "yazıyor göstergesi" tercihi yarım
doğru olurdu. Ş11 bunu sapma sayarsa raporlasın, kod tek satırla geri alınabilir
(`typing:start` içindeki `isTypingIndicatorPublishable` kapısı).

**Hata davranışı (ikisi de):** ayar okunamazsa **kapalı** varsayılır ve yayın yapılmaz.
Ulaşılamayan bir veritabanı rıza değildir; aynı takas dosyanın bir üstünde zaten yapılıyor
(`isTypingEventAllowed` Redis yokken `false` döner). Hatalı okuma **önbelleğe alınmaz**.

### 3. Mute socket olayının adı

```
"dm:conversation:mute"   → oda: user:<userId>
{ conversationId, muted, mutedUntil: string | null, notifyLevel: DMNotifyLevel }
```

`apps/web/src/lib/socket/events.ts` içinde `ServerToClientEvents`'e eklendi. Mevcut
`dm:conversation:notify` adlandırmasına ve odasına uyar (kişisel durum → kişisel oda);
**yeni kanal açılmadı**.

`notifyLevel` ayrı bir olay olarak değil bu olayın içinde geliyor: iki kolon tek update'te
yazılıyor, haberi bölmek bir sekmenin başlık pill'i ile bildirim radyosunu ayrı düşürürdü.

Olay **servisten** yayılıyor (`setDirectMessageMuted`), route'tan değil — böylece web ve
mobil mute uçları olayı bedavaya alıyor. Test için enjekte edilebilir
(`SetDirectMessageMutedDependencies.emitMuteChanged`).

---

## Mobil gizlilik ucu: **yeni**

`PATCH|GET /api/v1/mobile/account/privacy` (yeni dosya).

Mevcut `/api/v1/mobile/account/settings` ucunun bir `privacy` bloğu **var** ama yalnız
`dmPermission` / `friendRequests` / `groupInvites` taşıyor; `showReadReceipts` ve
`showTypingIndicator` orada **yok**. Oraya eklemek `MobileAccountSettingsResponseSchema`'yı
(`packages/types/**`) genişletmeyi gerektirirdi ve o dizin bu şeride kapalı.

İki uç aynı route-logic'i paylaşıyor
(`apps/web/src/app/api/v1/users/me/privacy/route-logic.ts`); yalnız kimlik ve rate-limit
kovası farklı (`mobileMessagingPrivacyDefaults`). Gövde ve yanıt şemaları ortak
(`UpdatePrivacyRequestSchema`, `ConversationPrivacySchema`), yani K1 paritesi sağlanıyor.

---

## Yazılanlar

### Süreli sessize alma (K8)

- `lib/dm/service.ts` → `setDirectMessageMuted(userId, conversationId, input, deps?)`.
  `input: boolean | SetMutedRequest`. **`muted`, `mutedUntil` ve `notifyLevel` tek
  `update` içinde** (tuzak 5). `muted: true` → `notifyLevel: "NONE"`,
  `muted: false` → `notifyLevel: "ALL"`. Dönüş: `{ muted, mutedUntil, notifyLevel }`.
- `lib/dm/service.ts` → `clearExpiredDirectMessageMutes(userId, now?)`, tembel temizlik.
  `listDirectMessages`'ın **ilk sayfasında** (imleçsiz çağrıda) koşar; sayfalar arası
  tekrar etmez. Gerekçe kod yorumunda: zamanlanmış sweep "sessiz mi" sorusuna **ikinci
  bir otorite** olurdu ve gecikip önceliği kaybettiği anda cevap hangisinin en son
  koştuğuna bağlı hâle gelirdi.
- `lib/dm/service.ts` → `mapDMParticipantWithPresence(..., now = new Date())`;
  `DMParticipantDTO.muted` artık `isMuteActive(...)`. Süresi dolmuş kayıt rayda ve profil
  panelinde **sessiz görünmez**. `dmConversationInclude` `mutedUntil`'i de seçiyor.
- `lib/dm/types.ts` → `SetDMMutedBodySchema = SetMutedRequestSchema` (alias; ikinci tanım
  açılmadı). Eski gövde `{ muted: true }` hâlâ geçerli ve `forever` demek.
- `app/api/v1/dm/[conversationId]/mute/route.ts` → yanıt artık
  `{ muted, mutedUntil, notifyLevel, success: true }`. Bitiş anı **sunucunun saatinden**
  döner; istemci kendi hesaplarsa pill bildirimlerden farklı bir dakikada biterdi.
- `app/api/v1/mobile/dm/[conversationId]/route-logic.ts` → gövdenin tamamını iletiyor
  (`input.muted` yerine `input`), böylece telefon da süre merdivenini kullanabiliyor.

**Bildirim yolu `isMuteActive`'i çağırıyor** — bu olmadan süreli mute hiç bitmezdi
(`notifyLevel` satırda `NONE` kalır):

- `lib/dm/notification-service.ts` → `selectDMNotificationRecipients({ ..., now? })`.
  `muted === true` ama `isMuteActive` `false` ise seviye `ALL`'a düşer. `mutedUntil: null`
  (yani `Süresiz` ve bildirim radyosundaki bilinçli `Kapalı`) **asla** düşmez.
- `lib/dm/message-send-service.ts` → `loadNotificationParticipants` `mutedUntil` seçiyor.
- `lib/dm/realtime-service.ts` + `lib/outbox/service.ts` → `mutedUntil` outbox job
  payload'ında taşınıyor (ISO dize olarak; eski job'larda alan yok ve yokluğu `Süresiz`
  okunuyor). Bu olmadan işçi süreli mute'u hiç göremezdi.

### Gizlilik tercihi (K9)

- `lib/messages/typing-visibility.ts` (yeni) + testi — yukarıdaki tek karar noktası.
- `lib/account/privacy-service.ts` → `getMessagingPrivacy` / `updateMessagingPrivacy`
  (+ `MessagingPrivacyStore` seam). Kısmî yazım: yalnız gövdenin adlandırdığı kolon
  yazılır; ayrıca `P2025` → 404.
- `app/api/v1/users/me/privacy/route.ts` + `route-logic.ts` + testi — `GET` ve `PATCH`.
- `app/api/v1/mobile/account/privacy/route.ts` — aynı route-logic, mobil defaults.

### Bildirme ucu (K12)

- `lib/social/user-report-submission.ts` (yeni) + testi — `USER_REPORT_REASONS` +
  `submitUserReport(...)`. `mobile/users/[userId]/route-logic.ts` içindeki private
  `REPORT_REASONS` haritası ve gövde→servis dönüşümü buraya taşındı; **iki route da**
  bunu çağırıyor, ikisi de inceldi.
- `app/api/v1/users/[userId]/report/route.ts` + `route-logic.ts` + testi.
  Kendini bildirme 400 (`SELF_REPORT`), eksik kullanıcı 404 — ikisi de paylaşılan
  `createMobileUserReport` içinde, ikinci bir kopya yazılmadı. Yanıt yalnız `{ reportId }`
  (şema `.strict()`, yani servis bir gün fazla alan dönerse uç **yanıt vermez**).
- Rate limit: `users:report` = **5 / 10 dk**, mobil `mobile:users:report` ile aynı ölçü.
  Ayrı anahtar, çünkü mobil ucun kayıtlı davranışı (`rate:<user>:mobile:users:report`)
  değişmemeli.

### İstemci köprüsü

`lib/dm/conversation-settings-client.ts` (yeni) + testi:
`setConversationMutedRequest`, `fetchMessagingPrivacy`, `updateMessagingPrivacyRequest`,
`reportUserRequest`, `ConversationSettingsError`. **`lib/dm/client.ts`'e dokunulmadı.**
Hepsi `fetchImpl` enjekte edilebilir; hiçbiri önbellek tutmuyor (Ş9/Ş8 React Query
katmanını kendi kurar).

### Rate limit anahtarları (`lib/api-rate-limit.ts`)

`user:privacy:read` 120/60 · `user:privacy:update` 30/60 · `users:report` 5/600.
Mobil gizlilik ucu mevcut `mobile:account:settings` kovasını kullanıyor, yeni anahtar
açılmadı.

---

## Kardeş şeritlerin bilmesi gereken sürprizler

1. **`lib/account/privacy-service.ts` ZATEN VARDI.** Görev tanımı "(yeni)" diyordu; dosya
   hesap silme / anonimleştirme / veri dışa aktarma taşıyor (401 satırlık testi de var).
   Yeni dosya açılmadı, iki fonksiyon mevcut dosyaya eklendi. `import { type Prisma }`
   → `import { Prisma }` (değer importu) gerekti, `P2025` `instanceof` kontrolü için.

2. **`resolveMuteState` yazılmadı** (prompt öneriyordu); Dalga 0'ın `isMuteActive`'i
   kullanıldı. `resolveMutedUntil`, `CONVERSATION_MUTE_DURATION_MINUTES` ve
   `SetMutedRequestSchema` / `UpdatePrivacyRequestSchema` / `ConversationPrivacySchema`
   hazır çıktı; `packages/types`'a hiç dokunulmadı.

3. **"`notifyLevel` eski değerine döner" yazılamaz.** Önceki tier'i saklayan kolon yok
   (Dalga 0 migration'ı da açmadı). Sessizlik kaldırılınca `ALL` yazılıyor; `MENTIONS`
   seçmiş biri mute'u kaldırdığında `ALL`'a düşer. Kolon açmak, bildirim radyosunun
   doğrudan yazabildiği bir değer için ikinci bir doğruluk kaynağı olurdu. **Ş8'in
   bildirim radyosu bu davranışı kullanıcıya göstermeli** (mute açıp kapatmak radyoyu
   `Tüm mesajlar`'a çeker).

4. **Bildirim yolu outbox üzerinden gidiyor.** DM bildirimi `enqueueDMMessageNotificationJob`
   ile job payload'ına serileşiyor ve işçi onu okuyor. `mutedUntil` payload'a
   eklenmeseydi süreli mute bildirim tarafında **hiç** bitmezdi. Payload'a dokunan başka
   bir şerit varsa alan adı `mutedUntil` (ISO dize | null).

5. **`selectDMNotificationRecipients` artık `now?` alıyor** ve süresi dolmuş mute'u `ALL`'a
   düşürüyor. `DMNotificationParticipant.mutedUntil` opsiyonel — eski job'lar kırılmıyor.

5b. **`mutedUntil` genişletmesi iki mock'u bayatlattı, ikisi de düzeltildi.**
`lib/dm/message-send-service.test.ts`'teki iki `loadNotificationParticipants` sahtesine
ve `lib/outbox/service.test.ts`'teki DM job beklentisine `mutedUntil: null` eklendi.
(Ş3 dosyayı `lib/messages/message-send-service.test.ts` diye bildirdi; öyle bir dosya
**yok**, doğru yol `lib/dm/`.) Şerit biterken `typecheck` temiz.

6. **`mobileUserReportRoute` artık kanıt işaretçilerini iletiyor.** Eskiden
   `attachmentId` / `dmMessageId` / `messageId` gövdede kabul edilip servise
   **verilmiyordu** (sessizce düşüyordu), oysa `createMobileUserReport` üçünü de
   destekliyor ve erişim kontrolünden geçiriyor. Bugünkü mobil istemci
   (`mobile-social-client.ts`) bu alanları hiç göndermiyor, dolayısıyla üründe **fiilî
   davranış değişimi yok**; sözleşme artık dürüst.

7. **`lib/api-rate-limit.ts` paylaşılan dosya** ve Ş3 (paylaşılan medya) şerit koşarken
   `dm:attachments` anahtarını ekledi. `HEAD` ile karşılaştırıldı: **silinen anahtar yok**,
   Ş3'ünki dâhil 15 yeni anahtarın hepsi yerinde. Ana oturum birleştirirken yine de
   `git show HEAD:… | grep -oE '^  "[a-z0-9:_-]+":'` ile aynı sayımı tekrarlasın.

7b. **`route-contract.test.ts` `route-logic` import'unu takma adla çözemiyor.**
`readRouteContractSource` (satır 1475) her `route-logic` ile biten import'u
`path.resolve(routeDirectory, spec + ".ts")` ile arıyor ve **var olmayan yolu sessizce
eliyor**. `@/app/api/v1/...` biçimi hiçbir zaman çözülmez; o rota yalnız kendi
`route.ts` metniyle taranır ve delege eden ince bir dosya "kimlik kapısı yok" görünür.
`mobile/account/privacy/route.ts` bu yüzden kırmızıydı; import
`"../../../users/me/privacy/route-logic"` yapıldı, test yeşil.

**Ölçüm tuzağı:** kod tabanında bugün **10 tane daha** takma adlı `route-logic`
import'u var (`admin/servers/*`, `mobile/account/sessions/*`, `*/badges/*`) ve test
onlarla **yeşil** — yani kapı takma adı yakalamıyor, o rotalar başka bir yoldan
(allowlist ya da `route.ts` metninin kendisi) geçiyor. Kural şu: **rota `route-logic`
dosyasına göreli yol ile import etmeli**, yoksa kimlik kapısı sayılmaz. Doğrulama:

```bash
# her route.ts için path.resolve(dirname, spec + ".ts") gerçekten var olmalı
cd apps/web && node -e "…"   # rapordaki tarama betiği
```

8. **`lib/socket/events.ts` bir sözleşme dosyası ama testi yok** ve mobil tarafın
   `mobile-realtime-contract.ts` allow-list'iyle senkron tutan bir test de yok.
   `dm:conversation:mute` mobil allow-list'te **yok** (K1: mobil ekran dosyası
   değişmiyor); mobil bu olayı bugün dinlemiyor.

9. **`typecheck` şerit başlarken 4 hata veriyordu** (`lib/desktop/runtime.test.ts`,
   `components/settings/sections/desktop/*`) — başka bir işin yarım bıraktığı ağaç
   durumuydu, şerit biterken kendiliğinden temizlendi. Bizim dosyalarımızdan gelmiyordu.

10. **Node test runner köşe kutuları glob'u.** `[userId]` / `[conversationId]` yollu test
    dosyaları düz argümanla **sessizce koşmuyor**; `src/app/api/v1/users/[[]userId[]]/...`
    biçimi gerekiyor (`apps/web/scripts/test-glob-path.mjs` bunu zaten yapıyor, ama elle
    tek dosya koşarken tuzak). Ayrıca elle koşarken `DATABASE_URL` şart:
    `postgresql://prisma:prisma@127.0.0.1:5432/wizards_unit_tests`.

## Kapsam dışında bırakılanlar

- `lib/dm/client.ts`'e hiç dokunulmadı (paralel çakışma). `setDMConversationMutedRequest`
  orada eski hâliyle duruyor ve hâlâ çalışıyor (`{ muted }` = `forever`); süre isteyen
  çağıran `conversation-settings-client.ts` kullanmalı. **Ş9/Ş8** ray menüsündeki eski
  çağrıyı yeni köprüye taşımak isteyebilir — bu ayrı bir iş.
- `MESSAGES_METRICS`, `messages-screen.ts`, `tr.ts`, `en.ts`, `components/**`,
  `apps/mobile/**`, `packages/**` — hiçbirine dokunulmadı.
- Toast metinleri Dalga 0'da yazıldı (`messages.toast.mutedFor` / `mutedForever` /
  `muteCleared` doğrulandı, mevcut). Ş9 bunları tüketir.

## Açık kalan

Yok.
