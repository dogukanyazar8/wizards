# Dalga 2 · Ş5 — Sohbet gövdesi (başlık, sabitlenen şerit, mesaj listesi)

**Ön koşul:** Ş1 (`MessagesLayout`), Ş2 (pin uçları), Ş4 (`voice-message-player`) kapıları yeşil.
**Paralel:** Ş6, Ş7, Ş8 ile aynı anda.

Kapsam: SPEC-MESAJLAR §5.1–§5.4. Ekranlar: `screens/05`, `06`.

---

## Sahiplenilen dosyalar

```
apps/web/src/components/chat/message-list.tsx
apps/web/src/components/chat/message-item.tsx
apps/web/src/components/chat/message-toolbar.tsx
apps/web/src/components/chat/message-attachments.tsx
apps/web/src/components/chat/reply-preview.tsx
apps/web/src/components/chat/typing-indicator.tsx
apps/web/src/components/chat/chat-area.tsx
apps/web/src/components/dm/dm-conversation.tsx
apps/web/src/components/dm/dm-conversation-page.tsx
apps/web/src/components/messages/conversation-header.tsx          (yeni)
apps/web/src/components/messages/pinned-strip.tsx                 (yeni)
apps/web/src/components/messages/pinned-list-sheet.tsx            (yeni — "Tümünü gör")
apps/web/src/components/messages/*.test.tsx                       (yeni)
apps/web/src/lib/messages/message-blocks.ts + *.test.ts           (yeni)
```

**Dokunulmaz:** `message-input.tsx` (Ş4), `message-poll.tsx` (Ş6), `thread-panel.tsx` /
`message-search-panel.tsx` (Ş7), modallar (Ş8).

---

## Sözleşme (okuduğun / verdiğin)

Okuduğun (Dalga 0 + Dalga 1'den):
`PinnedMessageDto`, `PollDto`, `fetchConversationPins`, `pinDmMessage`, `unpinDmMessage`,
`VoiceMessagePlayer`.

Verdiğin (Ş6 ve Ş7 okuyacak):

```ts
// message-item.tsx
export type MessageItemProps = {
  // ...
  /** Ş6'nın kartı. MessageItem anketi BİLMEZ, yalnız yuvaya koyar. */
  pollSlot?: React.ReactNode;
  /** Ş7 thread panelini açar. */
  onOpenThread?: (messageId: string) => void;
};
```

---

## İş

### 1. Başlık çubuğu (SPEC §5.1)

`conversation-header.tsx`, padding `15 22`, alt kenar `1px --border/0.45`, zemin `--surface-base`.

- **DM:** 40px avatar + presence noktası; ad 600/16 + `@kullanıcı` 12 muted; alt satır
  `Çevrimiçi · Tasarım Kritiği odasında` 12 muted — ikinci parça Ana Sayfa'nın türetilmiş durum
  metniyle **aynı** kaynaktan (`lib/home/presentation.ts`).
- **Grup:** 40×40 radius 14 `--primary` tile + iki harf; ad + `Sabitlendi` çipi (pin ikonu,
  `--surface-tertiary`, 10.5 muted) — çip yalnız **konuşma** sabitliyken (`DMParticipant.pinnedAt`),
  mesaj sabitlemeyle karıştırma; alt satır `{n} üye · {m} çevrimiçi`; sağda üye avatar yığını
  (24px, `+N` çipiyle biter, `GROUP_AVATAR_TILE_COUNT` yerine tasarımın 3+1 düzeni).
  - 250 üyeli grupta yığın yine 3 avatar + `+247` gösterir; roster'ın tamamı **çekilmez**,
    başlık için `previewMembers` (en çok 4) ve `memberCount` yeterlidir. Ş2'nin konuşma DTO'su
    bunu taşımıyorsa `TODO(api):` ile işaretle ve bildir.
- **Sağ ikon şeridi** 34×34 radius 11: sesli ara · görüntülü ara · thread paneli · mesajlarda ara ·
  `...`. Panel açıkken ilgili ikon `--primary/0.16` + primary. Thread ve arama **aynı anda
  açılmaz** — durum Ş0.3'ün indirgeyicisinde, ikon yalnız `dispatch` eder.

### 2. Sabitlenen mesaj şeridi (SPEC §5.2, karar #7)

`pinned-strip.tsx`: pin ikonu + `{n} sabitlenen mesaj` + en yeni sabitin önizlemesi
(`{yazar}: {metin}`, tek satır ellipsis) + sağda `Tümünü gör`.

- Sayı `fetchConversationPins` uzunluğundan; 0 ise şerit çizilmez.
- Şeridi kapatma `pinnedStripDismissedId` yazar; **yeni** bir sabit gelince şerit tekrar görünür.
- `Tümünü gör` → `pinned-list-sheet.tsx`: sabitlenenlerin listesi, her satırda "mesaja git" ve
  yetkisi olanda "sabitlemeyi kaldır". Yetkisi olmayanda kaldırma butonu **çizilmez**.
- Mesaja git: listede o mesaja kaydırır ve 1.2sn `--primary/0.10` zemin vurgusu
  (`prefers-reduced-motion` açıkken vurgu anlık, geçişsiz).

### 3. Mesaj listesi — ortak görsel dil (karar #10)

`flex-direction: column; justify-content: flex-end; gap: var(--m-gap)`, padding `16 0 8`, satır
yatay padding 26. **Baloncuk yok, düz satır.** Bu değişiklik sunucu kanallarında da geçerlidir;
kanal görsel testleri ve anlık görüntüleri bu şeritte yenilenir.

- **Tarih ayracı:** ortada `Bugün` / `Dün` / tarih (600/11 display, muted), iki yanında
  `1px --border/0.5` çizgi.
- **Satır:** 40px avatar (ardışık aynı yazar → avatar gizlenir, hiza korunur) + ad 600/13.5 +
  saat 11 muted + gövde 14/1.5. İç boşluk `var(--m-pad)`, hover zemini `--surface-soft/0.45`.
- **Bloklar** (`lib/messages/message-blocks.ts`): SPEC §11'in `blocks: (text | inlineCode |
codeBlock)[]` sözleşmesi. Bugün markdown render'ı `react-markdown` ile yapılıyor ve **kalır** —
  `message-blocks.ts` yalnız arama vurgusu ve alıntı özetleri için gereken düz metin çıkarımını
  yapar (`toPlainText`, `excerpt(n)`). İkinci bir markdown ayrıştırıcı yazılmaz.
- **`(düzenlendi)`** eki 11 muted, gövdenin sonunda.
- **Dosya kartı:** genişlik 420, radius 14, `--surface-card` + `1px --border/0.6`, 40×40 tile,
  ad 600/13 + `{boyut} · {tür}` 11.5 muted, sağda indir ikonu. Sesli mesaj eki ise kart yerine
  Ş4'ün `VoiceMessagePlayer`'ı çizilir.
- **Tepki çipleri:** h 26, radius 999, `--surface-soft`; kendi tepkin `--primary/0.14` +
  `1px --primary/0.35`. Yanında tepki ekle (+). Sayı ve "kimler" tooltip'i mevcut mantıktan.
- **Yanıt önizlemesi:** genişlik 340, 2px sol çizgi (`--border`) + küçük avatar + yazar + alıntı
  (12 muted, tek satır). Tıklama kaynağa gider ve vurgular.
- **Yazıyor göstergesi:** listenin altında `{ad} yazıyor…` + üç noktalı animasyon
  (`prefers-reduced-motion` açıkken nokta animasyonu durur, metin kalır).
- **Sanallaştırma korunur.** Mevcut `MessageList` davranışı bozulmaz; `message-list-performance.test.ts`
  yeşil kalmalı. Kırılıyorsa görsel değişiklik sanallaştırma ölçüm varsayımını bozmuştur — düzelt,
  testi gevşetme.

### 4. Hover eylem şeridi ve mesaj menüsü (SPEC §5.3)

- Şerit satırın sağ üstünde yüzer: radius 11, `--surface-card` + `1px --border`, gölge
  `0 12px 26px -14px --shadow-color`; butonlar 30×30: hızlı tepki · yanıtla · thread başlat ·
  sabitle · `...`.
  - Görünürlük `var(--act)` ile: `0` → yalnız hover **ve** klavye odağı. Odakla görünme şart —
    yoksa şerit klavyeyle erişilemez.
- `...` menüsü 206px radius 14: `Metni kopyala` · `Düzenle` · `Mesajı ilet` ·
  `Bağlantıyı kopyala` · ayırıcı · `Mesajı sil` (danger).
  - `Düzenle` yalnız kendi mesajında; `Mesajı sil` kendi mesajında ya da yetkilide.
    Yetkisiz satır **çizilmez**.
  - Aynı anda tek menü (Ş0.3 indirgeyicisi).

### 5. Grup listesine özgü öğeler (SPEC §5.4)

- **Rol çipi** (`Yönetici`) yazar adının yanında; `DMParticipantRole` OWNER/ADMIN.
- **Bahsetme çipi:** `--primary` metin, `--primary/0.14` zemin, radius 4. Seni bahseden satırın
  solunda 3px `--primary` şerit (`mentionsMe`).
- **Thread şeridi:** satırın altında radius 11, `--surface-soft/0.5`; `{n} yanıt` 600/12 primary +
  `Thread'i aç · son yanıt {saat}` 11.5 muted → `onOpenThread(messageId)`.
