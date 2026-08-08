# Faz 5 — Mobil (Görev 13, 14, 15, 16, 17)

> **Önce oku:** `docs/prompts/grup-sohbeti/00-ortak-baglam.md`.
> **Önkoşul:** Faz 3 + Faz 4 tamam — mobil uçlar (`/api/v1/mobile/dm/groups...`),
> realtime olayları ve `getMobileDMDetails` grup kolu hazır.

Gelen kutusu satırı, başlığı, avatarı, grup rozeti ve önizleme öneki **zaten grup
farkında** (ortak bağlam §2.6). Bu fazda yazılan: giriş noktası, oluşturma akışı,
sistem mesajı satırı, grup detay ekranı.

---

## Görev 13 — Metinler, rota, gelen kutusu `+` butonu

### 13.1 `DMInboxHeader`

`apps/mobile/src/app/screens/dm-inbox.tsx:70` — mevcut kalem butonunun **soluna**
ikinci buton:

- İkon `"plus"` (`MOBILE_LINE_ICON_NAMES` içinde mevcut)
- `testID="mobile-dm-create-group-button"`
- `accessibilityLabel={copy.dmCreateGroupAction}`
- Yalnızca `segment === "conversations"` iken render edilir; Arkadaşlar/İstekler
  sekmelerinde hiç çizilmez
- Yeni prop: `onCreateGroup(): void`

Mevcut kalem butonunun `testID`'si, davranışı ve konumu **değişmez**. İki buton
`styles.dmInboxHeaderActions` (yeni, `flexDirection: "row"`, `gap: 8`) içinde durur.

`apps/mobile/src/app/screens/dm-screen.tsx:170` çağrısı güncellenir:

```tsx
onCreateGroup={() => {
  if (mobileNavigationRef.isReady()) {
    mobileNavigationRef.navigate("GroupCreate");
  }
}}
```

### 13.2 Rota

- `apps/mobile/src/navigation/mobile-navigation-types.ts`: `GroupCreate: undefined;`
- `apps/mobile/src/navigation/mobile-linking.ts`: `GroupCreate: "channels/@me/new-group",`

**Ekran kaydı bu görevde yapılmaz** — bileşen Görev 15'te yazılıyor ve yer tutucu
ekran yazmak yasak. Tip ve deep-link kaydı yeterli.

### 13.3 Metinler

`apps/mobile/src/locale/mobile-copy.ts`, hem `tr` hem `en` bloğuna, alfabetik sırada:

`dmCreateGroupAction`, `groupAddMemberAction`, `groupCreateCounter`,
`groupCreateIdentityStepTitle`, `groupCreateLimitReached`, `groupCreateMembersStepTitle`,
`groupCreateMinimumHint`, `groupCreateNameHint`, `groupCreateNameLabel`,
`groupCreateNamePlaceholder`, `groupCreateNextAction`, `groupCreatePhotoAction`,
`groupCreateSubmitAction`, `groupCreateTitle`, `groupLeaveAction`,
`groupLeaveConfirmTitle`, `groupMembersTitle`, `groupOwnerBadge`,
`groupRemoveMemberAction`, `groupSystemActorSelf`, `groupSystemAdded`,
`groupSystemCreated`, `groupSystemIconChanged`, `groupSystemLeft`,
`groupSystemNameChanged`, `groupSystemRemoved`

Türkçe değerler:

