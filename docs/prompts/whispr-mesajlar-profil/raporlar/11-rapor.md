# Dalga 3 · Ş9 — Başlık menüleri, sessize alma, toast şeridi · rapor

**Tarih:** 2026-08-27 · **Dal:** `uat` · **Durum:** şerit bitti, kendi kapısı yeşil. Commit atılmadı.

## Kapı

| Komut                                                                                                                                                                                                            | Sonuç                                        |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Şeridin 5 test dosyası (`--test-force-exit`, sahte `DATABASE_URL`)                                                                                                                                               | **80 / 80**                                  |
| + komşular (`mention-card-menu`, `audit-budget`, `test-runner-coverage`, `composer-contract`, `server-channel-frame`, `profile-pinned-list`, `desktop/context-menu`, `shortcuts/catalog`, `messages-side-panel`) | **104 / 104** ve **82 / 82** (iki ayrı koşu) |
| `pnpm --filter @wizards/web typecheck`                                                                                                                                                                           | Bu şeridin dosyalarında **0 hata**           |
| `npx eslint` (dokunulan 12 dosya)                                                                                                                                                                                | temiz                                        |
| `npx prettier --check` (dokunulan 12 dosya)                                                                                                                                                                      | temiz                                        |

Tam süit koşulmadı (kardeş şeritler paralel).

**Kapıda kalan tek typecheck hatası benim değil:**
`apps/web/src/lib/dm/group-service.ts(1343,38)` — `writeOwnParticipant`'a `mutedUntil: null`
veriliyor ama `ParticipantWriteDependencies`'in yazma tipi o kolonu taşımıyor. Satır
`git diff`'te **yeni** ve dosya benim yazma listemde değil (Ş8'in bildirim yolu). Şerit
başlarken `add-members-modal.tsx` (Ş10) da üç hata veriyordu; onlar şerit koşarken kendiliğinden
düzeldi.

---

## 1. Ana oturumun bağlaması gereken prop'lar — tam imza

`dm-conversation-page.tsx` bu şeride **kapalıydı** (Dalga 2 Ş5 o dosyayı yeniden yazıyordu),
bu yüzden dört bileşen de saf **prop tabanlı** yazıldı: hiçbiri istek atmaz, hiçbiri kendi
durumunu tutmaz. Aşağıdaki üç bağlantı yapılmadan menü ekranda **görünmez**.

### 1.1 `ConversationHeader` — üç yeni yuva (dosya yazıldı, prop'lar hazır)

```ts
// apps/web/src/components/messages/conversation-header.tsx
export type ConversationHeaderProps = {
  // …mevcut alanlar değişmedi…
  /** §17 menüsü. Başlık menüyü çizmez, ona `position:relative` bir yuva açar. */
  moreMenu?: React.ReactNode;
  /** `...` butonunun vurgusu + `aria-expanded` + `aria-haspopup="menu"`. */
  moreOpen?: boolean;
  muted?: boolean;
  mutedUntil?: string | null | undefined;
  /** Test tohumu; verilmezse `new Date()`. */
  now?: Date | undefined;
  /** Pill'in tek eylemi. Gövdeyi `UNMUTE_REQUEST_BODY` verir. */
  onUnmute?: (() => void) | undefined;
};
```

### 1.2 `ChatArea` — geçiş yolu **eksik** (ana oturumun ekleyeceği tek kod)

`chat-area.tsx` bu şeritte **yalnız toast şeridinin yerleştirilmesi** için açıktı, o yüzden
başlık menüsünün geçiş prop'ları eklenmedi. Bugün `ChatArea` başlığı kendisi çiziyor
(`chat-area.tsx` ~L1194) ve yukarıdaki dört yuvayı **iletmiyor**. Eklenecek olan tam olarak
şu — `ChatAreaProps`'a:

```ts
  /** §17 menüsü, başlığın yuvasına iletilir. */
  conversationMoreMenu?: React.ReactNode;
  conversationMoreOpen?: boolean;
  conversationMuted?: boolean;
  conversationMutedUntil?: string | null;
  onUnmuteConversation?: (() => void) | undefined;
```

ve `<ConversationHeader …>` çağrısına:

