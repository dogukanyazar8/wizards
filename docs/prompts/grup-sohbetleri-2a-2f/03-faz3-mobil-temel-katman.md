# Faz 3 — Mobil temel katman: token, kopya, model, istemci, rota

**Ön koşul:** Faz 2 kapısı geçti. **Sonraki faz:** 04.
**Önce oku:** `00-ortak-baglam.md`, `raporlar/01-rapor.md`, `raporlar/02-rapor.md`.

```bash
graphify query "mobile theme token group messaging locale copy query client"
```

---

## A. Neden bu faz var

Beş ekranın hepsi aynı tokenları, aynı kopyayı, aynı türetme kurallarını ister. Bunlar ekran fazlarında yazılırsa üç yerde üç farklı "3 kişi okudu" biçimlendirmesi olur.

**Bu fazın kapısı sert: hiçbir ekran dosyası değişmez.** `git diff --stat` çıktısında `screens/` altında yalnız yeni rota kaydı görülebilir; render kodu görülemez.

---

## B. Görevler

### B1 — `theme.groupChat` token grubu

`apps/mobile/src/design/themes.ts` içine `MobileGroupChatTokens` arayüzü + `lightTheme.groupChat` + `darkTheme.groupChat`. Desen `theme.workspace` / `theme.serverProfile` ile birebir aynı (§3.7).

Alt gruplar ve her birinin **kaynağı** (HTML satır numarası verilen yer, değeri oradan oku):

