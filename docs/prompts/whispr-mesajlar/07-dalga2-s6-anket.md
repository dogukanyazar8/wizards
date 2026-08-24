# Dalga 2 · Ş6 — Anket (canlı kart + oluşturma modalı)

**Ön koşul:** Ş2 (anket uçları + `poll:updated`), Ş4 (`onOpenPoll`) kapıları yeşil.
**Paralel:** Ş5, Ş7, Ş8 ile aynı anda.

Kapsam: SPEC-MESAJLAR §5.5 ve §8. Ekranlar: `screens/06`, `11`.

---

## Sahiplenilen dosyalar

```
apps/web/src/components/messages/message-poll.tsx           (yeni)
apps/web/src/components/messages/message-poll.test.tsx      (yeni)
apps/web/src/components/messages/poll-composer.tsx          (yeni)
apps/web/src/components/messages/poll-composer.test.tsx     (yeni)
apps/web/src/components/messages/poll-voters-sheet.tsx      (yeni)
apps/web/src/hooks/use-poll.ts + use-poll.test.ts           (yeni)
apps/web/src/lib/polls/client.ts                            (Ş2 ile ORTAK — bkz. aşağıdaki not)
```

> **Dosya çakışması uyarısı.** `lib/polls/client.ts` Ş2'nin listesinde de var. Sahibi **Ş2**'dir;
> Ş6 bu dosyaya **yazmaz**. Ş2 bitmeden başlanırsa Ş6 kendi içinde geçici bir `TODO(api):`
> sarmalayıcı kullanır ve Ş2 kapandığında sarmalayıcıyı siler. İki şerit aynı dosyayı düzenlemez.

---

## İş

### 1. Canlı anket kartı — `message-poll.tsx` (SPEC §5.5)

Genişlik 470, radius 16, `--surface-card`, `1px --border/0.6`, padding 16.

- **Üst satır:** anket ikonu + `Anket · çoktan seçmeli` / `Anket · çoktan seçmeli değil`
  (600/10.5 display, uppercase, muted).
- **Soru:** 600/15.5 display.
- **Seçenekler** (gap 8): satır padding `10 13`, radius 12, `--surface-soft/0.6`; arkada oy oranı
  dolgusu — genişlik = yüzde, kendi oyunda `--primary/0.22` + kenar `--primary/0.55`, diğerlerinde
  `--surface-tertiary/0.85` + `--border/0.6`. Solda 17px radio (kendi oyunda dolu; `multi` iken
  radio değil **onay kutusu**), etiket 13.5, sağda yüzde 600/12.5.
  - Dolgu `width .3s`. `prefers-reduced-motion` açıkken geçiş yok, yüzde anında yerleşir.