```tsx
  moreMenu={conversationMoreMenu}
  moreOpen={conversationMoreOpen ?? false}
  muted={conversationMuted ?? false}
  mutedUntil={conversationMutedUntil ?? null}
  onUnmute={onUnmuteConversation}
```

**`onOpenMore` zaten var ve zaten bağlı** (`onOpenDirectMessageDetails`); anlamı
`dispatch({ menu: { kind: "conversationMore" }, type: "openMenu" })` olmalı. Ş5 o satıra
bilerek bir yorum bırakmış: _"Ş9 buraya §17'nin `...` menüsünü koyacak"_
(`dm-conversation-page.tsx` L271-273). Dar görünümdeki `openDetailsDrawer` dalı **korunmalı**:
menü 254/262 genişliğinde bir masaüstü yüzeyi, çekmece dar görünümün cevabı.

### 1.3 Toast — **bağlandı**, yalnız iki prop veriliyor

`chat-area.tsx` şeridi zaten çiziyor; ana oturum yalnız kaydı geçirecek:

```ts
  conversationToast?: ConversationToast | null;          // state.toast
  onDismissConversationToast?: (() => void) | undefined; // () => dispatch({ type: "dismissToast" })
```

Zamanlayıcıyı `useConversationToast` kurar (aşağıda). `ChatArea` zamanlayıcı **tutmaz**.

### 1.4 `ConversationMoreMenu` — tam imza

```ts
// apps/web/src/components/messages/conversation-more-menu.tsx
export type ConversationMoreMenuProps = {
  avatarColor?: string | null | undefined; // grup karosu; swatch ADI, hex değil
  avatarUrl?: string | null | undefined; // DM avatarı
  handle?: string | null | undefined; // DM alt satırı `@selin`
  memberCount?: number | undefined; // grup alt satırı + `Üyeleri görüntüle` sayacı
  muteDuration?: ConversationMuteDuration | null | undefined; // alt menüde seçili satır
  muteSubmenuOpen?: boolean; // state.menu?.kind === "muteSubmenu"
  name: string;
  onAddMembers?: (() => void) | undefined; // Ş10 modalı → openModal { kind: "invite" }
  onArchive?: (() => void) | undefined; // DELETE /api/v1/dm/[id]  (hiddenAt)
  onBlockUser?: (() => void) | undefined; // Ş8'in engelleme akışı
  onClearHistory?: (() => void) | undefined; // DELETE /api/v1/dm/groups/[id]/history
  onClose: () => void; // () => dispatch({ type: "closeMenu" })
  onDeleteGroup?: (() => void) | undefined; // DELETE /api/v1/dm/groups/[id]
  onEditGroup?: (() => void) | undefined; // yoksa onOpenProfile("ayarlar")
  onExportConversation?: (() => void) | undefined; // VERİLMEZSE satır çizilmez (bkz. §3)
  onLeaveGroup?: (() => void) | undefined;
  onMarkUnread?: (() => void) | undefined; // PATCH /api/v1/dm/[id]/unread
  onOpenPins?: (() => void) | undefined; // sabitlenenler sayfası
  onOpenProfile: (tab: ProfilePanelTab) => void; // dispatch({ tab, type: "openProfile" })
  onReportUser?: (() => void) | undefined; // POST /api/v1/users/[userId]/report (Ş4)
  onSelectMuteDuration: (duration: ConversationMuteDuration) => void;
  onToggleMuteSubmenu: () => void; // dispatch({ type: "openMuteSubmenu" })
  open: boolean; // state.menu?.kind === "conversationMore" || "muteSubmenu"
  pinnedCount?: number | undefined; // `Sabitlenen mesajlar` sayacı
  presence?: MessagesPresence | undefined; // DM alt satırı; varsayılan "offline"
  role?: DMParticipantRole | undefined; // rol kapısı; varsayılan "MEMBER"
  variant: "dm" | "group";
};
```

**`open` iki kipi birden kapsar.** Alt menü açıkken `state.menu.kind` `"muteSubmenu"` olur ve
menünün kendisi hâlâ ekrandadır; `open` yalnız `"conversationMore"`a bakarsa alt menü açıldığı
anda menü kaybolur. Doğrusu:

