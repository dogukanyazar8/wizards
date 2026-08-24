# Dalga 3 · Ş10 — Eski ekranın kaldırılması, parity kapısı, QA, kabul

**Ön koşul:** Ş9 yeşil. **Son şerit.**

Eski `/events` ekranı bu ana kadar **bilerek** ayakta bırakıldı: Dalga 2'nin şeritleri paralel
koşarken rota bir yerde çizilmek zorundaydı. Burada silinir, sonra ekran bütün olarak ölçülür.

---

## Sahiplenilen dosyalar

### Silinecek

- `apps/web/src/components/screens/events-screen.tsx`
- `apps/web/src/components/screens/event-list-row.tsx`
- `apps/web/src/components/screens/events-calendar-view.tsx`
- `apps/web/src/app/api/v1/events/list/` (route + logic + test)
- `apps/web/src/app/api/v1/events/calendar/` (route + logic + test)
- `apps/web/src/lib/home/side-screens.ts` — yalnız **etkinlik** parçası
  (`EVENTS_VIEW_PARAM`, `EventsView`, `parseEventsView`, `groupEventsByDay`, takvim ızgarası
  yardımcıları). `parseInboxSource` ve gelen kutusu parçaları **kalır**.
- `apps/web/src/lib/home/events-service.ts` — yalnız `listHomeEvents` ve takvim fonksiyonları;
  `getHomeUpcomingEvents` **kalır** (Ana Sayfa "Sıradaki" kartı).
- `lib/locale/messages/{tr,en}.ts` → `events.calendar.*`, `events.empty`, `events.remind`,
  `events.reminded`, `events.view.*`. **`events.title` kalır.**
- `components/screens/side-screens.test.tsx` — etkinlik bölümleri.

### Değiştirilecek

- `apps/web/src/components/home/*` — `/events?view=calendar` bağlantısı `/events`e döner
  (`home-interactions.test.tsx:290` bu href'i literal olarak bekliyor; test de güncellenir).
- `apps/web/src/hooks/use-home-actions.ts` — `eventsListKey` bağı kalkar; `remind` eylemi
  Ana Sayfa'nın kendi kullanımı için **kalır**.

### Yeni

- `apps/web/e2e/specs/events/events.spec.ts`
- `docs/prompts/whispr-etkinlikler/raporlar/10-rapor.md`

---

## İş

### 1. Temizlik

Silme sırası: önce rota (`page.tsx` zaten Ş5'te `EventsPage`'e bağlandı), sonra bileşenler,
sonra uçlar, sonra sözlük anahtarları. Her adımdan sonra `typecheck` — ölü referans bırakılmaz.

`grep -rn "events-screen\|EVENTS_VIEW_PARAM\|parseEventsView\|groupEventsByDay\|fetchHomeEventsList"
apps/web/src` **boş** dönmeli.

`events.remind` / `events.reminded` anahtarları Ana Sayfa'nın "Sıradaki" kartında da
kullanılıyorsa **silinmez** — silmeden önce `grep -rn "events.remind"` ile doğrula. Rapora yaz.

### 2. Parity kapısı

`lib/events/parity.test.ts` (Ş0.3) yeşil olmalı ve **en az 20 iddia** taşımalı.
Ek olarak bu şerit **görsel** karşılaştırmayı yapar:

Referans dosyayı aç (`referans/Etkinlikler-referans.html`), 10 durumu tek tek gez; uygulamada
aynı durumları kur ve ekran görüntüsü al. Karşılaştırma matrisi:

| Durum              | URL                                   |
| ------------------ | ------------------------------------- |
| 01 Tüm etkinlikler | `/events`                             |
| 02 Canlı           | `/events?tab=live`                    |
| 03 Filtre aktif    | `/events?time=week&source=<serverId>` |
| 04 Arama           | `/events?q=oyun`                      |
| 05 Katılacağım     | `/events?tab=going`                   |
| 06 RSVP şeridi     | `/events` + `Katıl` tıkla             |
| 07 Detay paneli    | `/events?panel=<eventId>`             |
| 08 Oluştur modalı  | `/events?modal=create`                |
| 09 Boş durum       | `/events?q=<sonuçsuz>`                |
| 10 Hata durumu     | ağ kesintisi simülasyonu              |
| 11 Aydınlık tema   | `/events` + `theme-light`             |

Her durumda `screens/<no>-durum.png` ile yan yana konur; **ölçü** farkı bulunursa
`SPEC_DEVIATIONS`'a değil, **düzeltmeye** gider (sözlük referanstan okundu, sapma varsa
uygulama hatalıdır).

### 3. Çözünürlük matrisi

`1360×920 · 1600×900 · 1920×1080 · 2560×1440 · 3840×2160 · 5120×1440`, her biri **açık ve koyu**.
Her boyutta:

- kaydırma yok (kabuk içinde biter),
- metin kırpılmıyor,
- başlık tek satır,
- sağ sütun kabuk içinde bitiyor,
- ızgara kolon sayısı adım büyüdükçe **artmıyor** (kartlar büyüyor — PROMPT §6).

