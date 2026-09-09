# Dalga 0 — Sözleşme katmanı

> **Başlatma prompt'u.** Aşağıdaki bloğun tamamını yeni bir Claude Code oturumuna ver.

---

Whispr monorepo, `uat` dalı. Görev: `design_handoff/mesajlar-paketi/` (2026-08-27 turu) SPEC
§15–§17'nin **sözleşme katmanını** kur. Bu dalga bitmeden hiçbir yüzey şeridi başlamaz.

Önce oku: `docs/prompts/whispr-mesajlar-profil/00-ortak-baglam.md` (kurallar, doğrulanmış 21
gerçek, 16 bağlayıcı karar, 11 tuzak) ve `design_handoff/mesajlar-paketi/SPEC-MESAJLAR.md`
§15, §16, §17. Ölçü sorularının cevabı `design_handoff/mesajlar-paketi/referans/Mesajlar.dc.html`
inline `style` değerleridir (§15 `L950–L1300`, §16 `L1415–L1560`, §17 `L520–L630`).
Kod tabanı sorularının cevabı için `graphify query "<soru>"` kullan.

Dört şerit **paralel** koşulur; dosya kümeleri ayrıktır.

---

## Ş0.1 — Ölçü sözlüğü

**Sahiplenilen dosyalar:** `apps/web/src/lib/messages/metrics.ts`,
`apps/web/src/lib/messages/metrics.test.ts`

`MESSAGES_METRICS` içine dört yeni blok. Değerler `Mesajlar.dc.html` inline `style`
değerlerinden okunur; SPEC ile fark varsa HTML kazanır ve `SPEC_DEVIATIONS` içine
`{ field, html, spec }` kaydı düşer.

1. **`profilePanel`** — §15. En az şunlar: `width: 330`, `headerPaddingTop/X/Bottom` (`16 16 14`),
   `headerTitleFontSize: 14.5`, `closeSize: 30`, `closeRadius: 10`;
   `identity`: `paddingTop: 22, paddingX: 18, paddingBottom: 16, gap: 11`,
   `dmTileSize: 72`, `dmTileFontSize: 24`, `dmRingInner: 3`, `dmRingOuter: 8`,
   `dmStatusDotSize: 16`, `dmStatusDotBorder: 3`, `groupTileSize: 66`, `groupTileRadius: 22`,
   `groupTileFontSize: 22`, `nameFontSize: 18`, `handleFontSize: 12.5`,
   `statusPillPaddingY: 5, statusPillPaddingX: 11, statusPillDotSize: 6`,
   `actionHeight: 36`, `actionRadius: 12`, `actionIconSize: 36`, `actionGap: 6`;
   `tabs`: `paddingTop: 12, paddingX: 14, paddingBottom: 10, gap: 3, height: 31, radius: 10,
fontSize: 12`;
   `body`: `gap: 16, paddingTop: 4, paddingX: 16, paddingBottom: 20, scrollThreshold: 561`;
   `sectionLabelFontSize: 10.5`, `sectionLabelTracking: 0.15`;
   `badge`: `columns: 2, gap: 6, cardPaddingY: 9, cardPaddingX: 10, cardRadius: 11,
tileSize: 26, tileRadius: 8, iconSize: 13, labelFontSize: 11.5`;
   `dateCard`: `radius: 14, padding: 12, tileSize: 32, tileRadius: 11`;
   `mutualServerTileSize: 28`, `mutualServerTileRadius: 9`, `mutualFriendTileSize: 28`,
   `mutualFriendDotSize: 9`;
   `members`: `addButtonHeight: 38, addButtonRadius: 13, rowPaddingY: 7, rowPaddingX: 8,
rowRadius: 11, avatarSize: 32, presenceDotSize: 10, presenceDotBorder: 2.5,
nameFontSize: 12.5, subFontSize: 11`;
   `inviteCard`: `radius: 14, padding: 13, copyButtonSize: 34`;
   `media`: `columns: 3, gap: 6, radius: 12, overlayIndex: 6, fileTileSize: 32`;
   `settings`: `radioCardRadius: 14, radioRingSize: 17, radioDotSize: 8,
privacyCardRadius: 14, privacyRowPaddingY: 11, privacyRowPaddingX: 12,
privacyTileSize: 30, privacyTileRadius: 10, privacyRowMinHeight: 56,
switchWidth: 40, switchHeight: 24, switchKnobSize: 18, switchKnobLeftOff: 3,
switchKnobLeftOn: 19, switchTransitionMs: 180`.
2. **`inviteModal`** — §16: `width: 560, radius: 22`,
   `headerPaddingTop: 22, headerPaddingX: 24, headerPaddingBottom: 18`,
   `headerTileSize: 40, headerTileRadius: 14, titleFontSize: 18, closeSize: 32`,
   `searchHeight: 42, searchRadius: 13`,
   `chipHeight: 30, chipAvatarSize: 22, chipRemoveSize: 18`,
   `rowPaddingY: 9, rowPaddingX: 10, rowRadius: 13, checkboxSize: 19, checkboxRadius: 6,
rowAvatarSize: 36, rowPresenceDotSize: 11, rowNameFontSize: 13.5, rowStatusFontSize: 11.5`,
   `memberStackAvatarSize: 26, memberStackOverlap: -7, memberStackBorder: 2`,
   `linkBoxRadius: 14, linkBoxPadding: 13, expirySegmentHeight: 24, expirySegmentRadius: 8,
copyButtonHeight: 36`,
   `footerPaddingTop: 18, footerPaddingX: 24, footerPaddingBottom: 20`.
