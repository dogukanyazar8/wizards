# Dalga 3 · Ş10 — Üye ekle modalı · rapor

**Tarih:** 2026-08-27 · **Dal:** `uat` · **Durum:** şerit bitti, kendi kapısı yeşil. Commit atılmadı.

## Kapı

Kardeş şeritler koştuğu için tam süit koşulmadı; yalnız bu şeridin beş test dosyası.

```bash
cd apps/web && DATABASE_URL="postgresql://prisma:prisma@127.0.0.1:5432/wizards_unit_tests" \
  node --import tsx --test --test-force-exit \
  src/components/messages/add-members-modal.test.tsx \
  src/components/messages/invite-candidate-row.test.tsx \
  src/components/messages/invite-link-box.test.tsx \
  src/lib/dm/invite-candidates.test.ts \
  "src/app/api/v1/dm/groups/[[]conversationId[]]/candidates/route-logic.test.ts"
```

| Ölçüm                                   | Sonuç                                          |
| --------------------------------------- | ---------------------------------------------- |
| Yeni testler                            | **95 / 95** geçti (24 süit), exit **0**        |
| `src/app/api/v1/route-contract.test.ts` | **25 / 25** — yeni uç kimlik kapısı listesinde |
| `npx eslint` (12 dosya)                 | temiz                                          |
| `npx prettier --check`                  | temiz                                          |
| `pnpm --filter @wizards/web typecheck`  | bu şeridin dosyalarında **sıfır** hata         |

Typecheck'te kalan tek hata bu şeridin değil: `lib/dm/group-service.ts(1343,38)` —
`setNotifyLevel` `writeOwnParticipant`'a `mutedUntil: null` geçiriyor ama
`ParticipantWriteDependencies`'in patch tipi o alanı henüz taşımıyor. K8'in sessize alma işi;
Ş4/Ş9 tarafında yarım duruyor.

## Landed

| Dosya                                                                          | Satır   | Ne                                             |
| ------------------------------------------------------------------------------ | ------- | ---------------------------------------------- |
| `apps/web/src/lib/dm/invite-candidates.ts`                                     | 477     | aday süzme kuralı + imleçli sayfalama servisi  |
| `…/invite-candidates.test.ts`                                                  | 42 test |                                                |
| `apps/web/src/lib/dm/invite-candidates-client.ts`                              | 106     | fetch + sorgu anahtarları + önbellek toplayıcı |
| `apps/web/src/app/api/v1/dm/groups/[conversationId]/candidates/route-logic.ts` | 97      | uç mantığı                                     |
| `…/candidates/route-logic.test.ts`                                             | 11 test |                                                |
| `…/candidates/route.ts`                                                        | 19      | `GET`                                          |
| `apps/web/src/components/messages/add-members-modal.tsx`                       | 809     | §16 penceresi (kabuk + gövde)                  |
| `…/add-members-modal.test.tsx`                                                 | 29 test |                                                |
| `apps/web/src/components/messages/invite-candidate-row.tsx`                    | 169     | §16 aday satırı                                |
| `…/invite-candidate-row.test.tsx`                                              | 11 test |                                                |
| `apps/web/src/components/messages/invite-link-box.tsx`                         | 315     | §16 `BAĞLANTIYLA DAVET` kutusu                 |
| `…/invite-link-box.test.tsx`                                                   | 13 test |                                                |

Sahiplenme listesinin dışına **çıkılmadı**. `metrics.ts`, `messages-screen.ts`, `tr.ts`,
`en.ts`, `lib/api-rate-limit.ts`, `lib/dm/client.ts`, `group-profile-client.ts`,
`dm/groups/route-logic.ts`, `conversation-*`, `profile-tab-*`, `packages/types/**`,
`apps/mobile/**` — hiçbirine yazılmadı. Yeni i18n anahtarı **gerekmedi**: Dalga 0'ın
`messages.invite.*` ve `messages.toast.*` blokları tam yetti.

---

## 1. Ana oturumun bağlayacağı prop imzası

```ts
// apps/web/src/components/messages/add-members-modal.tsx
export type AddMembersModalProps = {
  conversationId: string;
  /** K14'ün `inviteLinkExpiry` ekseni. */
  expiry: InviteLinkExpiry;
  /** Test tohumu — davetin geçerlilik penceresi. */
  now?: Date | undefined;
  /** Başarıda §16 kullanıcıyı grup sohbetine geri gönderir. */
  onAdded?: ((userIds: readonly string[]) => void) | undefined;
  onClearSelection: () => void;
  onClose: () => void;
  onSelectExpiry: (expiry: InviteLinkExpiry) => void;
  onToast?: ((toast: ConversationToast) => void) | undefined;
  onToggleSelection: (userId: string) => void;
  open: boolean;
  /** K14'ün `inviteSelection` ekseni. */
  selection: readonly string[];
};
```