`5120×1440` özel: ölçek **yükseklikten** sınırlanır (×1.5'te kalır), artan genişlik ızgara
kolonlarını genişletir.

### 4. Token denetimi

```bash
grep -rnE "#[0-9a-fA-F]{3,8}" apps/web/src/components/events apps/web/src/lib/events
```

Yalnız `#fff` (primary zemin üstündeki ters metin) çıkmalı. `rgb(` / `rgba(` hiç çıkmamalı.
Sabit font adı (`Outfit`, `Figtree`) hiç çıkmamalı.

### 5. e2e

`apps/web/e2e/specs/events/events.spec.ts`:

1. `/events` açılıyor, ızgara ve sağ ray çiziliyor.
2. `Katıl` → kart `Katılıyorsun`, sağ ray "Katılacağım" listesine ekleniyor, başlık sayacı
   artıyor — **üçü de aynı etkileşimde**.
3. Karta tıklamak paneli açıyor, sekme grubu ve ikon grubu kayboluyor, ray kayboluyor.
4. `Esc` paneli kapatıyor, ray geri geliyor.
5. `Oluştur` → modal açılıyor, tür seçilince kanal listesi süzülüyor, `Esc` kapatıyor.
6. Hafta şeridi `›` bir hafta ileri götürüyor, URL `?week=` taşıyor, geri tuşu geri alıyor.
7. Filtre çipi kaldırılınca URL'den o eksen düşüyor.
8. Aydınlık temada aynı akış (tema anahtarı).
9. `MANAGE_EVENTS` olmayan kullanıcıda `Oluştur` girişlerinin **üçü de** yok.

`e2e:a11y` mevcut a11y süitine `/events` rotası eklenir.

### 6. Performans ölçümü

- İlk boya: ızgara skeleton'u sağ ray'ı **beklemiyor** (iki sorgu bağımsız) — `Server-Timing`
  başlığından ölçülüp rapora yazılır.
- 3 sayfa yüklenmiş listede `event:rsvp` olayı geldiğinde kaydırma konumu değişmiyor.
- `GET /api/v1/events` p95 hedefi < 120 ms (yerel, seed veriyle); aşılırsa `EXPLAIN ANALYZE`
  çıktısıyla birlikte rapora yazılır.

---

## Kabul — PROMPT'un tam listesi

- [ ] Sol taraf (sunucu rayı, gezinme paneli, kullanıcı barı) **hiç değişmedi**; diff yalnız
      Etkinlikler bölgelerine ve rota bağlantısına dokunuyor.
- [ ] Gezinme panelindeki `Etkinlikler` satırı aktif; saat ipucu ve canlı noktası etkinlik
      verisinden geliyor, hata durumunda gizleniyor.
- [ ] Sadece token renkleri kullanıldı — yeni hex araması temiz.
- [ ] Tipografi Outfit + Figtree, token üzerinden.
- [ ] Başlık tek satırda kalıyor; detay paneli açıldığında sekme grubu ve ikon grubu gizleniyor.
- [ ] Hafta şeridi: 7 gün, gün başına en çok 4 tür noktası, bugün vurgulu, hafta ileri/geri
      çalışıyor (K9).
- [ ] Kart: tür tile'ı + tür pili doğru ton; canlı pili ve nokta; tekrar metni;
      `Başlamasına N dk`; avatar yığını (24, −8, 2 px halka); `Katıl` / `Belki` durumları.
- [ ] Kartta üç nokta menüsü **yok**.
- [ ] `Katıl` → kart kenarı `--success/.4`, buton `Katılıyorsun`, sağ ray listesi ve başlık
      sayacı **aynı anda** güncelleniyor.
- [ ] Sağ ajanda rayı 300 px; 44 px saat kolonu + 1,5 px dikey çizgi; canlıda `Canlı` + nokta.
- [ ] Detay paneli 326 px; ajanda rayının yerini alıyor; rol pilleri; CTA üç durumda doğru.
- [ ] Oluştur modalı 560 px; 6 tür, başlık, tarih-saat, süre segmenti, yer seçici,
      `Topluluk keşfetinde listele` anahtarı; `Esc` kapatıyor.
- [ ] Filtre şeridi yalnız aktif filtre varken; kaldır ve `Tümünü temizle` çalışıyor.
- [ ] Boş ve hata durumu metinleri birebir; hata kodu satırı var.
- [ ] Tema anahtarı çalışıyor; hiçbir parça tek temaya sabit değil.
- [ ] Dört çözünürlükte kaydırma/kırpma yok.
- [ ] Tüm metinler birebir; placeholder/lorem yok.

## Kabul — bu paketin eklediği

- [ ] Hatırlatma gerçekten gönderiliyor; saat değişince yeniden zamanlanıyor; RSVP geri
      alınınca iptal ediliyor; geçmişte kalan iş yazılmıyor.
- [ ] `.ics` geçerli dosya üretiyor (`BEGIN:VEVENT`, UTC `DTSTART`, `UID`, CRLF).
- [ ] `MANAGE_EVENTS` olmayan kullanıcıda üç `Oluştur` girişi de gizli; `POST /events` 403.
- [ ] `interestedCount` üç tüketicisi `count-contract.test.ts` ile kilitli.
- [ ] Mobil uçlar eski sözleşmeyle çalışıyor (K12).
- [ ] Canlı geçişi: sesli kanala ilk giriş `ACTIVE`, kanal boşalınca `COMPLETED`.
- [ ] Eski ekran ve uçları silindi; ölü referans yok.
- [ ] `parity.test.ts` yeşil; `SPEC_DEVIATIONS` beş kaydı taşıyor.

## Kapı

```
pnpm --filter @wizards/db db:generate && pnpm typecheck && pnpm lint && pnpm format
```

```
pnpm --filter @wizards/web test && pnpm --filter @wizards/types test && pnpm --filter @wizards/db test
```

```
pnpm --filter @wizards/web e2e:smoke && pnpm --filter @wizards/web e2e:a11y
```

Son adım: `graphify update .` — grafik güncel kalsın.
