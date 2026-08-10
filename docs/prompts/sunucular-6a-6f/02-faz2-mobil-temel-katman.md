# Faz 2 — Mobil temel katman: token + kopya + saf model + istemci + rota

> Önce `00-ortak-baglam.md` oku. Branch `uat`. caveman ultra. Kararsız kalırsan sor. Cihaz testini kullanıcı yapar. İzinsiz commit yok.

**Ön koşul:** Faz 1 landed, `01-rapor.md` okundu (genişletilmiş `ServerPublicProfile` alan listesi buradan alınır).
**Hedef:** 6a–6f'in tüm ekranlarının üzerine kurulacağı katmanı kur. **Bu fazda hiçbir ekranın görünümü değişmez** — mevcut ekranlar aynı görünmeye devam eder, altlarına yeni malzeme konur.

---

## A. Neden bu faz var

Üç ekran fazı (3, 4, 5) aynı token grubunu, aynı kopya setini, aynı saf mantığı ve aynı istemci fonksiyonlarını istiyor. Bunlar üç kez yazılırsa üç kez ayrışır. Mesajlaşma M0 ve Hakkında Prompt 02 aynı sebeple temel katmanla başladı; bu faz o kalıbı izler.

---

## B. Görevler

### B1 — Tema token grubu: `serverProfile` + `workspace`

`apps/mobile/src/design/themes.ts`. Kalıp: `voiceRoom` (`lightTheme:1000`, `darkTheme:1296`). İki grup, açık **ve** koyu varyant (00 §5 varsayım).

`MobileTheme.workspace` — 6a/6b/6c için:

