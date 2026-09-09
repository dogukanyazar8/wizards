# Dalga 5 · Ş13 — Erişilebilirlik, ölçekleme, kırılımlar, temizlik, parity QA

**Ön koşul:** Dalga 4 kapısı yeşil. **Paralel:** yok — paketin kapanış şeridi.

Bu şerit yeni yüzey **eklemez**; dört yüzeyi kabul kriterlerine karşı ölçer, eksikleri kapatır,
ölü kodu siler ve paketi kapatır.

Önce `00-ortak-baglam.md` okunur.

---

## Sahiplenilen dosyalar

- `apps/web/src/components/settings/**` (yalnız düzeltme)
- `apps/web/src/components/notifications/**` (yalnız düzeltme)
- `apps/web/src/components/shell/user-bar-menu.tsx` (yalnız düzeltme)
- `apps/web/e2e/settings-window.spec.ts` (yeni — uçtan uca)
- `apps/web/e2e/notification-panel.spec.ts` (yeni)
- `apps/web/src/lib/settings/parity.test.ts` (**genişletilir**)
- **Silinir:** `components/settings/settings-panel.tsx`, `settings-sidebar.tsx`,
  `components/screens/inbox-screen.tsx`, `app/(main)/inbox/`, `app/settings/appearance/`,
  `lib/notifications/client.ts` içindeki ölü fonksiyonlar, ölü i18n anahtarları
- `docs/prompts/whispr-ayarlar/raporlar/14-s13-rapor.md`

---

## İş

### 1. Erişilebilirlik geçişi

Dört yüzeyin tamamı için, **ölçülerek**:

| Konu            | Kriter                                                                                                                                             |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Modal           | `role="dialog" aria-modal="true"`; açılışta ilk öğeye focus; kapanışta focus tetikleyiciye döner; focus tuzağı `Tab` ve `Shift+Tab` ile doğrulanır |
| `Esc` merdiveni | açık menü → riskli blok → modal → panel; her adım ayrı test                                                                                        |
| Sol nav         | `role="tablist"`, satır `role="tab"` + `aria-selected`, `↑/↓`, `Home`/`End`                                                                        |
| Alt sekmeler    | `role="tablist"` + `aria-selected`, içerik `role="tabpanel"` + `aria-labelledby`                                                                   |
| Anahtar         | `role="switch" aria-checked`; kilitli olan `aria-disabled` + `aria-describedby`                                                                    |
| Açılır menü     | `aria-expanded`, `role="listbox"`/`option`, `↑/↓`, `Enter`, `Esc`, tip-ahead                                                                       |
| Kaydırıcı       | `role="slider"` + `aria-valuemin/max/now/text`, ok tuşları                                                                                         |
| Kayıt durumu    | `aria-live="polite"`                                                                                                                               |
| Bildirim satırı | okunmamış durumu `aria-label`'da **metinle**; renk tek başına anlam taşımıyor                                                                      |
| Kontrast        | Metin ve pil kontrastı iki temada da AA; ölçüm çıktısı rapora                                                                                      |
| Tıklama hedefi  | Her adımda **44 px fiziksel** altına düşen hedef yok                                                                                               |

`Test et` / `Önizle` gibi ses üreten düğmeler `prefers-reduced-motion` ile **susmaz** ama
animasyonları kısılır.

### 2. Ölçekleme (SPEC-ANA-SAYFA §8)

- Kod taraması: `w-[`, `h-[`, `text-[`, `p-[` gibi arbitrary px sınıfı **yok**.
- Hairline `hairline()` ile; `1px solid` doğrudan yazılmamış.
- İkonlar `pxToEm()` ile; `pxToRem` ile değil.
- Dört adımda (16 / 18 / 24 / 32 px kök) dört yüzey de kırpma yapmıyor.
- `zoom` kullanımı **yok**.
- `Yazı boyutu` (%85–130) ölçek adımının **üstüne** biniyor, yerine geçmiyor.

Test matrisi: **1360×920 · 1600×900 · 1920×1080 · 2560×1440 · 3840×2160**, her biri açık ve
koyu temada. Her boyutta: yatay kaydırma yok, metin kırpılmıyor, açılır menü kırpılmıyor.

### 3. Küçük ekran kırılımları (SPEC §10)

| Genişlik | Beklenen                                                                                  |
| -------- | ----------------------------------------------------------------------------------------- |
| `<1240`  | Ayarlar kenar boşluğu 16 px, genişlik `100%`                                              |
| `<1024`  | Sol nav 64 px (yalnız ikon)                                                               |
| `<860`   | Nav üstte yatay kaydırmalı şerit, içerik tam genişlik                                     |
| `<720`   | Pencere tam ekran (`radius:0`), alt sekmeler yatay kaydırmalı, kontroller satırın altında |
| `<520`   | Bildirimler paneli tam genişlik alt sayfa                                                 |

Kırılımlar **CSS'te** (tuzak #10); JS ile seçim yapılmadığı kod taramasıyla doğrulanır.

### 4. Açılır menü kırpılma ölçümü

Her `SettingSelect` için otomatik test: menü açıkken **ilk ve son seçeneğin** bounding box'ı
kaydırma alanının içinde. En kritik vakalar: Gizlilik › Dil ve bölge (sekmenin dibi),
Bildirimler › Sessiz saatler (4 menü art arda), Ses ve Video › Ses işleme (uzun sekme sonu).

### 5. Temizlik

