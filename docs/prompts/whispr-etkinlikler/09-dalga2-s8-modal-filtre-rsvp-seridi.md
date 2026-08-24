# Dalga 2 · Ş8 — Oluştur modalı (560), filtre şeridi, RSVP onay şeridi

**Ön koşul:** Dalga 1 kapısı yeşil. **Paralel:** Ş5, Ş6, Ş7.

Üç bağımsız yüzey. Modal en büyüğü; filtre ve RSVP şeritleri küçük ama ikisi de **koşullu**
render edildiği için Ş5'in yerleşimiyle sıkı bağlı.

---

## Sahiplenilen dosyalar

- `apps/web/src/components/events/event-create-modal.tsx` (yeni) + `.test.tsx`
- `apps/web/src/components/events/event-place-picker.tsx` (yeni) + `.test.tsx`
- `apps/web/src/components/events/event-kind-picker.tsx` (yeni — 3 kolon, 6 seçenek)
- `apps/web/src/components/events/event-datetime-field.tsx` (yeni)
- `apps/web/src/components/events/event-filter-bar.tsx` (yeni) + `.test.tsx`
- `apps/web/src/components/events/event-rsvp-strip.tsx` (yeni) + `.test.tsx`
- `apps/web/src/lib/events/create-form.ts` (yeni — saf form modeli + doğrulama) + `.test.ts`

