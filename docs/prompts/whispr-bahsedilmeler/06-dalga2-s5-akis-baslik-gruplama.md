# Dalga 2 · Ş5 — Akış başlığı, gruplama, sekmeler, URL durumu, boş durum

**Ön koşul:** Dalga 1 kapısı yeşil. **Paralel:** Ş6, Ş7, Ş8.

Ekranın iskeleti ve durum yönetimi. Kartın **içini** Ş6, yanıt kutusu ve paneli Ş7, modalı Ş8
yazar; bu şerit onları `MentionCardProps` ve slot'lar üzerinden yerleştirir.

---

## Sahiplenilen dosyalar

- `apps/web/src/app/(main)/mentions/page.tsx` (mevcut — yeniden yazılır)
- `apps/web/src/components/mentions/mentions-page.tsx` (yeni — durum sahibi)
- `apps/web/src/components/mentions/mentions-feed.tsx` (yeni)
- `apps/web/src/components/mentions/mentions-feed-header.tsx` (yeni)
- `apps/web/src/components/mentions/mentions-empty-state.tsx` (yeni)
- `apps/web/src/components/mentions/mentions-new-strip.tsx` (yeni)
- `apps/web/src/lib/mentions/grouping.ts` (yeni) + `.test.ts`
- `apps/web/src/lib/mentions/keyboard.ts` (yeni) + `.test.ts`
- `apps/web/src/components/mentions/mentions-feed.test.tsx` (yeni)
- `apps/web/src/components/screens/mentions-screen.tsx` — **silinir** (eski ekran).
  `side-screens.test.tsx` içindeki bahsedilmeler iddiaları güncellenir.

**Okunur, yazılmaz:** `mention-card.tsx` (Ş6), `mention-reply-box.tsx` /
`mention-context-panel.tsx` (Ş7), `mention-settings-modal.tsx` (Ş8).

---

## İş

### 1. Durum ekseni ve URL (SPEC §2, PROMPT kural 8)

Tek doğruluk kaynağı URL: `/mentions?filter=…&source=…&group=…&window=…&q=…`.
Geçici durumlar (`menu`, `reply`, `panel`) React state'inde durur ama **`panel` URL'e de yazılır**
(`?panel=<mentionId>`) — bağlam paneli paylaşılabilir bir görünümdür.

Disiplin (SPEC §2 sonu): aynı anda **tek** `menu`, **tek** `reply`, **tek** `panel`. Biri
açılırken diğerleri kapanır. Bu kural tek bir indirgeyicide (`mentionsUiReducer`) durur;
üç ayrı `useState` ile yazılmaz — üçü ayrı olduğunda "biri açılırken diğeri kapanır" kuralı
her çağrı yerinde tekrar edilmek zorunda kalır ve bir yerde unutulur.

### 2. Akış başlığı (SPEC §4)

- Sol blok: başlık `Bahsedilmeler` **veya seçili kaynağın adı** + sayı pili
  (`{count} bahsetme`, boş durumda `Hepsi okundu`).
- Alt satır: `Zamana göre gruplu · {unread} okunmamış · en yenisi {time}`; gruplama kaynağa
  alındığında `Kaynağa göre gruplu · …`; boş durumda `Son 30 gün · bekleyen bahsetme yok`.
  `time` izleyicinin saat biçimine göre (`UserAccountPreferences.timeFormat`) biçimlenir.
- Segment grubu: 4 sekme + sayı pilleri. Aktif `--primary` + `#fff`.
  Sekmeler ile raydaki tür satırları **aynı state**: `Okunmamış` sekmesi ile `Okunmamış`
  satırı birlikte seçili görünür.
  `Rol · @herkes` sekmesi `filter=role` → hem `role` hem `everyone` türünü kapsar.
- İki ikon butonu: `Gruplama` (zaman ↔ kaynak) ve `Bahsetme bildirimleri` (`?modal=settings`).
  **Bağlam paneli açıkken ikisi de `display:none`** (SPEC §4 sonu) — 456px'lik akışta başlık
  taşmasın diye. Bu bir `hidden` sınıfı değil, gerçek kaldırmadır (odak sırasına da girmemeli).

### 3. Gruplama (`grouping.ts`)

- `time`: `Sonra oku` (varsa, K5) · `Bugün` · `Dün` · `Bu hafta` · `Daha eski`.
  Eşikler izleyicinin saat diliminde hesaplanır, UTC'de değil.