| Alt grup         | Kapsam                                                                                                                                                                             | Kaynak satır   |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| `filterChip`     | aktif/pasif zemin+metin, sayaç rengi, h30/r11, yatay padding, fontlar                                                                                                              | 57–62          |
| `pinnedSection`  | bölüm etiketi, iğne ikonu, sabitlenen satır zemini (`#FFFFFF`)                                                                                                                     | 64–65          |
| `groupRow`       | 46px çift avatar alanı, 30px karo, r11, 2.5px ring, `+N` karosu, `· N` üye sayacı                                                                                                  | 66–71, 102–105 |
| `rowTyping`      | yeşil üç nokta (4px), `#1B8A55` 13/700                                                                                                                                             | 72             |
| `rowBadges`      | `@N` (`#DC4E5F`), okunmamış (`#4F46E5`), sessiz okunmamış (`#C9CDE3`), 18/r9, gap 4                                                                                                | 76, 110        |
| `rowMuted`       | ad `#3A3F5C` 600, üstü çizili çan 13px `#A2A8C3`                                                                                                                                   | 107            |
| `rowPreviewIcon` | çift tik 14px indigo, medya ikonu 13px `#8A90B0`, BOT çipi                                                                                                                         | 87, 120, 128   |
| `stepHeader`     | başlık 17/800, alt satır 11.5/600, sayaç 13/800 + `/32` `#A2A8C3`, geri alanı 26×38                                                                                                | 154–157        |
| `stepBar`        | 3px çubuk, r2, gap 4, dolu/boş                                                                                                                                                     | 158            |
| `pickerSearch`   | h42/r14 `#ECEEF7`, 16px ikon, 13.5/500 placeholder                                                                                                                                 | 160–163        |
| `selectedChip`   | h34/r12 `#EEF0FE`, 22/r8 mini avatar, 12/700 indigo, 13px çarpı                                                                                                                    | 165–167        |
| `pickerRow`      | 42/r15 avatar, 12px nokta + 2.5 ring, 14.5/700 ad, 12/500 kullanıcı adı, 24/r9 kutu                                                                                                | 171–195        |
| `pickerBlocked`  | `opacity .55`, 17px kilit `#A2A8C3`                                                                                                                                                | 197–201        |
| `bottomBar`      | beyaz zemin + `#E7E9F4` üst kenar, h50/r16 birincil buton, gölge, pasif `#D5D9EA`, sayaç rozeti                                                                                    | 203–205        |
| `identityAvatar` | 72/r24, 24/800 baş harf, 28/r10 kamera düğmesi, -4 ofset, gölge                                                                                                                    | 227–230        |
| `colorSwatch`    | 28/r10, gap 8, seçili çift halka (`2px zemin + 4px renk`)                                                                                                                          | 233–239        |
| `formField`      | etiket 11/800 ls .1em, sayaç 11/700 `#A2A8C3`, h48/r15 alan, odak kenarı + halka, 15/700                                                                                           | 242–246        |
| `formHint`       | 13px bilgi ikonu, 11.5/1.45 `#8A90B0`, vurgu 700 `#6B7194`                                                                                                                         | 247            |
| `formTextArea`   | h62/r15 `#ECEEF7`, padding 12/14                                                                                                                                                   | 249            |
| `memberStrip`    | 46/r16 karo, 52px sütun, gap 14, "Sen" etiketi indigo, kesikli "Ekle"                                                                                                              | 251–257        |
| `settingsCard`   | beyaz r16 kart, satır padding 13/14, ayırıcı `#F0F1F8`, 18px ikon, 13.5/700 başlık, 12.5/600 değer, 14px chevron                                                                   | 259–263        |
| `toggle`         | 44×26/r13, padding 3, 20px thumb, açık `#4F46E5` / kapalı `#D5D9EA`, gölge                                                                                                         | 261, 446–448   |
| `chatHeader`     | 22×38 geri, 38px çift avatar (25/r9 karo, 2px ring), 15.5/800 ad, meta satırı, iki 38/r13 buton                                                                                    | 280–293        |
| `pinnedStrip`    | beyaz zemin, `#F0F1F8` üst çizgi + `0 1px 0 #EAECF5`, 15px iğne, 10.5/800 ls .08em etiket, 12.5/600 önizleme, 15px çarpı                                                           | 295–299        |
| `systemCapsule`  | maks 250, padding 7/13, r12, `#ECEEF7`, 11.5/600, vurgu 800 `#3A3F5C`                                                                                                              | 302            |
| `incomingBubble` | 30/r11 avatar, 11.5/800 gönderen adı (padding-left 4), balon 18/18/18/7, padding 9/13/8, gölge, gövde `msg-size`/1.42/500, saat 10.5/600 `#9AA0BC`, gap 9, maks %78, grup arası 12 | 303–312        |
| `replyQuote`     | 2.5px sol çizgi (gönderen rengi), padding 1/0/1/8, alt boşluk 6, ad 11.5/800, metin 12.5/500 maks 190                                                                              | 318–321        |
| `reactionChip`   | h24/r12, nötr beyaz + `#E4E6F2`, kendi `#EEF0FE` + `#C7CBF5`, emoji 12, sayı 11/800                                                                                                | 327–330        |
| `outgoingBubble` | `#4F46E5`/beyaz, 18/18/7/18, gölge, saat `rgba(255,255,255,.68)`, 14px tik, padding-left 38                                                                                        | 333–340        |
| `mentionPill`    | gelen `#EEF0FE`/`#4F46E5`, giden `rgba(255,255,255,.20)`/beyaz, r5, padding 1/4, 800                                                                                               | 335            |
| `readStack`      | 16px yuvarlak avatar, 1.5px zemin ringi, -5 binişme, 7/800 baş harf, 10.5/600 `#9AA0BC`                                                                                            | 342–343        |
| `typingRow`      | 22/r8 avatar yığını (2px ring, -7 binişme), h30/r15 beyaz kapsül, 5px nokta, 11.5/600                                                                                              | 346–351        |
| `composer`       | 40/r14 `+`, h40/r14 alan, 14/500 placeholder, 18px emoji, 40/r14 indigo aksiyon + gölge                                                                                            | 354–360        |
| `infoIdentity`   | 80/r26 avatar, 26/800 baş harf, 20/800 ad, 12.5/600 meta                                                                                                                           | 380–385        |
| `quickAction`    | beyaz r16 kutu, padding 11/0, 19px ikon, 11/700 etiket, gap 8                                                                                                                      | 387–392        |
| `mediaTile`      | h66/r14; görsel/video `#E4E7F3`, dosya `#FCE9E9`/`#DC4E5F`/9.5-700 `#B0455A`, `+N` `#ECEEF7` 14/800                                                                                | 399–404        |
| `memberRow`      | 38/r14 avatar, 11px nokta + 2px ring, 14/700 ad, 11.5/500 alt satır, `SEN` çipi, rol çipleri (sahip `#FEF0E8`/`#C77A2B`, yönetici `#EEF0FE`/`#4F46E5`), 16px üç nokta              | 407–411        |
| `radioRow`       | 22px daire; seçili `#4F46E5` + 8px beyaz iç nokta; boş 1.8px `#D5D9EA`                                                                                                             | 433–435        |
| `adminChip`      | 9.5/800 `#C77A2B` on `#FEF0E8`, padding 2/6, r6                                                                                                                                    | 437            |
| `dangerRow`      | 18px çıkış ikonu + 13.5/700 `#DC4E5F`, ayrı kart, üst boşluk 16                                                                                                                    | 450–451        |

