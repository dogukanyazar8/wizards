# 15 — Doğrulama, kabul kriterleri ve temizlik

Önce `00-ortak-baglam.md` oku. Ön koşul: `03`–`13` tamam (`14` isteğe bağlı).
Branch `uat`, commit yok.

Hedef: 13 ekranın tasarımla **birebir** olduğunu kanıtlamak, artık kalmamış kodu temizlemek
ve tüm gate'leri yeşile almak. Bu prompt yeni özellik yazmaz; sapma bulursa **düzeltir**.

---

## 1. Kabul kriterleri (PROMPT.md §7 · 36 madde)

Her maddeyi **tek tek** doğrula. Doğrulama yöntemi madde başına yazılır:
`test` (otomatik test var), `kod` (stil/kaynak okuması), `görsel` (390×844 ve 430×932
çerçevede ekran görüntüsüyle karşılaştırma).

| #   | Kriter                                                                    | Ekran    | Yöntem       |
| --- | ------------------------------------------------------------------------- | -------- | ------------ |
| 1   | Hiçbir ekranda kırpılan metin/kart yok; 1a son kart 826px'de biter        | tümü     | görsel       |
| 2   | Kimlik kartı 60px logo, bar 15/22/30/21/16, `gap 3.5`, `r15`              | 1a/1e    | kod + görsel |
| 3   | Logo zemini iki katmanlı + üst ışık                                       | 1a/1e    | kod          |
| 4   | Sürüm çipi + kod adı + kanal çipi tek satır, `gap:6`                      | 1a/1e    | test         |
| 5   | Yapı satırı 11/500 + 11px kopyala ikonu                                   | 1a/1e    | test         |
| 6   | Güncelleme durumu tek satır; eski mor CTA yok                             | 1a       | test         |
| 7   | Yenilikler kartında 3 madde, üç tür rengi, açıklama 11.5/500 lh1.45       | 1a       | test         |
| 8   | Kart içi ayırıcılar `-16px` ile tam genişlik                              | tümü     | kod          |
| 9   | Grup etiketleri 10.5/700 `ls .1em`, hepsi büyük harf                      | tümü     | kod          |
| 10  | Liste satırları ≥44px; alt metinli `11px 16px`                            | tümü     | test         |
| 11  | Toggle 44×26 knob 20; beta kapalı, otomatik güncelleme açık               | 1a       | test         |
| 12  | 1b sticky başlığı beyaz + `#ECEEF7` çizgi, sağda sürüm                    | 1b       | test         |
| 13  | İmza bloğu tam görünür (3 chip + iki metin)                               | 1b       | test         |
| 14  | Servis pill'i `#E9F9EF` + `#1B8A55`, 7px `#22C55E` nokta                  | 1b       | test         |
| 15  | 1c tür çipleri 62px sabit, dördü aynı yükseklik                           | 1c       | test         |
| 16  | 1c vurgu kartı `#F7F6FF` + `#E7E6FD`, sürüm 20/800                        | 1c       | kod          |
| 17  | 1c geçmiş satırında 9px `#C9CDE3` nokta + "N değişiklik"                  | 1c       | test         |
| 18  | 1d kartı 160° gradyan + `0 14px 30px rgba(67,56,202,.28)`                 | 1d       | kod          |
| 19  | Sheet alt köşe 44px, scrim `.42`                                          | 1d/2d/2h | kod          |
| 20  | 1d aşama listesi 3 satır, yalnız ilki aktif                               | 1d       | test         |
| 21  | 1e = 1a piksel yerleşimi, yalnız renk farkı                               | 1e       | görsel       |
| 22  | Kontrast: gövde ≥4.5:1, ikincil ≥3:1; `#B9BED6` metin değil               | tümü     | kod          |
| 23  | 2a grup etiketinde sayı; YENİ'de ikon kutusu, diğerlerinde 6px nokta      | 2a       | test         |
| 24  | 2b yüklü sürüm noktası indigo + `0 0 0 3.5px #EEF0FE` halka               | 2b       | test         |
| 25  | 2b ve 2e arama alanı aynı bileşen                                         | 2b/2e    | kod          |
| 26  | 2c seçili satır `#F7F6FF`, radyo indigo dolu + beyaz tik, son satır `r24` | 2c       | test         |
| 27  | 2c ve 2f sabit alt buton `bottom:26`, `left/right:16`, `r16`, 14/800      | 2c/2f    | kod          |
| 28  | 2d ve 2h'de ikincil eylem düz metin                                       | 2d/2h    | test         |
| 29  | 2d onay kutusu 20px `r6`; işaretsizken birincil pasif                     | 2d       | test         |
| 30  | 2e kategori ızgarası 2 kolon, `gap:10`, eşit yükseklik                    | 2e       | test         |
| 31  | 2f başlığında X ikonu                                                     | 2f       | test         |
| 32  | 2f üç ek satırı ne gönderileceğini yazar; cihaz bilgisi kapalı            | 2f       | test         |
| 33  | 2g banner 92px, ikon `-26px` biner, çerçeve 3px                           | 2g       | test         |
| 34  | 2g avatar yığını `-9px` bindirme, 2px beyaz kenar                         | 2g       | test         |
| 35  | 2h yıldızlar 42px, dolu/boş renkleri, etiket biçimi                       | 2h       | test         |
| 36  | 2h 4 yıldızda mağaza butonu yok                                           | 2h       | test         |