- **Ayak:** `{n} kişi oy verdi · {label} sonra kapanıyor` + sağda `Oy verenleri gör`.
  - Kapanmış ankette ayak `{n} kişi oy verdi · kapandı`, seçenekler pasif, tıklama yok.
  - **`anonymous` iken `Oy verenleri gör` çizilmez** (karar #11). Bayrak `PollDto.canSeeVoters`;
    istemci `!anonymous` diye türetmez, sunucunun dediğini yapar.

**Oy verme davranışı:**

- Tek seçimlide tıklama oyu **taşır**: eski seçenekten düşer, yenisine eklenir. Aynı seçeneğe
  ikinci tıklama oyu **geri çeker** (`clearPollVote`).
- Çoktan seçmelide her seçenek bağımsız açılıp kapanır; istek her zaman **tam kümeyi** gönderir.
- İyimser güncelleme `applyPollVote` (Ş0.3'ün saf fonksiyonu) ile; istek başarısızsa önceki
  duruma dönülür ve `messages.errors.voteFailed` gösterilir.
- Hızlı ardışık tıklama: son istek kazanır, önceki `AbortController` ile iptal edilir. Sunucudan
  gelen `poll:updated` yükü **her zaman** iyimser durumu ezer.
- **Erişilebilirlik:** seçenek listesi `role="radiogroup"` (tek seçimli) / `role="group"` +
  `checkbox` (çoktan seçmeli). Her seçenek `aria-label`'ında etiket + yüzde + oy sayısı taşır:
  `"16:00 · %60 · 3 oy"`. Yüzdeyi yalnız renkle anlatan bir yüzey kalmaz.

**Gerçek zaman:** `use-poll.ts` `poll:updated` olayına abone olur ve React Query önbelleğini
yamalar. Konuşma değişince abonelik bırakılır.

### 2. Oy verenler — `poll-voters-sheet.tsx`

`Oy verenleri gör` → seçenek başına gruplanmış liste (avatar + ad). Veri
`fetchPollVoters(pollId)`; uç `403` dönerse sheet açılmaz ve buton zaten çizilmemiş olmalıdır —
`403` görünürse bu bir hata durumudur, sessizce yutulmaz, raporlanır.

### 3. Anket oluşturma modalı — `poll-composer.tsx` (SPEC §8)

Genişlik **520**, radius 22, `--surface-card`, `1px --border`, backdrop `--backdrop/0.62` +
`blur(4px)`, kabuk içinde konumlanır (`MessagesLayout` `position:relative`).

- **Başlık:** `Anket oluştur` + alt satır `{sohbet} · {n} üye oy verebilir`.
  1:1 DM'de `{n}` = 2 (karar #12).
- **`Soru`** giriş alanı — boş başlar, placeholder yok, etiket alanın üstünde bölüm etiketi
  stilinde. 300 karakter sayacı yalnız 250'yi geçince görünür.
- **`Seçenekler`** etiketi + sağda `en çok 6` (11 muted). Satırlar: harf tile (`A`,`B`,`C`… 24×24
  radius 8) + giriş + kaldır ikonu. Altında `Seçenek ekle` (kesikli kenar, primary metin).
  - `addPollOption` / `removePollOption` (Ş0.3) tavanları uygular: 6'da `Seçenek ekle` pasif,
    2'nin altına inilemez (kaldır ikonu çizilmez).
  - Boş seçenekler gönderimde elenir (`toPollCreateRequest`).
- **`Çoktan seçmeli`** toggle — varsayılan **kapalı**.
- **`Anonim oylama`** toggle — varsayılan **açık**.
- **`Kapanma süresi`** segmenti: `1 saat` / `24 saat` (seçili) / `3 gün`.
- **Ayak:** solda `Anket mesaj olarak gönderilir` (11.5 muted), sağda `İptal` + `Anketi gönder`
  (primary). `canSubmitPoll` false iken gönder **pasif** ve `aria-disabled` + neden
  (`aria-describedby`) taşır.
- Gönderim → modal kapanır, sohbete döner, anket kartı akışa eklenir (sunucudan gelen
  `dm:message:new` ile; iyimser mesaj eklenmez — anket kartı sunucu kimliği ister).

**Modal davranışı:** `Esc` ve backdrop kapatır; açılışta ilk alana focus; focus tuzağı; kapanınca
focus tetikleyen butona döner. Taslak modal kapanınca **atılır** (grup taslağının aksine) —
SPEC'te taslak koruma yok, uydurulmaz.

---

## Test

`message-poll.test.tsx`:

- Yüzdeler `{1,3,1}` → `20/60/20`; toplam 100'ü geçmez.
- Tek seçimlide oy taşınır (eski düşer, yeni eklenir); aynı seçeneğe ikinci tıklama geri çeker.
- Çoktan seçmelide iki seçenek birlikte işaretli kalır.
- İstek hatasında iyimser durum geri alınır ve hata metni görünür.
- `anonymous: true` iken `Oy verenleri gör` **yok**.
- Kapanmış ankette seçenekler tıklanamaz.
- Her seçeneğin `aria-label`'ı yüzde ve oy sayısı taşır.
- `poll:updated` geldiğinde kart iyimser durumu bırakıp sunucu durumunu gösterir.

`poll-composer.test.tsx`:

- 2 dolu seçenek olmadan gönder pasif; soru boşken pasif.
- `Seçenek ekle` 6'da durur; 3. satır kaldırılabilir, 2 satır kalınca kaldırma çizilmez.
- Varsayılanlar: çoktan seçmeli kapalı, anonim açık, süre `24 saat`.
- `Esc` kapatır ve taslağı atar; focus tetikleyiciye döner.

`use-poll.test.ts`: hızlı ardışık oy → tek istek hayatta kalır, önbellek son sunucu yükünü tutar.

## Kapı

```bash
pnpm --filter @wizards/web test -- --test-name-pattern "poll"
pnpm typecheck && pnpm lint
pnpm --filter @wizards/web e2e:a11y
```

Rapor: `raporlar/07-rapor.md`.
