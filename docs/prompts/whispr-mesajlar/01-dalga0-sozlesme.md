# Dalga 0 · Sözleşme katmanı

**Ön koşul:** yok. **Bu dalga bitmeden hiçbir şerit başlamaz.**

Dört şerit **aynı anda** koşar; dosya kümeleri ayrıktır. Dalga kapısı dördü de bittikten sonra tek
seferde koşulur.

---

## Ş0.1 — Ölçü sözlüğü, denetim ve lint kapsamı

### Sahiplenilen dosyalar

```
apps/web/src/lib/messages/metrics.ts                 (yeni)
apps/web/src/lib/messages/metrics.test.ts            (yeni)
apps/web/src/lib/messages/density.ts                 (yeni)
apps/web/src/lib/messages/density.test.ts            (yeni)
apps/web/src/lib/home/token-audit.ts                 (yalnız SCOPE dizisi)
apps/web/src/lib/home/copy-audit.ts                  (yalnız SCOPE dizisi)
apps/web/eslint.config.mjs                           (yalnız arbitrary-px files dizisi)
```

### İş

1. **`MESSAGES_METRICS` sözlüğü.** `lib/home/metrics.ts` biçiminde, ondan `pxToRem` / `pxToEm` /
   `hairline` içe aktararak. Renk **taşımaz** — yalnız ölçü, yarıçap, boşluk, ağırlık, satır
   yüksekliği, süre. Değerlerin otoritesi `Mesajlar.dc.html` inline stilleridir; SPEC ile çeliştiği
   yerde HTML kazanır ve çelişki rapora yazılır.

   Bölümler (SPEC-MESAJLAR §1–§9 sırasıyla):

   | Anahtar        | Kapsam                                                                                                                                                                                                                                                                                                                                                |
   | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | `rail`         | Sohbet rayı 276: başlık padding `16 16 12`, başlık 22/700, `Yeni mesaj` yüksekliği 38 radius 12, arama 38/12, bölüm etiketi 10.5/`.15em`, satır padding `8 10` radius 12 gap 10, avatar 40, presence noktası 11, grup tile 40 radius 11, ad 13.5, önizleme 12, saat 10.5, badge min-w 18 h 18 radius 6                                                |
   | `friends`      | Başlık bloğu padding `20 26 14`, başlık 22, sayaç çipi radius 999 padding `4 10` 11.5, sekme kutusu radius 13 padding 4, sekme h 33 padding `0 13` radius 10 12.5, satır padding `9 12` radius 14, avatar 44, ad 14, handle 12, durum 12.5, `Mesaj` butonu h 36 radius 11, ikon buton 34 radius 11, menü 212 radius 14 satır padding `9 10` radius 10 |
   | `conversation` | Başlık padding `15 22`, avatar 40, ad 16, alt satır 12, grup tile 40 radius 14, üye yığını 24, ikon şeridi 34 radius 11                                                                                                                                                                                                                               |
   | `pinnedStrip`  | Tek satır yüksekliği, pin ikonu, `Tümünü gör`                                                                                                                                                                                                                                                                                                         |
   | `messageList`  | padding `16 0 8`, satır yatay padding 26, avatar 40, ad 13.5, saat 11, gövde 14/1.5, tarih ayracı 11, dosya kartı 420 radius 14 tile 40, tepki çipi h 26 radius 999, yanıt önizlemesi 340 sol çizgi 2, hover şeridi radius 11 buton 30, mesaj menüsü 206 radius 14, thread şeridi radius 11, bahsetme çipi radius 4 + sol şerit 3                     |
   | `poll`         | Kart 470 radius 16 padding 16, soru 15.5, seçenek padding `10 13` radius 12 gap 8, radio 17, yüzde 12.5                                                                                                                                                                                                                                               |
   | `composer`     | Dış padding `0 22 18`, alan radius 15 (şerit açıkken `0 0 15 15`), araç min 31 radius 9, gönder 40 radius 12, ikon buton 34                                                                                                                                                                                                                           |
   | `panel`        | Sağ panel 340, thread kök kartı, yanıt avatarı 32/ad 12.5/saat 10.5/gövde 13, arama alanı 38/12, sonuç kartı padding 12 radius 13, sonuç avatarı 24                                                                                                                                                                                                   |
   | `groupModal`   | 560 radius 22, başlık tile 40 radius 14, ilerleme çubuğu, arama 42 radius 13, çip h 30 radius 999 avatar 24, aday listesi max-h 296 satır padding `9 10` radius 13, onay kutusu 19 radius 6, swatch 34, toggle 42×23 topuz x 21/3                                                                                                                     |
   | `pollModal`    | 520 radius 22, harf tile 24 radius 8                                                                                                                                                                                                                                                                                                                  |
   | `emptyState`   | 96 radius 32, başlık 22, açıklama 420 13.5/1.6, çip h 32 radius 999 tile 20                                                                                                                                                                                                                                                                           |

   Her alan için `metrics.test.ts` iki şey doğrular: (a) `pxToRem(276)` gibi türetilmiş değerlerin
   birebirliği, (b) sözlükte **renk benzeri hiçbir dize olmaması** (`#`, `hsl(`, `rgb(`).