```ts
const moreOpen = state.menu?.kind === "conversationMore" || state.menu?.kind === "muteSubmenu";
```

### 1.5 Ana oturumun yazacağı bağlantı — kopyalanabilir hâli

```tsx
const moreOpen = state.menu?.kind === "conversationMore" || state.menu?.kind === "muteSubmenu";
const toastController = useConversationToast({ dispatch, toast: state.toast });
const pillDuration = resolveMutePillDuration(
  { muted: state.muted, mutedUntil: state.mutedUntil },
  new Date(),
);

const setMuted = useMutation({
  mutationFn: (body: SetMutedRequest) =>
    setConversationMutedRequest(activeConversation.id, body),   // Ş4'ün köprüsü
  onError: () => toastController.show({ kind: "actionFailed", tone: "danger" }),
  onSuccess: (result, body) => {
    dispatch({ muted: result.muted, mutedUntil: result.mutedUntil, type: "setMute" });
    toastController.show(
      body.muted === false
        ? { kind: "muteCleared", tone: "success" }
        : body.duration === "forever"
          ? { kind: "mutedForever", tone: "success" }
          : { kind: "mutedFor", params: { duration: body.duration ?? "forever" }, tone: "success" },
    );
  },
});

<ChatArea
  …
  conversationToast={state.toast}
  onDismissConversationToast={toastController.dismiss}
  conversationMoreOpen={moreOpen}
  conversationMuted={state.muted}
  conversationMutedUntil={state.mutedUntil}
  onUnmuteConversation={() => setMuted.mutate(UNMUTE_REQUEST_BODY)}
  onOpenDirectMessageDetails={
    responsiveLayout.shouldMountInfoDrawer
      ? () => dispatch({ type: "openDetailsDrawer" })
      : () => dispatch({ menu: { kind: "conversationMore" }, type: "openMenu" })
  }
  conversationMoreMenu={
    <ConversationMoreMenu
      handle={otherParticipant?.username ?? null}
      memberCount={activeConversation.memberCount}
      muteDuration={pillDuration}
      muteSubmenuOpen={state.menu?.kind === "muteSubmenu"}
      name={title}
      onAddMembers={() => dispatch({ modal: { kind: "invite" }, type: "openModal" })}
      onClose={() => dispatch({ type: "closeMenu" })}
      onOpenProfile={(tab) => dispatch({ tab, type: "openProfile" })}
      onSelectMuteDuration={(duration) => setMuted.mutate(muteRequestBody(duration))}
      onToggleMuteSubmenu={() => dispatch({ type: "openMuteSubmenu" })}
      open={moreOpen}
      pinnedCount={pins.length}
      presence={presence}
      role={state.role}
      variant={conversationKind}
    />
  }
/>
```

`muteRequestBody` / `UNMUTE_REQUEST_BODY` / `resolveMutePillDuration` üçü de
`@/components/messages/mute-submenu` içinden gelir; gövdeyi elle kurma — `Süresiz`in
`{ duration: "forever", muted: true }` olduğu tek yerde yazılı.

---

## 2. `ConversationToast` — imza ve danger sözleşmesi

```ts
// apps/web/src/components/messages/conversation-toast.tsx
export function ConversationToastStrip(props: {
  onDismiss: () => void;
  toast: ConversationToast | null | undefined;
}): JSX.Element | null;

export function resolveToastCopy(toast: ConversationToast): {
  key: string;
  params: Record<string, number | string> | undefined;
  tone: "success" | "danger";
};
```

```ts
// apps/web/src/hooks/use-conversation-toast.ts
export function useConversationToast(options: {
  dispatch: (action: MessagesScreenAction) => void;
  timers?: ConversationToastTimers | undefined; // test tohumu
  toast: ConversationToast | null;
}): {
  dismiss: () => void;
  show: (toast: ConversationToast) => void;
  toast: ConversationToast | null;
};

export function scheduleToastDismiss(
  toast: ConversationToast | null | undefined,
  dismiss: () => void,
  timers?: ConversationToastTimers,
  delayMs?: number, // varsayılan MESSAGES_METRICS.toast.autoCloseMs
): () => void; // temizleyici
```