- `settings-panel.tsx` (2956 satır) ve `settings-sidebar.tsx` (691 satır) **silinir**.
  Silmeden önce **satır envanteri** çıkarılır: eski panelde olup yeni ağaçta karşılığı olmayan
  her ayar rapora yazılır ve ya taşınır ya gerekçesiyle `SPEC_DEVIATIONS`'a girer.
- `inbox-screen.tsx` + `app/(main)/inbox/` **silinir** (K10);
  `grep -rn "/inbox"` ile ölü bağlantı taraması yapılır (tuzak #15).
- `app/settings/appearance/` **silinir**.
- `lib/notifications/client.ts` içindeki eski `fetchNotifications(limit)` ve
  `markNotificationRead(id)` — kullanan kalmadıysa silinir.
- Ölü i18n anahtarları: `settings.` ve `notif.` önekinde `SETTINGS_TREE` ve bileşenler tarafından
  kullanılmayan anahtar kalmamalı; `settings-screen-copy.test.ts` bu taramayı içerir.
- `components/voice/{voice,camera,screen-share}-preferences-panel.tsx` (Ş8 sildi) — import kalıntısı yok.
- `graphify update .` çalıştırılır.

### 6. Parity kapısı genişletilir

`lib/settings/parity.test.ts` dört yüzeyin **tamamı** için iddia taşır (Ş0 beş grupla başladı;
burada 20 özel bloğun geometrisi ve satır motorunun kontrol ölçüleri eklenir).

`SPEC_DEVIATIONS` **11 kayıt** taşıyor ve her biri kodda gerçekten uygulanmış — sapma listesiyle
davranış arasında fark yok (her kayıt için bir test).

### 7. Uçtan uca

`settings-window.spec.ts`:

1. Kullanıcı barı dişlisi → menü → `Ayarlar` → pencere açılır, URL `/settings/account/profile`.
2. Sol nav ile `Bildirimler`, alt sekme `Türler` → URL `/settings/notifications/types`.
3. Bir anahtarı çevir → kayıt göstergesi `Kaydediliyor` → `Kaydedildi`; sayfayı yenile → değer korunuyor.
4. Kilitli satıra tıkla → değişmiyor, ağ isteği çıkmıyor.
5. Aramada `bildirim` yaz → sonuç satırına tıkla → doğru sekme.
6. `Esc` → pencere kapanır, focus dişliye döner.
7. Geri tuşu → önceki sekme.

`notification-panel.spec.ts`:

1. Zil → panel açılır; okunmamış sayısı ve zil noktası tutarlı.
2. Satıra tıkla → okundu; tekrar tıkla → okunmadı; sayaç iki yönde de doğru.
3. `Tümünü okundu işaretle` → `Hepsi okundu`; kırmızı `0` pili yok.
4. Dişli → panel kapanır, 560 px pencere açılır.
5. `Tüm bildirim ayarları` → `/settings/notifications/surfaces`.

### 8. Ekran görüntüsü karşılaştırması

Sekiz referans karesinin (`screens/01`–`08`) her biri için açık ve koyu temada ekran görüntüsü
alınır ve fark rapora yazılır. Piksel farkı **açıklanabilir** olmalı: gerçek veri, gerçek cihaz
adları ve gerçek tema adları örnek veriden farklı olacaktır — bunlar sapma sayılmaz.
Ölçü, hizalama, renk ve boşluk farkı **sapmadır** ve düzeltilir.

---

## Kabul

- [ ] Dört yüzeyin a11y tablosundaki her satırı geçiyor; her kriter için test var.
- [ ] `Esc` merdiveni dört adımda da doğru.
- [ ] Kontrast ölçümü iki temada AA; çıktı rapora eklendi.
- [ ] Arbitrary px sınıfı taraması **temiz**; `zoom` kullanımı yok.
- [ ] 5 çözünürlük × 2 tema matrisinde kırpma ve yatay kaydırma yok.
- [ ] 5 kırılımın hepsi SPEC §10'a uyuyor ve CSS'te seçiliyor.
- [ ] Açılır menü kırpılma testi üç kritik vakada da geçiyor.
- [ ] Eski panelin satır envanteri çıkarıldı; karşılığı olmayan her ayar taşındı ya da kayda geçti.
- [ ] `settings-panel.tsx`, `settings-sidebar.tsx`, `inbox-screen.tsx`, `app/(main)/inbox/`,
      `app/settings/appearance/` **silindi**; hiçbir yerden import edilmiyor.
- [ ] `grep -rn "/inbox"` ölü bağlantı bulmuyor.
- [ ] Ölü i18n anahtarı yok; `tr` ve `en` anahtar kümeleri aynı.
- [ ] `SPEC_DEVIATIONS` 11 kayıt ve her biri için davranış testi var.
- [ ] Parity testi dört yüzeyi de kapsıyor.
- [ ] İki e2e senaryosu da yeşil.
- [ ] Sekiz karenin karşılaştırması rapora yazıldı; ölçü/hizalama farkı kalmadı.
- [ ] `graphify update .` koştu.
- [ ] PLAN.md §11'deki kabul kriterlerinin **tamamı** işaretli.

## Kapı

```
pnpm --filter @wizards/web typecheck && pnpm --filter @wizards/web lint && pnpm --filter @wizards/web test
pnpm --filter @wizards/web e2e
```

Rapor: `docs/prompts/whispr-ayarlar/raporlar/14-s13-rapor.md`
