# 00 — Ortak bağlam (Bahsedilmeler)

**Bu dosya uygulanmaz, okunur.** Her şerit işe başlamadan önce buradaki gerçekleri, kararları ve
tuzakları bilir. Şeritler arası her çelişki burada çözülür.

---

## 1. Kapsam sınırı

Uygulanacak: **bahsetme rayı (276)** + **bahsetme akışı** + **bağlam paneli (326)** +
**bildirim ayarları modalı (496)** + **boş durum**, ve bunları besleyen **yazma/okuma katmanı**.

Dokunulmayacak: sunucu rayı (74), gezinme paneli (228), sol alttaki kullanıcı barı. Bunlar
`WizardsShell` içinde hazır. Bu ekranın onlara değen **tek** noktası:

- Gezinme panelindeki `Bahsedilmeler` satırı bu rotada aktif (zaten `app-nav-panel.tsx` yapıyor).
- Aynı satırdaki sayaç okunmamış bahsetme sayısını gösterir ve Mesajlar sayacıyla **aynı
  kaynaktan** okunur (`useUnreadCounters` → `homeQueryKeys.summary`).

Diff bu iki noktanın dışında sol tarafa dokunuyorsa şerit hatalıdır.

---

## 2. Doğrulanmış gerçekler (kodda okundu, tahmin değil)

### 2.1 Kabuk

- `apps/web/src/lib/home/third-column.ts` → `selectThirdColumn(pathname)` kabuğun **3. sütununu**
  seçer: `"messages"` · `"channels"` · `null`. `/mentions` bugün `null` dönüyor.
- `apps/web/src/components/shell/wizards-shell.tsx` bu sonuca göre dallanır
  (`thirdColumn === "messages" ? <MessagesRailContainer …/> : <ChannelSidebar …/>`),
  genişliği `--third-column-width` CSS değişkenine yazar.