**Bağlama (K14, üç açılış noktası tek action):**

| Prop                | Reducer karşılığı                                     |
| ------------------- | ----------------------------------------------------- |
| `open`              | `state.modal?.kind === "invite"`                      |
| `onClose`           | `dispatch({ type: "closeModal" })`                    |
| `selection`         | `state.inviteSelection`                               |
| `onToggleSelection` | `dispatch({ type: "toggleInviteSelection", userId })` |
| `onClearSelection`  | `dispatch({ type: "clearInviteSelection" })`          |
| `expiry`            | `state.inviteLinkExpiry`                              |
| `onSelectExpiry`    | `dispatch({ type: "setInviteLinkExpiry", expiry })`   |
| `onToast`           | `dispatch({ type: "showToast", toast })`              |

Üç tetikleyicinin üçü de `dispatch({ type: "openModal", modal: { kind: "invite" } })` çağırır:
Ş5'in profil başlığı `Üye ekle`, Ş7'nin `ProfileTabMembers.onAddMembers`, Ş9'un grup menüsündeki
`Üye ekle · davet bağlantısı`. Modal içeride **hiç** yerel seçim tutmuyor, o yüzden üç kapıdan
girilse de aynı seçim görünür.

**İkinci bir dışa açık bileşen var:** `AddMembersModalBody`. `Modal` portala çiziyor ve sunucu
tarafında `null` dönüyor (`useSyncExternalStore` sunucu snapshot'ı `false`), yani §16'nın ne
çizdiğini soran test gövdeyi render etmek zorunda. Üründe **`AddMembersModal` bağlanır**; gövde
yalnız test yüzeyidir.

## 2. Sunucu 250 tavanını gerçekten uyguluyor — **iki kez**

Prompt "reddetmiyorsa raporuna yaz" diyordu. Reddediyor, hem de iki katmanda:

1. `addGroupMembers` (`lib/dm/group-service.ts:987`) — anlık görüntü üzerinde
   `existing.size + addedUserIds.length > GROUP_DM_MAX_PARTICIPANTS` → `400 GROUP_FULL`.
2. `writeAddedMembers` (`:570`) — **transaction içinde**, `serializeGroupMembershipWrite` kilidi
   alındıktan sonra yeniden. Aynı anda iki yönetici 240 kişilik gruba 6'şar kişi eklerse ikisi de
   birinci kontrolü geçer; ikincisini yalnız biri geçer.
3. Üstüne zod: `GroupDMAddMembersRequestSchema.userIds` `.max(GROUP_DM_MAX_PARTICIPANTS - 1)`.

Yani istemcideki `exceedsInviteCeiling` bir **savunma değil, açıklama**. 220 kişilik gruba 40
kişi seçtirip sonra kırmızı şeritle reddetmek, aynı reddin daha kötü biçimi olurdu.

## 3. Aday süzme kurallarının tam listesi

Beşi de **sunucuda**, `lib/dm/invite-candidates.ts` içinde, saf fonksiyonlarda:

| #   | Kural                                                                              | Nerede                                                 |
| --- | ---------------------------------------------------------------------------------- | ------------------------------------------------------ |
| 1   | Havuz viewer'ın **arkadaşları** (`FriendRequest.status = ACCEPTED`, iki yön)       | `toInviteCandidateRelations`                           |
| 2   | Mevcut üyeler elenir                                                               | `selectInviteCandidateIds`                             |
| 3   | `UserSettings.allowGroupInvites: false` olan arkadaş elenir                        | `listClosedInviteUserIds` + `selectInviteCandidateIds` |
| 4   | Engellenen / engelleyen elenir (`BLOCKED` satırı `ACCEPTED`'ı yener, iki yönde de) | `toInviteCandidateRelations`                           |
| 5   | Viewer kendi listesinde çıkmaz                                                     | `selectInviteCandidateIds`                             |

Yetki kapısı `requireInviteCandidateContext`, sırası testle sabitlendi:
**404** (konuşma yok) → **403** (katılımcı değil, konuşmanın türünü öğrenmeden) → **400**
(1:1 DM kimliği) → **403** (`canMemberDo(role, permAddMembers)` başarısız). Son satır §16'nın
istediği: `ADMINS` politikasında üye rolüyle uç **403**, boş liste değil — boş liste
"eklenecek arkadaşın kalmamış" derdi ve bu başka (ve yanlış) bir cümle.

İki küçük optimizasyon kayda değer:

- **Gizlilik sorgusu yalnız kalan adaylara sorulur.** Zaten üye olan bir arkadaş iki türlü de
  aday değil; onu `UserSettings` okumasına sokmak sorguyu bedavaya genişletirdi. Test bunu
  sabitliyor (`asked` dizisi).
- **Presence yalnız sayfa için okunur.** 400 arkadaşı olan bir viewer, beş satır çizmek için
  400 Redis+policy araması ödemiyor. `listGroupMembers`'ın aynı kuralı.
- `lastSeenAt` **hiç okunmuyor**: DTO'da karşılığı yok ve hiçbir şeyin çizmediği bir etkinlik
  zaman damgasını çekmek, görünürlük politikasının tam da koruduğu değeri dağıtmak olurdu.

**Sayfalama K16:** `{ items, nextCursor, alreadyMemberCount }`, keyset imleç
(`base64url({ name, userId })`), `offset` yok. Bozuk imleç 400 değil, "listenin başı" —
Ş2'nin üye listesiyle aynı okuma.

**`alreadyMemberCount` = grubun üye sayısı.** SPEC §16'nın mock'u beş kişilik grupta
`5 kişi zaten üye` yazıp **dört** daire çiziyor; yani sayı üye sayısı, yığın dörtte kesiliyor
(`INVITE_MEMBER_STACK_MAX = 4`). "Zaten üye olan arkadaşların sayısı" okuması o mock'ta 4
verirdi ve metinle çelişirdi.

## 4. Invite süre değişimi bağlantıyı **döndürmüyor** — çünkü döndürmemeli, ve zaten süre yazılamıyor

Raporun asıl sorusu buydu. İki ayrı bulgu var:

### 4.1 Kod tabanında `GroupInvite.expiresAt`'i yazan **hiçbir yol yok**

- `GroupInviteSettingsRequestSchema` = `{ enabled: boolean }`, `.strict()`.
- `setGroupInviteEnabled` ve `rotateGroupInvite` `upsertInvite`'a gidiyor; onun girdi tipi
  `{ actorId, code?, conversationId, enabled, rotatedAt? }` — **`expiresAt` yok**.
- Kolon şemada duruyor ve yalnız **okunuyor** (`toInviteDTO`, `resolveJoinBlock`).

Yani §16'nın `7 gün` · `1 gün` · `Süresiz` segmenti, mevcut uçlarla **kalıcı hâle getirilemez**.
`TODO(api):` olarak `add-members-modal.tsx` içindeki `inviteMutation` yorumuna yazıldı.

### 4.2 Segment ne yapıyor

`PATCH /api/v1/dm/groups/[id]/invite` `{ enabled: true }` — **mevcut uç, yeni uç yok.** Bu bir
upsert: davet yoksa **üretir**, varsa **aynı kodu** döndürür. Yanıt `panel` sorgusunu geçersiz
kılıyor, yani kutudaki metin sunucunun gerçekten tuttuğu bağlantıya anında oturuyor — "süre
değişimi bağlantıyı döndürüyorsa metin de güncellenir" koşulu yapı gereği sağlanıyor.

**`POST …/invite/rotate` bilerek çağrılmıyor.** Rotate, sohbetlere yapıştırılmış her kopyayı
anında öldürür; "süreyi değiştir" diyen bir kontrolün vaat etmediği yıkıcı bir yan etki. Süre
gerçekten yazılabilir olduğunda doğru davranış `PATCH` gövdesine bir `expiresAt` alanı
eklemektir, rotate değil.

**Yetki inceliği:** segment `editInfo` gerektiriyor, oysa `permAddMembers: ALL` bir grupta düz
bir **üye** de bu modalı açabiliyor. O yüzden segment yalnız `viewerRole !== "MEMBER"` iken
çiziliyor (Ş7'nin davet kartıyla aynı kural); bağlantı alanı ve `Kopyala` **herkese** çiziliyor,
çünkü yönetici bağlantıyı açtıysa her üye onu paylaşabilir. Gri bir segment üçüncü seçenekti ve
yanlış olanı: sunucunun reddedeceği bir kontrolü reklam eder.

## 5. Gereken hız sınırı kovası — ana oturum eklemeli

`lib/api-rate-limit.ts` paylaşımlı dosya, koordinatör kararı gereği **dokunulmadı**. Uç şu an
mevcut `dm:group:read` kovasını (120/60) harcıyor.

```ts
// API_RATE_LIMITS içine:
"dm:group:candidates": { limit: 60, windowSeconds: 60 },
```

Gerekçe: bu bir **arama** yüzeyi — panel açılışının aksine her tuş vuruşunun (debounce sonrası)
peşinden geliyor ve tek konuşma yerine **arkadaş grafiğini** okuyor. Kod hazır:
`inviteCandidateDefaults.rateLimits.read` tek dize; eklendiğinde `route-logic.ts` içinde **bir**
satır değişir. `route-logic.ts` içindeki `TODO(rate-limit):` yorumu ve
`route-logic.test.ts` içindeki "kayıtlı bir kovayı harcar" testi bunun sessizce unutulmamasını
sağlıyor.

## 6. Kardeş şeritlerin bilmesi gerekenler

### 6.1 Toast sözleşmesi Ş9 ile **birebir tutuyor** — kontrol edildi

Bu şerit üç kayıt basıyor:

| Olay                       | Kayıt                                                                |
| -------------------------- | -------------------------------------------------------------------- |
| Kopyalama başarılı         | `{ kind: "inviteCopied", tone: "success" }`                          |
| Kopyalama reddedildi       | `{ kind: "copyFailed", tone: "danger" }`                             |
| Ekleme başarılı (tek kişi) | `{ kind: "membersAdded", params: { name }, tone: "success" }`        |
| Ekleme başarılı (çok kişi) | `{ kind: "membersAdded", params: { name, count }, tone: "success" }` |
| Ekleme başarısız           | `{ kind: "actionFailed", tone: "danger" }`                           |

Ş9'un `resolveToastCopy`'si (`conversation-toast.tsx:57`) `params.count` gördüğünde
`messages.toast.membersAddedMany`'ye geçiyor ve `FAILURE_KINDS` iki hata kipini de tanıyor.
Ek iş **yok**.

### 6.2 Ş7'nin `copyInviteLink`'i hâlâ eski kipi gönderiyor

`profile-invite-link-card.tsx:copyInviteLink` reddedilen panoda
`{ kind: "inviteCopied", tone: "danger" }` basıyor (Dalga 2'de `copyFailed` kipi henüz yoktu).
Ş9 bunu tolere ediyor ama kendi raporunda "kaynağın düzeltilmesi gerekiyor" diyor. Bu şeridin
kendi kopyalayıcısı (`invite-link-box.tsx:copyInviteLinkToClipboard`) doğrudan `copyFailed`
basıyor. **Tek satırlık düzeltme**, Ş7'nin dosyasında; ayrı iş olarak önerilir.

### 6.3 `InviteCandidateDTO` son görülme taşımıyor — §16'nın mock'u taşıyor

Tasarım aday satırlarında `2 saat önce görüldü`, `Dün 23:10`, `3 gün önce` yazıyor. Dalga 0'ın
DTO'sunda `lastSeenAt` **yok** (alanlar: `initials, name, presence, statusText, tint, userId`).
Satır bugün `statusText ?? presence sözcüğü` basıyor; uydurulmuş bir zaman damgası, ürünün
bilmediği bir sayıyı ekrana yazmak olurdu. Kapatmak isteyen için tek yol
`InviteCandidateDTOSchema`'ya `lastSeenAt: z.string().nullable()` eklemek — `packages/types` bu
şeridin yazma listesinde değil. Servis tarafı hazır: `readPresence` bağımlılığı
`redactPresenceCollectionForViewer`'a zaten giriyor, üçüncü argümanı `true` yapıp
`resolveLastSeenAtByUserId`'yi açmak yetiyor (Ş2'nin üye listesindeki kalıp).

### 6.4 Zaten-üye yığınının **yüzleri** Ş7'nin önbelleğinden geliyor

Sayı uçtan (`alreadyMemberCount`), baş harfler `groupProfileQueryKeys.members(id)` altındaki
sayfadan — **`getQueryData` ile, ikinci istek atmadan**. Roster önbellekte yoksa yalnız sayı
çizilir. Süs bir istek maliyeti üretmemeli; sayının doğruluğu ise sunucunun işi. Ş7 o anahtarın
şeklini değiştirirse (`{ pages: GroupMemberPage[] }`) burası sessizce yüzsüz kalır — kırılmaz,
ama haber verilmeli.

### 6.5 Çip aramaya dayanıklı: seçim, sorgu değişince kaybolmuyor

Seçim reducer'da (id listesi), ad/tint ise sayfalarda. Kullanıcı `can` yazıp birini seçip
kutuyu temizlediğinde o kişinin satırı artık görünen sayfada değil. Çip yine de çiziliyor:
`collectCachedInviteCandidates`, `["dm","invite-candidates", conversationId]` **önekiyle**
eşleşen bütün önbellek girdilerini tarıyor. Aynı harita başarı toast'ının `{name}`'ini de
besliyor ve `onSuccess` içinde **invalidate'lerden önce** okunuyor.

### 6.6 `route-logic` import'u göreli — tuzağa düşülmedi

`candidates/route.ts` `"./route-logic"` yazıyor ve gerekçe dosyanın başında yorum olarak duruyor.
`route-contract.test.ts` 25/25 yeşil, uç "kimliksiz rota" listesine düşmüyor.

## 7. Kayda geçmesi gereken sapmalar

`metrics.ts` bu şeridin dosyası olmadığı için `SPEC_DEVIATIONS` listesine **yazılmadı**; ana
oturum uygun görürse ekler.

1. **Aday satırının ikinci cümlesi son görülme değil, presence sözcüğü** (§6.3).
2. **Süre segmenti sunucuda kalıcı değil** (§4.1). Segment görsel olarak SPEC'e uygun, davranışı
   bir istemci tercihi.
3. **Kapat düğmesi elle yazıldı, `WindowCloseButton` kullanılmadı.** O bileşen çağıranın
   `style`'ını **kendi** `SETTINGS_METRICS` değerlerinden **önce** yayıyor, yani 31px kutusu,
   yarıcapı ve kenarlığı ezilemiyor; §16 ise 32px, kenarlıksız bir düğme çiziyor. Kural 4'ten
   bilinçli sapma.
4. **Süre segmenti `SegmentedControl` ile yazılmadı.** O bileşen ölçülerini `groupModal.*`
   sözlüğünden okuyor (§16'nın `expiry*` bloğunu değil) ve seçili segmenti `--surface-card` ile
   boyuyor; §16 `--primary` + `--primary-foreground` istiyor. Erişilebilirlik aynen taşındı:
   gerçek `radiogroup`/`radio`, roving tabindex, ok/Home/End.
5. **Backdrop blur'u `backdrop-blur-xs` sınıfıyla** çiziliyor. `blur(4px)` birebir aynı değer;
   arbitrary `[4px]` lint kuralınca yasak (kök font boyutuyla ölçeklenmez).
6. **`INVITE_SEARCH_DEBOUNCE_MS = 250` bileşen dosyasında.** `metrics.ts` **ölçü** sözlüğü ve
   bu bir zamanlama; ayrıca Dalga 0'ın dosyası. Ayarlar penceresinin `useDebouncedValue`'su
   dışa açık olmadığı için kopyalandı.
7. **`Daha fazla` satırı `messages.friends.action.more` anahtarını kullanıyor** — Ş7'nin
   emsaliyle aynı; Dalga 0 `messages.invite.loadMore` açmadı.

## 8. Açık kalan

1. **`dm:group:candidates` kovası** `API_RATE_LIMITS` içine eklenmeli (§5). Ana oturum, tek elden.
2. **Bağlama** ana oturumun işi: `DMConversationPage` içinde `AddMembersModal`'ı §1'deki
   tabloya göre reducer'a bağlamak. Bağlanmadan modal hiçbir yerden açılmıyor.
3. **`InviteCandidateDTO.lastSeenAt`** (§6.3) — `packages/types`, ayrı iş.
4. **`GroupInvite.expiresAt` yazma yolu** (§4.1) — `GroupInviteSettingsRequestSchema` +
   `upsertInvite`, ayrı iş. Bu olmadan §16'nın süre segmenti kalıcı değil.
5. **Ş7'nin `copyInviteLink`'i `copyFailed` kipine geçmeli** (§6.2) — tek satır, Ş7'nin dosyası.
6. **`lib/dm/group-service.ts(1343)` typecheck hatası** Ş4/Ş9'un yarım kalan `mutedUntil`
   yazma yolundan geliyor; bu şeridin dosyası değil, ama kapı repo genelinde onsuz yeşile
   dönmez.