```
dmCreateGroupAction: "Grup oluştur"
groupAddMemberAction: "Üye ekle"
groupCreateCounter: "{count}/32"
groupCreateIdentityStepTitle: "Grup bilgileri"
groupCreateLimitReached: "En fazla 32 kişi seçebilirsin"
groupCreateMembersStepTitle: "Üye seç"
groupCreateMinimumHint: "En az 2 arkadaş seç"
groupCreateNameHint: "Boş bırakırsan grup adı üyelerin adlarından oluşur"
groupCreateNameLabel: "Grup adı"
groupCreateNamePlaceholder: "Grup adı (isteğe bağlı)"
groupCreateNextAction: "İleri"
groupCreatePhotoAction: "Grup fotoğrafı ekle"
groupCreateSubmitAction: "Oluştur"
groupCreateTitle: "Yeni grup"
groupLeaveAction: "Gruptan ayrıl"
groupLeaveConfirmTitle: "Gruptan ayrılmak istiyor musun?"
groupMembersTitle: "Üyeler"
groupOwnerBadge: "Yönetici"
groupRemoveMemberAction: "Gruptan çıkar"
groupSystemActorSelf: "Sen"
groupSystemAdded: "{actor}, {targets} kişisini ekledi"
groupSystemCreated: "{actor} grubu oluşturdu"
groupSystemIconChanged: "{actor} grup fotoğrafını değiştirdi"
groupSystemLeft: "{actor} gruptan ayrıldı"
groupSystemNameChanged: "{actor} grup adını \"{value}\" olarak değiştirdi"
groupSystemRemoved: "{actor}, {targets} kişisini çıkardı"
```

İngilizce karşılıkları aynı anahtarlarla: `"Create group"`, `"Add member"`,
`"{count}/32"`, `"Group details"`, `"You can pick at most 32 people"`,
`"Pick members"`, `"Pick at least 2 friends"`,
`"Leave it blank and the title uses the members' names"`, `"Group name"`,
`"Group name (optional)"`, `"Next"`, `"Add a group photo"`, `"Create"`,
`"New group"`, `"Leave group"`, `"Leave this group?"`, `"Members"`, `"Admin"`,
`"Remove from group"`, `"You"`, `"{actor} added {targets}"`,
`"{actor} created the group"`, `"{actor} changed the group photo"`,
`"{actor} left the group"`, `"{actor} renamed the group to \"{value}\""`,
`"{actor} removed {targets}"`.

### 13.4 Testler

`apps/mobile/component-tests/mobile-group-create.test.tsx`:

- `+` butonu `conversations` sekmesinde görünür ve `onCreateGroup`'u çağırır
- mevcut kalem butonu (`mobile-dm-compose-button`) hâlâ `onCompose`'u çağırır
- `+` butonu `friends` sekmesinde render edilmez

**RNTL 14 async:** `render()` ve `fireEvent.*` promise döner — ikisini de `await` et.
`await` unutulursa aynı dosyadaki _sonraki_ testler bozuk ağaç render eder ve
"getByTestId is not a function" gibi alakasız hatalar verir.

---

## Görev 14 — Seçim modeli (`@wizards/types`, mobil + web ortak)

Ekranın tüm kuralları React'ten bağımsız saf fonksiyonlarda yaşar. Modül
`packages/types` içindedir, `apps/mobile` içinde **değil**: web diyaloğu (Görev 18)
aynı fonksiyonları çağırır. İki yüzeyde iki uygulama = iki sapma.

### Dosyalar

- Oluştur: `packages/types/src/group-dm-selection.ts`
- Oluştur: `packages/types/src/group-dm-selection.test.ts`
- Değiştir: `packages/types/src/index.ts` (tek satır re-export)

### API

```ts
export type GroupCreateStep = "identity" | "members";
export type GroupCreateState = {
  readonly name: string;
  readonly selectedUserIds: readonly string[];
  readonly step: GroupCreateStep;
};

export function createInitialGroupCreateState(): GroupCreateState;
export function getGroupSelectionCount(state): number; // kurucu dahil
export function isGroupSelectionFull(state): boolean;
export function toggleGroupMember(state, userId): GroupCreateState;
export function canAdvanceToIdentity(state): boolean;
export function canSubmitGroup(state): boolean;
export function toGroupCreateRequest(
  state,
  iconUrl: string | null,
): { iconUrl?: string; name?: string; userIds: string[] };
```

Sabitler `./group-dm`'den import edilir; 32 veya 3 asla elle yazılmaz.
Kurucu örtüktür: seçilebilir tavan `GROUP_DM_MAX_PARTICIPANTS - 1` = 31,
taban `GROUP_DM_MIN_PARTICIPANTS - 1` = 2.

`toggleGroupMember` seçimi kaldırırken sınır kontrolüne takılmamalı — kaldırma dalı
doluluk guard'ından **önce** dönmeli. Doluyken seçili olmayan bir id eklenmeye
çalışılırsa state değişmeden döner.

