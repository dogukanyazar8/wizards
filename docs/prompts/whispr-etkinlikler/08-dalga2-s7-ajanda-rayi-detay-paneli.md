# Dalga 2 · Ş7 — Sağ ajanda rayı (300) ve etkinlik detay paneli (326)

**Ön koşul:** Dalga 1 kapısı yeşil. **Paralel:** Ş5, Ş6, Ş8.

Sağ sütun. İkisi **aynı anda** görünmez: panel açıldığında ray unmount olur (Ş5'in kuralı,
bu şerit ona uyar).

---

## Sahiplenilen dosyalar

- `apps/web/src/components/events/event-agenda-rail.tsx` (yeni) + `.test.tsx`
- `apps/web/src/components/events/event-agenda-timeline.tsx` (yeni)
- `apps/web/src/components/events/event-going-row.tsx` (yeni)
- `apps/web/src/components/events/event-detail-panel.tsx` (yeni) + `.test.tsx`
- `apps/web/src/components/events/event-attendee-row.tsx` (yeni)
- `apps/web/src/components/events/event-reminder-strip.tsx` (yeni) + `.test.tsx`

**Okunur, yazılmaz:** `lib/events/metrics.ts`, `lib/events/density.ts`,
`components/events/event-kind-tile.tsx` + `event-source-tile.tsx` (Ş6'nın; **paylaşılır,
kopyalanmaz** — Ş6 ile aynı oturumda koşulmuyorsa geçici bir yerel kopya değil, `TODO(Ş6):`
ile boş bir sarmalayıcı bırakılır).

---

## İş

### 1. Ajanda rayı (`event-agenda-rail.tsx`) — SPEC §4

```
width 300 · flex:none · background --surface-panel · border-left hairline --border/.45
başlık: padding 15/16/13, border-bottom hairline --border/.45
  "Bugün" 600/14.5 display · alt "{tarih} · {n} etkinlik · {live} canlı" 500/11.5
gövde: padding 14/16, overflow-y auto
alt:   tam genişlik "Etkinlik oluştur" h36, ikincil stil, border-top hairline --border/.5
```

**Zaman çizelgesi** (`event-agenda-timeline.tsx`):

```
satır = 44 px saat kolonu │ 1,5 px dikey --border/.7 çizgi │ kart
saat kolonu: 600/11.5 display; canlı etkinlikte metin "Canlı", renk --danger
kart: radius 13, background --surface-card, border 1px --border/.6,
      sol 3 px tür tonu şeridi, başlık 600/12.5, alt satır 11 kaynak,
      canlıda sağda 6 px --danger nokta
seçili etkinlik: kart --primary/.1 zemin, --primary/.35 kenar
```

Kapsam: **bugünün** etkinlikleri, `startsAt ASC`. Liste ekranın filtrelerinden **bağımsızdır**
(ray bir gündelik özet, sonucun aynası değil) — `serverId`, `q`, `tab` uygulanmaz.
Satır sayısı `density.ts`'ten (ölçek adımına göre).

Dikey çizgi **satırlar arası süreklidir**: her satır kendi çizgi parçasını çizer, ilk satırda
üst yarısı, son satırda alt yarısı kırpılır (tasarımdaki görünüm). `hairline()` değil,
`1.5px` sabit değil — sözlükten `pxToRem(1.5)`; hairline istisnası yalnız 1 px kenarlar içindir.

**Katılacağım** bölümü: başlık `KATILACAĞIM` (600/10.5 display, `.15em`) + sayı; satırlar
radius 13, 30×30 tür tile'ı, başlık 600/12.5, alt satır `{gün} · {saat}`, sağda 14 px chevron.
Kapsam: izleyicinin `going` yanıtı verdiği **bütün** yaklaşan etkinlikler (bugüne sınırlı değil).

`Etkinlik oluştur` butonu `viewerCanCreate` yoksa çizilmez (K4); o durumda alt bölüm hiç
render edilmez ve `border-top` da çıkmaz.

Her satır gerçek `<button>`; `aria-label` başlık + saat + kaynak taşır. Canlı noktası
`aria-hidden`, canlı bilgisi `aria-label`'da metin.

### 2. Detay paneli (`event-detail-panel.tsx`) — SPEC §5

```
width 326 · flex:none · background --surface-panel · border-left hairline --border/.45
başlık: padding 15/16/13, border-bottom hairline --border/.45
  tür tile 38×38 radius 13 · tür pili + süre · başlık 600/15.5 display · kapat 30×30 radius 10
gövde: gap 15, padding 15/16, overflow-y auto
alt:   border-top hairline --border/.5; birincil CTA flex:1 h36 + "Paylaş"
```

