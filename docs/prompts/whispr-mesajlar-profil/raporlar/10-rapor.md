# Dalga 2 · Ş8 — Ayarlar sekmesi · rapor

**Tarih:** 2026-08-27 · **Dal:** `uat` · **Durum:** şerit bitti, kendi kapısı yeşil. Commit atılmadı.

## Kapı

| Komut                                                                 | Sonuç                               |
| --------------------------------------------------------------------- | ----------------------------------- |
| Şeridin dört test dosyası (`--test-force-exit`, sahte `DATABASE_URL`) | **65 / 65** geçti · 16 süit · ~1 sn |
| `pnpm --filter @wizards/web typecheck`                                | **temiz** (0 hata)                  |
| `npx eslint` (8 dosya)                                                | temiz                               |
| `npx prettier --check` (8 dosya)                                      | temiz                               |

Tam süit **koşulmadı** (kardeş şeritler paralel). Not: şerit başlarken `typecheck`
`components/dm/dm-conversation-page.tsx` içinde iki hata veriyordu (`variant: string` →
`ProfilePanelVariant`); benim dosyalarımdan değil, Ş5 sürerken kendiliğinden temizlendi.

## Yazılan dosyalar

Yalnız sahiplenilen dört bileşen + dört test. Başka hiçbir dosyaya dokunulmadı
(`metrics.ts`, `messages-screen.ts`, `tr.ts`, `en.ts`, `lib/dm/*-client.ts`,
`packages/**`, `apps/mobile/**` — hepsi salt okundu).

| Dosya                                               | Ne                                                                                      |
| --------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `components/messages/notification-choice-cards.tsx` | üç radyo kartı + `notifyWriteFields` + `nextRadioIndex`                                 |
| `components/messages/privacy-settings-card.tsx`     | üç bölmeli gizlilik kartı + `MESSAGING_PRIVACY_QUERY_KEY` + `PRIVACY_ROW_GRID_TEMPLATE` |
| `components/messages/profile-danger-actions.tsx`    | yıkıcı satırlar + onay diyaloğu + `resolveDangerActions`                                |
| `components/messages/profile-tab-settings.tsx`      | sekme: üç sorgu, dört mutasyon, `KİMLER ÜYE EKLEYEBİLİR` segmenti                       |

---

## 1. Hangi onay bileşeni kullanıldı

**`components/ui/modal.tsx` (`Modal`) + `@wizards/ui`'nin `Button`'ı.** Kod tabanında
`ConfirmDialog` / `AlertDialog` diye ayrılmış bir bileşen **yok** — arandı:
`onConfirm` geçen dokuz dosyanın dokuzu da onayı kendi içinde çiziyor, `@wizards/ui`
yalnız `Button` ihraç ediyor, `role="alertdialog"` tek yerde (hesap silme) ve o da elle
yazılmış bir `div`.

Kalıp `components/friends/friends-view.tsx:1469-1505` içindeki mevcut engelleme/kaldırma
onayından birebir alındı: `Modal` + öznenin adı + sağa dayalı `İptal` / danger düğme
çifti. Ortak kuralın (kural 4) "yeni modal yazılmaz" cümlesi böyle karşılandı; kabuğun
odak tuzağı, `Esc` kapanışı ve kapanışta tetikleyiciye dönen odak bedavaya geldi.

**Metin:** sözlükte yıkıcı satırlar için ayrılmış bir onay bloğu yok. Engelleme
`friends.confirm.block.title` / `.description` / `.safety` / `.action` ile soruluyor
(anahtarlar birebir bu diyaloğu tarif ediyor). Kalan dördü **satır etiketi + özne adı**
ile soruluyor — `Grubu sil` onayının gövdesi grup adıdır, yani SPEC'in "onay metni grup
adını içerir" şartı karşılanıyor. Eksik anahtarlar §5.6'da.

---

## 2. Ayarlar ekranıyla paylaşılan query key

```ts
// components/messages/privacy-settings-card.tsx
export const MESSAGING_PRIVACY_QUERY_KEY = ["user", "messaging-privacy"] as const;
```

Kök bilerek `["user", …]`: `lib/settings/client.ts` içindeki `settingsQueryKeys`
(`bootstrap`, `layout`, `mentions`) aynı kökü kullanıyor ve `mentions` satırının yorumu
("Ayarlar sayfası ile bahsetme modalı — tek anahtar, tek önbellek") bu paylaşımın
emsalidir. Aynı kök, Ayarlar tarafından atılacak bir `invalidateQueries({ queryKey:
["user"] })` çağrısının gizlilik kartını da kapsaması demektir.

