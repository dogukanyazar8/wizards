# Dalga 0 — Sözleşme (4 paralel şerit)

**Ön koşul:** yok. **Kapı:** `typecheck` + `test` + `db:generate` yeşil.
Bu dalga bitmeden hiçbir Dalga 1/2 şeridi başlamaz.

Dört şerit ayrık dosya kümelerine sahiptir, aynı anda koşulabilir.

---

## Ş0.1 — Ölçü sözlüğü + `--info` token

### Sahiplenilen dosyalar

- `apps/web/src/lib/mentions/metrics.ts` (yeni)
- `apps/web/src/lib/mentions/metrics.test.ts` (yeni)
- `apps/web/src/app/globals.css` (yalnız `--info` satırları) — veya tema token'ları hangi dosyada
  tanımlıysa orası; `graphify query "theme tokens css variables"` ile doğrula.

### İş

1. `lib/messages/metrics.ts` desenini birebir izle: `hairline`, `pxToEm`, `pxToRem`
   `lib/home/metrics.ts`'ten yeniden ihraç edilir; sözlük **renk taşımaz**, yalnız ölçü/yarıçap/
   boşluk/ağırlık/satır yüksekliği/süre.
2. Değerlerin **nihai otoritesi** `referans/Bahsedilmeler.dc.html` inline `style`'ıdır. SPEC ile
   çelişen her sayı `SPEC_DEVIATIONS` listesine `{ field, html, spec }` olarak yazılır.
3. Sözlük bölümleri (SPEC-BAHSEDILMELER §1–§8 sırasıyla):
   - `shell` — kolon genişlikleri (rail 276, contextPanel 326, feedMin 782 / panelOpen 456),
     kabuk radius 26, kenar opaklıkları.
   - `sidebar` — başlık padding `16/16/12`, başlık 700 22 display, sayaç (minWidth 22, height 20,
     radius 7), aksiyon satırı (padding `0/14/12`, gap 7, buton height 36 radius 11, zil 36×36
     radius 11), arama (height 36, radius 11, padding `0 11`, gap 9, ikon 15, placeholder 13),
     bölüm etiketi (600 10.5 display, `.15em`, padding `0/18/7`), tür satırı (padding `9 10`,
     radius 12, gap 10, tile 28 radius 9, glif 600 11.5, başlık 13.5, alt 11.5, pil minWidth 20
     height 20 radius 7), ayırıcı margin `13/16/11`, kaynak satırı (padding `8 10`, tile 28
     radius 9 / DM `50%`, ad 13, sayı 11.5).
   - `feedHeader` — padding `15 24`, gap `12 14`, başlık 600 16.5 display, sayı pili
     (padding `3 9`, radius 999, 600 10.5), alt satır 500 12, segment grubu (padding 4, radius 13,
     buton height 33 padding `0 13` radius 10, 600 12.5, pil minWidth 17 height 17 radius 6),
     ikon buton 34×34 radius 11.
   - `feed` — padding `16 24 20`, gap 6, grup başlığı (600 10.5, `.14em`, padding `6 2 8`),
     altlık 12.
   - `card` — padding `13 15 12 16`, radius 16, gap 8, avatar 36, içerik gap 13, üst satır gap 9
     (ad 600 14, kullanıcı adı 500 11.5, kaynak tile 17 radius 6, kaynak metni 11.5, tür pili
     padding `3 8` radius 999 600 10, saat 11), alıntı (marginTop 9, padding `7 11`, sol kenar 2,
     radius `0 10 10 0`, yazar 600 11.5, metin 11.5), gövde (marginTop 7, 14/1.55, çip padding
     `1 7` radius 7 600 13.5), thread satırı (marginTop 8, ikon 13, 600 11.5), eylem satırı
     (marginTop 11, gap 7, buton height 30 padding `0 12` radius 10 600 11.5, `⋯` 28×28 radius 9),
     okunmamış şerit (3px, `top/bottom:15`, radius `0 4 4 0`).
   - `cardMenu` — genişlik 218, radius 14, padding 6, satır padding `8 10` radius 10 gap 10
     500 12.5, ikon 15, ayırıcı margin `4 6`, açılış ofseti 34, `z-index` 5.
   - `replyBox` — marginTop 11, padding `11 12`, radius 13, meta ikon 13, meta 11.5, avatar 28,
     alan height 38 radius 12, ikon buton 26×26 radius 8, gönder 38×38 radius 12, alt satır 11.
   - `contextPanel` — genişlik 326, başlık padding `15 16 13`, başlık 600 14.5, tile 16 radius 5,
     kapat 30×30 radius 10, gövde padding `15 16` gap 14, satır avatar 28, ad 600 12.5,
     saat 10.5, metin 12.5/1.5, vurgulu satır padding `10 12` radius 13, altlık padding `13 16`,
     buton height 36 radius 11.
   - `settingsModal` — genişlik 496, radius 22, backdrop opaklığı .62, kabuk padding 40,
     başlık padding `20 24 16` + ikon 38 radius 13 + başlık 600 17 + alt 12.5 + kapat 32×32,
     gövde padding `19 24` gap 15, anahtar başlık 600 13.5 / alt 11.5, switch 44×26 knob 20
     geçiş .18s, segment (padding 3 radius 11, buton height 28 padding `0 11` radius 9 600 11.5),
     sessiz saat şeridi (padding `11 13`, radius 13, ikon 16), altlık padding `16 24 20`,
     buton height 38 radius 12.
   - `emptyState` — daire 78 radius 26, ikon 34, başlık 600 20, metin maxWidth 420 13.5/1.6,
     buton height 38 radius 12, gap 16.
   - `density` — `--m-pad` Kompakt 5 / Ferah 10, `--m-gap` Kompakt 11 / Ferah 20.