2. **Yoğunluk köprüsü.** `lib/messages/density.ts`: SPEC'in `--m-pad` (Kompakt 5 / Rahat 10) ve
   `--m-gap` (Kompakt 11 / Rahat 20) değerlerini **mevcut** `InterfaceDensity` enum'undan türetir.
   İkinci bir yoğunluk kaynağı üretilmez; `wizards-shell` bu iki değişkeni Ş1'de yayınlar.
   `--act` (satır eylemleri: `1` her zaman görünür / `0` yalnız hover) da buradan gelir ve
   varsayılanı `0`'dır (hover) — masaüstünde tasarımın davranışı budur.

3. **Ölçek başına içerik yoğunluğu.** `MESSAGES_DENSITY_BY_SCALE`: SPEC-ANA-SAYFA §8.3 mantığının
   Mesajlar karşılığı. Artan yükseklik **içerikle** dolar:

   |                              | ×1  | ×1.15 | ×1.5 | ×2  |
   | ---------------------------- | --- | ----- | ---- | --- |
   | Sohbet rayı görünen satır    | 9   | 11    | 14   | 19  |
   | Mesaj listesi ilk sayfa      | 30  | 30    | 40   | 50  |
   | Arkadaş satırı (kaydırmasız) | 9   | 11    | 14   | 19  |
   | Arama sonucu ilk sayfa       | 3   | 4     | 6    | 8   |

   Bu tablo sorgu `limit`'lerinin **tek kaynağıdır**; istemcide ikinci bir kırpma yapılmaz.
   Veri yetmezse listenin kısmi hâli geçerlidir, sahte satır üretilmez.

4. **Denetim kapsamı.** `HOME_TOKEN_AUDIT_SCOPE` ve `HOME_COPY_AUDIT_SCOPE` dizilerine ekle:

   ```
   "components/messages",
   "components/friends",
   "components/dm",
   "components/chat",
   "lib/messages",
   ```

   `HOME_TOKEN_AUDIT_ALLOWLIST` değişmez: iki `hsl()` üçlüsü zaten orada.

   > **Tuzak:** `components/chat` ve `components/dm` bugün arbitrary px ve sabit Türkçe taşıyor.
   > Kapsamı ekleyen commit testi kırmızıya çevirir. Bu yüzden Ş0.1 kapsamı ekler ama testi
   > **Dalga 3'e kadar `skip` etiketiyle** işaretler ve `raporlar/01-rapor.md` içine o an ölçülen
   > sapma sayısını yazar. Dalga 3 §2 bu sayıyı sıfıra indirmekle yükümlüdür.

5. **Lint kapsamı.** `eslint.config.mjs` arbitrary-px `files` dizisine `src/components/messages/**`
   ve `src/lib/messages/**` eklenir. `components/chat` / `components/dm` Dalga 3'te eklenir (aynı
   sebep).

### Kapı

```bash
pnpm --filter @wizards/web test -- --test-name-pattern "messages/(metrics|density)"
pnpm typecheck && pnpm lint
```

---

## Ş0.2 — Migration ve Prisma şeması

### Sahiplenilen dosyalar

```
packages/db/prisma/schema.prisma
packages/db/prisma/rebaseline-migrations/<timestamp>_messages_screen/migration.sql   (yeni)
```

> **Tuzak:** Prisma bu depoda `prisma/rebaseline-migrations` okur. Başka klasöre yazılan migration
> sessizce hiçbir şey yapmaz.

### İş