- **Anket yuvası:** `pollSlot` prop'u. Ş6 kartı buraya gelir; `MessageItem` anketi bilmez.

### 6. Eski markdown anket render'ı

`parsePollBlock` **korunur** (geriye dönük): eski mesajlarda anket bloğu hâlâ çizilir ve emoji
tepkileriyle oy sayısı gösterilir. Yeni anket üretimi kapandı (Ş4 §4). Kod başına
`@deprecated` yorumu + kaldırma koşulu ("tüm geçmiş anketler yeni modele taşındığında") yazılır.

---

## Test

- `conversation-header.test.tsx`: DM/grup varyantları; panel açıkken ikon vurgusu; 250 üyeli grupta
  yığın 3 avatar + `+247`.
- `pinned-strip.test.tsx`: 0 sabitte çizilmez; kapatma `dismissedId` yazar; yeni sabit geldiğinde
  tekrar görünür; `Tümünü gör` listeyi açar; yetkisizde kaldırma butonu yok.
- `message-item` testleri: ardışık yazarda avatar gizlenir/hiza korunur; `--act` 0 iken şerit
  klavye odağında görünür; yetkisizde `Düzenle`/`Sil` çizilmez; bahsetme şeridi `mentionsMe`
  ile çizilir; `pollSlot` render edilir.
- `message-list-performance.test.ts` yeşil kalır.
- `message-blocks.test.ts`: `excerpt` Türkçe karakterlerde kod noktası sayar, kelime ortasından
  kesmez.

## Kapı

```bash
pnpm --filter @wizards/web test -- --test-name-pattern "(message-|conversation-header|pinned)"
pnpm typecheck && pnpm lint
pnpm --filter @wizards/web exec playwright test --project=chromium e2e/specs/message-interactions
```

Rapor: `raporlar/06-rapor.md`. Kanal ekranlarının **öncesi/sonrası** ekran görüntüsü eklenir
(karar #10'un görünür sonucu).