4. `--info` token'ı: `hsl(199 89% 48%)` her iki temada aynı değer (tasarım tek ton veriyor).
   `--info-foreground` gerekiyorsa `0 0% 100%`. Bileşen içine gömülmez.

### Kabul

- Sözlükte hiçbir renk yok; `#` araması temiz.
- `metrics.test.ts` SPEC'teki her tablo satırı için bir iddia taşır ve `SPEC_DEVIATIONS`
  listesinin her kaydının sözlükte `html` değeriyle durduğunu doğrular.
- `--info` her iki tema bloğunda tanımlı.

---

## Ş0.2 — Migration + Prisma şeması

### Sahiplenilen dosyalar

- `packages/db/prisma/schema.prisma`
- `packages/db/prisma/rebaseline-migrations/<timestamp>_mentions_screen/migration.sql` (yeni)
- `packages/db/prisma/schema-mentions-screen.test.mjs` (yeni — mevcut
  `schema-messages-screen.test.mjs` desenini izler)

### Şema değişiklikleri

```prisma
enum MentionKind {
  SELF      // @kullanıcıadı
  ROLE      // @rol
  THREAD    // takip edilen thread'e gelen yanıt
}

enum MentionStateSource {
  CHANNEL   // MessageMention.id
  DM        // DMMessageMention.id
  EVERYONE  // Message.id (mentionEveryone bayrağı)
  THREAD    // Message.id (thread yanıtı)
}

enum DesktopMentionMode { ALL MENTIONS OFF }

enum ThreadFollowOrigin { AUTHOR REPLY MENTION EXPLICIT }
```

1. `MessageMention`: `kind MentionKind @default(SELF)`, `roleId String?`
   (`Role` ilişkisi `onDelete: SetNull`), `@@index([userId, kind, createdAt])`.
2. `DMMessageMention`: `kind MentionKind @default(SELF)`.
3. **`@herkes` için yeni tablo yok** (K2). Bunun yerine ham SQL kısmi indeks:
   `CREATE INDEX "Message_mentionEveryone_idx" ON "Message" ("channelId","createdAt" DESC) WHERE "mentionEveryone" = true;`
4. `MentionState` (yeni) — okundu/sonra oku/kaldırıldı **tek yeri**:
   ```prisma
   model MentionState {
     id          String             @id @default(uuid())
     userId      String
     source      MentionStateSource
     refId       String
     readAt      DateTime?
     readLaterAt DateTime?
     dismissedAt DateTime?
     createdAt   DateTime           @default(now())
     updatedAt   DateTime           @updatedAt
     user User @relation(fields: [userId], references: [id], onDelete: Cascade)
     @@unique([userId, source, refId])
     @@index([userId, readAt])
     @@index([userId, readLaterAt])
   }
   ```