`lib/settings/client.ts` **yazma listemde değildi**, o yüzden anahtar sahiplendiğim
dosyada duruyor ve oradan ihraç ediliyor. Ayarlar ekranı bağlandığında **bu sabiti import
etmeli**, ikinci bir anahtar açmamalı.

### Şaşırtan taraf: bugün paylaşılacak bir state **yok**

- Web Ayarlar ekranında `Okundu bilgisini göster` satırı var (`settings.row.g6`,
  `lib/settings/tree.ts:373`), ama **hiçbir uca bağlı değil**:
  `components/settings/sections/account/account-surface.ts:139` içinde
  `// TODO(api): … g6 (okundu bilgisi) …` yorumuyla `unmapped` listesine düşüyor. Yani
  kullanıcı o anahtarı çevirdiğinde sunucuya hiçbir şey gitmiyor.
- `Yazıyor göstergesi` için Ayarlar ağacında **satır hiç yok**.
- `/api/v1/users/me/privacy` ucunun (Ş4) bugün **hiç** web istemcisi yoktu; bu kart
  ilk tüketicisi.

**Sonuç:** iki yüzeyin ayrışması bugün Ayarlar tarafından geliyor — `g6` yerel olarak
`true` varsayıyor ve değeri sessizce atıyor, kart ise gerçek kolonu okuyor. Kapatması
`account-surface.ts` içindeki `g6` dalını `updateMessagingPrivacyRequest`'e bağlamak ve
`MESSAGING_PRIVACY_QUERY_KEY`'i geçersizleştirmek; ayrıca `Yazıyor göstergesi` satırını
ağaca eklemek. İkisi de bu şeridin yazma listesi dışında, **ayrı iş olarak açılmalı**.

Kartın kendi yazma yolu: iyimser `setQueryData` → `PATCH /api/v1/users/me/privacy` →
`onSuccess` yanıtı önbelleğe koyar → `onSettled` **paylaşılan anahtarı** geçersizleştirir.
Hata dönerse anlık görüntü geri konur.

**`UserProfilePanelDTO.privacy` bilerek kullanılmıyor.** Alan DTO'da var, ama tercih hesap
genelidir: sohbet başına bir kopyadan beslenirse iki sohbet paneli aynı anahtarı iki farklı
değerde gösterebilir. Kart tek anahtardan okur.

---

## 3. Gizlilik kartının hizası hangi grid ile kuruldu

Tek bir stil kaydı, üç satırda **aynen** kullanılıyor:

```ts
export const PRIVACY_ROW_GRID_TEMPLATE = `${pxToRem(privacyTileSize)} minmax(0, 1fr) minmax(${pxToRem(switchWidth)}, auto)`;
//   30px ikon kolonu        esneyen metin      en az 40px kontrol kolonu

export const privacyRowStyle = {
  alignItems: "center",
  columnGap: pxToRem(privacyRowGap),
  display: "grid",
  gridTemplateColumns: PRIVACY_ROW_GRID_TEMPLATE,
  minHeight: pxToRem(privacyRowMinHeight), // 56
  padding: `${pxToRem(privacyRowPaddingY)} ${pxToRem(privacyRowPaddingX)}`,
};
```

Üç satır da `{...privacyRowStyle, …}` ile çiziliyor; testler markup içinde
`grid-template-columns:…`, `min-height:…` ve `padding:…` dizelerinin **tam olarak üçer
kez** geçtiğini doğruluyor. Satır başına elle padding yok, gözle tutturma yok.

**`subgrid` kullanılmadı** — bilerek. Kartın kendisine grid verip satırları `subgrid` ile
hizalamak daha zarif olurdu ama projenin `browserslist`'i `Chrome >= 111` diyor ve
`subgrid` Chrome 117'de geldi. Kontrol kolonunun `minmax(40px, auto)` olması `Aktif`
pill'i ile 40px anahtarın **sağ kenarını** da sol kenarını da aynı yere getiriyor.

Şifreleme satırı bir düğme değil: `Aktif` salt okunur bir `span`. Kartta iki `role="switch"`
var, üç değil — kapatılamayan bir şeyi anahtar gibi çizmek kapatılabilir sanan birine yalan
söylemektir.

---

## 4. K2 doğrulaması

`lib/messages/metrics.ts` dosya başı yorumundaki "§15–§17 turunun sayıya dökülemeyen
sapmaları" listesinde kayıt **duruyor** (satır ~65):