3. **`moreMenu`** — §17: `dmWidth: 254, groupWidth: 262, top: 41, padding: 6, radius: 17`,
   `headerTileSize: 32`, `rowPaddingY: 8, rowPaddingX: 9, rowRadius: 10, rowFontSize: 13,
rowIconSize: 16, rowGap: 11, counterFontSize: 11`,
   `submenuIndent: 36`, `mutePillHeight: 26, mutePillPaddingX: 9, mutePillFontSize: 11`.
4. **`toast`** — §17: `paddingY: 10, paddingX: 22, iconSize: 20, fontSize: 12.5, closeSize: 24,
autoCloseMs: 5000` (K13).

Ayrıca:

- `sidePanel` bloğuna `profileWidth: 330` ekle. **`sidePanelWidth: 340` değişmez** (tuzak 10).
- `NAV_PANEL_ADJUSTMENTS` üstündeki yorumu güncelle: 2026-08-27 turu da 228 diyor, karar K3 ile
  280'de kalıyor; gerekçe (kullanıcı ayağı + Etkinlikler gün paneli) korunur.
- `SPEC_DEVIATIONS` içine §15–§17 sapmaları + K2 metin sapması (`Uçtan uca şifreli` →
  `Aktarımda şifreli`) ve K15 (`Süresiz` toast metni) sayıya dökülemeyen sapma olarak dosya
  başındaki yorum listesine yazılır.

`metrics.test.ts` içine: her yeni blok için "tanımlı ve pozitif sayı" testi, `profileWidth !==
sidePanelWidth` testi, `SPEC_DEVIATIONS` kayıtlarının `field` yollarının gerçekten sözlükte
bulunduğu testi, `NAV_PANEL_ADJUSTMENTS.width.to === HOME_METRICS.panel` eşitliğinin **hâlâ**
geçtiği testi.

---

## Ş0.2 — Migration + Prisma şeması

**Sahiplenilen dosyalar:** `packages/db/prisma/schema.prisma`,
`packages/db/prisma/rebaseline-migrations/<yeni-klasör>/migration.sql`,
`packages/db/prisma/schema-messages-screen.test.mjs`

İki kolon:

1. `DMParticipant.mutedUntil DateTime?` — K8. Yorumla gerekçesini yaz: `muted` boolean süresiz
   sessizliği taşıyor, `mutedUntil` süreliyi; ikisi `notifyLevel` ile aynı update içinde yazılır.
   `UserChannelSettings.mutedUntil` emsaldir, aynı adlandırma kullanılır.