5. `ThreadFollow` (yeni):
   ```prisma
   model ThreadFollow {
     id              String             @id @default(uuid())
     userId          String
     parentMessageId String
     channelId       String
     origin          ThreadFollowOrigin
     /// Açık olarak kapatıldığında satır silinmez; örtük kural onu tekrar açmasın diye susturulur.
     mutedAt         DateTime?
     createdAt       DateTime           @default(now())
     user   User    @relation(fields: [userId], references: [id], onDelete: Cascade)
     parent Message @relation("ThreadFollowParent", fields: [parentMessageId], references: [id], onDelete: Cascade)
     @@unique([userId, parentMessageId])
     @@index([parentMessageId])
     @@index([userId, createdAt])
   }
   ```
6. `UserNotificationSettings` genişletmesi (K6):
   `mentionSelf Boolean @default(true)`, `mentionThreadReplies Boolean @default(false)`,
   `desktopMentionMode DesktopMentionMode @default(MENTIONS)`,
   `quietHoursEnabled Boolean @default(false)`, `quietHoursFrom String? @db.VarChar(5)`,
   `quietHoursTo String? @db.VarChar(5)`, `quietHoursTimeZone String?`.
   Mevcut `suppressRoleMentions` / `suppressEveryoneMentions` **kalır** ve ters mantıkla eşlenir.
7. Geri doldurma (`migration.sql` içinde, tek `UPDATE`):
   mevcut `MessageMention` / `DMMessageMention` satırları `kind = 'SELF'` ile doğru başlar
   (varsayılan bunu zaten verir; ayrıca `UPDATE` gerekmez).
   `MentionState` **boş başlar** — mevcut okundu durumu `Notification` satırından okunmaya devam
   eder, Ş3 birleşik okumayı yazar (bkz. Ş3 §"Geçiş kuralı").

### Kabul