`toGroupCreateRequest` adı kırpar; kırpılmış ad boşsa `name` anahtarını gövdeye hiç
koymaz (sunucu `null` saklar). `iconUrl` null ise anahtarı koymaz.

### Testler (10)

başlangıç durumu · kurucunun sayıma dahil olması · iki kez seçilince kalkması ·
2 seçimden az iken `canAdvanceToIdentity === false` · 2 seçimde `true` ·
31 seçimde kilit ve 32.'nin listeyi büyütmemesi · doluyken kaldırmanın çalışması ·
boş adın gövdeden düşmesi · kırpılmış ad + ikon birlikte · `members` adımından
`canSubmitGroup === false`

**§5 kuralı devrede:** `packages/types` değişti, `@wizards/mobile` de doğrulanmalı.

---

## Görev 15 — Grup oluşturma ekranı ve API istemcisi

### 15.1 `apps/mobile/src/dm/mobile-group-client.ts`

```ts
export async function createMobileGroup(
  apiClient,
  input: GroupDMCreateRequest,
): Promise<DMConversationDTO>;
export async function addMobileGroupMembers(
  apiClient,
  conversationId,
  userIds,
): Promise<DMConversationDTO>;
export async function updateMobileGroup(
  apiClient,
  conversationId,
  patch: GroupDMUpdateRequest,
): Promise<DMConversationDTO>;
export async function removeMobileGroupMember(apiClient, conversationId, userId): Promise<void>;
export function useMobileGroupMutations(apiClient);
```

Yanıtlar `GroupDMConversationResponseSchema.parse` ile doğrulanır.
Yol parçaları `encodeURIComponent` ile kaçırılır.

`useMobileGroupMutations` dört mutation döner (`create`, `addMembers`, `update`,
`removeMember`); **hepsi** `onSuccess`'te `mobileQueryKeys.dmConversations()`
invalidate eder. Her grup mutasyonu gelen kutusu satırının başlığını, avatar
yığınını ve üye sayısını değiştirir — invalidation atlanırsa satır bayat kalır.

`MobileApiClient`'ın gerçek metot adlarını `apps/mobile/src/api/mobile-api-client.ts`
içinden doğrula. `mobileQueryKeys` import yolunu
`grep -rn "mobileQueryKeys" apps/mobile/src/realtime/realtime-query-bridge.ts` ile bul.

### 15.2 `apps/mobile/src/app/screens/group-create-screen.tsx`

Tam ekran rota, modal değil — klavye davranışı `MobileChatKeyboardRegion` deseniyle
ekran seviyesinde zaten çözülü. Test edilebilirlik için `friends`, `onSubmit`,
`onCreated`, `onCancel` proplarını dışarıdan alır; rota kaydı bunları
`useMobileFriendsQuery` + `useMobileGroupMutations` ile doldurur.

Durum **yalnızca** Görev 14 modelinden gelir — ekranda kopya seçim/sınır mantığı
yazılmaz:

```tsx
import {
  canAdvanceToIdentity,
  canSubmitGroup,
  createInitialGroupCreateState,
  getGroupSelectionCount,
  isGroupSelectionFull,
  toGroupCreateRequest,
  toggleGroupMember,
  type GroupCreateState,
} from "@wizards/types";

const [state, setState] = useState<GroupCreateState>(createInitialGroupCreateState);
```

Sözleşme:

| testID                                  | Davranış                                                                                                                                |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `mobile-group-create-friend-<userId>`   | seçilebilir satır; `accessibilityState.selected` seçimi yansıtır; doluyken seçili olmayanlar `disabled`                                 |
| `mobile-group-create-selected-<userId>` | seçilenler çip şeridi; basınca seçimden çıkarır                                                                                         |
| `mobile-group-create-counter`           | `copy.groupCreateCounter`'daki `{count}` = `getGroupSelectionCount(state)`                                                              |
| `mobile-group-create-next`              | `disabled = !canAdvanceToIdentity(state)`; basınca `step = "identity"`                                                                  |
| `mobile-group-create-back`              | kimlik adımından üye adımına döner, **seçimi korur**                                                                                    |
| `mobile-group-create-name-input`        | yalnızca kimlik adımı; `maxLength={GROUP_DM_NAME_MAX_LENGTH}`                                                                           |
| `mobile-group-create-photo`             | yalnızca kimlik adımı; foto seçiciyi açar                                                                                               |
| `mobile-group-create-submit`            | `disabled = !canSubmitGroup(state) \|\| isPending`; `onSubmit(toGroupCreateRequest(state, iconUrl))` sonra `onCreated(conversation.id)` |