**Okunur, yazılmaz:** `components/ui/{modal,input,toggle-switch,segmented-control}`,
`lib/events/client.ts` (Ş3'ün yazma çağrıları), `lib/workspace/client.ts` (sunucu/kanal listesi).

---

## İş

### 1. Oluştur modalı — SPEC §6

```
örtü: --backdrop/.62
kart: width 560, max-width 100%, radius 22, --surface-card,
      box-shadow 0 40px 90px -40px --shadow-color
başlık: 38×38 --primary/.15 takvim-artı ikonu · "Etkinlik oluştur" 600/17 display
        alt "Sunucu üyelerine bildirim gider, katılım yanıtları sayılır" · kapat 32×32
gövde: gap 15, padding 19/24
alt:   "Tekrar eden etkinlikler oluşturulduktan sonra ayarlanır" · İptal · Oluştur (h38, radius 12)
```

Gövde alanları, sırayla:

| Alan                    | Ölçü / davranış                                                                                                                                                 |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ETKİNLİK TÜRÜ**       | 3 kolonlu ızgara, 6 seçenek; kutu radius 13, 26×26 glif tile, ad 600/12. Seçili: zemin `--primary/.1`, kenar `--primary/.45`, tile tür soft zemin + tür tonu    |
| **BAŞLIK**              | `Input` h40 radius 12, placeholder `Örn. Tasarım Kritiği`, 1..120 karakter                                                                                      |
| **TARİH VE SAAT** (1fr) | `27 Ağustos · 15:00` + takvim ikonu — yerel tarih-saat seçici                                                                                                   |
| **SÜRE** (1fr)          | segment `30 dk / 45 dk / 1 sa` (`SegmentedControl`)                                                                                                             |
| **YER**                 | `{sunucu} › {kanal}` + 18×18 sunucu tile + chevron → `EventPlacePicker`                                                                                         |
| Anahtar şeridi          | `Topluluk keşfetinde listele` / `Sunucu dışındaki kullanıcılar da görebilir ve katılabilir` · toggle 44×26, topuz 20 px, açık `--primary` (topuz offset 21 ↔ 3) |

**Tekrar alanı YOKTUR** (K6) — alt metnin kendisi bunu söylüyor.

**Yer seçici (K10):**

- Sunucu listesi = izleyicinin `MANAGE_EVENTS` taşıdığı sunucular. Boşsa modal hiç açılmaz
  (buton zaten çizilmemişti).
- Kanal listesi **türe göre** süzülür:
  `voice`/`game` → sesli · `live`/`community` → sahne · `meeting`/`workshop` → metin + sesli.
- Ayrıca `Harici bağlantı` seçeneği → `externalLocation` metin alanı (URL doğrulaması).
- **Tür değişince** seçili kanal yeni kurala uymuyorsa **temizlenir** ve alan uyarı gösterir.
  Sessizce geçersiz bir kanalla `POST` atmak 422 döndürür ve kullanıcı nedenini görmez.

`Topluluk keşfetinde listele` anahtarı yalnız seçili sunucu **COMMUNITY** tipindeyse etkin;
değilse pasif ve alt metin nedenini söyler (Ş3 aynı kuralı sunucuda uyguluyor).

`create-form.ts` **saf**: alan durumu, türe göre kanal süzme, doğrulama, `CreateEventInput`
üretimi. Modal yalnız çizer. Böylece "tür değişince kanal temizlenir" kuralı React'sız test edilir.

Modal `components/ui/modal` üzerine kurulur: `Esc` kapatır, focus tuzağı, açılışta tür ızgarasının
ilk seçeneğine focus, kapanışta tetikleyiciye dönüş. Gönderim sırasında `Oluştur` pasif +
yükleniyor durumu; başarıda modal kapanır, yeni etkinlik seçili panelde açılır ve toast çıkar.

### 2. Filtre şeridi — SPEC §3.3

**Yalnız aktif filtre varken görünür.**

```
padding 11/24 · border-bottom hairline --border/.45 · background --primary/.06
etiket "AKTİF FİLTRELER" 600/10.5 display, .14em, --primary
çip: padding 5/8/5/11 · radius 999 · --surface-card · kenar --primary/.4
     kaldır düğmesi 16×16 radius 5 --surface-tertiary
sağda "Tümünü temizle" 600/11.5 --primary
```

Çip kaynakları ve sırası: **zaman → kaynak (sunucu) → katılım → arama**.
Arama çipi tırnaklı (`“oyun”`). Her çipin kaldır düğmesi yalnız kendi eksenini sıfırlar;
`Tümünü temizle` hepsini + `tab`'ı `all`'a çeker (HTML `clearAll` davranışı).

Her kaldır düğmesi gerçek `<button>` + `aria-label` (`{label} filtresini kaldır`).
Şerit `role="region"` + `aria-label`.

Sekme (`tab`) **çip üretmez** — sekme başlıkta zaten görünür ve iki yerde göstermek
"Tümünü temizle"nin ne yapacağını belirsizleştirir.

### 3. RSVP onay şeridi — SPEC §3.4

`Katıl` yanıtı verildikten sonra ızgaranın üstünde çıkar.

```
margin 14/24/0 · padding 12/14 · radius 14
background --success/.12 · kenar --success/.35
ikon 30×30 radius 10 --success/.2 + tik
başlık "{title} etkinliğine katılıyorsun"  600/13 body
alt    "{gün} {saat} · başlamadan {n} dk önce hatırlatma gönderilecek"  11.5 muted
sağda  "Takvime ekle" 32 px buton + 28×28 kapat
```

- `{n}` gerçek hatırlatma tercihinden gelir (varsayılan 10, K5). Ş3'ün RSVP cevabı
  `reminder.minutesBefore` taşır; şerit metni ondan kurar. Sabit "10" yazılmaz.
- Ş3 `scheduled: false` döndüyse (etkinlik çok yakın) alt satır **hatırlatma cümlesini
  yazmaz**, yalnız `{gün} {saat}` kalır.
- `Takvime ekle` → `GET /api/v1/events/[eventId]/calendar.ics` indirmesi (K7).
- Kapat düğmesi şeridi kapatır; şerit ayrıca **8 saniye** sonra kendiliğinden kapanır.
  `prefers-reduced-motion` açıkken geçiş animasyonu yok, doğrudan kaybolur.
- Yeni bir `Katıl` yanıtı gelirse şerit **yeniden** açılır ve yeni etkinliği gösterir
  (kuyruğa alınmaz).

Şerit `role="status"` + `aria-live="polite"` — ekran okuyucu yanıtın kaydedildiğini duyar.

---

## Kabul

- [ ] Modal 560 px; `Esc` kapatıyor; focus tuzağı ve dönüşü çalışıyor.
- [ ] 6 tür seçeneği 3 kolonda; seçili kutu `--primary/.1` + `--primary/.45`.
- [ ] Tür değişince uyumsuz kanal temizleniyor ve uyarı çıkıyor.
- [ ] Yer seçici kanal listesi türe göre süzülüyor (altı tür için ayrı test).
- [ ] `Harici bağlantı` seçilince kanal alanı yerine URL alanı geliyor; geçersiz URL reddediliyor.
- [ ] `Topluluk keşfetinde listele` yalnız COMMUNITY sunucuda etkin.
- [ ] Toggle topuz konumu açık 21 px / kapalı 3 px.
- [ ] Modalda tekrar alanı **yok**; alt metin SPEC ile birebir.
- [ ] Gönderim sırasında `Oluştur` pasif; başarıda modal kapanıp panel açılıyor.
- [ ] Filtre şeridi yalnız aktif filtre varken çiziliyor.
- [ ] Çip sırası zaman → kaynak → katılım → arama; arama çipi tırnaklı.
- [ ] `Tümünü temizle` `tab`'ı da `all`'a çekiyor.
- [ ] Sekme çip üretmiyor.
- [ ] RSVP şeridi `{n}` değerini gerçek tercihten okuyor, sabit 10 yazmıyor.
- [ ] `scheduled: false` durumunda hatırlatma cümlesi yazılmıyor.
- [ ] `Takvime ekle` geçerli `.ics` indiriyor.
- [ ] Şerit 8 saniyede kapanıyor; ikinci yanıtta yeniden açılıyor.
- [ ] `role="status"` + `aria-live="polite"`.

## Kapı

```
pnpm --filter @wizards/web typecheck && pnpm --filter @wizards/web lint && pnpm --filter @wizards/web test
```