- `pnpm --filter @wizards/db db:generate` yeşil.
- `schema-mentions-screen.test.mjs` her yeni model/alan/indeks için bir iddia taşır.
- Migration `rebaseline-migrations` altında (tuzak #4).
- Var olan hiçbir kolon düşürülmedi/yeniden adlandırılmadı.

---

## Ş0.3 — `@wizards/types` sözleşmeleri + rota ayrıştırıcıları

### Sahiplenilen dosyalar

- `packages/types/src/mentions-screen.ts` (yeni)
- `packages/types/src/mentions-screen.test.ts` (yeni)
- `packages/types/src/index.ts` (yalnız yeni ihraç satırı)
- `apps/web/src/lib/mentions/routes.ts` + `routes.test.ts` (yeni)

### İş

1. Zod şemaları — SPEC §10 veri sözleşmesinin ürün karşılığı:
   ```ts
   MentionKindSchema        = z.enum(["me", "role", "everyone", "thread"]);
   MentionFilterSchema      = z.enum(["all", "unread", "role", "dm", "me", "thread"]);
   MentionGroupingSchema    = z.enum(["time", "source"]);
   MentionWindowSchema      = z.enum(["30d", "all"]);
   MentionSourceSchema      = discriminated union: channel { serverId, serverName, serverInitial, channelId, channelName } | dm { conversationId, title }
   MentionSchema            = { id, stateKey: { source, refId }, author, kind, tag, body, createdAt, unread, readLater, source, quote?, thread?, messageUrl, permalink }
   MentionCountsSchema      = { all, unread, me, role, everyone, thread, readLater, bySource: Record<string, number> }
   MentionContextSchema     = { messages: [{ id, authorName, initials, avatarUrl?, time, text, isMention }] }
   MentionSettingsSchema    = { me, role, everyone, threadReplies, desktop: "all"|"mentions"|"off", quietHours: { enabled, from, to, timeZone } }
   MentionListResponseSchema= { items, nextCursor: string|null }
   ```
   `tag` alanı gövdede vurgulanacak metindir (`@Doğukan Yazar`, `@tasarım`, `@herkes`) ve
   **sunucudan** gelir; istemci metinden tahmin etmez.
2. `MentionCard` prop sözleşmesi (Ş5 ↔ Ş6 ↔ Ş7 temas noktası) — `packages/types` değil,
   `apps/web/src/lib/mentions/contracts.ts` içinde tip olarak donar:
   ```ts
   export type MentionCardProps = {
     mention: Mention;
     active: boolean; // klavye imleci
     menuOpen: boolean;
     replyOpen: boolean;
     contextOpen: boolean;
     onOpen(): void; // gövdeye tıklama
     onReply(): void;
     onContext(): void;
     onToggleRead(): void;
     onMenuToggle(): void;
     onMenuAction(action: MentionMenuAction): void;
     menuDirection: "down" | "up";
     replySlot?: React.ReactNode; // Ş7 kutusunu buraya takar
   };
   export type MentionMenuAction = "copy-link" | "read-later" | "mute-source" | "dismiss";
   ```
3. Rota/durum ayrıştırıcıları — URL tek doğruluk kaynağı (PROMPT kural 8):
   `/mentions?filter=unread&source=whispr&group=source&window=all&q=...&panel=<id>`
   - `parseMentionFilter`, `parseMentionSource`, `parseMentionGrouping`, `parseMentionWindow`,
     `buildMentionsHref(state)` — tanınmayan değer varsayılana düşer, asla atmaz.
   - `MENTIONS_ROUTE = "/mentions"`.

### Kabul

- Her şema için geçerli + geçersiz girdi testi.
- `buildMentionsHref` varsayılan değerleri URL'e **yazmaz** (`filter=all` parametresi çıkmaz).
- `apps/web` ve `apps/mobile` tipleri derleniyor.

---

## Ş0.4 — i18n sözlüğü

### Sahiplenilen dosyalar

- `apps/web/src/lib/locale/messages/tr.ts` (yalnız `mentions.*` blokları)
- `apps/web/src/lib/locale/messages/en.ts` (aynı anahtarlar)

### İş

SPEC'teki **her** metin anahtarlaştırılır; TR karşılığı birebir kopyalanır (kısaltma, düzeltme,
"iyileştirme" yok). Anahtar ağacı:

| Alan            | Anahtar örnekleri                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ray             | `mentions.sidebar.title`, `mentions.sidebar.markAllRead`, `mentions.sidebar.searchPlaceholder`, `mentions.sidebar.byKind`, `mentions.sidebar.bySource`, `mentions.sidebar.notificationSettings`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Tür satırları   | `mentions.kind.me.title` = `Bana özel`, `mentions.kind.me.subtitle` = `{handles}`, `mentions.kind.role.title` = `Rol bahsetmeleri`, `.subtitle` = `{roles}`, `mentions.kind.thread.title` = `Thread yanıtları`, `.subtitle` = `Takip ettiğin thread'ler`, `mentions.kind.unread.title` = `Okunmamış`, `.subtitle` = `Sayaca yansıyanlar`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Sekmeler        | `mentions.tabs.all` = `Tümü`, `.unread` = `Okunmamış`, `.role` = `Rol · @herkes`, `.dm` = `DM`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Başlık          | `mentions.header.countPill` = `{count} bahsetme`, `.allRead` = `Hepsi okundu`, `.subtitleTime` = `Zamana göre gruplu · {unread} okunmamış · en yenisi {time}`, `.subtitleSource` = `Kaynağa göre gruplu · {unread} okunmamış · en yenisi {time}`, `.subtitleEmpty` = `Son 30 gün · bekleyen bahsetme yok`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Gruplar         | `mentions.group.today` = `Bugün`, `.yesterday` = `Dün`, `.thisWeek` = `Bu hafta`, `.older` = `Daha eski`, `.readLater` = `Sonra oku`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Tür pilleri     | `mentions.badge.me` = `Bana özel`, `.role` = `Rol`, `.everyone` = `@herkes`, `.thread` = `Thread`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Kart            | `mentions.card.actions.reply` = `Yanıtla`, `.context` = `Bağlamda gör`, `.markRead` = `Okundu işaretle`, `.markUnread` = `Okunmadı işaretle`, `mentions.card.thread` = `{count} yanıt · thread hâlâ açık`, `mentions.card.threadClosed` = `{count} yanıt · thread kapandı`, `mentions.card.menuLabel`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Menü            | `mentions.card.menu.copyLink` = `Mesaj bağlantısını kopyala`, `.readLater` = `Sonra oku`, `.muteChannel` = `{channel} kanalını sessize al`, `.muteConversation` = `Bu sohbeti sessize al`, `.remove` = `Listeden kaldır`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Yanıt           | `mentions.reply.meta` = `{author} mesajına yanıt · {source}`, `.metaThread` = `{author} mesajına thread'de yanıt · {source}`, `.placeholder` = `Yanıt yaz — kanala gönderilir`, `.placeholderThread` = `Yanıt yaz — thread'e gönderilir`, `.hintEnter` = `Enter gönder`, `.hintShift` = `Shift+Enter satır`, `.hintEsc` = `Esc kapat`, `.cancel` = `Vazgeç`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Akış altlığı    | `mentions.feed.footer` = `Daha eski bahsetmeler 30 gün sonra arşivlenir`, `mentions.feed.newStrip` = `{count} yeni bahsetme`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Bağlam paneli   | `mentions.context.title` = `Bağlam`, `.openInChannel` = `Kanalda aç`, `.replyInThread` = `Thread'de yanıtla`, `.close`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Ayarlar modalı  | `mentions.settings.title` = `Bahsetme bildirimleri`, `.subtitle` = `Bu ayarlar tüm sunucular için geçerli`, `.me.title` = `Bana özel bahsetmeler`, `.me.subtitle` = `Adın veya kullanıcı adın yazıldığında`, `.role.title` = `Rol bahsetmeleri`, `.role.subtitle` = `@tasarım, @ürün gibi rollerde`, `.everyone.title` = `@herkes ve @burada`, `.everyone.subtitle` = `Sunucu geneline yapılan çağrılar`, `.thread.title` = `Thread yanıtları`, `.thread.subtitle` = `Takip ettiğin thread'lere gelen yanıtlar`, `.desktop.label` = `Masaüstü bildirimi`, `.desktop.all` = `Tümü`, `.desktop.mentions` = `Sadece bahsetmeler`, `.desktop.off` = `Kapalı`, `.quiet.title` = `Sessiz saatler açık`, `.quiet.subtitle` = `{from} – {to} · bahsetmeler sayaçta birikir`, `.quiet.edit` = `Düzenle`, `.footerNote` = `Kanal bazlı ayarlar kanal menüsünden yönetilir`, `.cancel` = `İptal`, `.save` = `Kaydet` |
| Boş durum       | `mentions.empty.title` = `Bekleyen bahsetme yok`, `.body` = `Son 30 günün bahsetmelerini okudun. Yeni bir bahsetme geldiğinde burada ve gezinme panelinde sayaç olarak görünür.`, `.archive` = `Arşive dön`, `.settings` = `Bildirim ayarları`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Toast           | `mentions.toast.readAll` = `{count} bahsetme okundu işaretlendi`, `.undo` = `Geri al`, `.muted` = `{channel} sessize alındı`, `.removed` = `Bahsetme listeden kaldırıldı`, `.linkCopied` = `Mesaj bağlantısı kopyalandı`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Erişilebilirlik | `mentions.a11y.unreadStripe` = `{count} okunmamış bahsetme`, `.cardLabel` = `{author} · {source} · {time}`, `.feedLabel` = `Bahsetme akışı`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

Mevcut `mentions.filter.*`, `mentions.empty`, `mentions.emptyHint`, `mentions.markAllRead`,
`mentions.title`, `mentions.unreadCount` anahtarları **silinmez**; eski ekran kaldırılana kadar
(Ş5) kullanımda kalır ve Dalga 3'te kullanılmıyorsa temizlenir.

### Kabul

- TR ve EN aynı anahtar kümesine sahip (sözlük eşitliği testi varsa o geçer).
- TR metinleri SPEC ile karakter karakter aynı (Türkçe karakterler ve `·` ayracı dahil).
- Hiçbir metin JSX'e gömülü değil (Dalga 2 şeritleri bunu doğrular).