2. `UserSettings.showTypingIndicator Boolean @default(true)` — K9. Yorumu `showReadReceipts` ile
   ikiz olduğunu ve §15.5 gizlilik kartının iki anahtarını beslediğini söylesin.

Index gerekmez: `mutedUntil` yalnız satır zaten okunmuşken değerlendirilir, üzerinde filtre yok.
Bunu şema yorumuna yaz — bir sonraki okuyucu "index unutulmuş mu" diye sormasın.

Migration `prisma/rebaseline-migrations/` altına yazılır (tuzak 9). Geri doldurma gerekmez:
iki kolon da nullable ya da default'lu.

`packages/db/prisma/schema-messages-screen.test.mjs` bu ekranın şema sözleşmesini zorluyor —
iki yeni kolon oraya beklenti olarak eklenir. `scripts/schema-index-audit.test.mjs` de koşar;
index eklenmemesinin gerekçesi şema yorumunda yazılı olmalı ki denetim onu boşluk saymasın.

Kapı: `pnpm --filter @wizards/db exec prisma migrate dev` yerel veritabanında koşar,
`pnpm --filter @wizards/db test` yeşil, `prisma generate` temiz.

---

## Ş0.3 — `@wizards/types` sözleşmeleri

**Sahiplenilen dosyalar:** `packages/types/src/messages-screen.ts`,
`packages/types/src/messages-screen.test.ts`, `packages/types/src/index.ts` (yalnız yeni export
satırları)

### Durum eksenleri

- `MessagesPanel` → `"thread" | "search" | "profile" | null`.
- Yeni `ProfilePanelTab = "genel" | "uyeler" | "medya" | "ayarlar"`.
- `MessagesModal` birleşimine `{ readonly kind: "invite" }` eklenir.
- `MessagesMenu` birleşimine `{ readonly kind: "conversationMore" }` ve
  `{ readonly kind: "muteSubmenu" }` eklenir. Mevcut `{ kind: "conversation" }` yuvası **kalır**
  (satır menüsü sıralaması için kullanılıyor); iki yuvanın farkını yorumla yaz.
- `MessagesScreenState` yeni alanlar:
  `profileTab: ProfilePanelTab`, `role: DMParticipantRole`,
  `mutedUntil: string | null`, `muted: boolean`,
  `toast: ConversationToast | null`,
  `privacy: { readReceipts: boolean; typingIndicator: boolean }`,
  `inviteSelection: readonly string[]`, `inviteLinkExpiry: InviteLinkExpiry`,
  `detailsDrawerOpen: boolean`, `searchRequestId: number` (K14 — `DMConversationPage` iki
  ad-hoc `useState` alanını buraya katlıyor).
- Yeni action'lar: `openProfile` (`tab?: ProfilePanelTab`), `setProfileTab`, `openMuteSubmenu`,
  `setMute` (`{ muted, mutedUntil }`), `showToast`, `dismissToast`, `setPrivacy`,
  `toggleInviteSelection`, `clearInviteSelection`, `setInviteLinkExpiry`,
  `openDetailsDrawer` / `closeDetailsDrawer`, `bumpSearchRequest`.
- Reducer davranışı (`dc.html` `go()` — tuzak 3): **görünüm ya da sohbet değişince**
  `panel`, `modal`, `menu`, `profileTab`, `toast` sıfırlanır; `profileTab` `"genel"` olur.
  `openProfile` thread ve aramayı **kapatır** (K5). `openMuteSubmenu` yalnız
  `menu.kind === "conversationMore"` iken geçerlidir, aksi hâlde durum değişmez.
  DM'de `profileTab === "uyeler"` **imkânsızdır**: reducer bunu `"genel"` yapar.

### DTO şemaları (zod, `.strict()`)