> §15.5'in ilk gizlilik satırı HTML'de `Uçtan uca şifreli · Anahtar doğrulandı · 21 Ağu`.
> Üründe uçtan uca şifreleme **yok** … metin `Aktarımda şifreli · TLS 1.3 · sunucuda
şifreli saklanır` olur (karar K2). Ölçü, ikon karosu, yeşil zemin ve `Aktif` pill'i
> tasarımdaki gibi kalır — sapan yalnız metindir.

`SPEC_DEVIATIONS` **dizisi** yalnız sayısal `{ field, html, spec }` üçlülerini taşıyor;
metin sapmaları dosyanın kendi tasarımı gereği üstteki düzyazı bloğunda. Yani kayıt doğru
yerde, ikinci bir yere yazılmadı. `tr.ts` / `en.ts` de aynı gerekçeyi taşıyor (tr.ts:3995).
Test `Uçtan uca şifreli` ve `Anahtar doğrulandı` dizelerinin markup'ta **bulunmadığını**
ayrıca doğruluyor.

---

## 5. Kardeş şeritlerin bilmesi gereken sürprizler

### 5.1 Sunucu hatası: `setNotifyLevel` `mutedUntil`'i temizlemiyor

`lib/dm/group-service.ts:1326` (`setNotifyLevel`) tek `update` içinde
`{ muted: notifyLevel === "NONE", notifyLevel }` yazıyor — **`mutedUntil`'e dokunmuyor**.

Ş4 raporu (§K8) "`mutedUntil: null` (yani `Süresiz` ve bildirim radyosundaki bilinçli
`Kapalı`) **asla** düşmez" diyor. Radyo `Kapalı` yazdığında bu **doğru değil**: sohbette
süreli bir sessizlik hâlâ etkinse (`mutedUntil` gelecekte), kullanıcının bilinçli
`Kapalı` seçimi o damganın geldiği dakikada kendiliğinden `ALL`'a düşer
(`selectDMNotificationRecipients` → `isMuteActive`).

**Düzeltme tek satır** ve benim yazma listem dışında:

```ts
// lib/dm/group-service.ts → setNotifyLevel
{ muted: notifyLevel === "NONE", mutedUntil: null, notifyLevel }
```