Her sapma için: önce testi yaz (kırmızı), sonra düzelt, sonra yeşile al.

---

## 2. Ek dürüstlük kontrolleri (bu iş için eklendi)

1. Ekranların hiçbirinde **uydurma sayı** yok: yüzde, ETA, üye sayısı, kullanım günü,
   makale sayısı — hepsi veri kaynağından gelir, yoksa ilgili parça gizlenir.
2. 1d'de `capabilities.reportsPercent === false` iken yüzde metni ve `Duraklat`
   render edilmiyor.
3. 2c "uygulama yeniden başlar" metni yalnız sunucu `requiresRestart: true` derse görünüyor.
4. 2f'nin gönderdiği gövdede mesaj içeriği, kişi adı, dosya adı veya token yok.
5. Teşhis metninde tam kullanıcı kimliği veya token yok (yalnız 8 karakter kısaltma).

---

## 3. Temizlik

- `mobile-about-settings-screen.tsx`'in eski sürümünden kalan kullanılmayan stil
  anahtarları ve `mobileCopy` girdileri: `aboutSettingsCheckUpdates`,
  `aboutSettingsUpToDate`, `aboutSettingsChecking`, `aboutSettingsUpdating`,
  `aboutSettingsLegalHeading`, `aboutSettingsSupportHeading`, `aboutSettingsServiceOffline`
  vb. — **başka ekranda kullanılmıyorsa** sil (önce `grep` ile doğrula, `tr` ve `en`
  birlikte silinir, ardından copy parity testi).
- Ölü `AboutLegalRow` bileşeni ve `ABOUT_APP_LOGO_*` sabitleri.
- `component-tests/mobile-about-settings-screen.test.tsx` — eski ekranı test ediyor;
  yeni test dosyalarıyla değiştirildiyse sil, değilse yeni ekrana göre yeniden yaz.

---

## 4. Tam gate

Sırasıyla çalıştır ve **hepsi yeşil** olmalı:

```bash
pnpm --filter @wizards/types typecheck
```

```bash
pnpm --filter @wizards/web typecheck
```

```bash
pnpm --filter @wizards/mobile typecheck
```

`apps/mobile` içinden tüm node testleri:

```bash
pnpm --filter @wizards/mobile test
```

`apps/mobile` içinden tüm bileşen testleri:

```bash
pnpm --filter @wizards/mobile test:components
```

`apps/web` içinden sözleşme testleri:

```bash
node --test --import tsx src/app/api/v1/route-contract.test.ts
```

Ayrıca özellikle koşulacak sözleşme testleri:
`mobile-redesign-theme-contract.test.ts`, `mobile-copy-parity.test.ts`,
`mobile-design-contract.test.ts`, `mobile-deep-link-contract.test.ts`,
`admin-route-capability.test.ts` (14 çalıştıysa).

---

## 5. Görsel doğrulama

13 ekranın her biri için:

1. Ekranı 390×844 çerçevede render et (mevcut görsel regresyon altyapısı varsa onunla;
   yoksa cihaz/simülatör ekran görüntüsü).
2. `screenshots/<kod>.png` ile üst üste bindir.
3. Sapma listesi çıkar: konum farkı >2px veya renk farkı olan her öğe.
4. 430×932'de tekrar et — kırpma ve taşma kontrolü (`1`, `27`, `30` kriterleri).

---

## 6. Rapor

Bittiğinde tek bir özet üret:

- 36 kriterin durumu (geçti / düzeltildi / açık kaldı + sebep)
- Bilinçli sapmalar listesi ve gerekçeleri (prompt 03 §5 "sarsma" metni, prompt 06 ikon
  eşlemesi, prompt 11 düzenleyici kapsamı, prompt 13 mağaza modülü gibi)
- Kalan iş kalemleri (OTA yapılandırması, karalama düzenleyicisi, otomatik puanlama
  tetikleyicisi, görsel regresyon anlık görüntüleri)
- Test sayıları: mobil node, mobil bileşen, web node — önceki sayıyla karşılaştırmalı

**Commit atılmaz.**