- `ConversationToastSchema` — `{ kind, text }`; `kind` §17'nin 12 toast'ı + K15'in `mutedForever`
  değerinden oluşan enum. Metin i18n'den gelir, DTO yalnız `kind` taşır; `text` istemci tarafı
  alanıdır ve şemada **yoktur** — bunu yorumla söyle.
- `MuteDurationSchema` — `"15m" | "1h" | "8h" | "forever"`.
- `InviteLinkExpirySchema` — `"7d" | "1d" | "never"`.
- `ProfileBadgeDTOSchema` — `{ id: BadgeIdSchema, earnedAt: string | null, tier: number }`.
- `UserProfilePanelDTOSchema` — `{ userId, name, initials, handle, tint, presence, statusText,
bio: string | null, badges: ProfileBadgeDTO[], badgeTotal: number,
friendship: { since: string; metViaServerName: string | null; durationLabelKey } | null,
mutualServers: { id, name, initials, tint, onlineCount }[],
mutualFriends: { id, name, initials, tint, presence }[],
notifyLevel, muted, mutedUntil, privacy: { readReceipts, typingIndicator },
blocked: boolean }`.
- `GroupProfilePanelDTOSchema` — `{ conversationId, name, initials, avatarColor, memberCount,
onlineCount, description: string | null, viewerRole, createdAt, ownerName,
pinnedMessages: PinnedMessageDTO[], invite: { code, url, expiresAt } | null,
addPolicy, historyVisibility, notifyLevel, muted, mutedUntil }`.
- `GroupMemberRowDTOSchema` — `{ userId, name, initials, tint, presence, statusText, role, isSelf }`.
- `SharedMediaItemDTOSchema` / `SharedFileDTOSchema` / `SharedLinkDTOSchema` +
  `SharedMediaPageSchema` (`{ items, nextCursor, total }` — K16).
- `InviteCandidateDTOSchema` — `{ userId, name, initials, tint, presence, statusText }`.
- `AddMembersRequestSchema` — `{ userIds: string[] }` (1..25, benzersiz).
- `SetMutedRequestSchema` — mevcut `SetDMMutedBodySchema` **kırılmadan** genişletilir:
  `{ muted: boolean; duration?: MuteDuration }`. Eski gövde hâlâ geçerli olsun.
- `UpdatePrivacyRequestSchema` — `{ readReceipts?: boolean; typingIndicator?: boolean }`
  (en az biri zorunlu).
- `ReportUserRequestSchema` — mobil route-logic'in bugün kabul ettiği gövdeyle **birebir aynı**;
  yeni bir biçim icat edilmez, mevcut şema paylaşıma çıkarılır.

Test: her şemanın geçerli/geçersiz örneği, reducer'ın 12 yeni geçişi, "iki panel aynı anda açık
kalamaz" ve "sohbet değişince `profileTab` sıfırlanır" testleri.

---

## Ş0.4 — i18n

**Sahiplenilen dosyalar:** `apps/web/src/lib/locale/messages/tr.ts`,
`apps/web/src/lib/locale/messages/en.ts`

TR metinleri SPEC'ten **birebir** kopyalanır. Anahtar ağaçları:

- `messages.profile.title.user` = `Kullanıcı profili`, `.group` = `Grup profili`
- `messages.profile.tab.genel|uyeler|medya|ayarlar` = `Genel` · `Üyeler` · `Medya` · `Ayarlar`
- `messages.profile.action.message` = `Mesaj gönder`, `.voiceCall`, `.videoCall`,
  `.addMember` = `Üye ekle`, `.mute`, `.groupSettings`
- `messages.profile.section.about` = `HAKKINDA`, `.groupDescription` = `GRUP AÇIKLAMASI`,
  `.badges` = `ROZETLER`, `.mutualServers` = `ORTAK SUNUCULAR`,
  `.mutualFriends` = `ORTAK ARKADAŞLAR`, `.pinnedMessages` = `SABİTLENEN MESAJLAR`,
  `.inviteLink` = `DAVET BAĞLANTISI`, `.admins` = `YÖNETİCİ`, `.members` = `ÜYE`,
  `.sharedMedia` = `PAYLAŞILAN MEDYA`, `.sharedFiles` = `PAYLAŞILAN DOSYALAR`,
  `.sharedLinks` = `PAYLAŞILAN BAĞLANTILAR`, `.notifications` = `BİLDİRİM AYARLARI`,
  `.privacy` = `GİZLİLİK VE GÜVENLİK`, `.addPolicy` = `KİMLER ÜYE EKLEYEBİLİR`