Stiller `useDmScreenStyles()`'a eklenir; mevcut ekranların token kullanımını
(`theme.messaging.*`, `msg.avatar.*`) izler. Ham renk yazılmaz.

### 15.3 Rota kaydı

`grep -rn "name=\"DirectMessage\"" apps/mobile/src` ile kök stack dosyasını bul,
`GroupCreate` ekranını aynı biçimde kaydet. `onCreated` içinde:

```tsx
mobileNavigationRef.navigate("DirectMessage", { conversationId });
```

Oluşturma sonrası gelen kutusuna düşmeden doğrudan yeni sohbete gidilir.

### 15.4 Testler

`mobile-group-create.test.tsx`'e eklenir: iki seçim olmadan "İleri" kapalı ·
kimlik adımına geçip geri dönünce seçim korunuyor · kırpılmış ad ve seçili id'lerle
`onSubmit` çağrılıyor, ardından `onCreated(conversationId)`.

---

## Görev 16 — Sistem mesajı satırı

### 16.1 Mesaj yükü genişlemesi

`packages/types/src/socket.ts`, `DMMessagePayloadSchema` ve `DMMessagePayload`:

```ts
systemType: DMSystemMessageTypeSchema.nullable().default(null),
systemTargetUserIds: z.array(z.string()).default([]),
systemValue: z.string().nullable().default(null),
```

`apps/web/src/lib/dm/service.ts`, `mapDMMessagePayload` üç alanı satırdan doldurur.
`dmMessageInclude` değişmez — `include` tüm skaler alanları getiriyor.

**§5 kuralı devrede.** Bu değişiklik mobil fixture'larını kırabilir; hepsini onar.

### 16.2 `apps/mobile/src/dm/group-system-message-copy.ts`

```ts
export type GroupSystemMessageLabels = {
  readonly actorSelf: string;
  readonly added: string;
  readonly created: string;
  readonly iconChanged: string;
  readonly left: string;
  readonly nameChanged: string;
  readonly removed: string;
};

export function formatGroupSystemMessage(input: {
  readonly actorName: string;
  readonly isActorSelf: boolean;
  readonly labels: GroupSystemMessageLabels;
  readonly systemType: DMSystemMessageTypeValue | null;
  readonly systemValue: string | null;
  readonly targetNames: readonly string[];
}): string;
```

`systemType` null ise `""` döner (istemci hiçbir şey çizmez). Şablondaki
`{actor}` / `{targets}` / `{value}` yer tutucuları doldurulur; aktör mevcut
kullanıcıysa adı yerine `labels.actorSelf` kullanılır. Hedefler `", "` ile birleşir.

Testler (5): oluşturma · "Sen" ikamesi · çoklu hedef · yeniden adlandırmada
`{value}` · `systemType: null` → `""`.

### 16.3 `apps/mobile/src/app/components/dm-system-message-row.tsx`

Akışta ortalanmış sönük hap. `testID="mobile-dm-system-message"`.
Balon yok, avatar yok, zaman damgası yok, uzun-basma menüsü yok, tepki yok.
`formatGroupSystemMessage` `""` döndürürse `null` render eder.

`apps/mobile/src/app/screens/dm-conversation-screen.tsx` mesaj render dalında,
normal balondan **önce**:

```tsx
if (message.systemType) {
  return (
    <DMSystemMessageRow
      message={message}
      currentUserId={currentUserId}
      participants={participants}
    />
  );
}
```

Hedef adları `participants` listesinden `systemTargetUserIds` ile çözülür;
listede olmayan bir id **atlanır** (boş isim basılmaz).

