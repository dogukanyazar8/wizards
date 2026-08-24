# Dalga 2 · Ş6 — `EventCard`, ızgara, gün grupları, skeleton, boş ve hata durumu

**Ön koşul:** Dalga 1 kapısı yeşil. **Paralel:** Ş5, Ş7, Ş8.

Ekranın gövdesi. Kart tasarımın en yoğun parçası; SPEC §3.6 satır satır ölçü veriyor ve
`.dc.html` her değeri inline taşıyor.

---

## Sahiplenilen dosyalar

- `apps/web/src/components/events/event-card.tsx` (yeni) + `.test.tsx`
- `apps/web/src/components/events/event-kind-tile.tsx` (yeni — tür tile'ı + pili)
- `apps/web/src/components/events/event-source-tile.tsx` (yeni — kaynak 16×16 / 30×30 / 18×18)
- `apps/web/src/components/events/event-attendee-stack.tsx` (yeni — avatar yığını)
- `apps/web/src/components/events/event-grid.tsx` (yeni) + `.test.tsx`
- `apps/web/src/components/events/event-day-group.tsx` (yeni)
- `apps/web/src/components/events/event-card-skeleton.tsx` (yeni)
- `apps/web/src/components/events/events-empty-state.tsx` (yeni)
- `apps/web/src/components/events/events-error-state.tsx` (yeni)

**Okunur, yazılmaz:** `lib/events/metrics.ts`, `lib/events/presentation.ts`,
`packages/types` ton/glif haritaları, `components/ui/{avatar,badge,skeleton}`.

---

## İş

### 1. `EventCard` — SPEC §3.6

Kart bir `<article>`. **Üç nokta menüsü YOKTUR** — eylem satırında yalnız `Katıl` ve `Belki`.
Karta tıklamak detay panelini açar.

```
radius 18 · overflow hidden
background: rsvp==='going' ? --surface-card : --surface-card/.6
border 1px:  seçili --primary/.5  →  going --success/.4  →  diğer --border/.6
hover: border --primary/.45 + translateY(-2px)
seçili: sol 3px --primary şerit, top/bottom 16
```

| Satır             | Ölçü                                                                                                              | Not                                                  |
| ----------------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Üst               | padding `13 14 0`, gap 11                                                                                         | tür tile + meta blok                                 |
| Tür tile          | 42×42, radius 14, tür soft zemin + tür tonu, glif 600/15 display                                                  | glif `EVENT_KIND_GLYPH`                              |
| Tür pili          | padding `3 8`, radius 999, 600/10 body                                                                            | **metin de taşır**                                   |
| Canlı pili        | `--danger/.16` zemin, `--danger` metin, 5 px nokta, `Canlı`                                                       | tür pilinin yanında                                  |
| Tekrar / yaklaşma | 500/10.5 body, muted                                                                                              | `Her çarşamba` (RRULE'dan) veya `Başlamasına {n} dk` |
| Başlık            | 600/15/1.3 display, `-.02em`, `text-wrap: pretty`                                                                 |                                                      |
| Saat satırı       | padding `10 14 0`, ikon 13, 600/12 + süre 500 muted                                                               | canlıda `Şu an` + `{n} geçti`                        |
| Yer satırı        | kaynak tile 16×16 radius 5 + 500/11.5 ellipsis                                                                    | `{sunucu} › {kanal}`                                 |
| Katılımcılar      | padding `11 14 0`; avatar 24, 2.'den `margin-left:-8`, `box-shadow: 0 0 0 2px --surface-card`                     | metin `{n} kişi katılıyor · {host} düzenliyor`       |
| Eylem satırı      | marginTop 12, padding `11 14 13`, borderTop `--border/.5`, zemin `--surface-soft/.35`                             |                                                      |
| `Katıl`           | `flex:1`, h32, radius 10, kenar 1px; going → `--success/.16` zemin + `--success/.45` kenar + metin `Katılıyorsun` |                                                      |
| `Belki`           | h32, padX 12; seçili → `--warning/.16` + `--warning/.45`                                                          |                                                      |

**Kaynak tile dili (K3):** `viewerIsMember === false && isPublic` → tile `--surface-tertiary`
zemin + `--text-secondary` metin, baş harf `TK`, radius **%50** (HTML `topluluk` kaynağını böyle
çiziyor). Üye olunan sunucularda normal sunucu tile'ı (radius 9, sunucunun kendi tonu).

**Erişilebilirlik:** kart `<article>`, başlık bir `<button>` içinde (klavye hedefi tek),
`Katıl`/`Belki` gerçek `<button>`. Avatar yığını `aria-hidden`; katılımcı sayısı metin olarak
zaten yazıyor. Tür ve canlı bilgisi renk değil metin taşıyor.

**İyimser güncelleme:** `Katıl`/`Belki` tıklanınca kart kendi görünümünü **hemen** değiştirir,
mutasyon cevabıyla doğrulanır, hata olursa geri alınır ve toast çıkar. Sayaç ve sağ ray
güncellemesi Ş5'in sorumluluğu (mutasyon cevabı `counts` taşıyor); kart yalnız kendi durumunu
bildirir.

### 2. Izgara ve gün grupları — SPEC §3.5

```
kaydırma alanı: flex:1 · overflow-y auto · padding 16/24/20 · gap 4
grup başlığı:   padding 6/2/10
  etiket (Bugün/Yarın/Bu hafta) 600/10.5 display, .14em, uppercase, muted
  sayı · tarih (27 Ağustos / 28 Ağustos / 29 Ağustos – 2 Eylül) · esneyen hairline
ızgara: grid-template-columns repeat(auto-fill, minmax(var(--e-min), 1fr)) · gap 12
        --e-min: 280px (medium) / 340px (large)
alt not: "Geçmiş etkinlikler 30 gün arşivde tutulur"
```

- Grup sırası `today → tomorrow → week`. `past` kovası ızgarada **çizilmez** (sapma #5);
  `time=past` filtresi seçiliyken tek grup olarak `Geçmiş` başlığıyla çizilir.
- Grup içi sıra `startsAt ASC`; canlı etkinlik zaten en erken başlangıçlıdır, ayrı bir
  sabitleme yapılmaz.
- Boş grup **render edilmez**.
- Grup başlığındaki tarih aralığı `presentation.ts`'ten (`Intl.DateTimeFormat`), sunucudan değil.
- `--e-min` bir CSS değişkeni olarak ızgara kabına yazılır; kart boyutu değişince yalnız o
  değişken oynar, ızgara yeniden kurulmaz.

Her grup `<section aria-labelledby>` + `<h2>`; ızgara `role="grid"` **değil** — kartlar
bağımsız `article`, ızgara yalnız yerleşim. Klavye gezinmesi Ş9'da.

### 3. Skeleton

`EventCardSkeleton` 3 kart; ızgara ile aynı `minmax` ve `gap`. Kart iskeleti gerçek kartın
yüksekliğini taşır (tür tile + iki satır + eylem satırı) ki içerik gelince sıçrama olmasın.

### 4. Boş durum — SPEC §3.7

```
ikon 78×78 radius 26 --primary/.13 + --primary/.3 kenar, takvim-artı 34
başlık  Planlanmış etkinlik yok           (600/20 display)
metin   Bu filtrede yaklaşan etkinlik bulunmuyor. Sunucularından biri için etkinlik
        oluşturabilir ya da herkese açık topluluk etkinliklerine göz atabilirsin.
buton   Etkinlik oluştur (primary) · Filtreleri temizle
```

`Etkinlik oluştur` butonu `viewerCanCreate` yoksa çizilmez (K4); o durumda yalnız
`Filtreleri temizle` kalır ve tek başına ortalanır.

### 5. Hata durumu — SPEC §3.8

```
ikon --danger/.13 + uyarı üçgeni
başlık  Etkinlikler yüklenemedi
metin   Sunucuyla bağlantı kurulamadı. Yeniden denerken kaydedilmiş katılım yanıtların
        korunur; yerel hatırlatmalar çalışmaya devam eder.
buton   Yeniden dene (yenile ikonlu, primary) · Durum sayfası
alt      Hata kodu: {code} · son deneme {time}     (11.5, --text-muted/.85)
```

`{code}` sunucudan gelen hata kodu; yoksa `EVT-503`. `{time}` son deneme saati (istemci).
`Durum sayfası` mevcut durum sayfası bağlantısına gider (`lib/health.ts` / dağıtım sabitleri);
yoksa buton çizilmez ve rapora `TODO(api):` yazılır.

---

## Kabul

- [ ] Kartta **üç nokta menüsü yok**; eylem satırında yalnız iki buton.
- [ ] Altı türün altısında da tile zemini/metni doğru token; hiçbirinde hex yok.
- [ ] Canlı kartta hem nokta hem `Canlı` metni var.
- [ ] `Başlamasına {n} dk` yalnız `startsInMinutes` doluyken; `Her çarşamba` yalnız
      `recurrenceRule` doluyken; ikisi birden varsa **tekrar** yazılır (HTML `e.repeat || e.soon`).
- [ ] Avatar yığını: ilk avatar `margin-left: 0`, sonrakiler `-8px`, halka 2 px `--surface-card`.
- [ ] `Katıl` basılınca kart kenarı `--success/.4`'e dönüyor ve buton `Katılıyorsun` oluyor
      (iyimser); mutasyon hatasında geri alınıyor.
- [ ] `Belki` ikinci tıkta yanıtı kaldırıyor.
- [ ] Seçili kartta sol 3 px `--primary` şerit ve kenar `--primary/.5`.
- [ ] `viewerIsMember=false && isPublic` kartta kaynak tile'ı yuvarlak ve `TK`.
- [ ] Izgara `auto-fill minmax(280px,1fr)`; kart boyutu `large` iken `340px` — yalnız
      `--e-min` değişkeni değişiyor.
- [ ] Boş grup render edilmiyor.
- [ ] Boş ve hata metinleri SPEC ile **karakter karakter** aynı (literal test).
- [ ] `viewerCanCreate=false` iken boş durumda tek buton kalıyor.
- [ ] Skeleton yüksekliği gerçek kartla aynı büyüklük sınıfında (sıçrama testi).

## Kapı

```
pnpm --filter @wizards/web typecheck && pnpm --filter @wizards/web lint && pnpm --filter @wizards/web test
```