Gövde dört blok:

1. **Bilgi kartı** — radius 14, `--surface-card`, kenar `--border/.6`:
   takvim ikonu + `{gün} · {saat} · {süre}` · kaynak tile + `{sunucu} › {kanal}` ·
   sahip avatarı 20 px + `{host} düzenliyor`.
2. **Açıklama** — bölüm etiketi + 12.5/1.6 metin. Açıklama boşsa blok **hiç çizilmez**.
3. **Katılımcılar** — etiket + sayı; satırlar 28 px avatar + ad + rol pili
   (`Sahibi` primary · `Katılıyor` success · `Belki` warning · `Dinliyor` success);
   altında `{n} kişi daha` bağlantı butonu (Ş2'nin `attendeeCursor` sayfalaması).
4. **Hatırlatma şeridi** — `--surface-secondary/.8`, zil ikonu `--warning`,
   `Hatırlatma açık` / `Başlamadan {n} dk önce`, sağda `Değiştir`.

**CTA metni** Ş2'nin üç alanından kurulur, sunucudan metin gelmez:

```
rsvp === 'going'  → Katılımı geri al   (zemin --surface-tertiary, metin --text-secondary)
canJoinLive       → Yayına katıl       (zemin --primary, metin #fff)
diğer             → Katıl              (zemin --primary, metin #fff)
```

`Yayına katıl` `joinHref`e gider (gerçek `<a>` değil — kabuk içi gezinme, ama `href` taşıyan
bir bağlantı olarak çizilir ki orta tık ve "yeni sekmede aç" çalışsın).

`Paylaş` etkinlik bağlantısını panoya kopyalar + toast (`useToast`). `.ics` indirmesi burada
**değil** — RSVP şeridindeki `Takvime ekle` butonundadır (Ş8).

**Erişilebilirlik:** panel `role="complementary"` + `aria-label`; açılışta focus kapatma
butonuna gider, kapanışta tetikleyici karta döner. `Esc` Ş5'in merdiveninden gelir; panel
kendi `keydown` dinleyicisini kurmaz.

### 3. Hatırlatma şeridi (`event-reminder-strip.tsx`)

`Değiştir` bir `ContextMenu` açar: 5 / 10 / 15 / 30 / 60 dk + `Hatırlatma kapalı`.
Seçim `PUT /api/v1/events/[eventId]/reminder`'a gider (Ş3), iyimser güncellenir.

Üç özel durum:

- `reminderSuppressed` (hesap bildirimleri kapalı, Ş2) → şerit "Bildirimler kapalı" durumunda
  çizilir ve `Değiştir` yerine ayarlara giden bir bağlantı gösterir.
- Yanıt `scheduled: false` (etkinlik çok yakın, tuzak #8) → şerit "Etkinlik çok yakın,
  hatırlatma gönderilmeyecek" metnini gösterir; tercih yine saklanır.
- İzleyici `going` değilse şerit **çizilmez** — hatırlatma bir RSVP sonucudur.

---

## Kabul

- [ ] Ray 300 px, panel 326 px; ikisi aynı anda DOM'da değil.
- [ ] Zaman çizelgesi: 44 px saat kolonu, 1,5 px çizgi, sol 3 px tür şeridi.
- [ ] Canlı etkinlikte saat yerine `Canlı` ve renk `--danger`; sağda 6 px nokta.
- [ ] Seçili etkinlikte ray kartı `--primary/.1` / `--primary/.35`.
- [ ] Ray listesi ekran filtrelerinden bağımsız (test: `serverId` filtresi açıkken ray değişmiyor).
- [ ] `Katılacağım` bölümü bugünle sınırlı değil.
- [ ] `viewerCanCreate=false` iken ray alt bölümü hiç render edilmiyor.
- [ ] Panel CTA üç durumda da doğru metin ve doğru zemin.
- [ ] Açıklama boşken blok çizilmiyor.
- [ ] Rol pilleri dört rolde de doğru token; `Dinliyor` yalnız canlı etkinlikte çıkıyor.
- [ ] `{n} kişi daha` ikinci sayfayı getiriyor, aynı kişiyi tekrarlamıyor.
- [ ] Hatırlatma şeridi üç özel durumda da doğru; `going` değilken çizilmiyor.
- [ ] Panel açılışında focus kapatma butonunda, kapanışta tetikleyici kartta.
- [ ] Panel kendi `Esc` dinleyicisini kurmuyor (test: `keydown` kaydı yok).

## Kapı

```
pnpm --filter @wizards/web typecheck && pnpm --filter @wizards/web lint && pnpm --filter @wizards/web test
```
