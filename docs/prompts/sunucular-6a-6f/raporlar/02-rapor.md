# Faz 2 raporu — Mobil temel katman (token + kopya + saf model + istemci + rota)

Branch `uat`. Commit yok, her şey uncommitted. **Hiçbir ekran dosyasına dokunulmadı.**

---

## 1. Ne yapıldı

### Yeni dosya

| Dosya                                                          | Satır |
| -------------------------------------------------------------- | ----- |
| `apps/mobile/src/app/providers/use-mobile-workspace-filter.ts` | 91    |

### Değişen dosyalar (`git diff --stat`, 9 dosya, **+2243 / −1**)

| Dosya                                                     | Δ       | Ne                                                                                                                                                         |
| --------------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/mobile/src/design/palette.ts`                       | +572    | B1: `redesignWorkspaceLight/Dark`, `redesignServerProfileLight/Dark`                                                                                       |
| `apps/mobile/src/design/themes.ts`                        | +554    | B1: `MobileWorkspaceTokens` + `MobileServerProfileTokens` arayüzleri, `theme.workspace` / `theme.serverProfile`, 6 yeni `elevation` anahtarı (açık + koyu) |
| `apps/mobile/src/app/mobile-sunucular-model.ts`           | +454/−1 | B3: 16 yeni fonksiyon + 1 sabit (filtre, kalıcılık, 6f ad, kategori başlığı, profil istatistik/kanal, etkinlik, erişim, yıldız sıralama)                   |
| `apps/mobile/scripts/mobile-sunucular-model.test.ts`      | +380    | B3 testleri: 34 yeni test / 15 yeni suite                                                                                                                  |
| `apps/mobile/src/about/mobile-community-invite-client.ts` | +142    | B5: 4 yol üreteci + 6 istemci fonksiyonu (ayar + etkinlik CRUD + ilgi)                                                                                     |
| `apps/mobile/src/locale/mobile-copy.ts`                   | +101    | B2: 48 anahtar × 2 dil                                                                                                                                     |
| `apps/mobile/src/design/tokens.ts`                        | +20     | B1: `mobileServerNameLayout` (6f ad rampası, tek kaynak)                                                                                                   |
| `apps/mobile/src/query/mobile-query-keys.ts`              | +13     | B5: `serverProfile(serverId)` (alias), `serverEvents(serverId)`                                                                                            |
| `apps/mobile/src/navigation/mobile-navigation-types.ts`   | +8      | B6: `ServerEvents`, `ServerEventForm` param tipleri                                                                                                        |

Ekran/bileşen/test-fixture dosyası değişmedi: `git status` altında `component-tests/` içindeki iki dosya **Faz 1'den kalma**, bu fazda dokunulmadı.

---

## 2. Bağlayıcı kararlar (Faz 3/4/5'i kısıtlar)

1. **Ekrana özel hiçbir değer `StyleSheet` literali değildir.** Renk _ve_ ölçü `theme.workspace` / `theme.serverProfile` üzerinden gelir. `mobile-design-contract.test.ts` zaten `src/app` altında ham hex/rgba yasaklıyor; ölçüler de aynı tabloda olduğu için Faz 3-5 tek yerden okur.
2. **Ölçüler iki temada aynı, yalnız renk değişir.** `railWidth`, `channelRow.iconBox`, `fab.height` … açık ve koyu varyantta birebir eşittir. Koyu varyantta yalnız renk türetilir (02 §B1 kuralı).
3. **6f ad kuralının tek kaynağı `mobileServerNameLayout`** (`src/design/tokens.ts`). `getMobileServerNameLayout` ve `theme.workspace.serverNameTitle/serverNameCard`, `theme.serverProfile.profileName/stickyHeader.name` aynı sabitten türer. **Hiçbir ekran kendi `numberOfLines`'ını yazmaz.**
4. **Filtre durumu cihaz yerel.** Anahtar `whispr.mobile.workspace-filter`, bileşik anahtar `userId:serverId`. `"all"` **saklanmaz** — varsayılana dönmek kaydı siler. Sunucuya gönderilmez.
5. **Etkinlik zaman mantığı Faz 1'den gelir.** `resolveMobileEventAction` yalnızca `resolveServerScheduledEventAction`'ı çağırır; mobil 15 dk eşiğini yeniden hesaplamaz.
6. **`mobileQueryKeys.serverProfile(serverId)` mevcut `aboutServerProfile(serverId)` dizisinin aynısıdır** (alias). İki ad, tek cache girdisi. Faz 5 ikinci bir profil anahtarı açamaz.
7. **Invalidation sözleşmesi** (yazılı, Faz 4/5 buna uyar):
   - `updateMobileServerUserSettings` → `serverProfile(serverId)` **+ sunucu listesi** (rail sırası `starred`'a bağlı, bkz. `sortMobileServersByStar`).
   - etkinlik mutasyonları (`create`/`update`/`cancel`/`interest`) → `serverEvents(serverId)` **+** `serverProfile(serverId)` (yaklaşan etkinlik kartı profilde).
8. **Kullanıcı-sunucu tercihi tek uçtan yazılır:** `updateMobileServerUserSettings`. Faz 4 `starred`/`muted`/`notificationLevel` için ayrı istemci fonksiyonu açamaz.
9. **`cancelMobileServerEvent` etkinliği geri döner** (`status: "CANCELLED"`), satır silinmez — istemci listeden çıkarmaz, değiştirir.
10. **Yeni gölge adları** (ham `boxShadow` yasak): `workspaceFab`, `workspaceFilterSegment`, `workspaceServerCard`, `workspaceSheet`, `serverProfilePrimaryAction`, `serverProfileBottomBar`. Koyu temada iki marka renkli gölge yaşar, dört nötr yüzey düzleşir (mesajlaşma §0.3 kuralı).
11. **`ServerEvents` / `ServerEventForm` yalnızca param tipidir.** Faz 5 `RootStack.Screen` + `mobile-screen-containers.tsx` container'ını eklemeden bu rotalara `navigate` edilemez (Admin W3/D1 üçlü kayıt tuzağı).
12. **Eski token/kopya anahtarı silinmedi.** `workspaceChannelSearchPlaceholder` yerinde duruyor; genişletilmiş metin ayrı anahtarda.

---

## 3. Tasarımdan / prompt'tan sapmalar

| Sapma                                                                                                                                                    | Gerekçe                                                                                                                                                                                                                                                                                                                   |
| -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`workspaceChannelSearchPlaceholder` güncellenmedi.** Yeni anahtar `workspaceChannelSearchPlaceholderExpanded: "Kanallarda ve mesajlarda ara"` eklendi. | 02 §B2 "güncelle" diyor, ama 02 §D ve senin bağlayıcı kuralın "hiçbir ekranın görünümü değişmez" diyor. Bu anahtarı `workspace-browser.tsx` **bugün render ediyor** (`631`, `761`, `767`) — değeri değiştirmek görünür metni değiştirirdi. Hangi yüzeyin hangisini okuyacağına Faz 3 karar verir; iki anahtar da duruyor. |
| `getMobileServerNameLayout` **dört** bağlam alıyor: `header \| card \| sticky \| profile`                                                                | 02 §B3 üç bağlam sayıyor, ama 6d sunucu adı (HTML `233`: 22px/800, `-.02em`, clamp 2) hiçbirine uymuyor. Dördüncü bağlam olmasa 6d kendi `numberOfLines`'ını yazardı — 02 §C3 bunu yasaklıyor.                                                                                                                            |
| `getMobileCategoryHeaderState` `labelColor`/`countColor` yerine `tone: "idle" \| "collapsed"` (+ `channelCount`, `isCollapsed`) döner                    | Model `src/app` altında; `mobile-design-contract.test.ts:139` orada ham hex/rgba'yı kırmızıya çeviriyor, ve §C1 renklerin temadan gelmesini istiyor. Ekran `tone`'u `theme.workspace.categoryLabel` / `categoryCollapsed`'a çevirir.                                                                                      |
| `getMobileServerAccessLabel(accessLevel, labels)` — ikinci parametre yerelleştirilmiş metinleri taşır                                                    | Model dil taşımaz; etiketler `mobileCopy[locale]`'dan gelir. İmza yine etiketin kendisini döndürür.                                                                                                                                                                                                                       |
| `filterMobileWorkspaceSections(sections, filter, voiceStates)` ve `hasMobileWorkspaceLiveVoice(sections, voiceStates)` fazladan parametre alıyor         | Canlılık `MobileWorkspaceChannelSummary` üzerinde **yok**; `voiceStates` sorgusundan geliyor (`workspace-channel-section-list.tsx:180` bugün de öyle yapıyor). Uydurmak yerine veri olarak alınıyor. `voiceStates` varsayılanı `[]`, yani §B3'teki iki argümanlı çağrı geçerli kalıyor.                                   |
| `groupMobileProfileChannelsByCategory` kategori sırasını **ilk görülme** ile kuruyor, `position` ile değil                                               | `ServerPublicProfileChannel` şemasında `position` **yok** (Faz 1 §F). Profil rotası kanalları zaten `position asc` sırasıyla döndürüyor (`server-public-profile-service.ts:51`), dolayısıyla ilk görülme = tasarımın sırası.                                                                                              |
| `getMobileServerProfileStats` sayıları sıkıştırmadan (`"5"`, `"142"`) döner                                                                              | 6d HTML'i (`240-247`) düz sayı yazıyor; `formatServerProfileCount` 2g kartının kuralı, 6d'nin değil.                                                                                                                                                                                                                      |
| `mobileQueryKeys.serverProfile` yeni bir anahtar değil, `aboutServerProfile` dizisinin aynısı                                                            | İki ad tek rotayı besliyor; ayrı anahtar iki cache girdisi ve bağımsız bayatlama demekti (mesajlaşma gönderim fırtınası vakası).                                                                                                                                                                                          |
| Token grupları **renk + ölçü** olarak tek tabloda, `palette.ts` içinde                                                                                   | `voiceRoom` kalıbı renk-yalnız; 6a-6f handoff'u ölçüyü rengiyle birlikte bağlıyor (30px ikon kutusu _ve_ içindeki tint). İkiye bölmek Faz 3-5'i bir satır çizmek için iki dosya okumaya zorlardı. Ad rampası bunun istisnası: `tokens.ts`'te, çünkü modelle paylaşılıyor.                                                 |
| Etkinlik/ayar istemci fonksiyonları `mobile-community-invite-client.ts` içinde                                                                           | 02 §B5 bu dosyayı adlandırıyor ve `fetchMobileServerProfile` zaten orada; profil + etkinlik + ayar tek ekranın verisi.                                                                                                                                                                                                    |
| `use-mobile-workspace-filter.ts` için ayrı test yok                                                                                                      | Kardeşi `use-mobile-collapsed-sections.ts` de testsiz; hook yalnız AsyncStorage + React sarmalayıcısı, **tüm karar mantığı** test edilen saf fonksiyonlarda (`parse`/`serialize`/`set`/`buildKey`). Hook için yeni test altyapısı kurmak 00 §2.4'ün yasakladığı iş.                                                       |
| `formatMobileEventDateBlock` ay kısaltmalarını kendi tablosundan okuyor; `BUGÜN`/`YARIN` kopyadan                                                        | Hermes garantili ICU tarih kataloğu göndermiyor — `Intl.DateTimeFormat` cihazda bu testten farklı basardı. `eventToday`/`eventTomorrow` kopyada olduğu için model onları oradan okur; iki kaynak yok. 24 ay anahtarı 02 §B2 tablosunda yok, o yüzden kopyaya girmedi.                                                     |
| `stickyHeader.name.lineHeight = 18`                                                                                                                      | Handoff 6e adına `line-height` vermiyor (tek satır, `nowrap`). Kartın 1.2 oranı uygulandı. Tek satırda görünür etkisi yok.                                                                                                                                                                                                |

---

## 4. Kapı çıktıları

```bash
pnpm --filter @wizards/mobile typecheck
```

```
$ node ../../scripts/quality/typescript-project-runner.mjs --project=mobile --mode=check
(çıktı yok — temiz, exit 0)
```

```bash
pnpm --filter @wizards/mobile test
```

```
ℹ tests 1704
ℹ suites 295
ℹ pass 1704
ℹ fail 0
ℹ duration_ms 20554.2218
```

Faz 1 sonunda 1670'ti; **+34** yeni saf model testi.

Bileşen testleri **değişmeden** koştu (`apps/mobile` dizininden):

```bash
npx jest
```

```
Test Suites: 130 passed, 130 total
Tests:       1182 passed, 1182 total
Time:        16.576 s
```

Faz 1 raporundaki sayılarla birebir aynı (130/1182) — hiçbir bileşen testi eklenmedi, değiştirilmedi, kırılmadı. "Ekran davranışı sızmadı" kapısı bu.

```bash
graphify update .
```

```
[graphify watch] Rebuilt: 23701 nodes, 55756 edges, 1034 communities
[graphify watch] graph.json and GRAPH_REPORT.md updated in graphify-out
Code graph updated.
```

Faz 1'in 6 numaralı borcu (`graphify` dosya kilidi) böylece kapandı.

`packages/types` ve `apps/web` bu fazda değişmediği için kapı listesindeki diğer iki komut koşulmadı.

---

## 5. Cihaz test listesi (kullanıcı yapar)

Bu faz **görünür hiçbir şey değiştirmiyor** — liste bir regresyon kontrolüdür. Beklenen sonuç her satırda "Faz 1'deki gibi".

| #   | Ekran                              | Adım                                     | Beklenen                                                                                                |
| --- | ---------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| 1   | Sunucular (rail görünümü)          | Bir sunucu aç                            | Başlıkta **beş** buton, ad tek satırda kırpılı — yani bugünküyle aynı                                   |
| 2   | Sunucular (compact)                | Dar cihazda/oryantasyonda aç             | Kart, arama kutusu ve kategori satırları bugünküyle aynı; arama placeholder'ı hâlâ **"Kanallarda ara"** |
| 3   | Kategori başlığı                   | Bir kategoriyi kapat/aç                  | Chevron ve kalıcılık bugünküyle aynı; **"+" butonu hâlâ yerinde** (Faz 3'ün işi)                        |
| 4   | Sunucu profili (`ServerProfile`)   | Üye olduğun bir sunucunun profilini aç   | 2g kartı bugünküyle aynı, yüklenme hatasız                                                              |
| 5   | Davet önizleme (`CommunityInvite`) | Geçerli bir davet bağlantısı aç          | Önizleme bugünküyle aynı                                                                                |
| 6   | Koyu tema                          | Ayarlar › Görünüm › Koyu; 1-5'i tekrarla | Hiçbir ekranda renk kayması yok (yeni token grupları henüz hiçbir ekran tarafından okunmuyor)           |
| 7   | Dil                                | Ayarlar › Dil › English; 1-5'i tekrarla  | Metinler bugünküyle aynı; yeni anahtarlar hiçbir yerde görünmüyor                                       |
| 8   | Soğuk açılış                       | Uygulamayı tamamen kapat, aç             | Açılış süresi ve akış bugünküyle aynı (yeni AsyncStorage anahtarı henüz okunmuyor)                      |

---

## 6. Devredilen borç

1. **Arama placeholder'ı kararı Faz 3'e devredildi.** `workspaceChannelSearchPlaceholder` (dar, 6a) ve `workspaceChannelSearchPlaceholderExpanded` (geniş, 6b) yan yana duruyor. Faz 3 hangi yüzeyin hangisini okuduğunu bağlar; 6b'nin geniş metni compact aramaya gider.
2. **`useMobileWorkspaceFilter` tüketicisiz.** Hook ve anahtar hazır; filtre şeridini çizen ekran Faz 3'te. O ana dek `whispr.mobile.workspace-filter` hiç yazılmıyor.
3. **48 kopya anahtarı ve iki token grubu kullanılmıyor.** Tasarım gereği: ekranlar Faz 3-5'te bağlanır. `mobile-locale-coverage.test.ts` kullanılmayan anahtarı kırmızıya çekmiyor, doğrulandı.
4. **`ServerEvents` / `ServerEventForm` rotaları yarım.** Param tipi var, `RootStack.Screen` ve container yok — Faz 5 üç kaydı birden yapmalı.
5. **Faz 1'in yönetici presence sorusu hâlâ açık** (`AppSession.lastSeenAt` mi Redis `server:<id>:online` mi). Faz 5 profili çizerken karar gerekecek.
6. **Mobil etkinlik formu Faz 5'te.** İstemci fonksiyonları (`createMobileServerEvent` vd.) bu fazda geldi, ekran gelmedi.

---

## F. Token grubu anahtar listesi

Otorite `apps/mobile/src/design/themes.ts` içindeki `MobileWorkspaceTokens` / `MobileServerProfileTokens` arayüzleridir. Faz 3/4/5 stilini buradan yazar; hiçbir değer ekranda literal olarak tekrarlanmaz.

### `theme.workspace` (6a/6b/6c)

| Anahtar                                                      | Şekil                                                                                                                                                          |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `railWidth`, `railAvatarSize`, `railAvatarRadius`, `railGap` | `number`                                                                                                                                                       |
| `railActiveBar`                                              | `{ color, height, radius, width }`                                                                                                                             |
| `railActiveRing`                                             | `{ inner, innerWidth, outer, outerWidth }`                                                                                                                     |
| `railDivider`                                                | `{ color, height, width }`                                                                                                                                     |
| `headerIconButton`, `headerIconButtonCompact`                | `{ bg, border, radius, size }`                                                                                                                                 |
| `serverNameTitle`, `serverNameCard`                          | `{ fontSize, fontWeight, letterSpacing, lineHeight, numberOfLines }`                                                                                           |
| `metaText`, `metaVoice`                                      | `{ color, fontSize, fontWeight }`                                                                                                                              |
| `metaSeparator`, `dangerRow`, `sheetBackdrop`                | `string`                                                                                                                                                       |
| `filterTrack`                                                | `{ bg, padding, radius }`                                                                                                                                      |
| `filterSegmentActive`                                        | `{ bg, radius }`                                                                                                                                               |
| `filterLabelActive`, `filterLabelIdle`                       | `{ color, fontSize, fontWeight }`                                                                                                                              |
| `filterBadge`                                                | `{ bg, height, minWidth, radius, text, textFontSize, textFontWeight }`                                                                                         |
| `categoryLabel`                                              | `{ color, fontSize, fontWeight, letterSpacing }`                                                                                                               |
| `categoryCount`                                              | `{ color, fontSize, fontWeight }`                                                                                                                              |
| `categoryCollapsed`                                          | `{ chevron, label, unreadDot }`                                                                                                                                |
| `channelRow`, `channelRowCompact`                            | `{ iconBox, iconRadius, paddingHorizontal, paddingVertical, radius }`                                                                                          |
| `channelRowActive`                                           | `{ bg, iconBg, name, nameFontWeight }`                                                                                                                         |
| `voiceRowLive`                                               | `{ bg, border, icon, iconBg, joinPill, sub, subFontSize, subFontWeight }`                                                                                      |
| `voiceRowEmpty`                                              | `{ icon, iconBg, iconBorder, name, nameFontWeight, sub, subFontSize }`                                                                                         |
| `unreadBadge`, `mentionBadge`                                | `{ bg, height, minWidth, radius }`                                                                                                                             |
| `fab`, `fabCompact`                                          | `{ bottom, height, icon, label, paddingHorizontal, radius, right }`                                                                                            |
| `sheetHandle`                                                | `{ color, height, width }`                                                                                                                                     |
| `sheetRadius`                                                | `number`                                                                                                                                                       |
| `quickActionCard`                                            | `{ bg, border, icon, labelFontSize, labelFontWeight, paddingVertical, radius }`                                                                                |
| `menuListCard`                                               | `{ bg, border, radius }`                                                                                                                                       |
| `menuRow`                                                    | `{ chevron, chevronSize, divider, icon, iconSize, labelFontSize, labelFontWeight, paddingHorizontal, paddingVertical, value, valueFontSize, valueFontWeight }` |
| `adminChip`                                                  | `{ bg, letterSpacing, paddingHorizontal, paddingVertical, radius, text, textFontSize, textFontWeight }`                                                        |

### `theme.serverProfile` (6d/6e)

| Anahtar                                   | Şekil                                                                                                                                                                                   |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bannerHeight`, `sheetTop`, `sheetRadius` | `number`                                                                                                                                                                                |
| `bannerGradient`                          | `{ angle, colors[], locations[] }` — iki temada **aynı**                                                                                                                                |
| `bannerOverlay`                           | `string` (yalnız kullanıcı banner'ı üstünde)                                                                                                                                            |
| `bannerBlob`                              | `{ color, offsetRight, offsetTop, size }`                                                                                                                                               |
| `bannerButton`                            | `{ bg, icon, iconSize, radius, size }`                                                                                                                                                  |
| `logo`                                    | `{ borderColor, borderWidth, fontSize, fontWeight, marginTop, radius, size }`                                                                                                           |
| `statusChipOnline`                        | `{ bg, dot, text, textFontSize, textFontWeight }`                                                                                                                                       |
| `statusChipEnv`                           | `{ bg, text, textFontSize, textFontWeight }`                                                                                                                                            |
| `profileName`                             | `{ fontSize, fontWeight, letterSpacing, lineHeight, numberOfLines }`                                                                                                                    |
| `verifiedBadge`                           | `{ check, fill, size }`                                                                                                                                                                 |
| `inviteAddress`                           | `{ color, fontSize, fontWeight }`                                                                                                                                                       |
| `copyIcon`                                | `{ color, size }`                                                                                                                                                                       |
| `description`                             | `{ color, fontSize, lineHeight, numberOfLines }`                                                                                                                                        |
| `tagChip`                                 | `{ bg, paddingHorizontal, paddingVertical, radius, text, textFontSize, textFontWeight }`                                                                                                |
| `statCard`                                | `{ bg, border, cellPaddingVertical, radius }`                                                                                                                                           |
| `statValue`                               | `{ color, fontSize, fontWeight, voice }`                                                                                                                                                |
| `statLabel`                               | `{ color, fontSize, fontWeight }`                                                                                                                                                       |
| `statDivider`                             | `{ color, width }`                                                                                                                                                                      |
| `friendsRow`                              | `{ avatar, overlap, paddingHorizontal, paddingVertical, radius, text, textFontSize, textFontWeight }`                                                                                   |
| `eventCard`                               | `{ gap, paddingHorizontal, paddingVertical, radius }`                                                                                                                                   |
| `eventDateBlock`                          | `{ bg, label, labelFontSize, labelFontWeight, labelLetterSpacing, radius, time, timeFontSize, timeFontWeight, width }`                                                                  |
| `eventJoinPill`                           | `{ bg, paddingHorizontal, paddingVertical, radius, text, textFontSize, textFontWeight }`                                                                                                |
| `channelPreviewRow`                       | `{ divider, iconBox, iconRadius, nameFontSize, nameFontWeight, paddingHorizontal, paddingVertical }`                                                                                    |
| `privateChip`                             | `{ bg, icon, iconSize, paddingHorizontal, paddingVertical, radius, text, textFontSize, textFontWeight }`                                                                                |
| `roleChip`                                | `{ letterSpacing, paddingHorizontal, paddingVertical, radius, textFontSize, textFontWeight }`                                                                                           |
| `roleChipOwner`, `roleChipAdmin`          | `{ bg, text }`                                                                                                                                                                          |
| `aboutRowLabel`, `aboutRowValue`          | `{ color, fontSize, fontWeight }`                                                                                                                                                       |
| `stickyHeader`                            | `{ avatar, avatarRadius, back, backRadius, bg, border, menu, menuRadius, name, paddingBottom, paddingTop }`                                                                             |
| `bottomBar`                               | `{ bg, border, gap, iconButton{bg,border,icon,iconSize,radius,size}, leaveButton{bg,icon}, paddingBottom, paddingHorizontal, paddingTop, primary{bg,height,radius,text,textFontSize} }` |

### `theme.elevation` — yeni altı anahtar

| Anahtar                      | Açık                              | Koyu                  |
| ---------------------------- | --------------------------------- | --------------------- |
| `workspaceFab`               | `0 10px 24px rgba(79,70,229,.42)` | marka renkli, korunur |
| `workspaceFilterSegment`     | `0 2px 6px rgba(30,34,53,.10)`    | düz (gölgesiz)        |
| `workspaceServerCard`        | `0 4px 12px rgba(30,34,53,.05)`   | düz                   |
| `workspaceSheet`             | `0 -12px 34px rgba(30,34,53,.18)` | düz                   |
| `serverProfilePrimaryAction` | `0 8px 18px rgba(79,70,229,.32)`  | marka renkli, korunur |
| `serverProfileBottomBar`     | `0 -8px 24px rgba(30,34,53,.06)`  | düz                   |

---

## F.2 Saf model fonksiyon imzaları

`apps/mobile/src/app/mobile-sunucular-model.ts`. Hepsi saf; tarih `nowMs: number` olarak dışarıdan gelir.

```ts
type MobileWorkspaceFilterId = "all" | "unread" | "voice";
const MOBILE_WORKSPACE_DEFAULT_FILTER: MobileWorkspaceFilterId;

interface MobileWorkspaceFilterableChannel {
  id: string; mentionCount: number;
  type: MobileWorkspaceChannelSummary["type"]; unreadCount: number;
}
interface MobileWorkspaceFilterableSection<TChannel> { channels: readonly TChannel[] }
interface MobileWorkspaceVoicePresence { channelId: string; participants: readonly unknown[] }

filterMobileWorkspaceSections<TChannel, TSection>(
  sections: readonly TSection[],
  filter: MobileWorkspaceFilterId,
  voiceStates?: readonly MobileWorkspaceVoicePresence[],
): TSection[];

getMobileWorkspaceUnreadChannelCount<TChannel>(
  sections: readonly MobileWorkspaceFilterableSection<TChannel>[],
): number;

hasMobileWorkspaceLiveVoice<TChannel>(
  sections: readonly MobileWorkspaceFilterableSection<TChannel>[],
  voiceStates: readonly MobileWorkspaceVoicePresence[],
): boolean;

buildMobileWorkspaceFilterKey(userId: string, serverId: string): string;             // `${userId}:${serverId}`
parseMobileWorkspaceFilters(raw: string | null | undefined): Record<string, MobileWorkspaceFilterId>;
serializeMobileWorkspaceFilters(map: Readonly<Record<string, MobileWorkspaceFilterId>>): string;
setMobileWorkspaceFilter(map, key: string, filter: MobileWorkspaceFilterId): Record<string, MobileWorkspaceFilterId>;

type MobileServerNameContext = "card" | "header" | "profile" | "sticky";
getMobileServerNameLayout(name: string, context: MobileServerNameContext):
  { fontSize: number; letterSpacing: number; lineHeight: number; numberOfLines: number };

getMobileCategoryHeaderState<TChannel>(section, collapsed: boolean):
  { channelCount: number; chevronRotation: "-90deg" | "0deg"; isCollapsed: boolean;
    showUnreadDot: boolean; tone: "collapsed" | "idle" };

type MobileServerProfileStatId = "channels" | "members" | "voice" | "weekly";
getMobileServerProfileStats(profile: {
  channelCount: number; memberCount: number; voiceActiveCount: number; weeklyMessageCount: number | null;
}): { id: MobileServerProfileStatId; value: string }[];                              // weekly === null → "—"

groupMobileProfileChannelsByCategory<TChannel>(channels: readonly TChannel[]):
  { categoryId: string | null; categoryName: string | null; channels: TChannel[] }[];

getMobileProfileChannelPreview<TChannel>(groups, limit: number):
  { groups: MobileProfileChannelGroup<TChannel>[]; remaining: number };

resolveMobileEventAction(
  event: { scheduledStartAt: string; status: string }, nowMs: number,
): ServerScheduledEventAction | null;                                                // Faz 1'in fonksiyonunu çağırır

formatMobileEventDateBlock(
  event: { scheduledStartAt: string }, nowMs: number, locale: MobileLocale,
): { label: string; time: string };                                                  // "BUGÜN"/"YARIN"/"12 MAR" · "16:00"

getMobileServerAccessLabel(
  accessLevel: ServerProfileAccessLevel,
  labels: { serverAccessApproval: string; serverAccessInvite: string; serverAccessPublic: string },
): string;

sortMobileServersByStar<T extends { starred: boolean }>(servers: readonly T[]): T[];
```

## F.3 İstemci fonksiyonları

`apps/mobile/src/about/mobile-community-invite-client.ts`:

```ts
buildMobileServerUserSettingsPath(serverId): string;
buildMobileServerEventsPath(serverId): string;
buildMobileServerEventPath(serverId, eventId): string;
buildMobileServerEventInterestPath(serverId, eventId): string;

updateMobileServerUserSettings(client, serverId, patch: UpdateServerUserSettingsInput)
  : Promise<MobileServerUserSettingsResponse>;                                       // PATCH .../settings
fetchMobileServerEvents(client, serverId, { includePast? })
  : Promise<MobileServerScheduledEventsResponse>;                                    // GET .../events[?includePast=true]
createMobileServerEvent(client, serverId, input)  : Promise<MobileServerScheduledEventResponse>;  // POST
updateMobileServerEvent(client, { eventId, serverId }, patch) : Promise<…>;          // PATCH
cancelMobileServerEvent(client, { eventId, serverId })        : Promise<…>;          // DELETE, etkinliği döner
setMobileServerEventInterest(client, { eventId, serverId }, interested: boolean) : Promise<…>;    // POST .../interest
```

`includePast` **yalnız `true` iken** sorgu dizesine yazılır — rota şeması `.strict()`, `includePast=false` göndermek 400 üretmez ama gereksiz; şema `"true" | "false"` bekliyor, parametre yoksa yalnız `SCHEDULED`/`ACTIVE` döner.

## F.4 Kopya anahtarları (48 × 2 dil)

`apps/mobile/src/locale/mobile-copy.ts` içinde, `serverProfileNotFound`'un hemen altında tek blok:

`workspaceFilterAll`, `workspaceFilterUnread`, `workspaceFilterVoice`,
`workspaceChannelSearchPlaceholderExpanded`, `workspaceCreateChannelFab`,
`workspaceVoiceRowEmpty`, `workspaceVoiceRowLive`, `channelEmptyVoiceShort`,
`serverMenuViewProfile`, `serverMenuInvite`, `serverMenuMute`, `serverMenuStar`,
`serverMenuShare`, `serverMenuInfo`, `serverMenuMembers`, `serverMenuNotifications`,
`serverMenuSettings`, `serverMenuLeave`, `serverMenuAdminChip`,
`notificationLevelAll`, `notificationLevelMentions`, `notificationLevelNone`,
`serverProfileStatMembers`, `serverProfileStatChannels`, `serverProfileStatVoice`,
`serverProfileStatWeekly`, `serverProfileFriends`, `serverProfileChannelsSection`,
`serverProfileAdminsSection`, `serverProfileAboutSection`, `serverProfileAboutCreated`,
`serverProfileAboutJoined`, `serverProfileAboutAccess`, `serverAccessInvite`,
`serverAccessPublic`, `serverAccessApproval`, `serverProfileShowRemaining`,
`serverProfileOpen`, `serverProfileJoin`, `serverProfileMore`,
`serverProfilePrivateChannel`, `roleOwner`, `roleAdmin`, `eventToday`,
`eventTomorrow`, `eventJoin`, `eventRemind`, `eventSubtitle`.

`{count}` / `{channel}` taşıyan dördü (`workspaceVoiceRowLive`, `serverProfileFriends`, `serverProfileShowRemaining`, `eventSubtitle`) mevcut i18n yardımcısıyla doldurulur; elle string birleştirme yok.
