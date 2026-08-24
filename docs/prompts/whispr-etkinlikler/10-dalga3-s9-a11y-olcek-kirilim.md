# Dalga 3 · Ş9 — Klavye, erişilebilirlik, ölçek adımları, kırılımlar

**Ön koşul:** Dalga 2 kapısı yeşil. **Ardıl:** Ş10.

Dalga 2 şeritleri kendi yüzeylerinin `aria-label`'larını ve rollerini zaten yazdı. Bu şerit
**aralarındaki** davranışı kuruyor: ızgarada gezinme, focus merdiveni, ölçek adımları ve üç
kırılım.

---

## Sahiplenilen dosyalar

- `apps/web/src/lib/events/keyboard.ts` (yeni — saf klavye modeli) + `.test.ts`
- `apps/web/src/hooks/use-event-grid-columns.ts` (yeni — ölçülen kolon sayısı) + `.test.ts`
- `apps/web/src/components/events/events-page.tsx` — yalnız klavye bağlama ve kırılım dalları
- `apps/web/src/components/events/event-grid.tsx` — yalnız roving tabindex
- `apps/web/src/lib/events/metrics.ts` — yalnız kırılım eşikleri bloğu
- `apps/web/src/app/globals.css` — yalnız Etkinlikler kırılım medya sorguları (gerekiyorsa)

---

## İş

### 1. Izgarada klavye gezinme (SPEC §7)

| Tuş            | Sonuç                                                           |
| -------------- | --------------------------------------------------------------- |
| `←` / `→`      | Önceki / sonraki kart (gruplar arası geçer)                     |
| `↑` / `↓`      | Bir satır yukarı / aşağı — **ölçülen** kolon sayısı kadar atlar |
| `Home` / `End` | Grubun ilk / son kartı                                          |
| `Enter`        | Detay panelini açar                                             |
| `K`            | RSVP `going` (ikinci basış geri alır)                           |
| `Esc`          | Merdiven: modal → panel → RSVP şeridi                           |

`keyboard.ts` **saf**: `(items, cursorId, columns, key) => nextCursorId | null`. React yok,
DOM yok. Grup sınırları `items` düzleştirilmiş listede zaten yok — gruplama yalnız sunum.

