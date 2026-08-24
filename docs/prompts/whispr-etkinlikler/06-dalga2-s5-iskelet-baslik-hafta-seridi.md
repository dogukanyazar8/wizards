# Dalga 2 · Ş5 — Sayfa iskeleti, akış başlığı, hafta şeridi, URL durumu

**Ön koşul:** Dalga 1 kapısı yeşil. **Paralel:** Ş6, Ş7, Ş8.

Ekranın **durum sahibi**. Bu şerit diğer üçünü yalnız **yerleştirir**; kartın içini Ş6, rayı ve
paneli Ş7, modalı ve şeritleri Ş8 çizer. `mentions-page.tsx` deseninin aynısı: dört slot,
varsayılanı gerçek bileşen, prop olarak kalmalarının tek sebebi test.

---

## Sahiplenilen dosyalar

- `apps/web/src/app/(main)/events/page.tsx` (yeniden yazılır — `EventsPage`'e bağlanır)
- `apps/web/src/components/events/events-page.tsx` (yeni) + `.test.tsx`
- `apps/web/src/components/events/events-feed-header.tsx` (yeni) + `.test.tsx`
- `apps/web/src/components/events/event-week-strip.tsx` (yeni) + `.test.tsx`
- `apps/web/src/lib/events/week.ts` (yeni — hafta hesabı, saf) + `.test.ts`

**Okunur, yazılmaz:** `lib/events/routes.ts` (Ş0.4), `lib/events/metrics.ts` (Ş0.3),
`lib/events/client.ts` (Ş1), `components/shell/wizards-shell.tsx`.

---

## İş

### 1. Sayfa iskeleti (`events-page.tsx`)

```
┌─ ana kolon (flex:1, min-width:0) ──────────────────┬─ sağ sütun ─┐
│  akış başlığı                                       │  ajanda rayı │
│  hafta şeridi                                       │  (300)  VEYA │
│  filtre şeridi (koşullu)                            │  detay paneli│
│  RSVP onay şeridi (koşullu)                         │  (326)       │
│  ızgara (kaydırma alanı)                            │              │
└────────────────────────────────────────────────────┴──────────────┘
```

- **Tek doğruluk kaynağı URL** (Ş0.4). Filtre, sekme, hafta, kart boyutu, panel ve modal adres
  çubuğunda. Geçici katmanlar (klavye imleci, RSVP şeridi) `eventsUiReducer`'da (Ş0.1); panel
  ve modal da aynı indirgeyicide durur ama **yazımları adresten geçer** — adres değişince
  indirgeyici eşitlenir, indirgeyici tek başına adresin arkasından gitmez.
- Sorgular: `useInfiniteQuery` liste + türetilmiş `counts`. **Bağımlılıklar ilkel**
  (tuzak #12): `const { fetchNextPage, hasNextPage, isFetchingNextPage } = listQuery;`
- Kolonlar bağımsız yükler: ızgara `EventCardSkeleton` çizerken sağ ray kendi verisiyle gelir.
- `Esc` merdiveni `eventsUiReducer('closeTransient')`'tan okunur; sıra burada tekrar yazılmaz.
- Aynı anda tek panel, tek modal: `openCreate` paneli kapatır, `openPanel` modalı kapatır.
- Detay paneli açıkken **ajanda rayı unmount** olur (`ternary`, `hidden` değil) — iki sütun aynı
  anda DOM'da durmaz.

Dört slot: `renderCard`, `renderAgendaRail`, `renderDetailPanel`, `renderCreateModal`.
Varsayılanları gerçek bileşenler; testte sahte çizici geçirilir.

### 2. Akış başlığı (`events-feed-header.tsx`) — SPEC §3.1

```
padding 15/24 · border-bottom hairline --border/.45 · background --surface-base
display flex · flex-wrap NOWRAP · align-items center · gap 14
```

| Parça        | Kural                                                                               |
| ------------ | ----------------------------------------------------------------------------------- |
| Başlık bloğu | `flex: 1 1 170px; min-width: 0`                                                     |
| Başlık       | 600/16.5/1.2 display, `-.02em`, nowrap + ellipsis                                   |
| Alt satır    | 500/12/1 body, muted, nowrap + ellipsis                                             |
| Sekme grubu  | `flex: none`, padding 4, radius 13, `--surface-secondary`, kenar `--border/.55`     |
| Sekme        | h33, padX 13, radius 10, 600/12.5; aktif `--primary` zemin + `#fff`                 |
| Sekme pili   | minW 17, h17, radius 6, 600/10 display; aktifte `hsl(0 0% 100%/.22)`                |
| İkon grubu   | gap 5; `Oluştur` 34×34 `--primary` + beyaz artı; kart boyutu ve zil 34×34 radius 11 |

**Başlık metni** (§3.2 sapma #4 — HTML davranışı):

```
q varsa            → events.title.search        (Arama sonuçları)
kaynak filtresi    → sunucu adı
tab === 'live'     → events.title.live          (Canlı)
tab === 'going'    → events.title.going         (Katılacağım)
time === 'today'   → events.title.today         (Bugün)
diğer              → events.title               (Etkinlikler)
```

**Alt satır** = `{count} etkinlik · {sub}` biçiminde birleşir:

```
normal   → Güne göre gruplu · {live} canlı · {going} katılım · takvim {bağlı|bağlı değil}
arama    → “{q}” için {n} sonuç · {live} canlı · …
boş      → 0 etkinlik · Yaklaşan etkinlik yok · filtreleri temizleyebilirsin
hata     → Bağlantı yok · Son eşitleme {time} · yerel hatırlatmalar çalışıyor
```

**Daralma kuralı (zorunlu):** detay paneli açıkken sekme grubu **ve** ikon grubu
`display: none`. Ana kolon 432 px'e düştüğünde başlık tek satırda kalmalı; sarma yasak.
Test bunu `panel` durumuyla doğrular.

`Oluştur` butonu `viewerCanManage` yoksa **hiç çizilmez** (K4). Bu bilgi `counts` yanıtından
değil, izleyicinin sunucularından gelir — `GET /api/v1/events` yanıtına
`viewerCanCreate: boolean` alanı eklenir (Ş1 sözleşmesine ait; burada tüketilir).

Zil butonu `eventNotifications` tercihini yazar (`PUT /api/v1/account/notifications`) ve alt
satır metnini sürer. Kart boyutu butonu `?size` + `localStorage` yazar (K11, Ş0.4 yardımcıları).

### 3. Hafta şeridi (`event-week-strip.tsx`) — SPEC §3.2

```
padding 13/24 · border-bottom hairline --border/.45 · background --surface-panel/.5
sol: ‹ 28×28 radius 9 kenar --border/.7 │ ay etiketi minW 112, 600/13 display │ ›
sağ: grid 7 × 1fr, gap 6
```

Gün kutusu: padding `8 4 7`, radius 13, kenar 1px; içinde `dow` (600/9.5 display, `.12em`,
uppercase) → `num` (600/17 display) → nokta satırı (h6, gap 3, nokta 5×5).

- Noktalar o günün **tür** tonlarından, sırayla, **en çok 4** (Ş1'in `week` bloğu).
- Bugün: zemin `--primary/.14`, kenar `--primary/.45`, dow ve num `--primary`.
- **Ok bir hafta adımlar** (K9). Etiket görünen haftanın ayını yazar; hafta iki ayı bölüyorsa
  `Ağu – Eyl 2026`.
- Gün kutusuna tıklamak zaman filtresini o güne alır; bugüne tıklamak `time=today`.
  Aynı güne ikinci tık filtreyi kaldırır.
- `week.ts` saf: `weekStartOf(date, timeZone)`, `weekDays(weekStart)`, `weekMonthLabel(days, locale)`.

Her gün kutusu gerçek `<button>`; `aria-label` gün + tarih + etkinlik sayısını metin olarak
taşır (`27 Ağustos, 4 etkinlik`). Nokta satırı `aria-hidden`.

### 4. URL yazımı

`router.replace` (push değil) — filtre değişimi geçmişte yığın büyütmez; **panel ve modal
`push`** çünkü geri tuşu onları kapatmalı. Bu ayrım `buildEventsHref` çağrı yerinde değil,
`pushRoute` / `replaceRoute` iki yardımcısında durur.

---

## Kabul

- [ ] Başlık altı dalın altısında da doğru metni yazıyor (birim test, altı durum).
- [ ] Alt satır dört durumda da (normal / arama / boş / hata) SPEC metniyle birebir.
- [ ] Detay paneli açıkken sekme grubu **ve** ikon grubu DOM'da yok.
- [ ] 432 px genişlikte başlık tek satır, taşma yok (test: `flex-wrap: nowrap` + ellipsis).
- [ ] Hafta şeridi 7 gün, gün başına en çok 4 nokta, bugün vurgulu.
- [ ] `‹` bir hafta geri götürüyor; etiket ay sınırında `Ağu – Eyl 2026` yazıyor.
- [ ] Gün kutusuna ikinci tık filtreyi kaldırıyor.
- [ ] `viewerCanCreate: false` iken `Oluştur` butonu çizilmiyor.
- [ ] Kart boyutu düğmesi `?size=large` yazıyor ve `localStorage`'a düşüyor.
- [ ] Filtre değişimi `replace`, panel/modal `push`; geri tuşu paneli kapatıyor.
- [ ] Ana kolonda ölçü sözlüğü dışında sabit px yok (`grep -n "\[[0-9]\+px\]"` boş).
- [ ] `Esc` merdiveni: modal açıkken yalnız modal, sonra panel.

## Kapı

```
pnpm --filter @wizards/web typecheck && pnpm --filter @wizards/web lint && pnpm --filter @wizards/web test
```