- `source`: kaynak adları; sıralama akıştaki en yeni bahsetmeye göre azalan,
  `Direkt mesajlar` en sonda.
- **Boş grup render edilmez** (SPEC §5).
- Grup başlığı: etiket + grup sayısı + kalan genişliği dolduran hairline çizgi.

### 4. Liste ve performans (PROMPT kural 7)

- `useInfiniteQuery` + kaydırma sonu sentinel'i (mevcut `ScreenInfiniteSentinel` yeniden
  kullanılabilir; kopyalanmaz).
- **Sanallaştırma:** liste 60 karttan uzunsa pencereleme devreye girer. Grup başlıkları
  düz listeye (`flatten`) çevrilerek tek sanal listede tutulur — iç içe listelerde grup
  başlıkları yapışkan olamaz ve ölçüm bozulur.
- Yeni bahsetme (`mention:new`): kullanıcı **en üstteyse** kart doğrudan `Bugün` grubuna girer;
  **kaydırılmışsa** kart eklenir ama kaydırma konumu korunur ve üstte `{count} yeni bahsetme`
  şeridi çıkar (tıklayınca en üste gider). Konum korumak için `scrollTop` telafisi
  ölçülerek yapılır, `scrollIntoView` ile değil.
- Akış geciktiğinde ray beklemez; akış 3 kart `Skeleton`'u gösterir.

### 5. Klavye (`keyboard.ts`, PROMPT kural 5)

- `J`/`↓` sonraki kart, `K`/`↑` önceki kart — imleç `active` prop'u ile karta iner.
- `R` yanıtla, `E` okundu/okunmadı çevir, `Esc` açık panel/menü/modalı kapatır.
- Kısayollar **yalnız akış odaktayken** çalışır (`role="feed"` konteynerinde `tabIndex=0`);
  bir input/textarea odaktayken hiçbiri tetiklenmez.
- İmleç değiştiğinde kart görünür alana `block: "nearest"` ile kaydırılır.

### 6. Boş durum (SPEC §8)

- 78×78 `--success/0.14` daire + 34px tik, başlık, 420px metin, iki buton.
- `Arşive dön` → `?window=all` (K7). `Bildirim ayarları` → `?modal=settings`.
- `Tümünü okundu işaretle` sonrası **aynı** ekran; gezinme panelindeki sayaç kaybolur.
- Boş durum yalnız `window=30d` + filtre `all` + arama boşken tam metinlidir; filtreli boş
  sonuçta başlık aynı kalır, metin `mentions.empty.filtered` ile filtreye işaret eder
  (Ş0.4 anahtarı; SPEC'te olmayan bu durum rapora sapma olarak yazılır).

### 7. Akış altlığı

Ortalanmış 12px muted metin, iki yanında hairline: `Daha eski bahsetmeler 30 gün sonra
arşivlenir`. `window=all` iken **gösterilmez**.

---

## Kabul

- [ ] Filtre + kaynak + gruplama + pencere + arama URL'e yansıyor; geri tuşu her birini
      tek adım geri alıyor; adres paylaşıldığında aynı görünüm açılıyor.
- [ ] Sekmeler ile ray satırları aynı state'i gösteriyor (birinden seçim diğerinde görünüyor).
- [ ] Sayı pilleri (başlık pili, 4 sekme pili, ray pilleri, nav rozeti) **tek** sorgudan;
      hepsi aynı anda değişiyor.
- [ ] Bağlam paneli açıkken başlıktaki iki ikon butonu DOM'dan kalkıyor ve başlık taşmıyor
      (456px'te ölçüldü).
- [ ] Boş grup render edilmiyor; `Sonra oku` grubu en üstte.
- [ ] Kaydırılmış akışa yeni bahsetme geldiğinde konum bozulmuyor ve şerit çıkıyor.
- [ ] `J/K/R/E/Esc` çalışıyor; yanıt kutusu odaktayken `J` metne yazıyor, kart değiştirmiyor.
- [ ] Eski `mentions-screen.tsx` silindi ve hiçbir import kalmadı.
- [ ] 200 kartlık listede kaydırma 60 fps'in altına düşmüyor (ölçüm rapora eklendi).

## Kapı

```
pnpm --filter @wizards/web typecheck
pnpm --filter @wizards/web lint
pnpm --filter @wizards/web test
```
