# Dalga 4 · Ş11 — Bildirimler paneli (400 px) + Bildirim ayarları penceresi (560 px)

**Ön koşul:** Dalga 3 kapısı yeşil. **Paralel:** Ş12.

Referans kareler: `screens/01-bildirimler-penceresi.png`, `screens/02-bildirim-ayarlari.png`.
Otorite: SPEC §1 ve §2, `.dc.html` `NOTIFS` ve `levels` / `quickPrefs` dizileri.

Önce `00-ortak-baglam.md` okunur.

---

## Sahiplenilen dosyalar

- `apps/web/src/components/notifications/notification-panel.tsx` (yeni)
- `apps/web/src/components/notifications/notification-item.tsx` (yeni)
- `apps/web/src/components/notifications/notification-panel-tabs.tsx` (yeni)
- `apps/web/src/components/notifications/notification-prefs-dialog.tsx` (yeni)
- `apps/web/src/components/shared/notification-bell.tsx` (**düzenlenir** — popover gövdesi değişir)
- `apps/web/src/lib/notifications/panel-state.ts` (yeni — tek reducer) + `.test.ts`
- Her biri için `.test.tsx`

**Okunur, yazılmaz:** `lib/notifications/client.ts` (Ş2), `lib/settings/notification-prefs-client.ts` (Ş1),
`lib/settings/metrics.ts`, `lib/settings/navigation.ts`.

---

## A. Bildirimler paneli (400 px)

### 1. Kutu

```
position absolute · top 50px · right 0 · z-index 30
radius 20 · H(surface-card) · border 1px H(border)
box-shadow 0 34px 76px -32px H(shadow-color) · max-height 640
```

Zil düğmesi açıkken `H(primary,.14)` zemin + `H(primary,.5)` kenar + `H(primary)` ikon;
okunmamış varsa üstünde 7 px `--danger` nokta (bu davranış `badgeVariant="dot"` ile **zaten var**,
korunur).

`role="dialog"`, liste `role="list"`.

### 2. Başlık

`padding:16px 18px 13px`, alt kenar `1px H(border,.6)`:

- `Bildirimler` (`600 15.5px display`)
- Okunmamış sayacı: `min-width:20`, `height:19`, `radius:7`, `H(danger)` zemin, beyaz metin
- `Tümünü okundu işaretle` (`H(primary)`, `600 11.5px`)
- 28 px dişli

**Okunmamış kalmadığında** sayaç ve `Tümünü okundu işaretle` **gizlenir**, yerine yeşil tikli
`Hepsi okundu` göstergesi geçer. Kırmızı `0` pili **hiçbir zaman görünmez** — kabul kriteri.

### 3. Sekmeler

`padding:11px 14px`, alt kenar `1px H(border,.5)`; dört sekme `Tümü · Bahsedilmeler · Yanıtlar ·
Sistem`, `height:30`, `radius:10`, `600 12px`; aktif `H(primary)`/`#fff`, sayaç pili aktifte
`hsl(0 0% 100%/.22)`.

**Sayılar yalnız okunmamışı sayar** ve Ş2'nin dörtlü sayaç ucundan gelir.
Sayacı istemci artırmaz — socket yükündeki `counts` okunur (iki sekme açıkken ayrışmasın).

`role="tablist"`, `←/→` gezinir.

### 4. Liste

`padding:8px 10px 12px`, `overflow-y:auto`.

- `BUGÜN` / `DÜN` grup etiketleri (`600 10px display`, `.15em`, uppercase) + esneyen hairline.
  Grup etiketi metni i18n'den, kova enum'u sunucudan (Ş2).
- Satır: `padding:10px 11px`, `radius:14`.
  Okunmamış: `background:H(surface-soft,.6)`, başlık `600`, sağda 7 px `H(primary)` nokta.
  Okunmuş: zemin şeffaf, ağırlık `500`.
- 32 px tür ikonu (`radius:11`): bahsetme `@` `--primary` · rol `R` `--info` · thread `T`
  `--success` · etkinlik `E` `--warning` · sistem `S` `--text-muted`.
- **Satıra tıklamak okundu/okunmadı durumunu çevirir** (Ş2 çevirme kipi).

**Okunmamış durumu renkle değil metinle de bildirilir** — satır `aria-label`'ında
`Okunmadı` / `Okundu` geçer; ekran okuyucu noktayı göremez.