**Koyu tema kuralı.** Teslim paketinde grup ekranlarının koyu varyantı **yok** (HTML satır 459: "Sıradaki adımlar: koyu tema grup varyantı"). Bu yüzden koyu değerler §0.2'nin eşleme kuralıyla türetilir:

| Açık                                | Koyu                                                          |
| ----------------------------------- | ------------------------------------------------------------- |
| Ekran zemini `#F6F7FB`              | `#12141F`                                                     |
| Başlık/composer/kart `#FFFFFF`      | `#1B1E2C`                                                     |
| Gelen balon `#FFFFFF` + gölge       | `#1E2235`, **gölge yok**                                      |
| Alan/çip zemini `#F1F2F9`/`#ECEEF7` | `rgba(255,255,255,.07)`                                       |
| Ayırıcı `#F0F1F8`/`#E9EBF4`         | `rgba(255,255,255,.07)`                                       |
| Metin ana / ikincil / meta          | `#F2F3FA` / `rgba(255,255,255,.55)` / `rgba(255,255,255,.45)` |
| Giden balon                         | değişmez (`#4F46E5`/beyaz)                                    |
| Gönderen adı renkleri (5'li palet)  | değişmez — üye kimliğidir                                     |
| Çevrimiçi metni `#1B8A55`           | `#4ADE80`                                                     |

Bu tabloya girmeyen bir token için koyu karşılık **uydurulmaz — sorulur.**

**Kural:** `apps/mobile/src/app` altında hex literal yok; her değer `theme.groupChat.*`'tan okunur (§3.7).

### B2 — Kopya: `apps/mobile/src/locale/mobile-copy.ts`

`tr` ve `en` bloklarına aynı anahtar kümesi. §11.2'deki anahtarlar **düz camelCase**'e çevrilir (dosyanın deseni bu, noktalı yol değil). Asgari küme:

**Liste (2a):** `messagesFilterAll`, `messagesFilterUnread`, `messagesFilterGroups`, `messagesFilterMuted`, `messagesPinnedSection`, `messagesTypingOne` (`{name} yazıyor…`), `messagesTypingTwo` (`{a} ve {b} yazıyor…`), `messagesTypingMany` (`{a} +{count} yazıyor…`), `messagesPreviewYou`, `messagesPreviewPhotos` (`{count} görsel`).

**Kurma (2b/2c):** `groupCreateStep1Title`, `groupCreateStep1Subtitle` (`Adım 1 / 2 · en fazla {max} kişi`), `groupCreateStep2Title`, `groupCreateStep2Subtitle` (`Adım 2 / 2 · {count} üye seçildi`), `groupCreateSearchPlaceholder`, `groupCreateFrequent`, `groupCreateAllFriends`, `groupCreateBlocked`, `groupCreateNext`, `groupCreateSubmit`, `groupCreateColor`, `groupCreateNameLabel`, `groupCreateNameHint` (`Boş bırakırsan grup adı {names} olur`), `groupCreateDescriptionLabel`, `groupCreateDescriptionOptional`, `groupCreateDescriptionPlaceholder`, `groupCreateMembers`, `groupCreateEdit`, `groupCreateYou`, `groupCreateAdd`, `groupCreateJoin`, `groupCreateLimitReached`.

**Sohbet (2d):** `groupChatMembersOnline` (`{total} üye · {online} çevrimiçi`), `groupChatPinned`, `groupChatSystemCreated`, `groupChatReadBy` (`{count} kişi okudu`), `groupChatReadByAll`, `groupChatComposerPlaceholder`, `groupChatCallStart`, `groupChatCallOngoing` (`{count} kişi görüşüyor`), `groupChatCallJoin`.

**Bilgi (2e):** `groupInfoTitle`, `groupInfoCreatedAt` (`{count} üye · {date} tarihinde oluşturuldu`), `groupInfoActionMute`, `groupInfoActionUnmute`, `groupInfoActionVideo`, `groupInfoActionSearch`, `groupInfoActionInvite`, `groupInfoPinnedMessage`, `groupInfoMedia`, `groupInfoMembers`, `groupInfoAddMember`, `groupInfoSeeAll`, `groupRoleOwner`, `groupRoleAdmin`, `groupRoleYou`, `groupMemberSheetMessage`, `groupMemberSheetProfile`, `groupMemberSheetPromote`, `groupMemberSheetDemote`, `groupMemberSheetRemove`.

**Ayarlar (2f):** `groupSettingsTitle`, `groupSettingsNotifications`, `groupNotifyAll`, `groupNotifyMentions`, `groupNotifyMentionsHint`, `groupNotifyNone`, `groupNotifyNoneHint`, `groupSettingsPermissions`, `groupPermSendMessage`, `groupPermAddMembers`, `groupPermEditInfo`, `groupPermPinMessage`, `groupPermValueAll`, `groupPermValueAdmins`, `groupSettingsPrivacy`, `groupInviteLink`, `groupInviteLinkHint`, `groupInviteCopy`, `groupInviteRotate`, `groupInviteRotateConfirm`, `groupDisappearing`, `groupDisappearingOff`, `groupDisappearing24h`, `groupDisappearing7d`, `groupDisappearing90d`, `groupHideChat`, `groupHideChatHint`, `groupLeave`, `groupLeaveConfirm`, `groupLeaveOwnerTransfer`, `groupHistoryVisibility`, `groupHistoryNone`, `groupHistory24h`, `groupHistory30d`, `groupHistoryAll`.

**Davet (Faz 2 uçları):** `groupInvitePreviewTitle`, `groupInviteJoin`, `groupInviteFull`, `groupInviteDisabled`, `groupInviteExpired`, `groupInviteAlreadyMember`.

**Hatalar:** `groupErrorNoPermission`, `groupErrorLastAdmin`, `groupErrorFull`.

Kurallar: tasarımdaki Türkçe metinler `tr` değerleridir, birebir. İngilizce karşılıklar **çeviridir**, Türkçenin kopyası değil. Hiçbir arayüz etiketinde emoji yok (§0/5).

### B3 — Saf model: `apps/mobile/src/app/mobile-group-chat-model.ts`

React import etmez (§4.7). Test: `apps/mobile/scripts/mobile-group-chat-model.test.ts`.

| Fonksiyon                                                                | Sözleşme                                                                                                                         |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `getGroupAvatarPair(pair, overflowCount)`                                | 2a/2d çapraz kompozisyon girdisi: iki karo + `+N`; tek üye varsa tek karo (V7)                                                   |
| `buildGroupNameHint(memberNames, locale)`                                | `Atakan, UAT Test ve DY` — son ayraç yerelleştirilir; 2c ipucu **ve** oluşturulan grubun adı aynı çıktı (§4.4)                   |
| `formatGroupTypingLabel(names, copy)`                                    | 1 / 2 / 3+ dalları; 3+ → `{ilk} +{n}`                                                                                            |
| `formatReadReceiptLabel(count, everyone, copy)`                          | `Herkes okudu` / `{n} kişi okudu`; `count === 0` → `null` (satır çizilmez)                                                       |
| `getConversationFilterPredicate(filter)`                                 | `all` / `unread` / `groups` / `muted` (V4)                                                                                       |
| `sortConversationsForInbox(rows)`                                        | Sabitlenenler önce (`pinnedAt` desc), sonra `lastMessageAt` desc                                                                 |
| `getGroupCapabilities(role, permissions)`                                | `{ canSend, canAddMembers, canEditInfo, canPin, canManageRoles, canTransferOwnership }` — `canMemberDo` üstünde ince sarmalayıcı |
| `getMemberSheetActions(viewerRole, target, isSelf)`                      | 2e §7 kümesi; yetkisiz eylem **listeye hiç girmez** (pasif gösterilmez)                                                          |
| `resolveSenderNameColor(member)`                                         | `nameColor` okur; yoksa palet indeksine düşer (eski satır güvencesi)                                                             |
| `getPinnedStripState(conversation, dismissedId)`                         | Gösterilecek mi + önizleme metni                                                                                                 |
| `getGroupCallBannerState(callState, viewerId)`                           | `idle` / `ongoing` / `joined` + katılımcı sayısı                                                                                 |
| `formatDisappearingLabel(window, copy)` ve `formatHistoryLabel(v, copy)` | 2f/2c değer sütunları                                                                                                            |
| `buildGroupInviteDisplayUrl(host, code)`                                 | `host + "/g/" + code`; host yoksa `null` (satır gizlenir)                                                                        |
| `getGroupNameCounter(value)` / `getGroupDescriptionCounter(value)`       | `18/32`, `0/120`; sınır aşımında `over: true`                                                                                    |
| `getFrequentContacts(conversations, now)`                                | V9: son 30 günde mesajlaşılmış, en yeni 5 birebir DM'in karşı tarafı; 3'ten azsa boş dizi                                        |

**Tekrar yasağı:** `buildGroupNameHint` sunucudaki `resolveConversationName` ile aynı kuralı uygulamak zorunda. Kural `packages/types` içine taşınır ve iki taraf da onu çağırır; mobil kendi kopyasını yazamaz.

### B4 — Filtre kalıcılığı

`apps/mobile/src/app/features/use-mobile-conversation-filter.ts` — `use-mobile-workspace-filter.ts` deseninin aynısı: kullanıcı başına anahtar, okuma senkron (ilk kare doğru çip aktif), yazma gecikmeli. Yeni depolama katmanı yazılmaz.

### B5 — İstemci ve query

`apps/mobile/src/app/api/` (mevcut istemci dosyası nerede ise oraya) altı yeni fonksiyon + query anahtarları:

```
updateGroupSettings(conversationId, patch)
updateGroupMemberRole(conversationId, userId, patch)
setGroupPinnedMessage(conversationId, messageId | null)
dismissGroupPinnedStrip(conversationId)
setConversationNotifyLevel(conversationId, level)
setConversationPinned(conversationId, pinned)
setGroupInviteEnabled(conversationId, enabled)
rotateGroupInvite(conversationId)
previewGroupInvite(code)
joinGroupViaInvite(code)
```

Query anahtarları: `["dmConversations"]` (mevcut), `["groupDetails", conversationId]`, `["groupMembers", conversationId]`, `["groupMedia", conversationId]`, `["groupInvitePreview", code]`.

**Invalidation sözleşmesi** (yanlış yapılırsa 2a bayat kalır — geçmişte olan hata):

| Eylem              | Geçersiz kılınan                                |
| ------------------ | ----------------------------------------------- |
| ayar/izin değişimi | `groupDetails`                                  |
| rol değişimi       | `groupDetails` + `groupMembers`                 |
| sabitleme          | `groupDetails` + açık sohbet akışı              |
| bildirim kademesi  | `dmConversations` + `groupDetails`              |
| sohbeti sabitleme  | `dmConversations`                               |
| davetle katılma    | `dmConversations` (yeni satır) + `groupDetails` |

Yazma işlemleri **iyimser** güncellenir (toggle'lar anında döner), hata olursa geri alınır ve toast gösterilir (mevcut toast standardı).

### B6 — Rotalar

`MobileRootStackParamList`'e:

| Rota                 | Parametre                            | Ekran fazı           |
| -------------------- | ------------------------------------ | -------------------- |
| `GroupCreate`        | `{ step?: "members" \| "identity" }` | 04 (yeniden yazılır) |
| `GroupInfo`          | `{ conversationId }`                 | 05                   |
| `GroupSettings`      | `{ conversationId }`                 | 05                   |
| `GroupMembers`       | `{ conversationId }`                 | 05 (2e "Tümü")       |
| `GroupInvitePreview` | `{ code }`                           | 05                   |

Deep link: `/g/<code>` → `GroupInvitePreview`. Sunucu daveti `/invite/<code>` ile **çakışmamalı** — yönlendiricide ayrı dal, aynı prefix'e ikinci bir eşleşme eklenmez.

Bu fazda rotalar **kayıt edilir ve boş yer tutucu bileşene** bağlanır; gerçek ekranlar 04/05'te gelir. Yer tutucu bileşenler tek satır `null` döner, stil içermez.

### B7 — Realtime köprüsü

Faz 1 B9 + Faz 2 D3 olayları mobil socket köprüsüne bağlanır (mevcut `realtime-query-bridge` deseni):

```
dm:group:settings   → groupDetails patch
dm:group:role       → groupMembers + groupDetails patch
dm:group:pin        → groupDetails + akış
dm:conversation:notify / :pin → dmConversations satır patch
dm:message:expired  → akıştan mesaj çıkar
dm:call:state       → grup çağrı banner durumu
```

Her olay **patch** uygular, `invalidate` atmaz — 32 üyeli grup detayını her rol değişiminde yeniden çekmek gereksiz.

---

## C. Bağlayıcı kararlar

1. Grup ekranları **yalnız `theme.groupChat`** okur; `theme.messaging` balon tokenları paylaşılıyorsa `groupChat` içinden **yeniden dışa vurulur** (ekran iki gruba bakmaz).
2. Koyu tema §B1 eşleme tablosundan türetilir; tabloda olmayan token için sorulur.
3. Grup adı türetme kuralı `packages/types` içinde **tek** yerde.
4. Realtime olayları patch uygular.
5. Yetkisiz eylem menüde **görünmez**.

---

## D. Yapılmayacaklar

- Ekran render kodu yazmak.
- Yeni depolama/state kütüphanesi.
- `theme.messaging`'i grup için değiştirmek (mevcut DM/kanal ekranları kırılır).
- Kopya anahtarlarını noktalı yol biçiminde eklemek (dosya düz camelCase).
- `invalidateQueries` ile grup detayını her olayda yeniden çekmek.

---

## E. Kapı

```bash
cd apps/mobile && node --test --import tsx scripts/mobile-group-chat-model.test.ts
```

```bash
pnpm --filter @wizards/mobile typecheck
```

```bash
pnpm --filter @wizards/mobile test
```

```bash
pnpm --filter @wizards/types test
```

Kontrol listesi:

- [ ] `git diff --stat` içinde `src/app/screens/` altında render değişikliği **yok**.
- [ ] `theme.groupChat` hem `lightTheme` hem `darkTheme` içinde, aynı anahtar kümesiyle.
- [ ] Kopya: `tr` ve `en` anahtar sayıları eşit (fark varsa test kırılır).
- [ ] Model fonksiyonlarının her biri en az bir sınır durumuyla testli (0 okuyan, 1 yazan, 3+ yazan, boş ad, sınır aşımı).
- [ ] `buildGroupNameHint` ile sunucu adı türetmesi aynı girdide aynı çıktıyı veriyor.

---

## F. Rapor

`raporlar/03-rapor.md` — §8 formatı. Ek olarak koyu tema tablosunda **türetilen** ve **sorulan** tokenların listesi.

Cihaz testi yok.