**Kolon sayısı ölçülür, tahmin edilmez** (tuzak #5). `use-event-grid-columns.ts`:
`ResizeObserver` ile ızgara kabını izler, ilk satırdaki kart sayısını `offsetTop`
karşılaştırmasıyla sayar. Kart boyutu değişince (`--e-min`) yeniden ölçer.
Ölçüm yapılamadıysa (`0` kart) `↑/↓` tek adım davranır — asla patlamaz.

Roving tabindex: yalnız imleçteki kart `tabIndex={0}`, diğerleri `-1`. `Tab` ızgaradan
**çıkar** (kart içi butonlara girmez); ızgara içindeki gezinme ok tuşlarıyla.

`K` kısayolu yalnız ızgara odaktayken çalışır — bir metin alanına yazarken değil
(`event.target` `input`/`textarea`/`contenteditable` ise yok sayılır).

### 2. Focus merdiveni ve dönüşü

- Modal açılır → focus tür ızgarasının ilk seçeneğinde; kapanır → `Oluştur` butonunda.
- Panel açılır → focus kapatma butonunda; kapanır → paneli açan **kartta**.
- Ray satırından panel açıldıysa dönüş o **ray satırına**.
- Tetikleyici DOM'dan kalktıysa (kart filtreyle düştü) focus ızgara kabına düşer, `body`'ye değil.
- `Esc` dinleyicisi **tek** yerde (`events-page.tsx`); modal ve panel kendi dinleyicilerini
  kurmaz (Ş7/Ş8 bunu zaten yapmadı, bu şerit doğrular).

### 3. Ölçek adımları (SPEC-ANA-SAYFA §8)

Motor hazır (`useUiScale`); bu şerit **tüketimi** doğrular:

- Ekrandaki **her** px değeri `pxToRem` üzerinden geliyor mu — otomatik denetim:
  `lib/events/token-audit.test.ts` (Ana Sayfa `token-audit.ts` dili) `components/events/*.tsx`
  dosyalarında `\[[0-9.]+px\]` ve `: *[0-9.]+px` aramalarının boş olduğunu doğrular.
  İzinli istisnalar: `hairline()` çıktısı ve `1.5px` ajanda çizgisi **değil** (o da rem).
- İkonlar `pxToEm(px, satırFontBoyutu)`; avatar ve gölge yarıçapı rem.
- Hairline kenarlar `hairline()`.
- Yoğunluk: `density.ts` adım başına ajanda rayı ve "Katılacağım" satır sayısını sürer;
  ızgara kart sayısı **sayfalamaya** bağlı (adım büyüdükçe daha fazla kart görünür, kolon
  sayısı artmaz — PROMPT §6).

Dört adımda (×1 / ×1.15 / ×1.5 / ×2) kabuk içinde dikey taşma olmamalı. Test:
`lib/events/scale.test.ts` her adım için toplam yükseklik hesabı (başlık + hafta şeridi +
ızgara min yüksekliği) `920 * step ≥` kontrolü.

### 4. Kırılımlar (SPEC §11)

| Eşik       | Davranış                                                                              |
| ---------- | ------------------------------------------------------------------------------------- |
| `< 1100px` | Detay paneli **overlay** olur (sağdan kayan, örtülü); ajanda rayı gizlenir            |
| `< 960px`  | Hafta şeridi **yatay kaydırmalı** olur (7 gün sığmaz), ızgara **tek kolona** düşer    |
| `< 720px`  | Sağ ray tamamen kalkar; "Bugün" ajandası ızgaranın **üstünde katlanır bir blok** olur |

**Kırılım CSS'te seçilir, JavaScript'te değil** (tuzak #11). Medya sorguları `metrics.ts`'teki
eşik sabitlerinden üretilir; `useSyncExternalStore` ile genişlik okunup dallanılmaz.

`< 720px` katlanır blok bir `<details>`/`<summary>` **değil** — kendi düğmesi ve `aria-expanded`
taşıyan bir bölüm (tasarım dili `details` oku göstermiyor). Varsayılan **kapalı**.

Overlay panel: `position: fixed`, `inset-block: 0`, `right: 0`, arkasında `--backdrop/.4` örtü,
örtüye tıklamak kapatır, `Esc` merdivenine dahil.

### 5. Hareket tercihi

`usePrefersReducedMotion` (mevcut) açıkken:

- kart hover `translateY(-2px)` yok,
- panel/overlay geçişi yok (doğrudan görünür/kaybolur),
- RSVP şeridi solma animasyonu yok.

---

## Kabul

- [ ] `keyboard.ts` saf ve React'sız test ediliyor; 6 tuşun altısı da doğru.
- [ ] `↑/↓` ölçülen kolon sayısı kadar atlıyor; kolon sayısı `large` boyutta değişiyor.
- [ ] Ölçüm yapılamadığında `↑/↓` tek adım, hata yok.
- [ ] Roving tabindex: `Tab` ızgaradan çıkıyor, kart içi butonlara girmiyor.
- [ ] `K` metin alanında yazarken tetiklenmiyor.
- [ ] Panel kapanınca focus onu açan karta/ray satırına dönüyor; kart düştüyse ızgara kabına.
- [ ] `Esc` dinleyicisi tek yerde (test: `document.addEventListener('keydown')` sayımı 1).
- [ ] `token-audit.test.ts` yeşil — `components/events/*` içinde sabit px yok.
- [ ] Dört ölçek adımında dikey taşma yok.
- [ ] `< 1100`: panel overlay, ray gizli. `< 960`: şerit yatay kaydırmalı, ızgara tek kolon.
      `< 720`: ray yok, katlanır "Bugün" bloğu var ve varsayılan kapalı.
- [ ] Kırılımlar CSS medya sorgusuyla; bileşenlerde genişlik okuyan dal yok.
- [ ] `prefers-reduced-motion` açıkken üç animasyon da kapalı.

## Kapı

```
pnpm --filter @wizards/web typecheck && pnpm --filter @wizards/web lint && pnpm --filter @wizards/web test
```