### Danger tonu: kırmızı bir başarı cümlesi basılmaz

`resolveToastCopy` iki eşleme yapıyor ve ikisi de **kayda değer**:

| Gelen kayıt                                   | Basılan cümle                     |
| --------------------------------------------- | --------------------------------- |
| `{ kind: "inviteCopied", tone: "danger" }`    | `messages.toast.copyFailed`       |
| başka her başarı kipi + `tone: "danger"`      | `messages.toast.actionFailed`     |
| `copyFailed` / `actionFailed`                 | kendi cümlesi (kip zaten hata)    |
| `{ kind: "membersAdded", params: { count } }` | `messages.toast.membersAddedMany` |

**Ş7'nin düzeltmesi gerekiyor.** `profile-invite-link-card` / `copyInviteLink` kopyalama
reddedilince hâlâ `{ kind: "inviteCopied", tone: "danger" }` gönderiyor (09-rapor §2, "Ş9'un
borcu"). Dalga 0 o borcu **kapattı**: `ConversationToastKindSchema` artık `copyFailed` ve
`actionFailed` taşıyor, iki sözlükte de karşılıkları var. Şerit bugünkü kaydı tolere ediyor,
ama doğru düzeltme kaynakta: `dangerToast("copyFailed")`.

**Ş8'in de aynı borcu var.** `profile-tab-settings.tsx`'teki `dangerToast(...)` ve
`notifyFailureToast(...)` hata yollarında `mutedForever` / `muteCleared` / `userBlocked` /
`historyCleared` / `groupDeleted` / `groupLeft` / `reportSent` kiplerini danger tonuyla
gönderiyor — hepsi kırmızı bir **başarı** cümlesi olurdu. Şerit hepsini `actionFailed`e
düşürüyor; kaynak düzeltilirse `notifyFailureToast` tek satıra iner:
`dangerToast("actionFailed")`. Ş7/Ş8'in kodu düzeldiğinde bu eşleme **kalabilir** — eşleme bir
yedek, bir yol değil.

### `{duration}` parametresi bir kayıt taşır, cümle değil

`{ kind: "mutedFor", params: { duration: "8h" } }` gönderilir; şerit `8h`i
`messages.more.mute.8h` üzerinden çevirip `8 saat boyunca sessize alındı` basar. Toast'ı
üreten yerin sözlüğe erişmesi gerekmiyor ve İngilizce sözlükte `8 hours` yazan bir şerit aynı
kayıttan doğuyor. Süre kaydı `ConversationMuteDurationSchema` ile doğrulanıyor; başka bir dize
gelirse aynen basılır.

---

## 3. `Sohbeti dışa aktar` — karşılığı **yok**, satır **gizlendi**

Arandı ve bulunamadı: üründe sohbet başına döküm üreten bir uç yok.

- `GET /api/v1/users/me/data-export` **var** ama hesabın tamamını verir; ne parametre alır ne
  de bir `conversationId` okur (`lib/account/account-data-export-stream.ts` içinde
  `conversationId` yalnız bir `select` alanı).
- `lib/dm/**`, `app/api/v1/dm/**` ve mobil karşılıklarında `export` / `transcript` /
  `download` adında bir yol yok.

**Karar:** satır pasif çizilmiyor, **hiç çizilmiyor** ve toast basmıyor. Yapamadığı bir şeyi
vaat eden bir satır, gri de olsa, kullanıcıya o özelliğin var olduğunu söyler.

Geri gelmesi tek satır: `ConversationMoreMenu`'ye `onExportConversation` verildiği anda satır
**ve ikinci ayırıcı** kendiliğinden geri gelir (`buildDmMenuEntries({ exportEnabled: true })`).
İki testi de yazılı. `messages.more.dm.export` ve `messages.toast.exportStarted` anahtarları
sözlükte duruyor, silinmedi.

---

## 4. `ContextMenu`'ye eklenen varyant

`components/ui/context-menu.tsx` **API'si bozulmadan** büyüdü; mevcut üç çağıran
(`friend-row-menu`, `channel-sidebar`, `server-rail`, `wizards-shell`, `event-reminder-strip`)
hiç değişmedi.

```ts
type ContextMenuProps = {
  children: React.ReactNode;
  onClose: () => void;
  open: boolean;
  position?: { x: number; y: number }; // artık opsiyonel
  placement?: "viewport" | "anchor"; // YENİ, varsayılan "viewport"
  className?: string; // YENİ
  style?: React.CSSProperties; // YENİ
  label?: string; // YENİ — anchor kabuğunun aria-label'ı
  testId?: string; // YENİ
};

type ContextMenuItemProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  destructive?: boolean;
  ref?: React.Ref<HTMLButtonElement>; // YENİ
};

export function ContextMenuSeparator(props?: {
  // YENİ — ikisi de opsiyonel
  className?: string;
  style?: React.CSSProperties;
}): JSX.Element;
```

Dört davranış değişikliği, hepsi genişletme:

1. **`placement: "anchor"`** — portal **yok**. Menü `position:relative` bir sarmalayıcının
   içinde `absolute` çizilir; yüzeyi (genişlik, yarıçap, gölge, zemin) `className` / `style`
   ile dışarıdan gelir. §17 menüyü tetikleyiciye `top:41; right:0` ile bağlıyor ve görünüm
   alanına portallanan bir kabuk bunu ancak koordinat matematiğiyle taklit edebilirdi —
   pencere yeniden boyutlandığında da kayardı. **Yan fayda:** anchor kolu `document` kontrolüne
   girmediği için **sunucuda da çizilir**, yani menü statik işaretlemeyle sınanabiliyor.
   (`MentionCardMenu` aynı sorunda kabuğu tamamen reddetmişti — 09/mentions raporu; o dosya
   isterse artık bu varyanta taşınabilir, ayrı iş.)
2. **Menü öğesi seçicisi genişledi** — `[role="menuitem"]` yerine
   `menuitem` + `menuitemradio` + `menuitemcheckbox`. Alt menünün süre satırları
   `menuitemradio` (seçili süre `aria-checked` ile duyuruluyor) ve dar seçici onları `Tab`
   turunun dışında bırakırdı.
3. **Ok tuşlarıyla gezinme** — `ArrowUp` / `ArrowDown` artık `Tab` / `Shift+Tab` ile aynı
   halkayı sürüyor. `role="menu"` bunu vaat ediyor; yalnız `Tab` çalıştığında kullanıcı ilk
   okta menünün ölü olduğunu sanıyordu. Her menüye bedavaya geldi.
4. `ContextMenuSeparator` artık `className` / `style` alıyor — §17'nin ayırıcısı
   `--border/0.6` düz çizgi, kabuğun varsayılan gradyanı değil.

---

## 5. Toast zamanlayıcısının temizlenme yolu

```
useConversationToast
  └─ useEffect(() => scheduleToastDismiss(toast, dismiss, timers), [dismiss, timers, toast])
                                                        └─ () => timers.clearTimer(handle)
```

- **Bağımlılık kaydın kendisi**, "toast var mı" değil. Yeni toast eskisinin yerini aldığında
  efekt yeniden koşar, eski zamanlayıcı temizlenir, yeni şerit **tam** beş saniye yaşar. Yalnız
  varlığa bağlansaydı ikinci toast birincinin artakalan süresini devralırdı.
- **`null` kayıt zamanlayıcı kurmaz.** Kurulsaydı beş saniye sonra tetiklenen `dismissToast`
  o arada gelen yeni şeridi düşürürdü.
- **Söküldüğünde temizlenir** — efektin dönüş değeri `clearTimeout`.
- **`unref` varsa çağrılıyor** (`DEFAULT_CONVERSATION_TOAST_TIMERS.startTimer`). Dalga 1
  entegrasyon raporunun 2. ölçüm tuzağı tam buydu: `privacy-service.test.ts`'in açık handle'ı
  izole koşuyu `--test-force-exit` olmadan astı. Tarayıcıda `unref` yok ve kontrol sessizce
  atlanır.
- **Şeridin kendi testleri hiç gerçek zamanlayıcı kurmuyor** (`ConversationToastTimers` sahte
  saatle enjekte ediliyor), yani bu süit hiçbir handle bırakmıyor.
- **Görünüm/sohbet değişince temizlik reducer'ın**: `openConversation`, `openFriends` ve
  `openEmpty` `toast: null` yazıyor. Kanca ikinci bir kopya tutmuyor — tutsaydı o kuralla
  anında ayrışırdı.

---

## 6. Kardeş şeritlerin bilmesi gerekenler

1. **`components/ui/context-menu.tsx`'e dokunuldu** ve o dosya hiçbir şeridin sahiplenme
   listesinde değildi. Değişiklikler yukarıda (§4); hepsi geriye dönük uyumlu ve mevcut beş
   çağıranın testleri (`mention-card-menu`, `shortcuts/catalog`, `desktop/context-menu`) yeşil.
   Aynı dosyaya dokunan başka bir şerit varsa **birleştirirken** `MENU_ITEM_SELECTOR`,
   `placement` kolu ve `handleMenuKeyDown`'un ok tuşu dalı korunmalı.

2. **`Esc` sırası menünün kendi yakalama-fazı dinleyicisinde.** `ConversationMoreMenu` açıkken
   `window`a `keydown` **capture** dinleyicisi kuruluyor ve `Escape`'i `stopPropagation` ile
   durduruyor: alt menü açıksa yalnız alt menü kapanır ve odak `Sessize al` satırına döner,
   değilse yalnız menü kapanır. Kabuğun kendi `Esc`i (kabarma fazı, `window`) ve arkadaki
   panelin `Esc`i o tuşu **hiç görmez** — bir tuş bir katman. Panel/modal tarafında `Esc`
   dinleyen bir şerit bunu bilsin: menü açıkken `Esc` size ulaşmaz, ve bu bilerek.

3. **`ChatArea`'nın iki yeni prop'u** (`conversationToast`, `onDismissConversationToast`)
   opsiyonel; verilmezse şerit hiç çizilmez ve bugünkü davranış birebir korunur.
   `mode === "dm"` kapısının arkasında — kanal başlığının altında toast **yok** (SPEC §17 DM
   yüzeyinin şeridi).

4. **Toast, sabitlenen şeridin ÜSTÜNDE.** `chat-area.tsx`te başlıkla `messages-screen-root`
   arasına kondu; sabitlenen şerit `messageConversationContent` içinde, yani sıra
   `başlık → toast → sabitlenen → liste`. `SPEC_DEVIATIONS` yorumu bunu zaten kayda geçirmişti
   (Ş0.1 sapma #2), kod ona uyuyor.

5. **`Grup adını ve rengini düzenle` `onOpenProfile("ayarlar")` çağırıyor** — `dc.html` de o
   satırı `openSettings`e bağlıyor. Ayrı bir kanca isteyen (`onEditGroup`) verirse o kazanır.
   §10'un dört satırlık listesinde bu satır **yok**, o yüzden `PROFILE_TAB_ACTIONS` haritasında
   da yok; davranış varsayılan, sözleşme değil.

6. **`isProfileAdminRole` `profile-panel-identity.tsx`ten import ediliyor** (Ş5/Ş6'nın dosyası,
   dışa aktarılmış). "Sahip de yöneticidir" kuralının tek kaydı orası; ikinci bir kopya
   yazmadım. `canDeleteGroup` (yalnız `OWNER`) bu şeridin kendi kapısı, çünkü Ş2'nin kuralı
   ondan ayrı.

7. **Presence etiketi haritası ikinci kez yazıldı.** `profile-panel-identity.tsx` aynı dört
   anahtarı (`home.presence.dnd/idle/online` + `home.friends.offline`) satır içi bir sabitte
   taşıyor ve **dışa aktarmıyor**; o dosya yazma listemde değildi. Birleştirmesi tek satır
   (`export const PRESENCE_LABEL_KEY`), aynı kişinin durumu iki yüzeyde farklı yazılmasın diye
   değerler birebir aynı tutuldu.

8. **`ConversationMoreMenu` hiçbir istek atmıyor ve hiçbir React Query anahtarına dokunmuyor.**
   Sayaçlar (`memberCount`, `pinnedCount`) prop; verilmezse satır sayaçsız çizilir. `dc.html`in
   `5` ve `2`si örnek veriydi ve koda sabit olarak **girmedi**.

9. **`membersAddedMany` artık tüketiliyor.** Ş10 üye ekleme toast'ını
   `{ kind: "membersAdded", params: { count: <ek kişi sayısı>, name: <ilk isim> } }` diye
   gönderirse şerit çoğul cümleyi basar; `count` yoksa tekil cümle. Kip tek, cümle iki.

10. **Pill'in süresi türetiliyor, saklanmıyor.** Seçilen süreyi tutan bir kolon yok
    (`DMParticipant` yalnız `muted` + `mutedUntil`), o yüzden `resolveMutePillDuration` kalan
    süreyi **en küçük yeterli** basamağa yuvarlıyor: 7 saat kalan bir sessizlik `8 saat sessiz`
    der. Pill hiçbir zaman gerçekte olduğundan uzun bir süre vaat etmez. Karar noktası hâlâ
    `isMuteActive`; başlıkta ikinci bir tarih karşılaştırması yok.

11. **Şerit `packages/types`, `metrics.ts`, `tr.ts`, `en.ts`, `messages-screen.ts`,
    `lib/dm/**`, `apps/mobile/**` dosyalarının hiçbirine dokunmadı.** Yeni metin yazılmadı —
    Dalga 0'ın koyduğu 30 anahtar (`messages.more.*`, `messages.toast.*`) olduğu gibi
    tüketildi ve her kipin iki sözlükte de karşılığı olduğu testle sabitlendi.

---

## 7. Yazılan dosyalar

| Dosya                                                              | Durum                                |
| ------------------------------------------------------------------ | ------------------------------------ |
| `apps/web/src/components/messages/conversation-more-menu.tsx`      | yeni                                 |
| `apps/web/src/components/messages/conversation-more-menu.test.tsx` | yeni                                 |
| `apps/web/src/components/messages/mute-submenu.tsx`                | yeni                                 |
| `apps/web/src/components/messages/mute-submenu.test.tsx`           | yeni                                 |
| `apps/web/src/components/messages/conversation-toast.tsx`          | yeni                                 |
| `apps/web/src/components/messages/conversation-toast.test.tsx`     | yeni                                 |
| `apps/web/src/hooks/use-conversation-toast.ts`                     | yeni                                 |
| `apps/web/src/hooks/use-conversation-toast.test.ts`                | yeni                                 |
| `apps/web/src/components/messages/conversation-header.tsx`         | pill + menü yuvası (düzen değişmedi) |
| `apps/web/src/components/messages/conversation-header.test.tsx`    | 10 yeni test                         |
| `apps/web/src/components/chat/chat-area.tsx`                       | toast şeridinin yeri + iki prop      |
| `apps/web/src/components/ui/context-menu.tsx`                      | `anchor` varyantı (§4)               |

---

## 8. Açık kalan

1. **§1.2'nin geçiş prop'ları** — `ChatArea` başlık menüsünü henüz iletmiyor. Bu yapılmadan
   `...` düğmesi eski anlamını (paneli aç/kapat) taşımaya devam eder ve menü ekranda görünmez.
   Ana oturumun işi; `chat-area.tsx` bu şeride yalnız toast için açıktı.
2. **Ş7 ve Ş8'in danger toast kaynakları** — §2'deki iki borç. Şerit tolere ediyor, kaynak
   yanlış kip göndermeye devam ediyor.
3. **Ekranda görsel doğrulama yapılamadı** — menü canlı bir sohbetten açılmadan çizilmiyor ve
   §1.2 bağlanmadan o yol kapalı. 1360×920 koyu/açık tema kontrolü Ş11'e devrediliyor;
   ölçülerin tamamı `MESSAGES_METRICS.moreMenu` / `.toast` üzerinden okunuyor ve testlerle
   sabitlendi.
4. **`lib/dm/group-service.ts:1343` typecheck hatası** — Ş8'in yeni `mutedUntil` yazımı,
   `ParticipantWriteDependencies` tipi genişletilmeli. Benim dosyam değil.
