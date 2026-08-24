# Dalga 2 · Ş7 — Sağ paneller (thread 340 + mesaj arama 340)

**Ön koşul:** Ş1 (`MessagesLayout.panel`), Ş2 (global arama ucu) kapıları yeşil.
**Paralel:** Ş5, Ş6, Ş8 ile aynı anda.

Kapsam: SPEC-MESAJLAR §6. Ekranlar: `screens/07`, `08`.

---

## Sahiplenilen dosyalar

```
apps/web/src/components/chat/thread-panel.tsx
apps/web/src/components/chat/message-search-panel.tsx
apps/web/src/components/messages/messages-side-panel.tsx      (yeni — ortak kabuk)
apps/web/src/components/messages/*.test.tsx                    (panel testleri)
apps/web/src/hooks/use-thread-messages.ts
apps/web/src/hooks/use-message-search.ts                       (yeni)
apps/web/src/lib/messages/search-highlight.ts + *.test.ts      (yeni)
```

**Dokunulmaz:** `message-item.tsx` / `message-list.tsx` (Ş5), `message-input.tsx` (Ş4).

---

## Sözleşme

Okuduğun: `MessagesLayoutProps.panel` (Ş1), `searchDmMessagesGlobal` + `MessageSearchHitDto`
(Ş2), `onOpenThread` (Ş5).

Verdiğin: yok — paneller yaprak bileşenlerdir.

---

## İş

### 0. Ortak panel kabuğu

`messages-side-panel.tsx`: genişlik 340 (`flex:none`), `--surface-panel`, sol kenar
`--border/0.5`. Başlık satırı (ikon + başlık + alt satır + kapat `×`) ve gövde yuvası.
İki panel de bunu kullanır; iki kez çizilmez.

- Panel açıldığında focus başlığa taşınır; `Esc` kapatır ve focus tetikleyen başlık ikonuna döner.
- `<1100px`'te overlay olur (Ş1'in `MessagesLayout` davranışı); overlay hâlinde `role="dialog"` +
  `aria-modal` ve focus tuzağı, docked hâlinde `role="complementary"` ve tuzak **yok**.
  Bu ayrım önemli: docked panelde focus tuzağı klavye kullanıcısını ekranın geri kalanından koparır.

### 1. Thread paneli (SPEC §6.1)

- **Başlık:** thread ikonu (primary) + `Thread` 600/14.5 + alt satır `{kök özeti} · {n} yanıt` +
  kapat.
  - `{kök özeti}` = kök mesajın ilk satırından türetilmiş kısa başlık (`excerpt`, Ş5'in
    `message-blocks.ts`'i). Sunucu "thread başlığı" tutmuyor; uydurma alan istenmez.
- **Kök mesaj kartı:** yazar + saat + gövde.
- **Yanıtlar:** 32px avatar, ad 600/12.5, saat 10.5, gövde 13. Mevcut `use-thread-messages.ts`
  sonsuz sorgusu ve socket yaması korunur.
- **Panele özel bestekar:** placeholder `Thread'e yanıt yaz` + `Ana sohbete de gönder` onay kutusu.
  - Kanal tarafında bu bayrak `alsoSendToChannel` olarak zaten var. **DM tarafında karşılığı var
    mı doğrula** (`graphify query "DM thread alsoSend"`): yoksa `TODO(api):` işaretle, onay
    kutusunu çiz ama pasif bırakma yerine isteği bayraksız gönder ve durumu rapora yaz. Sessizce
    yoksayma.
  - Bestekar Ş4'ün bileşenidir; burada `variant="thread"` ile monte edilir, **yeniden yazılmaz**.
- Thread paneli sohbet değişince **kapanır** (kök mesaj başka konuşmada anlamsız). Panel durumu
  aksi hâlde korunur (SPEC §12).

### 2. Mesaj arama paneli (SPEC §6.2, karar #6)

Bugünkü yüzen popover **kaldırılır**; panel docked hâle gelir.

- **Başlık:** `Mesajlarda ara` 600/14.5 + kapat.
- **Arama alanı:** h 38, radius 12. Girdi 300ms `debounce`; 2 karakterin altında sorgu atılmaz.
- **Filtre çipleri:**
  - `Kişi: {ad}` — panel açıldığında **açık sohbetin karşı tarafıyla ön-dolu** gelir
    (grupta ön-dolu gelmez). Kaldırılabilir (primary tint, × ile). Kaldırılınca arama global olur.
  - `Tarih ekle` (nötr) → tarih aralığı seçici; seçilince çip `{başlangıç} – {bitiş}` olur ve
    kaldırılabilir.
- **`{n} sonuç`** etiketi. Sonuç kartları: padding 12, radius 13, `--surface-card`,
  `1px --border/0.6`, hover kenar primary + `translateY(-1px)`; 24px avatar + ad 600/12.5 +
  saat 10.5 muted; altında eşleşme metni 12.5, eşleşen kelime `--primary/0.18` zeminli çip.
  - Vurgu `matchRange` **sunucudan** gelir (Ş2). `search-highlight.ts` yalnız aralığı `<mark>`'a
    çevirir; kendi arama mantığını **kurmaz**. Test: `yoğunluğu` kelimesinde aralık kod noktası
    cinsinden doğru dilimler (`ğ`, `ı` çok baytlı).
  - Kart tıklaması → o mesajın bulunduğu sohbete gider ve mesajı vurgular. Başka bir konuşmaya
    gidiyorsa sohbet değişir ve **arama paneli açık kalır** (aramaya devam edilebilsin).
- **Sayfalama:** kaydırma sonuna gelince sonraki sayfa (`cursor`). İlk sayfa uzunluğu
  `MESSAGES_DENSITY_BY_SCALE[scale].searchResults`.
- **Boş sonuç:** alanın ortasında tek satır muted metin.
- **Yükleme:** sonuç kartı iskeleti, sorgu değişince önceki sonuçlar **kaybolmaz**, üzerine
  soluklaşır (zıplayan liste olmaz).

### 3. Panel dışlayıcılığı

`thread` ve `search` aynı anda açılmaz — kural Ş0.3'ün `reduceMessagesScreen`'inde. Panel
bileşenleri bunu kendi içinde kontrol **etmez**, yalnız `dispatch` eder. Testi `messages-screen`
biriminde (Ş0.3) ve burada entegrasyon seviyesinde bir kez daha koş.

---

## Test

- `thread-panel.test.tsx`: başlık `{özet} · {n} yanıt`; sohbet değişince kapanır; docked hâlde
  focus tuzağı **yok**, overlay hâlde var; `Esc` kapatır ve focus geri döner.
- `message-search-panel.test.tsx`: DM'de `Kişi:` çipi ön-dolu, grupta değil; çip kaldırılınca
  isteğin `personId`'si düşer; vurgu doğru kelimeyi sarar; boş sonuç metni; sonuç tıklaması sohbet
  değiştirir ve paneli kapatmaz.
- `search-highlight.test.ts`: çok baytlı Türkçe karakterlerde aralık kayması yok.
- Entegrasyon: thread açıkken arama ikonuna basmak thread'i kapatır.

## Kapı

```bash
pnpm --filter @wizards/web test -- --test-name-pattern "(thread|search)"
pnpm typecheck && pnpm lint
pnpm --filter @wizards/web e2e:a11y
```

Rapor: `raporlar/08-rapor.md`. `Ana sohbete de gönder` bayrağının DM karşılığı bulundu mu —
bulunamadıysa açık kalan olarak yaz.