Prompt "yazma `PATCH .../notify` ucuna gider, ayrı iki çağrı yapma" dediği için istemci
tarafında telafi **yapılmadı** (mute ucuna ikinci bir çağrı atmak tuzak 5'i çiğnerdi).
**Ana oturum ya da Dalga 3 QA kapatsın.**

### 5.2 Toast şeridinin başarısızlık kaydı yok

`ConversationToastKind` on üç kayıt taşıyor ve hiçbiri "bu olmadı" demiyor; `messages.toast.*`
sözlüğünde de hata cümlesi yok. Şema "hatalar şeridi danger tonunda yeniden kullanır"
diyor, o yüzden kırmızı toast şu an **başarı cümlesini** gösteriyor
(`Grup silindi` kırmızı = "silinemedi" demek).

Şeridin yaptığı:

- Yıkıcı eylem hatası → `{ kind: <o eylemin kaydı>, tone: "danger" }` (özne doğru, cümle
  zamanı yanlış).
- Bildirim radyosu hatası → `notifyFailureToast(level)`: `Kapalı` denendiyse
  `mutedForever`, diğerlerinde `muteCleared`, ikisi de danger.
- Gizlilik anahtarı hatası → **toast yok**, yalnız geri sarma. Anahtarın eski konumuna
  dönmesi geri bildirimin kendisi; var olmayan bir cümleyi kırmızıya boyamaktansa hiç
  basmamak dürüst.

**Öneri (Ş9 / Dalga 3):** `ConversationToastKind`'a `actionFailed` ekleyin ve
`messages.toast.actionFailed` anahtarını açın; `dangerToast` tek satırda oraya çevrilir.

### 5.3 Sekmenin prop sözleşmesi görüntüleyen kimliğini taşımıyor

`Gruptan ayrıl` "kendini çıkar" yazmasıdır ve uç yolda bir kullanıcı kimliği ister
(`DELETE /api/v1/dm/groups/[id]/members/[userId]`); `ProfileTabProps` ise yalnız
`conversationId` / `variant` / `onToast` taşıyor.

Üç yol denendi, biri seçildi:

1. **`useAuthenticatedAppRuntime()`** (kabuk bağlamı) — üretimde doğru, ama sekmeyi
   `SocketProvider` / `VoiceProvider` ağacına bağlıyor ve `renderToStaticMarkup` tabanlı
   testlerde sağlayıcı kurulmasını gerektiriyor (`getSocket()` render sırasında koşuyor).
   `try/catch` ile yumuşatmak **mümkün değil**: `eslint-plugin-react-hooks@7` hook'u
   try/catch içinde çağırmayı hata sayıyor.
2. `dmQueryKeys.conversation(id)` önbelleği — `DMConversationDTO` viewer kimliği
   **taşımıyor** (`role` var, `userId` yok).
3. **Seçilen:** `resolveViewerMemberId(conversationId, { seed })` — roster'ın **zaten var
   olan** `isSelf` bayrağını okur. İstek yalnız kullanıcı ayrılmayı onayladığında atılır,
   önce `groupProfileQueryKeys.members(id)` önbelleğine bakar (Ş7'nin `Üyeler` sekmesi
   doldurduysa **sıfır** istek) ve imleçli sayfaları `maxPages` (10) ile sınırlı gezer.

**Ş5'e:** sekme sözleşmesine bir gün `currentUserId` eklenirse bu yardımcı silinebilir.

### 5.4 `Modal` sunucu çiziminde `null` döner — onay gövdesi markup testinde görünmez

`components/ui/modal.tsx` `useSyncExternalStore` ile hidrasyonu bekliyor
(`getServerHydrationSnapshot → false`) ve `createPortal` kullanıyor. Yani
`renderToStaticMarkup` çıktısında **açık bir modal hiç yok**. Onayın testi bu yüzden iki
parçalı: (a) saf `dangerConfirmCopy(kind)` her eylem için sözlükte gerçekten var olan
anahtarlar döndürüyor mu, (b) ilk çizimde `profile-danger-confirm` / `profile-danger-submit`
**yok** ve `onRun` hiç çağrılmıyor. Aynı tuzağa düşecek her şerit için kayda geçsin.

### 5.5 `Bildir` sebep seçmiyor — `reason: "other"`

Tasarımda (`dc.html` L1276, `screens/18`) `Bildir` **tek satır**; sebep seçici yok. Sözlükte
de sebep etiketleri yok (`USER_REPORT_REASONS`: harassment · impersonation · inappropriate ·
other · spam — hiçbirinin i18n karşılığı web'de bulunmuyor). Uydurma metin yazmamak için
(kural 3) kayıt `other` ile açılıyor ve onay diyaloğu kullanıcıya ne olacağını söylüyor.
Sebep seçici istenirse önce beş anahtar sözlüğe girmeli.

### 5.6 Sözlükte eksik bulunan anahtarlar (hiçbiri yazılmadı)

| Anahtar                                                                                     | Ne için                                                                                                                                                          |
| ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `messages.profile.danger.confirm.clearHistory` (+ `.leaveGroup`, `.deleteGroup`, `.report`) | onay başlığı/gövdesi; şimdilik satır etiketi + özne adı kullanılıyor                                                                                             |
| genel bir "bu işlem geri alınamaz" satırı                                                   | `friends.confirm.block.description` tam bu cümle ama `friends.*` altında; `Geçmişi temizle` ve `Grubu sil` onaylarında **kullanılmadı** (ad alanı yalanı olurdu) |
| `messages.toast.actionFailed`                                                               | §5.2                                                                                                                                                             |
| `messages.report.reason.*` (5 sebep)                                                        | §5.5                                                                                                                                                             |
| Ayarlar ağacında `Yazıyor göstergesi` satırı                                                | §2                                                                                                                                                               |

### 5.7 Mevcut `SegmentedControl` ve `ToggleSwitch` bu yüzeyde kullanılamadı

İkisi de `MESSAGES_METRICS.groupModal` ölçülerini **sabitliyor** ve §15.5 farklı ölçü
istiyor:

|         | mevcut bileşen (`groupModal`)           | §15.5 (`profilePanel`)                      |
| ------- | --------------------------------------- | ------------------------------------------- |
| anahtar | 44×26, topuz 20, 3→21                   | **40×24, topuz 18, 3→19**                   |
| segment | radius 11, h28, seçili `--surface-card` | **radius 12, h30, seçili dolu `--primary`** |

Bileşenler stil propu almıyor, o yüzden anahtar `privacy-settings-card.tsx` içinde,
segment `profile-tab-settings.tsx` içinde `profilePanel` ölçüleriyle yazıldı. İkisi de
gerçek `role="switch"` / `role="radiogroup"` + `role="radio"`, roving tabindex ve ok
tuşlarıyla gezinme taşıyor; ok tuşu mantığı tek yerden (`nextRadioIndex`) geliyor ve
bildirim kartlarıyla segment onu paylaşıyor.

### 5.8 Sözlüğün taşımadığı iki renk kararı

`metrics.ts` bilerek renk taşımıyor. İki yerde token seçimi tasarımın kendisinden okundu
ve burada kayda geçiyor:

- **Seçilmemiş bildirim kartı:** `--surface-card` zemin + `1px --border/0.6` kenar
  (`dc.html` `{{o.bg}}` / `{{o.bd}}` yer tutucularının `screens/18`'deki karşılığı;
  gizlilik kartının kenarıyla aynı ton).
- **Segment kabı:** `--surface-soft/0.8` + `1px --border/0.5`, seçili segment dolu
  `--primary` + `--primary-foreground` (`dc.html` L1237).

### 5.9 `dangerIconSize` 15, `dc.html` 16 çiziyor

Sözlük 15 diyor (Dalga 0'ın kaydı), HTML `width="16"`. Kural 2 gereği sözlükten okundu.
Sayısal sapma listesinde bu alan **yok**; Ş11 isterse ekleyebilir, kod tarafında
değiştirilecek bir şey yok.

### 5.10 Ayrılma/silme sonrası **gezinme yok**

Sekme `dmQueryKeys.root` altını geçersizleştiriyor ve toast basıyor; `router.replace`
**çağırmıyor**. İki gerekçe: (a) `useRouter` app-router bağlamı ister ve sekmeyi
yönlendirme sahibi yapardı, (b) `dm:conversation:removed` olayı zaten sohbeti raydan ve
önbellekten düşürüyor. **Ş5/Ş9:** silinen ya da ayrılınan sohbetin sayfasından çıkışı
`DMConversationPage` üstlenmeli.

### 5.11 Ş9'a: sessize alma alt menüsü profil önbelleğini de tazelemeli

Bildirim radyosu seviyeyi **panel sorgusundan** okuyor (yerel seçim state'i yok — Ş4'ün
"`notifyLevel` eski değerine dönemiyor" kuralı ancak böyle dürüst kalır: sessizlik
kalkınca radyo gerçekten `Tüm mesajlar`'a gider). Başlıktaki `Sessize al` alt menüsü
`notifyLevel`'i değiştirdiğinde `dmProfileQueryKeys.profile(id)` /
`groupProfileQueryKeys.panel(id)` (ya da `dmQueryKeys.root`) geçersizleştirilmezse panel
açıkken radyo bayat kalır. `dm:conversation:mute` soket olayının yükü
(`{ conversationId, muted, mutedUntil, notifyLevel }`) bunun için yeterli.

---

## 6. Ş5'in tüketeceği ihraç yüzeyi

```ts
// components/messages/profile-tab-settings.tsx
export type ProfileTabProps = {
  conversationId: string;
  variant: "dm" | "group";
  onToast?: ((toast: ConversationToast) => void) | undefined;
};
export function ProfileTabSettings(props: ProfileTabProps): React.JSX.Element;
```

Sekme kendi verisini kendi çeker; `enabled` varyanta bağlı, yani DM panelinde grup
sorgusu, grup panelinde DM sorgusu **koşmaz** (kural 7). Yükleme sırasında kendi
`Skeleton`'unu, hata durumunda `messages.profile.error.load` satırını çizer — panelin
kalanını bekletmez.

Yan bileşenler de dışarıdan kullanılabilir durumda ve saf: `NotificationChoiceCards`,
`PrivacySettingsCard`, `ProfileDangerActions`, `resolveDangerActions`,
`MESSAGING_PRIVACY_QUERY_KEY`, `optimisticPatch`, `resolveViewerMemberId`.

## 7. Açık kalan

1. **`setNotifyLevel` `mutedUntil: null` yazmalı** (§5.1) — sunucu tarafı, tek satır.
2. **Ayarlar ekranının `g6` satırı `MESSAGING_PRIVACY_QUERY_KEY`'e bağlanmalı** ve
   `Yazıyor göstergesi` satırı ağaca eklenmeli (§2).
3. **`ConversationToastKind`'a başarısızlık kaydı** (§5.2).
4. Silinen/ayrılınan sohbetten çıkış gezinmesi Ş5'te (§5.10).
5. Ş9'un mute yazması profil önbelleğini geçersizleştirmeli (§5.11).