- `messages.profile.badge.<badgeId>.label` ve `.description` — §15.3 tablosundaki altı rozet için
  SPEC metni; kalan on rozetin metni **Ayarlar ekranındaki mevcut anahtarlardan** alınır, yeniden
  yazılmaz. Sayaç `messages.profile.badgeCount` = `{earned} / {total}`.
- `messages.profile.friendship.since` = `{date} tarihinden beri arkadaşsınız`,
  `.metVia` = `{server} üzerinden tanıştınız · {duration}`,
  `.groupCreated` = `{date} tarihinde kuruldu`, `.groupOwner` = `Kurucu: {name} · {duration}`
- `messages.profile.privacy.encryption.title` = `Aktarımda şifreli` (K2),
  `.encryption.subtitle` = `TLS 1.3 · sunucuda şifreli saklanır` (K2),
  `.encryption.state` = `Aktif`,
  `.readReceipts.title` = `Okundu bilgisi`,
  `.readReceipts.subtitle` = `Mesajı gördüğün karşı tarafa iletilir`,
  `.typing.title` = `Yazıyor göstergesi`, `.typing.subtitle` = `Yazarken karşı taraf görür`
- `messages.profile.notify.all.title` = `Tüm mesajlar`, `.all.subtitle` = `Her yeni mesajda bildirim`,
  `.mentions.title` = `Sadece bahsedilmeler`, `.mentions.subtitle` = `@ ile anıldığında bildirim`,
  `.none.title` = `Kapalı`, `.none.subtitle` = `Bildirim yok, yalnızca rozet`
- `messages.profile.danger.block` = `Kullanıcıyı engelle`, `.report` = `Bildir`,
  `.clearHistory` = `Geçmişi temizle`, `.leaveGroup` = `Gruptan ayrıl`, `.deleteGroup` = `Grubu sil`
- `messages.more.*` — §17'nin iki menüsündeki **her** satır + `YÖNETİM` bölüm etiketi +
  `Sessize al` alt menüsünün dört süresi + `{duration} sessiz` / `Sessiz` pill metinleri
- `messages.invite.*` — §16'nın başlığı, alt satırı (`{group} · {n} / 250 üye`), arama
  placeholder'ı, `Henüz kimse seçilmedi`, `ARKADAŞLARIN`, `{n} eklenebilir`,
  `{n} kişi zaten üye`, `BAĞLANTIYLA DAVET`, üç süre etiketi, `Kopyala`,
  `{n} kişi seçildi · grup {m} üye olur`, `Eklemek için arkadaş seç ya da bağlantı paylaş`,
  `{n} kişiyi ekle`, `Ekle`, `İptal`
- `messages.toast.*` — §17'nin 12 metni + K15'in `Sohbet süresiz sessize alındı` satırı
- `messages.profile.a11y.*` — presence noktalarının metin karşılıkları, anahtarların ve kapat
  düğmelerinin `aria-label` metinleri

EN karşılıkları aynı ağaçta yazılır. Mevcut anahtar **silinmez, yeniden adlandırılmaz**.

---

## Dalga 0 kapısı

```bash
pnpm --filter @wizards/types test
```

```bash
pnpm --filter @wizards/web typecheck
```

```bash
pnpm --filter @wizards/db exec prisma migrate dev
```

Üçü de temiz geçmeden Dalga 1 başlamaz. Rapor: `raporlar/01-rapor.md` — hangi değer HTML'den
geldi, hangi sapma kayda geçti, hangi anahtar mevcut Ayarlar sözlüğünden yeniden kullanıldı.