**Sonsuz kaydırma (K10):** liste dibe gelince sonraki sayfa çekilir.
`IntersectionObserver` efekt bağımlılıkları **ilkel** olmalı (tuzak: `useInfiniteQuery` nesnesi
her render'da yeni; `[listQuery]` yazmak her render bir sayfa daha çeker).

Boş durum: sekmede hiç kayıt yoksa boş durum metni; uydurma satır çizilmez.

### 5. Alt

`padding:12px 16px`, üst kenar `1px H(border,.6)`:
`Sessiz saatler 23:00 – 08:00` (tercihten, kapalıysa satır **yazılmaz**) +
`Tüm bildirimleri gör` → **`/mentions`** (K10).

### 6. Dişli

Paneli **kapatır** ve bildirim ayarları penceresini açar. Aynı anda tek panel + tek modal.

---

## B. Bildirim ayarları penceresi (560 px)

### 7. Kutu ve başlık

```
radius 22 · H(surface-card) · border 1px H(border) · box-shadow 0 44px 96px -38px H(shadow-color)
başlık: 38×38 H(primary,.15) zil ikonu · "Bildirimler" 600 17px display
        alt "Ne zaman ve nasıl bildirim almak istediğini seç." · kapat 32×32
```

Örtü kartın kardeşi (tuzak #11); `Esc` sırayla modal → panel.

### 8. İzin şeridi

`H(warning,.1)` zemin, `H(warning,.35)` kenar, 30 px uyarı ikonu.
`Sistem bildirimi izni` + `İzin verilmedi` pili.
Metin: `Whispr kapalıyken veya arka plandayken bildirim almak için sistem izni gerekir.`
Düğmeler: `İzin iste` (primary) · `Sistem ayarlarını aç`.

**İzin verilmişse şerit hiç render edilmez.** Durum `navigator.permissions` +
`Notification.permission`'dan; sabit değer yok.

`İzin iste` gerçek `Notification.requestPermission()` çağırır; kullanıcı jesti içinde.

### 9. Bildirim düzeyi

Üç radyo kartı (`padding:11px 12px`, `radius:14`; seçili `H(primary,.09)` + `H(primary,.45)`):

| Etiket                              | Açıklama                                                                                           |
| ----------------------------------- | -------------------------------------------------------------------------------------------------- |
| `Tümü`                              | `Mesajlar, bahsetmeler, çağrılar ve diğer etkinlikler.`                                            |
| `Yalnızca önemli` + `Önerilen` pili | `Doğrudan bahsetmeler, yanıtlar, çağrılar, güvenlik ve moderasyon.`                                |
| `Kapalı`                            | `İsteğe bağlı açılır bildirimleri ve sesleri durdurur. Bildirim merkezi kayıt tutmaya devam eder.` |

`role="radiogroup"` + `role="radio"`, `↑/↓` gezinir.

**Ayarlar › Bildirimler › Genel'deki `Hangi bildirimleri al` menüsüyle aynı `level` anahtarını
yazar** (sapma #6). Etiket metinleri farklı ve ikisi de birebir korunur.

Ayrıntılı ayarlarda sapma varsa bölüm başlığında `Özel` pili — `isCustomLevel` (Ş1) okunur.

### 10. Hızlı tercihler

Üç satır (`radius:14`, `H(surface-soft,.5)`), her biri 40×23 anahtarlı:

- `Bildirim sesi` / `Yeni bildirim geldiğinde ses çal.` → `soundNotificationEnabled` (`ns1`)
- `Mesaj önizlemelerini göster` / `Gönderen ve mesaj içeriğini sistem bildiriminde göster.`
  (varsayılan **kapalı**) → `systemPreview` (`na6`)
- `Sessiz saatler` / `Her gün 23:00 – 08:00 arasında sessiz.` + `Saatleri düzenle` düğmesi
  → `quietHoursEnabled` (`nq1`)

Üçü de **Ayarlar penceresindeki aynı anahtarları** yazar (tuzak #4). Alt metindeki saat aralığı
gerçek tercihten interpolasyonla.

### 11. Alt

`Tüm bildirim ayarları` → `/settings/notifications/surfaces` ·
otomatik kayıt göstergesi (`aria-live="polite"`, üç durum, **gerçek yanıt** üzerine) · `Bitti`.

`Saatleri düzenle` → `/settings/notifications/quiet-hours`.

İkisi de pencereyi kapatır ve Ayarlar penceresini açar.

---

## Kabul

**Panel**

- [ ] Zil paneli açıyor/kapatıyor; açıkken primary vurgu; okunmamış varsa 7 px danger nokta.
- [ ] Satıra tıklamak durumu **çeviriyor**; sayaç, 4 sekme pili ve zil noktası aynı anda güncelleniyor.
- [ ] `Tümünü okundu işaretle` hepsini okuyor; başlık `Hepsi okundu` göstergesine dönüyor.
- [ ] Kırmızı `0` pili **hiçbir durumda görünmüyor**.
- [ ] Sekme sayaçları yalnız okunmamışı sayıyor ve socket yükünden okunuyor (istemci artırmıyor).
- [ ] İki sekme açıkken birinde okunan bildirim diğerinde de okunmuş görünüyor.
- [ ] Gün grubu etiketi i18n'den; kova sunucudan.
- [ ] Okunmamış durumu `aria-label`'da **metinle** de var.
- [ ] Sonsuz kaydırma çalışıyor ve her render bir sayfa çekmiyor (istek sayacı testi).
- [ ] Sessiz saat satırı tercih kapalıyken **yazılmıyor**.
- [ ] `Tüm bildirimleri gör` `/mentions`'a gidiyor.
- [ ] Dişli paneli kapatıp 560 px pencereyi açıyor.

**560 px pencere**

- [ ] İzin verilmişse şerit **render edilmiyor**; verilmemişse iki düğme çalışıyor.
- [ ] `İzin iste` gerçek tarayıcı izni istiyor.
- [ ] `Yalnızca önemli` kartında `Önerilen` pili var.
- [ ] Düzey seçimi Ayarlar › Genel'deki menüyle **aynı** değeri yazıyor.
- [ ] Ayrıntıda sapma varken `Özel` pili çıkıyor.
- [ ] Üç hızlı tercih Ayarlar'daki karşılıklarıyla senkron.
- [ ] `Tüm bildirim ayarları` → Yüzeyler, `Saatleri düzenle` → Sessiz saatler.
- [ ] Kayıt göstergesi gerçek yanıt üzerine üç durumu gösteriyor; sabit gecikme yok.
- [ ] Örtüye tıklama ve `Esc` sırayla modal → panel kapatıyor; focus tetikleyiciye dönüyor.
- [ ] Açık ve koyu temada `screens/01-*.png` ve `screens/02-*.png` ile karşılaştırma yapıldı.

## Kapı

```
pnpm --filter @wizards/web typecheck && pnpm --filter @wizards/web lint && pnpm --filter @wizards/web test
```

Rapor: `docs/prompts/whispr-ayarlar/raporlar/12-s11-rapor.md`