---

## Görev 17 — Grup detay ekranı ve realtime bağlantısı

### 17.1 Detay ekranı grup kolu

`grep -rn "mobile-dm-details" apps/mobile/src` ile mevcut DM detay ekranını bul.

Grupta **gösterilir:** grup adı + fotoğrafı (sahipse düzenlenebilir), üye listesi
(avatar + ad + sahip rozeti), "Üye ekle" (yalnızca sahip), üye satırında çıkar
(yalnızca sahip), "Gruptan ayrıl" (herkes), sessize al, sohbeti gizle, ortak medya.

Grupta **gizlenir:** ortak sunucular bloğu, 1:1 profil blokları, sesli/görüntülü
arama düğmeleri (grup araması kapsam dışı).

Veri Görev 11'in genişlettiği `MobileDMDetailsResponseSchema`'dan gelir:
`members[]` (her biri `isOwner` taşır) ve `ownerId`.

testID sözleşmesi: `mobile-group-add-member`, `mobile-group-remove-user-<id>`,
`mobile-group-leave`.

### 17.2 Realtime köprüsü

`apps/mobile/src/realtime/realtime-query-bridge.ts`, mevcut
`dm:conversation:updated` işleyicisinin yanına:

- `dm:conversation:created` → `dmConversations()` + `bootstrap()` invalidate
- `dm:conversation:members_changed` → `dmConversations()` + o sohbetin detay
  anahtarı invalidate
- `dm:conversation:removed` → `dmConversations()` + `bootstrap()` invalidate,
  **artı** o sohbet açıksa gelen kutusuna geri navigasyon

Sonuncusu şart: çıkarılan üyenin açık sohbeti kalırsa istemci sunucunun artık 403
döndüğü bir sohbeti yoklamaya devam eder.

### 17.3 Testler

`apps/mobile/component-tests/mobile-group-details.test.tsx`:

| Test                      | Beklenen                                                                                       |
| ------------------------- | ---------------------------------------------------------------------------------------------- |
| Sahip görünümü            | `mobile-group-add-member` ve `mobile-group-remove-user-<id>` görünür                           |
| Üye görünümü              | ikisi de render edilmez; `mobile-group-leave` görünür                                          |
| Sahip rozeti              | `ownerId` ile eşleşen satır `copy.groupOwnerBadge` taşır                                       |
| Ortak sunucular           | grupta render edilmez                                                                          |
| Ayrılma onayı             | onaylanınca `removeMember` mutation'ı `{ conversationId, userId: currentUserId }` ile çağrılır |
| `dm:conversation:removed` | açık grup kapanır                                                                              |

---

## Faz 5 kabul kriterleri

- [ ] `+` butonu yalnızca Sohbetler sekmesinde; kalem butonu bozulmamış
- [ ] `GroupCreate` rotası + deep link kayıtlı, ekran Görev 15'te bağlanmış
- [ ] 26 kopya anahtarı tr + en'de mevcut
- [ ] Seçim modeli `packages/types`'ta, 10 test, mobil ekran onu import ediyor
- [ ] Oluşturma ekranı sözleşmedeki 8 testID'yi karşılıyor
- [ ] `DMMessagePayload` üç sistem alanını taşıyor, sunucu dolduruyor
- [ ] Sistem mesajı satırı 6 tipin hepsini yerelleştirilmiş çiziyor
- [ ] Grup detay ekranı sahip/üye ayrımını uyguluyor, `getMobileDMDetails` 404 atmıyor
- [ ] Üç realtime olayı invalidate ediyor; `removed` açık sohbeti kapatıyor
- [ ] `pnpm --filter @wizards/mobile test` + `test:components` + `typecheck` yeşil
- [ ] `pnpm --filter @wizards/types test` + `@wizards/web test` regresyonsuz
- [ ] En az iki deliberate-failure kanıtı: (a) seçim tavanının 31'de kilitlendiği,
      (b) `dm:conversation:removed` olayının açık sohbeti kapattığı

## Rapor

Görev başına bir dosya: `.superpowers/sdd/groupdm/task-13-report.md` … `task-17-report.md`.