- Gezinme paneli **her rotada** durur (Mesajlar paketi kararı #2). Sol üç kolon
  74 + 228 + 276 = 578.
- Küçük ekran: `RESPONSIVE_BREAKPOINTS` (`apps/web/src/lib/responsive.ts`) —
  `mobileMax: 767`, `tablet: 768`, `desktop: 1024`, `supportPanel: 1280`,
  `commandCenter: 960`, `commandCenterWide: 1360`. Drawer için `MobileDrawerTrigger`
  (`components/shell/server-rail.tsx`) mevcut.

### 2.2 Ölçü ve tema

- `apps/web/src/lib/home/metrics.ts` → `pxToRem`, `pxToEm`, `hairline` **mevcut ve yeniden
  ihraç ediliyor** (`lib/messages/metrics.ts` bunu yapar). Bahsedilmeler sözlüğü aynı deseni izler.
- Tema `<html>` üzerindeki `theme-light` / `theme-dark` sınıflarıyla gelir (`ThemeProvider`).
- Tipografi token'ları `--font-display` (Outfit) / `--font-sans` (Figtree) üzerinden.
- `hsl(199 89% 48%)` "info" tonunun token karşılığı **yok**; Ş0.1 `--info` olarak tanımlar.

### 2.3 Veri — bugün var olan

- `MessageMention { id, messageId, userId, createdAt }` — `@@unique([messageId,userId])`,
  `@@index([userId, createdAt])`. **`kind` yok.**
- `DMMessageMention` — aynısının DM ikizi. **`kind` yok.**
- `apps/web/src/lib/home/mentions-service.ts` → `listHomeMentions` iki tabloyu `UNION ALL` ile
  birleştirir, `(createdAt, id)` keyset imleci ile sayfalar, okundu durumunu `Notification`
  satırından okur (`dedupeKey` = `channel-mention:<messageId>:<userId>` /
  `dm-message:<messageId>:<userId>`), notification satırı olmayan bahsetme **okunmuş** sayılır.
- `apps/web/src/lib/workspace/message-notification-service.ts`:
  - `extractMentionUsernames` — `everyone`/`here`'i **dışlar**, yalnız `@kullanıcıadı` eşler.
  - `createChannelMentionNotifications` — sunucu üyeliği + `VIEW_CHANNEL` süzgeci +
    kanal/sunucu sessize alma ayarları; `messageMention.createManyAndReturn` ile satırı yazar.
  - `createChannelThreadReplyNotification` — yalnız **üst mesajın yazarına** `SYSTEM` tipinde
    bildirim üretir. Takip kavramı yok.
- `apps/web/src/lib/workspace/message-service.ts` → `MASS_MENTION_PATTERN` +
  `assertCanMentionEveryone`: `@everyone`/`@here` yalnız `PermissionBits.MENTION_EVERYONE`
  izniyle **yazılabilir**; satır da bildirim de üretmez. **Ama** `Message.mentionEveryone`
  kolonu gönderimde (`:835`) ve düzenlemede (`:1022`) **zaten yazılıyor** — geçmiş veri dahil
  dolu. `@everyone` ile `@here` tek bayrağa düşer, ayrım tutulmaz.
- `Message.threadParentId` thread'in anahtarıdır (`@@index([threadParentId, createdAt])`);
  `threadId` ayrı bir kanal ilişkisidir ve thread takibi için kullanılmaz.
- `Role { …, mentionable Boolean @default(false) }` + `MemberRole` mevcut; rol bahsetmesi
  ayrıştırıcısı **yok**.
- `UserNotificationSettings { desktopNotifications, mobileNotifications, emailNotifications,
notificationSound, notificationSoundFile, suppressEveryoneMentions, suppressRoleMentions,
mutedUntil }` — sessiz saat **aralığı** ve thread anahtarı yok, masaüstü alanı boolean.
- `UserChannelSettings { muted, mutedUntil, messageNotifications, mobilePush }` — kart menüsündeki
  "sessize al" bunun üzerinden çalışır.
- Sayaç: `apps/web/src/lib/home/summary-service.ts` →
  `unreadMentions = SUM(ChannelReadState.mentionCount) + SUM(DMParticipant.mentionCount)`.
  `notifications/service.ts` içindeki `markRead` / `markAllRead` bu kolonları serbest bırakır
  (`releaseChannelMention`, `releaseAllChannelMentions`, `releaseAllDirectMessageUnread`).
- Socket: `apps/web/src/lib/socket/events.ts` yalnız `notification:new` taşıyor. `mention:*`
  olayı yok.
- Outbox: `OUTBOX_JOB_TYPES` içinde `CHANNEL_MENTION_NOTIFICATIONS`,
  `CHANNEL_THREAD_REPLY_NOTIFICATION`, `DM_MESSAGE_NOTIFICATIONS` var — fan-out bu yoldan gider.

### 2.4 Bugünkü `/mentions` ekranı

`apps/web/src/components/screens/mentions-screen.tsx` — Ana Sayfa'nın `HomeCard` + `HomeListRow`
dilinde tek kolonluk bir liste; 4 çip (`all/unread/servers/dms`), `markAllNotificationsRead`
(→ **bütün** bildirimleri okur), sanallaştırma yok. Bu ekran bu paketle **değiştirilecek**;
`HomeListRow` Ana Sayfa'nın kendi satırıdır, ona dokunulmaz.

### 2.5 Mevcut bileşenler

`components/ui/`: `avatar`, `badge`, `context-menu` (`ContextMenu` + `ContextMenuItem` +
`ContextMenuSeparator`), `input`, `modal`, `segmented-control`, `skeleton`, `textarea`,
`toggle-switch`.
`components/chat/`: `thread-panel`, `reply-preview`, `message-input`, `message-item`
(`copyMessageLink` burada), `emoji-picker`.
`components/shell/`: `channel-sidebar`, `channel-item`, `app-nav-panel`.
`components/shared/`: `notification-bell`, `user-profile-popover`.

**Web'de genel bir toast altyapısı YOK** — yalnız `components/voice/voice-invite-toasts.tsx` var
ve o sese özeldir. Ş8 `components/ui/toast.tsx` + sağlayıcıyı yazar (bkz. karar K11).

---

## 3. Alınmış kararlar (bağlayıcı — tartışılmaz, uygulanır)

| #       | Karar                                                                                                                                                                                                                                                                                                                                                                                              | Gerekçe                                                                                                                          |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **K1**  | **Rol bahsetmeleri uçtan uca yazılır.** Yeni `@rol` ayrıştırıcı + `Role.mentionable` izni + rol üyelerine fan-out + bestekar otomatik tamamlama + bildirim/sayaç + mobil bildirim uyumu.                                                                                                                                                                                                           | Tasarımın 4 türünden biri; yarım bırakılırsa ray satırı ve `Rol · @herkes` sekmesi kalıcı olarak boş kalır.                      |
| **K2**  | **`@herkes`/`@burada` türetilmiş işaretle üretilir.** Yeni tablo **gerekmez**: `Message.mentionEveryone` kolonu zaten gönderimde ve düzenlemede yazılıyor (`message-service.ts:835,1022`). Akış bu bayrağı okuma anında izleyiciye genişletir, okundu/kaldırıldı durumu `MentionState`'te tutulur. Üye başına satır yazılmaz.                                                                      | 5.000 üyeli sunucuda üye başına satır yazmak O(üye) yazma demektir. Var olan bayrak O(1)'dir ve geçmişe dönük olarak da doludur. |
| **K3**  | **Thread takibi örtük + açık.** Thread'i başlatan, içine yanıt yazan veya içinde bahsedilen otomatik takipçi olur; `ThreadFollow` satırı ile temsil edilir ve thread panelindeki `Takip` düğmesiyle kapatılabilir.                                                                                                                                                                                 | "Takip ettiğin thread'ler" satırı yalnız açık takiple ilk gün boş kalırdı.                                                       |
| **K4**  | **Okunmamış sayacı tek kaynağa taşınır.** `unreadMentions` artık bahsetme listesinin kaynağından (`Notification` + `MentionState`) hesaplanır; `ChannelReadState.mentionCount` / `DMParticipant.mentionCount` rozet **için** terk edilir (kanal içi rozetler için yerinde kalır).                                                                                                                  | İki kaynak, `Okunmadı işaretle` eklenince kaçınılmaz olarak ayrışır. Ekrandaki sayı ile paneldeki sayı asla farklı olamaz.       |
| **K5**  | **`Sonra oku` üstte sabitlenir ve sayaçta kalır.** Kart okunmamış kalır, akışın en üstündeki `Sonra oku` grubunda durur, filtre/gruplama değişse de görünür. Süre sınırı yok.                                                                                                                                                                                                                      | Tek tıkla "bunu unutma" demenin en dolaysız hali; süpervizyon işi eklemez.                                                       |
| **K6**  | **Bildirim ayarları mevcut tabloya yazılır.** `UserNotificationSettings` genişletilir: `mentionSelf`, `mentionThreadReplies`, `desktopMentionMode` (`ALL`/`MENTIONS`/`OFF`), `quietHoursEnabled`, `quietHoursFrom`, `quietHoursTo`, `quietHoursTimeZone`. Mevcut `suppressRoleMentions` / `suppressEveryoneMentions` **aynı anahtarlara eşlenir** (ters mantık: `suppress=true` ↔ anahtar kapalı). | İkinci tablo, ayarlar sayfasıyla iki kaynak yaratırdı.                                                                           |
| **K7**  | **30 gün bir sorgu penceresidir, yıkıcı iş değil.** Ak��ş varsayılan olarak son 30 günü gösterir; boş durumdaki `Arşive dön` `/mentions?window=all` ile eskileri açar. Hiçbir satır silinmez/taşınmaz.                                                                                                                                                                                             | Geri dönüşü olmayan veri işi bir tasarım altlığı metnine dayanarak eklenmez.                                                     |
| **K8**  | **Kapsam: web + masaüstü tam, mobil asgari.** Mobil ekran yeniden tasarlanmaz; yeni bahsetme türlerinin mobil bildirim ve sayaçlara doğru düşmesi sağlanır (`push-sender`, `mobile/bootstrap`).                                                                                                                                                                                                    | Sunucu tarafı ortak; mobil sessizce yanlış sayaç göstermemeli.                                                                   |
| **K9**  | **Kullanıcı takısı yalnız `username`.** Ray alt metni gerçek `@username` gösterir; `displayName`'den türetilmiş ikinci takı üretilmez.                                                                                                                                                                                                                                                             | Görünen ad benzersiz değil; ikinci takı yanlış pozitif bahsetme üretirdi.                                                        |
| **K10** | **Thread kartında yanıt thread'e gider.** Diğer türlerde kanala/DM'e. Yanıt kutusunun meta satırı hedefi açık yazar.                                                                                                                                                                                                                                                                               | Kullanıcının beklediği yer; kanala düşen thread yanıtı bağlamından kopar.                                                        |
| **K11** | **`Tümünü okundu işaretle` yalnız bahsetmeleri okur** ve 10 saniyelik `Geri al` toast'ı sunar. Bugünkü genel `markAllNotificationsRead` bu ekranda **kullanılmaz**. Toast altyapısı Ş8'de yazılır.                                                                                                                                                                                                 | Bugünkü davranış arkadaşlık isteklerini ve sistem bildirimlerini de sessizce okuyor.                                             |
| **K12** | **`{kanal} kanalını sessize al` süresizdir** (`UserChannelSettings.muted = true`, `mutedUntil = null`) ve toast'ta `Geri al` sunar. DM kartında `Bu sohbeti sessize al` → `DMParticipant`/konuşma ayarı.                                                                                                                                                                                           | Tasarımdaki menü tek satır; alt menü tasarımı bozardı.                                                                           |

---

## 4. Tuzaklar (önceki paketlerde ölçüldü)

1. **`markAllNotificationsRead` genel kapsamlıdır.** `notifications/service.ts: markAllRead`
   kullanıcının **tüm** okunmamış bildirimlerini okur. Bu ekranda kullanılmaz (K11).
2. **Notification satırı olmayan bahsetme okunmuş sayılır.** `mentions-service.ts` bunu bilerek
   yapar (sessize alınmış kanal, satır öncesi geçmiş). Yeni türler eklenirken bu kural korunur;
   aksi halde eski bahsetmeler bir gecede okunmamışa döner ve sayaç patlar.
3. **`extractMentionUsernames` `everyone`/`here`'i dışlar.** Rol ayrıştırıcısı ayrı yazılır;
   mevcut fonksiyonun regex'i genişletilirse kullanıcı adı eşleşmeleri bozulur.
4. **Prisma migration yolu:** `packages/db/prisma/rebaseline-migrations` okunur
   (`prisma/migrations` değil). Yanlış klasöre yazılan migration hiç koşmaz.
5. **`zoom` üretimde kullanılmaz.** Referans HTML ölçeği `zoom` ile taklit eder; üretimde
   rem + kök font boyutu adımları geçerlidir (SPEC-ANA-SAYFA §8.2).
6. **Arbitrary px sınıfı yasak.** `w-[276px]`, `text-[13px]` yazılmaz; ölçü sözlüğünden
   `pxToRem(...)` ile gelir. 4K'da px sabit kalır ve tasarım küçülür.
7. **Hairline ölçeklenmez.** Kenar ve ayırıcılar `hairline()` (`max(1px, 0.0625rem)`) ile verilir.
8. **Kırılım CSS'te seçilir, JavaScript'te değil.** `useSyncExternalStore` SSR anlık görüntüsü
   1280'dir; ilk boya yanlış kırılımda çıkar ve hidrasyon uyuşmazlığı doğar (`lib/home/layout.ts`).
9. **Fan-out senkron yazılmaz.** Rol bahsetmesi ve thread takipçisi bildirimi outbox işine
   kuyruklanır (`OUTBOX_JOB_TYPES`); mesaj gönderme yolu 200 üyelik bir rolün bildirimini
   beklemez.

---

## 5. Kalite çıtası (her şerit için)

- **Test önce.** Yeni davranışın testi önce yazılır, kırmızı görülür, sonra yeşile çevrilir.
- **Token dışı renk yok.** `#`, `rgb(`, `rgba(` araması bileşen dosyalarında temiz olmalı;
  tek istisna tasarımda `#fff` olarak verilen ters metin ve `--info` token tanımı.
- **Sabit font adı yok.** `Outfit` / `Figtree` yalnız token tanımında geçer.
- **i18n.** Her metin `mentions.*` anahtarından gelir; TR karşılığı SPEC'teki metnin **birebir
  aynısı**. Kanal/sunucu adı gibi dinamik parça interpolasyonla.
- **Erişilebilirlik.** Kart `article`, her eylem gerçek `button`, ikon-only butonlarda
  `aria-label`, sayaçlar metin karşılığı taşır, `Esc` kapatır, focus tuzağı ve focus dönüşü
  çalışır, focus stili `ring-ring` token'ından.
- **Uydurma endpoint yok.** Karşılığı olmayan alan için tipli adapter + `TODO(api):` notu.
- **Kapı komutları** (şerit sonunda, ilgili olanlar):
  ```
  pnpm --filter @wizards/web typecheck
  pnpm --filter @wizards/web lint
  pnpm --filter @wizards/web test
  pnpm --filter @wizards/db db:generate
  ```
- **Rapor:** `docs/prompts/whispr-bahsedilmeler/raporlar/<no>-rapor.md` — ne yapıldı, hangi
  sapma kayda geçti, hangi `TODO(api):` bırakıldı, kapı çıktısı.
- **Commit yok.** Kullanıcı açıkça isteyene kadar hiçbir şerit commit atmaz.