| Token                                             | Açık değer                                                                                                                                                                          | Kullanım                  |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| `railWidth`                                       | `62`                                                                                                                                                                                | 6a rail                   |
| `railAvatarSize` / `railAvatarRadius` / `railGap` | `42` / `15` / `11`                                                                                                                                                                  | rail avatarları           |
| `railActiveBar`                                   | `{ width: 4, height: 28, radius: 3, color: #4F46E5 }`                                                                                                                               | aktif sunucu barı         |
| `railActiveRing`                                  | `{ inner: #F6F7FB, outer: #4F46E5, innerWidth: 2, outerWidth: 2 }`                                                                                                                  | avatar halkası            |
| `railDivider`                                     | `{ width: 26, height: 1, color: #DEE1EF }`                                                                                                                                          | + butonundan önceki ayraç |
| `headerIconButton`                                | `{ size: 34, radius: 12, bg: #FFFFFF, border: #E7E9F4 }`                                                                                                                            | ara + "⋯"                 |
| `headerIconButtonCompact`                         | `{ size: 42, radius: 15, … }`                                                                                                                                                       | 6b "⋯"                    |
| `serverNameTitle`                                 | `{ fontSize: 19, fontWeight: "800", lineHeight: 22.4, letterSpacing: -0.19 }`                                                                                                       | 6a ad (lh 1.18×19)        |
| `serverNameCard`                                  | `{ fontSize: 15.5, fontWeight: "800", lineHeight: 18.6 }`                                                                                                                           | 6b/6c ad                  |
| `metaText` / `metaSeparator` / `metaVoice`        | `#6B7194` 11.5/600 · `#C9CDE4` · `#22A366` 11.5/700                                                                                                                                 | meta satırı               |
| `filterTrack` / `filterSegmentActive`             | `#E9EBF5` r13 p3 · `#FFFFFF` r10 + elevation                                                                                                                                        | filtre şeridi             |
| `filterLabelActive` / `filterLabelIdle`           | 12/800 `#1E2235` · 12/600 `#6B7194`                                                                                                                                                 | segment metni             |
| `filterBadge`                                     | `{ minWidth: 16, height: 16, radius: 8, bg: #E5484D, text: 9.5/800 #fff }`                                                                                                          | okunmamış sayacı          |
| `categoryLabel` / `categoryCount`                 | 10.5/800 ls 1.26 `#8A90B0` · 10.5/700 `#C0C5DC`                                                                                                                                     | kategori başlığı          |
| `categoryCollapsed`                               | `{ label: #B7BCD4, chevron: #B7BCD4, unreadDot: #4F46E5 }`                                                                                                                          | kapalı kategori           |
| `channelRow` / `channelRowCompact`                | `{ padding: [8,10], radius: 14, iconBox: 30, iconRadius: 10 }` / `{ padding: [9,10], iconBox: 32, iconRadius: 11 }`                                                                 | 6a / 6b                   |
| `channelRowActive`                                | `{ bg: #EEF0FE, iconBg: #FFFFFF, name: #4F46E5 800 }`                                                                                                                               | aktif kanal               |
| `voiceRowLive`                                    | `{ bg: #FFFFFF, border: #D8EFE3, iconBg: #E7F6EE, icon: #22A366, sub: #22A366 11/600, joinPill: #22A366 }`                                                                          | canlı ses                 |
| `voiceRowEmpty`                                   | `{ iconBg: #FFFFFF, iconBorder: #E7E9F4, icon: #9AA0BC, name: #6B7194 600, sub: #9AA0BC 11.5 }`                                                                                     | boş ses                   |
| `unreadBadge` / `mentionBadge`                    | `{ minWidth: 18, height: 18, radius: 9, bg: #4F46E5 }` / aynı, `#E5484D`                                                                                                            | satır rozetleri           |
| `fab` / `fabCompact`                              | `{ height: 46, radius: 16, paddingH: 16, bottom: 100, right: 16, icon: 18, label: 13.5 }` / `{ height: 50, radius: 18, paddingH: 18, bottom: 104, right: 18, icon: 19, label: 14 }` | etiketli FAB              |
| `sheetHandle` / `sheetBackdrop` / `sheetRadius`   | `38×4 #DEE1EF` · `rgba(20,23,42,.42)` · `28`                                                                                                                                        | 6c                        |
| `quickActionCard`                                 | `{ bg: #F6F7FB, border: #EDEFF8, radius: 16, paddingV: 12, icon: 19, label: 11/700 }`                                                                                               | 6c dörtlü                 |
| `menuListCard` / `menuRow`                        | `{ bg: #F6F7FB, border: #EDEFF8, radius: 18 }` / `{ padding: [13,14], divider: #EDEFF8, icon: 18 #6B7194, label: 14/700, value: 12.5/600 #9AA0BC, chevron: 14 #C0C5DC }`            | 6c liste                  |
| `adminChip` / `dangerRow`                         | `{ bg: #EEF0FE, text: #4F46E5 9.5/800 ls .38, radius: 7, padding: [3,7] }` · `#E5484D`                                                                                              | 6c                        |

`MobileTheme.serverProfile` — 6d/6e için:

| Token                                                  | Açık değer                                                                                                                                                                                                                                                         |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `bannerHeight` / `bannerGradient`                      | `186` / `["#6D5DF6", "#4F46E5", "#3B2FC4"]` konum `[0, .52, 1]`, açı 135°                                                                                                                                                                                          |
| `bannerOverlay` / `bannerBlob`                         | `rgba(20,23,42,.25)` (özel banner üstü) / `rgba(255,255,255,.10)` 190px daire, `top:-30 right:-40`                                                                                                                                                                 |
| `bannerButton`                                         | `{ size: 36, radius: 13, bg: rgba(255,255,255,.18), icon: 17 #fff }`                                                                                                                                                                                               |
| `sheetTop` / `sheetRadius`                             | `150` / `26`                                                                                                                                                                                                                                                       |
| `logo`                                                 | `{ size: 74, radius: 24, borderWidth: 4, borderColor: #F6F7FB, marginTop: -30, font: 24/800 }`                                                                                                                                                                     |
| `statusChipOnline` / `statusChipEnv`                   | `{ bg: #E7F6EE, dot: #22A366, text: #1B8552 11/800 }` / `{ bg: #FFF3E4, text: #B45309 11/800 }`                                                                                                                                                                    |
| `profileName`                                          | `{ fontSize: 22, fontWeight: "800", lineHeight: 25.3, letterSpacing: -0.44 }`                                                                                                                                                                                      |
| `verifiedBadge`                                        | `17` px, `#4F46E5` gövde + beyaz check                                                                                                                                                                                                                             |
| `inviteAddress` / `copyIcon`                           | `12.5/600 #6B7194` / `13` px `#4F46E5`                                                                                                                                                                                                                             |
| `description`                                          | `13 / lineHeight 19.5 / #4C5270`, 3 satır + "Devamı"                                                                                                                                                                                                               |
| `tagChip`                                              | `{ bg: #EEF0FE, radius: 9, padding: [5,10], text: #4F46E5 11/700 }`                                                                                                                                                                                                |
| `statCard` / `statValue` / `statLabel` / `statDivider` | `{ bg: #FFFFFF, border: #E7E9F4, radius: 18, cellPaddingV: 12 }` / `17/800` (Seste `#22A366`) / `10.5/600 #8A90B0` / `1px #EDEFF8`                                                                                                                                 |
| `friendsRow`                                           | `{ radius: 16, padding: [10,12], avatar: 26, overlap: -9, text: 12.5/600 #4C5270 }`                                                                                                                                                                                |
| `eventCard` / `eventDateBlock`                         | `{ radius: 16, padding: [11,12], gap: 11 }` / `{ width: 42, bg: #EEF0FE, radius: 12, label: 9.5/800 ls .57 #4F46E5, time: 14/800 #4F46E5 }`                                                                                                                        |
| `eventJoinPill`                                        | `{ bg: #EEF0FE, radius: 11, padding: [7,12], text: #4F46E5 11.5/800 }`                                                                                                                                                                                             |
| `channelPreviewRow`                                    | `{ padding: [10,11], iconBox: 28, iconRadius: 9, name: 13.5/700, divider: #EDEFF8 }`                                                                                                                                                                               |
| `privateChip`                                          | `{ bg: #F1F2F8, radius: 7, padding: [3,7], icon: 9 #8A90B0, text: 9.5/800 #8A90B0 }`                                                                                                                                                                               |
| `roleChipOwner` / `roleChipAdmin`                      | `{ bg: #FFF3E4, text: #B45309 }` / `{ bg: #EEF0FE, text: #4F46E5 }`, `9.5/800 ls .38 r8 p[4,8]`                                                                                                                                                                    |
| `aboutRowLabel` / `aboutRowValue`                      | `13/600 #6B7194` / `13/700`                                                                                                                                                                                                                                        |
| `stickyHeader`                                         | `{ paddingV: [6,10], bg: #FFFFFF, border: #E7E9F4, back: 34 r12, avatar: 28 r10, name: 15/800 tek satır, menu: 34 r12 }`                                                                                                                                           |
| `bottomBar`                                            | `{ bg: #FFFFFF, border: #E7E9F4, padding: [12,16,26], gap: 9, primary: { height: 50, radius: 17, bg: #4F46E5, text: 15/800 }, iconButton: { size: 50, radius: 17, bg: #F6F7FB, border: #E7E9F4, icon: 19 #4F46E5 }, leaveButton: { bg: #FDECEC, icon: #E5484D } }` |

Kurallar:

- Gölgeler **`MobileThemeElevationStyle`** üzerinden (00 §3.4). Ham `boxShadow` yok. Gereken üç gölge: FAB `0 10px 24px rgba(79,70,229,.42)`, filtre aktif segment `0 2px 6px rgba(30,34,53,.10)`, alt aksiyon çubuğu `0 -8px 24px rgba(30,34,53,.06)`, 6c sheet `0 -12px 34px rgba(30,34,53,.18)`, 6b sunucu kartı `0 4px 12px rgba(30,34,53,.05)`, 6d/6e birincil buton `0 8px 18px rgba(79,70,229,.32)`.
- `letterSpacing` px'e çevrilmiş (00 §4.4). Tabloda zaten dönüşmüş değerler var.
- Koyu varyant açık paletten türetilir: kart `#1E2235`, kenar `#2E3452`, birincil metin `#EDEFF7`, ikincil `#8A90B0`, aksan `#8B85F0`, success `#3DCB84`, danger `#F27074`, warning `#F0A44B` (Bölüm 3'ün koyu toast kuralı). Gradyan koyu temada da aynı kalır.
- Eski anahtar silinmez, gerekiyorsa alias bırakılır — rozet W2'deki `theme.profileBadge` kalıbı.

### B2 — Kopya

`apps/mobile/src/locale/mobile-workspace-copy.ts` (sunucular) ve gerekiyorsa `mobile-copy.ts`. Metinler **birebir** tasarımdan:

| Anahtar                                                                                                       | Metin                                                                                     |
| ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `workspaceFilterAll`                                                                                          | `Tümü`                                                                                    |
| `workspaceFilterUnread`                                                                                       | `Okunmamış`                                                                               |
| `workspaceFilterVoice`                                                                                        | `Sesli`                                                                                   |
| `workspaceChannelSearchPlaceholder` (güncelle)                                                                | `Kanallarda ve mesajlarda ara`                                                            |
| `workspaceCreateChannelFab`                                                                                   | `Kanal`                                                                                   |
| `workspaceVoiceRowEmpty`                                                                                      | `Boş · sesli kanal`                                                                       |
| `workspaceVoiceRowLive`                                                                                       | `Canlı · {count} kişi konuşuyor`                                                          |
| `serverMenuViewProfile`                                                                                       | `Profili gör`                                                                             |
| `serverMenuInvite` / `serverMenuMute` / `serverMenuStar` / `serverMenuShare`                                  | `Davet et` / `Sessize al` / `Yıldızla` / `Paylaş`                                         |
| `serverMenuInfo` / `serverMenuMembers` / `serverMenuNotifications` / `serverMenuSettings` / `serverMenuLeave` | `Sunucu bilgisi` / `Üyeler` / `Bildirim ayarları` / `Sunucu ayarları` / `Sunucudan ayrıl` |
| `serverMenuAdminChip`                                                                                         | `YÖNETİCİ`                                                                                |
| `notificationLevelAll` / `Mentions` / `None`                                                                  | `Tümü` / `Bahsetmeler` / `Kapalı`                                                         |
| `serverProfileStatMembers` / `Channels` / `Voice` / `Weekly`                                                  | `Üye` / `Kanal` / `Seste` / `Bu hafta`                                                    |
| `serverProfileFriends`                                                                                        | `Arkadaşlarından {count} kişi bu sunucuda`                                                |
| `serverProfileChannelsSection`                                                                                | `KANALLAR`                                                                                |
| `serverProfileAdminsSection` / `AboutSection`                                                                 | `YÖNETİCİLER` / `HAKKINDA`                                                                |
| `serverProfileAboutCreated` / `Joined` / `Access`                                                             | `Oluşturulma` / `Katılımın` / `Erişim`                                                    |
| `serverAccessInvite` / `Public` / `Approval`                                                                  | `Davetle` / `Herkese açık` / `Onaylı`                                                     |
| `serverProfileShowRemaining`                                                                                  | `Kalan {count} kanalı gör`                                                                |
| `serverProfileOpen` / `Join`                                                                                  | `Sunucuyu aç` / `Sunucuya katıl`                                                          |
| `serverProfileMore`                                                                                           | `Devamı`                                                                                  |
| `serverProfilePrivateChannel`                                                                                 | `Özel`                                                                                    |
| `roleOwner` / `roleAdmin`                                                                                     | `SAHİP` / `YÖNETİCİ`                                                                      |
| `eventToday` / `eventJoin` / `eventRemind`                                                                    | `BUGÜN` / `Katıl` / `Hatırlat`                                                            |
| `eventSubtitle`                                                                                               | `{channel} · {count} kişi katılıyor`                                                      |
| `channelEmptyVoiceShort`                                                                                      | `Boş`                                                                                     |

Çoğullama/sayı biçimlendirmesi mevcut i18n yardımcısıyla; string birleştirme elle yapılmaz.

### B3 — Saf model katmanı

`apps/mobile/src/app/mobile-sunucular-model.ts` (mevcut dosya genişletilir — yeni dosya açma).

| Fonksiyon                                                | Sözleşme                                                                                                                                                                                          |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MobileWorkspaceFilterId = "all" \| "unread" \| "voice"` | filtre kimliği                                                                                                                                                                                    |
| `filterMobileWorkspaceSections(sections, filter)`        | `all` → değişmez; `unread` → yalnız `unreadCount > 0 \|\| mentionCount > 0` kanallar, boş kategoriler düşer; `voice` → yalnız ses kanalları, **canlı olanlar üstte**, kategori gruplaması korunur |
| `getMobileWorkspaceUnreadChannelCount(sections)`         | filtre şeridi rozeti; 0 ise rozet gizlenir                                                                                                                                                        |
| `hasMobileWorkspaceLiveVoice(sections)`                  | "Sesli" segmentinin yeşil noktası                                                                                                                                                                 |
| `buildMobileWorkspaceFilterKey(userId, serverId)`        | AsyncStorage bileşik anahtarı                                                                                                                                                                     |
| `parse/serialize/setMobileWorkspaceFilter`               | `use-mobile-collapsed-sections` kalıbının birebir eşi                                                                                                                                             |
| `getMobileServerNameLayout(name, context)`               | 6f kuralı: `context: "header" \| "card" \| "sticky"`; döner `{ numberOfLines, fontSize, lineHeight, letterSpacing }` — `sticky` → `1`, diğerleri → `2`                                            |
| `getMobileCategoryHeaderState(section, collapsed)`       | `{ chevronRotation, labelColor, countColor, showUnreadDot }`; kapalıda `-90deg` + `#B7BCD4`; boş kategori (0 kanal) **daima kapalı** döner                                                        |
| `getMobileServerProfileStats(profile)`                   | dört hücre: `[üye, kanal, seste, bu hafta]`; `weeklyMessageCount === null` → değer `—`                                                                                                            |
| `groupMobileProfileChannelsByCategory(channels)`         | 6e kategori gruplaması, kategori sırası `position`, kategorisizler sona                                                                                                                           |
| `getMobileProfileChannelPreview(groups, limit)`          | 6d ön izleme: ilk `limit` kanal + `remaining` sayısı ("Kalan n kanalı gör")                                                                                                                       |
| `resolveMobileEventAction(event, now)`                   | `"join"` (başlangıca ≤15 dk veya başladı) \| `"remind"` (>15 dk) — **Faz 1'deki saf fonksiyonu çağırır, kendi eşiğini hesaplamaz**                                                                |
| `formatMobileEventDateBlock(event, now, locale)`         | `{ label: "BUGÜN" \| "YARIN" \| "12 MAR", time: "16:00" }`                                                                                                                                        |
| `getMobileServerAccessLabel(accessLevel)`                | `Davetle` / `Herkese açık` / `Onaylı`                                                                                                                                                             |
| `sortMobileServersByStar(servers)`                       | `starred desc` → mevcut sıralama (Faz 1 §C5)                                                                                                                                                      |

Hepsi **saf** — React yok, tarih için `now` parametre olarak geçilir (test edilebilirlik).

### B4 — Kalıcılık hook'u

`apps/mobile/src/app/providers/use-mobile-workspace-filter.ts` (yeni). `use-mobile-collapsed-sections.ts` birebir kalıbı:

- Tek AsyncStorage anahtarı `whispr.mobile.workspace-filter`
- `userToggleVersion` ref'i ile yavaş disk okumasının kullanıcı seçimini ezmesini engelle
- `collapsedSectionsRef` muadili ref mirror — render fazında yan etki yok (React Compiler güvenli)
- Dönen: `{ filter(serverId), setFilter(serverId, id) }`, varsayılan `"all"`

### B5 — İstemci + query katmanı

- `apps/mobile/src/about/mobile-community-invite-client.ts`: `fetchMobileServerProfile` genişletilmiş şemayı parse eder (Faz 1 B2). Yeni fonksiyonlar:
  - `updateMobileServerUserSettings(client, serverId, patch)` → Faz 1 B5 ucu
  - `fetchMobileServerEvents`, `createMobileServerEvent`, `updateMobileServerEvent`, `cancelMobileServerEvent`, `setMobileServerEventInterest` → Faz 1 B3 uçları
- `apps/mobile/src/query/mobile-query-keys.ts`: `serverProfile(serverId)`, `serverEvents(serverId)` anahtarları. **Mevcut anahtar adlarını değiştirme** — mesajlaşma fırtınası vakasındaki query-key tuzağı.
- Invalidation kuralları (yazılı, Faz 4/5 buna uyar):
  - `updateMobileServerUserSettings` → `serverProfile(serverId)` + sunucu listesi (rail sıralaması `starred`'a bağlı)
  - etkinlik mutasyonları → `serverEvents(serverId)` + `serverProfile(serverId)` (yaklaşan etkinlik kartı)

### B6 — Rota kaydı hazırlığı

Faz 5 iki yeni ekran açacak (etkinlik listesi + etkinlik formu). Rota kaydı **üç dosyayı birden** ister (Admin W3/D1 tuzağı):

1. `apps/mobile/src/navigation/mobile-navigation-types.ts` — param tipi
2. `apps/mobile/src/navigation/mobile-navigator.tsx` — `RootStack.Screen`
3. `apps/mobile/src/app/screens/mobile-screen-containers.tsx` — container

Bu fazda **yalnız param tipleri** eklenir (`ServerEvents: { serverId }`, `ServerEventForm: { serverId, eventId?: string }`); ekranlar Faz 5'te. Derleme kırılmayacak şekilde.

---

## C. Bağlayıcı kararlar

1. Ekrana özel değer `StyleSheet` içinde literal olarak **yazılmaz** — `theme.workspace` / `theme.serverProfile` üzerinden gelir. Görünüm ekranındaki 803-literal vakası tekrarlanmaz.
2. Filtre durumu **cihaz yerel**; sunucuya gönderilmez.
3. 6f kuralı `getMobileServerNameLayout` üzerinden uygulanır; hiçbir ekran kendi `numberOfLines`'ını yazmaz.
4. Etkinlik zaman mantığı Faz 1'in saf fonksiyonundan gelir; mobil kendi eşiğini kurmaz.

## D. Yapılmayacaklar

- Herhangi bir ekranın görünümünü değiştirmek. Bu faz sonunda uygulama **birebir aynı** görünür.
- Kategori `+` butonunu kaldırmak (Faz 3'ün işi).
- Yeni bileşen kiti öğesi eklemek — Faz 3/4/5 gerçek ihtiyaçla ekler.
- Eski token anahtarlarını silmek.

## E. Kapı

```bash
pnpm --filter @wizards/mobile typecheck
```

```bash
pnpm --filter @wizards/mobile test
```

Ek:

- `mobile-sunucular-model.test.ts` yeni fonksiyonların **her biri** için test taşır (filtre üç modu, uzun ad üç durumu, kapalı/boş kategori, etkinlik join/remind sınırı, `weeklyMessageCount: null`).
- Mevcut bileşen testleri **değişmeden** geçer — değişiyorsa ekran davranışı sızmış demektir, geri al.

## F. Rapor

`docs/prompts/sunucular-6a-6f/raporlar/02-rapor.md` — 00 §8. Ek olarak token grubu anahtar listesi (Faz 3/4/5 buna göre stil yazacak) ve saf model fonksiyon imzaları.