1. **Anket modelleri** (karar #1). Kapsam DM + grup (karar #12); kanal mesajı **bu pakette
   bağlanmaz**, model ileride genişletilebilsin diye `dmMessageId` nullable + `messageId` nullable
   olarak açılır ve tam olarak birinin dolu olduğu `CHECK` ile zorlanır.

   ```prisma
   enum PollDuration { H1 D1 D3 }

   model Poll {
     id            String   @id @default(uuid())
     dmMessageId   String?  @unique
     messageId     String?  @unique
     createdById   String
     question      String   @db.VarChar(300)
     multi         Boolean  @default(false)
     anonymous     Boolean  @default(true)
     closesAt      DateTime
     createdAt     DateTime @default(now())

     options PollOption[]
     votes   PollVote[]
     dmMessage DMMessage? @relation(fields: [dmMessageId], references: [id], onDelete: Cascade)
     message   Message?   @relation(fields: [messageId],   references: [id], onDelete: Cascade)
     creator   User       @relation(fields: [createdById], references: [id], onDelete: Cascade)

     @@index([closesAt])
   }

   model PollOption {
     id       String @id @default(uuid())
     pollId   String
     position Int
     label    String @db.VarChar(80)

     poll  Poll       @relation(fields: [pollId], references: [id], onDelete: Cascade)
     votes PollVote[]

     @@unique([pollId, position])
   }

   model PollVote {
     id        String   @id @default(uuid())
     pollId    String
     optionId  String
     userId    String
     createdAt DateTime @default(now())

     poll   Poll       @relation(fields: [pollId],   references: [id], onDelete: Cascade)
     option PollOption @relation(fields: [optionId], references: [id], onDelete: Cascade)
     user   User       @relation(fields: [userId],   references: [id], onDelete: Cascade)

     /// Tek seçimli ankette oy taşıma bunu ihlal etmeden çalışır: silme + ekleme aynı işlemde.
     @@unique([optionId, userId])
     @@index([pollId, userId])
   }
   ```

   Migration SQL'i ek olarak şunu yazar:

   - `ALTER TABLE "Poll" ADD CONSTRAINT "poll_single_owner" CHECK (num_nonnulls("dmMessageId","messageId") = 1);`
   - Tek seçimli ankette kullanıcının **tek** oyu olduğunu zorlayan kısmi benzersiz indeks
     uygulama katmanında değil, `PollVote` üzerinde `(pollId, userId)` benzersizliğiyle
     **çoktan seçimli anketlerde çalışmaz** — bu yüzden tek-seçimlilik uygulama katmanında bir
     `DELETE ... WHERE pollId = $1 AND userId = $2` + `INSERT` işlemiyle, `SERIALIZABLE` değil,
     tek `INSERT ... ON CONFLICT` + `DELETE` transaction'ıyla zorlanır. Test bunu yarışlı iki
     istekle doğrular.

2. **Çoklu sabitleme** (karar #7).

   ```prisma
   model DMPinnedMessage {
     id             String   @id @default(uuid())
     conversationId String
     messageId      String
     pinnedById     String
     pinnedAt       DateTime @default(now())

     conversation DMConversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
     message      DMMessage      @relation(fields: [messageId],      references: [id], onDelete: Cascade)
     pinnedBy     User           @relation(fields: [pinnedById],     references: [id], onDelete: Cascade)

     @@unique([conversationId, messageId])
     @@index([conversationId, pinnedAt])
   }
   ```

   Migration mevcut `DMConversation.pinnedMessageId` satırlarını `DMPinnedMessage`'a taşır
   (`pinnedById` = `pinnedById`, `pinnedAt` = `pinnedAt`). Kolonlar **düşürülmez**: bir sürüm
   boyunca okunur, yazılmaz. `raporlar/01-rapor.md` taşınan satır sayısını yazar.

3. **`GroupHistoryVisibility.LAST_7D`** (karar #9). Enum'a eklenir; `LAST_24H` korunur.
   `DMConversation.historyVisibility` varsayılanı **değişmez** (`LAST_30D`) — yeni grup varsayılanı
   uygulama katmanındaki `createInitialGroupCreateState()`'tedir, şemada değil.

4. **Sesli mesaj** (karar #5). Yeni tablo **yok**: sesli mesaj bir ek dosyadır. `Attachment`
   modeline iki alan eklenir — `durationMs Int?` ve `waveform Int[] @default([])` (0–100 arası
   normalize genlik örnekleri, en çok 64 kova). Mevcut ekler için ikisi de boş kalır ve oynatıcı
   düz çubuk çizer.

5. **Sıralama tercihi** (karar #8). `UserSettings` modeline `friendsSort` alanı:
   `enum FriendsSort { STATUS NAME RECENT }`, varsayılan `STATUS`.

6. **İndeksler.** Global arama (karar #6) `DMMessage.content_search` + mevcut `pg_trgm` GIN
   indeksini kullanır. Ek olarak `DMParticipant(userId, hiddenAt)` zaten var; global arama planını
   `EXPLAIN (ANALYZE, BUFFERS)` ile ölçüp raporla — 10k mesajlık fikstürde seq scan görünürse
   indeks eklenir.

### Kapı

```bash
pnpm db:generate && pnpm typecheck
pnpm --filter @wizards/db test
```

---

## Ş0.3 — `@wizards/types` sözleşmeleri

### Sahiplenilen dosyalar

```
packages/types/src/poll.ts                   (yeni)
packages/types/src/poll.test.ts              (yeni)
packages/types/src/messages-screen.ts        (yeni)
packages/types/src/messages-screen.test.ts   (yeni)
packages/types/src/voice-message.ts          (yeni)
packages/types/src/voice-message.test.ts     (yeni)
packages/types/src/group-dm.ts               (yalnız tavan sabiti)
packages/types/src/group-dm-settings.ts      (renk paleti + history enum)
packages/types/src/group-dm-selection.ts     (varsayılanlar + ad zorunluluğu)
packages/types/src/index.ts                  (dışa aktarım)
```

### İş

1. **`poll.ts`** — zod şemaları ve **saf** mantık; React yok, Prisma yok.

   ```ts
   export const POLL_MAX_OPTIONS = 6;
   export const POLL_MIN_OPTIONS = 2;
   export const POLL_OPTION_MAX_LENGTH = 80;
   export const POLL_QUESTION_MAX_LENGTH = 300;
   export const PollDurationSchema = z.enum(["1h", "24h", "3d"]);

   export type PollDraft = {
     question: string;
     options: string[];
     multi: boolean;
     anonymous: boolean;
     duration: PollDuration;
   };
   export function createInitialPollDraft(): PollDraft; // 3 boş seçenek, multi=false, anonymous=true, duration="24h"
   export function canSubmitPoll(draft: PollDraft): boolean; // soru dolu + ≥2 dolu seçenek
   export function addPollOption(draft): PollDraft; // 6'da durur
   export function removePollOption(draft, index): PollDraft; // 2'nin altına inmez
   export function toPollCreateRequest(draft): PollCreateRequest; // boş seçenekleri eler, trim'ler

   export type PollDto = {
     id;
     question;
     options: { id; label; position; votes }[];
     myOptionIds: string[];
     totalVotes;
     closesAt;
     closed;
     multi;
     anonymous;
     canSeeVoters;
   };
   export function selectPollPercentages(poll: PollDto): Record<string, number>; // 0 oy → hepsi 0; yuvarlama toplamı 100'ü aşmaz
   export function applyPollVote(poll: PollDto, optionId: string, viewerVoted: boolean): PollDto; // optimistic; tek seçimlide oyu TAŞIR
   ```

   `canSeeVoters` sunucudan gelir ve karar #11'in tek anahtarıdır: `anonymous` iken **daima**
   `false` ve uç oy veren listesini hiç döndürmez. İstemci bu bayrağı türetmez.

   `selectPollPercentages` testi: `{1,3,1}` → `{20,60,20}`; `{1,1,1}` → toplam 99/100 sapmasında
   en büyük paya yuvarlama artığı verilir ve toplam 100'ü **geçmez**.

2. **`messages-screen.ts`** — ekranın durum makinesi ve liste sözleşmeleri (SPEC §2, §11, §12).

   ```ts
   export type MessagesView = "friends" | "dm" | "group" | "empty";
   export type FriendsTab = "all" | "add" | "pending" | "blocked";
   export type MessagesPanel = "thread" | "search" | null;
   export type MessagesModal = { kind: "group"; step: 1 | 2 } | { kind: "poll" } | null;
   export type FriendsSort = "status" | "name" | "recent";

   export type MessagesScreenState = {
     view;
     tab;
     panel;
     modal;
     formattingOpen;
     openMenu: MenuRef | null;
   };
   export function reduceMessagesScreen(state, action): MessagesScreenState;
   ```

   Kural, indirgeyicide **zorlanır**: aynı anda iki panel açılmaz (thread ↔ arama birbirini
   kapatır), aynı anda iki menü açılmaz, modal açılınca menü kapanır. Testler bu üçünü ayrı ayrı
   doğrular — SPEC §10'un "aynı anda iki panel veya iki menü açık kalmaz" kabul kriteri budur.

   Ayrıca SPEC §11 veri sözleşmesinin zod karşılıkları: `ConversationRowDto`, `FriendRowDto`,
   `FriendSuggestionDto`, `IncomingRequestDto`, `OutgoingRequestDto`, `BlockedUserDto`,
   `PinnedMessageDto`, `MessageSearchFilterDto`, `MessageSearchHitDto` (`matchRange: [number,
number][]` — vurgu **sunucudan** gelir, istemci ikinci kez arama yapmaz).

3. **`voice-message.ts`** (karar #5) — mobil ile ortak sözleşme:

   ```ts
   export const VOICE_MESSAGE_MAX_MS = 5 * 60_000;
   export const VOICE_MESSAGE_WAVEFORM_BUCKETS = 64;
   export function normalizeWaveform(samples: readonly number[]): number[]; // dBFS → 0..100, tam 64 kova
   export function formatVoiceDuration(ms: number): string; // "0:07", "1:04"
   export function isVoiceMessageAttachment(a: MessageAttachment): boolean;
   ```

4. **Grup sözleşmesi güncellemeleri.**

   - `GROUP_DM_MAX_PARTICIPANTS`: 32 → **250** (karar #3). `GROUP_SELECTABLE_MAX` türetilmiş
     olduğu için kendiliğinden 249 olur; ilgili testler güncellenir.
   - `GROUP_AVATAR_COLORS` (karar #4): sabit hex dizisi yerine **token adı** dizisi —
     `["primary","success","warning","danger","info","accent"] as const`. `GroupAvatarColor` bu
     birlik tipidir. `mapLegacyGroupAvatarColor(hex): GroupAvatarColor` mevcut 5 hex'i eşler
     (`#4F46E5`→primary, `#1B8A55`→success, `#C77A2B`→warning, `#C2185B`→danger, `#1E2235`→primary).
     `getGroupAvatarForeground(color)`: `success | warning | info` → `hsl(222 30% 14%)`, diğerleri
     `#fff` (SPEC §7 adım 2).
   - `GroupHistoryVisibilitySchema`: `["NONE","LAST_24H","LAST_7D","LAST_30D","ALL"]`.
     `GROUP_CREATE_HISTORY_OPTIONS = ["ALL","LAST_30D","LAST_7D","NONE"] as const` — kurma
     ekranının **çizdiği** dört seçenek, tasarımdaki sırayla.
   - `createInitialGroupCreateState()`: `historyVisibility: "ALL"`, `inviteEnabled: true`,
     `avatarColor: "primary"` (karar #9).
   - `canSubmitGroup(state)`: artık **ad zorunlu** — `state.name.trim().length > 0` şartı eklenir
     (SPEC §10). `buildGroupNameFromMembers` yalnız _öneri_ olarak kalır, otomatik ad atamaz.

   > Bu değişiklikler `apps/mobile` tarafındaki grup kurma akışını da etkiler. Ş0.3 mobil
   > çağrı yerlerini **derlenir** hâlde tutar (tip hatası bırakmaz) ama mobil ekran tasarımına
   > dokunmaz; ad zorunluluğunun mobil karşılığı `raporlar/01-rapor.md` içinde açık kalan olarak
   > bildirilir.

### Kapı

```bash
pnpm --filter @wizards/types test
pnpm typecheck
```

---

## Ş0.4 — i18n `messages.*` sözlüğü

### Sahiplenilen dosyalar

```
apps/web/src/lib/locale/messages/tr.ts
apps/web/src/lib/locale/messages/en.ts
apps/web/src/lib/locale/messages.test.ts
```

> Bu iki dosya **yalnız bu şeride** aittir. Sonraki şeritler yazmaz, okur.

### İş

SPEC-MESAJLAR'daki **her** görünür cümleyi anahtara çevir. TR metin SPEC'teki **birebir aynısı**
olacak; kısaltma, yeniden yazma, "iyileştirme" yok. EN doğal çeviridir.

Ad alanı ağacı (düz anahtar, mevcut biçim):

```
messages.rail.*            başlık, Yeni mesaj, yeni grup, Sohbet ara, Sabitlenenler, Sohbetler,
                           okunmamış etiketi ("{count} okunmamış mesaj"), Sen: ön eki
messages.friends.*         başlık, üç sayaç çipi, 4 sekme, arama placeholder, Duruma göre +
                           3 sıralama seçeneği, Çevrimiçi/Çevrimdışı bölümleri, satır eylemleri
                           (Mesaj / sesli ara / görüntülü ara), 6 satırlık `...` menüsü,
                           Arkadaş ekle kartı (başlık, açıklama, placeholder, İstek gönder),
                           Ortak sunuculardan öneriler + Ekle, Gelen/Giden istekler + Kabul et /
                           Yoksay / İsteği iptal et, Engellenenler + Engeli kaldır + bilgi şeridi,
                           4 boş durum metni
messages.conversation.*    başlık alt satırları, Sabitlendi çipi, 5 ikon aria-label,
                           sabitlenen şerit ("{count} sabitlenen mesaj", Tümünü gör),
                           tarih ayracı (Bugün/Dün), (düzenlendi), yazıyor göstergesi,
                           hover şeridi 5 aria-label, mesaj `...` menüsü 5 satır,
                           thread şeridi ("{count} yanıt", "Thread'i aç · son yanıt {time}"),
                           Yönetici rol çipi
messages.composer.*        placeholder (DM/grup), 9 araç adı + kısayol ipucu,
                           "Markdown kısayolları desteklenir", emoji/GIF/ses/anket/gönder
                           aria-label'ları, sesli mesaj kayıt durumları
messages.poll.*            kart üst etiketi ("Anket · çoktan seçmeli" / "· çoktan seçmeli değil"),
                           "{count} kişi oy verdi", "{label} sonra kapanıyor", kapandı hâli,
                           Oy verenleri gör, yüzde aria etiketi
messages.pollModal.*       başlık, alt satır ("{group} · {count} üye oy verebilir"), Soru,
                           Seçenekler + "en çok 6", Seçenek ekle, Çoktan seçmeli, Anonim oylama,
                           Kapanma süresi 3 seçenek, ayak metni, İptal / Anketi gönder
messages.groupModal.*      başlık, iki adım etiketi, arama placeholder, seçilen çip aria,
                           ayak sayacı ("En az 2 kişi seç · en çok 250 üye",
                           "{count} kişi seçildi · sen dahil"), Grup adı, Açıklama,
                           Grup ikonu rengi + 6 renk adı, 3 ayar satırı başlık+açıklama+seçenekler,
                           Geri / İleri / İptal / Grubu oluştur
messages.panel.thread.*    Thread, "{title} · {count} yanıt", kapat, placeholder,
                           "Ana sohbete de gönder"
messages.panel.search.*    Mesajlarda ara, placeholder, filtre çipleri (Kişi: {name}, Tarih ekle),
                           "{count} sonuç", boş sonuç, kapat
messages.empty.*           Kiminle konuşalım?, açıklama, Yeni mesaj, Yeni grup sohbeti, Hızlı başla:
messages.errors.*          tavan aşımı (250 üye / 50 sabit / 6 seçenek), anket kapandı,
                           oy verilemedi, sesli mesaj kaydedilemedi, mikrofon izni reddedildi
```

`messages.test.ts` üç şeyi zorlar: (a) TR ve EN anahtar kümeleri **birebir aynı**, (b)
`messages.*` altında boş dize yok, (c) `{placeholder}` adları iki dilde aynı.

### Kapı

```bash
pnpm --filter @wizards/web test -- --test-name-pattern "locale"
pnpm typecheck
```

---

## Dalga 0 kapısı (dört şerit bittikten sonra, tek sefer)

```bash
pnpm db:generate && pnpm typecheck && pnpm lint
pnpm --filter @wizards/types test && pnpm --filter @wizards/web test
```

Rapor: `raporlar/01-rapor.md` — dört şeridin çıktısı tek dosyada, §"Sözleşme değişikliği" bölümü
Dalga 1'in okuyacağı tip adlarını **listeler**.
