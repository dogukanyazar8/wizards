# Faz 8 — Parity kapısı, performans ölçümü ve paket kabulü

**Ön koşul:** Faz 7. **Sonraki:** yok — paket burada kapanır.
**Önce oku:** `00-ortak-baglam.md` §5 (kalite çıtası); PROMPT "Kabul kriterleri"; SPEC §8.4
(test matrisi).

Bu faz **yeni özellik yazmaz.** Ölçer, kanıtlar, kapatır. Çıktısı: sayılarla dolu bir rapor ve
kullanıcının kendi gözüyle doğrulayacağı numaralı liste.

---

## 0. Başlangıç

```
graphify update .
```

---

## 1. Görsel parity — 6 × 2 matris

Faz 0'da kurulan `e2e/specs/design/home-parity.spec.ts` `test.skip` kaldırılarak açılır.

| #   | Görünüm alanı | Beklenen adım | Kök font |
| --- | ------------- | ------------- | -------- |
| 1   | 1360×920      | ×1            | 16px     |
| 2   | 1600×900      | ×1            | 16px     |
| 3   | 1920×1080     | ×1.15         | 18px     |
| 4   | 2560×1440     | ×1.5          | 24px     |
| 5   | 3840×2160     | ×2            | 32px     |
| 6   | 5120×1440     | ×1.5          | 24px     |

Her biri `theme-light` ve `theme-dark` → 12 çalıştırma. Her çalıştırmada:

- [ ] Yatay taşma yok.
- [ ] Dikey taşma yok — Arkadaşlar şeridi kabuğun içinde bitiyor.
- [ ] Ellipsis taşımayan kırpılmış metin yok.
- [ ] Kök font boyutu beklenen değerde.
- [ ] Tıklama hedefleri ≥ 44 fiziksel px.
- [ ] Ekran görüntüsü alınıp `design/1a-komuta-merkezi.html` karşılığıyla yan yana karşılaştırıldı.

Referans HTML karşılaştırması elle yapılır: referansı aynı çözünürlükte aç, ekran görüntüsünü
üretim ekranıyla yan yana koy, farkları numaralı listeye yaz. Fark **yoksa** raporda "0 sapma"
yazılır — "gözle aynı görünüyor" yeterli değil, liste boş olmalı.

### 1.1 Ek boyutlar

Küçük ekran kırılımları (Faz 7 §3): 1280 · 1100 · 900 · 720 genişlik, iki tema. Kırpma ve
okunabilirlik kontrolü.

---

## 2. Fonksiyonel kabul — PROMPT kriterleri

**Ortak**

- [ ] Yeni hex araması temiz (amber butonu hariç). Token denetim testi yeşil.
- [ ] Tipografi Outfit + Figtree, token üzerinden; hiçbir bileşende sabit font adı yok.
- [ ] Tema anahtarı çalışıyor; hiçbir parça tek temaya sabitlenmiş değil. **32 temanın hepsinde**
      Ana Sayfa açılıp gözle tarandı (kısa tur, bozuk olan varsa listede).
- [ ] Dört çözünürlükte kaydırma yok, metin kırpılmıyor; 4K'da gövde metni fiziksel olarak temel
      çözünürlükteki kadar okunur.
- [ ] 5120×1440'ta ölçek yükseklikten seçiliyor, dikey taşma yok.
- [ ] Sunucu rayı ve kullanıcı barı tek bileşenden geliyor.
- [ ] Tüm metinler birebir; placeholder/lorem yok.
- [ ] Tip kontrolü, lint ve testler geçiyor; yeni bileşenler için render testleri var.

**Ana Sayfa**

- [ ] Ray (74) + panel (272) + ana alan düzeni SPEC ölçülerinde.
- [ ] 6 kart doğru ızgara alanında: Kaldığın yer (2) · Şu an canlı (2) · Yanıt bekliyor (2) ·
      Durumun (1) · Sıradaki (1) · Arkadaşlar (4).
- [ ] Hover durumları tasarımdakiyle aynı; okunmamış badge'leri, presence noktaları ve
      "oda açık" nabız animasyonu çalışıyor.

**Bu paketin ek kriterleri**

- [ ] Ana Sayfa'da ölü link yok (Faz 6 §5 tablosu).
- [ ] ⌘K arama + komut çalışıyor.
- [ ] Odak modu açılıyor, geri sayıyor, süresi dolunca kendiliğinden kapanıyor ve presence eski
      değerine dönüyor — **gerçek zamanla doğrulandı** (kısa süre ile test edilebilir hâle
      getirildiyse raporda belirtilir).

---

## 3. Performans ölçümü

`00-ortak-baglam.md` §5.2 bütçeleri ölçülür, tahmin edilmez.

| Ölçüm                                  | Nasıl                                        | Bütçe                                    |
| -------------------------------------- | -------------------------------------------- | ---------------------------------------- |
| Ana Sayfa açılışında istek sayısı      | DevTools network, cache boş                  | ≤ 6 paralel                              |
| Uç başına SQL sorgu sayısı             | Prisma log / test sayacı, `limit` 4 ve 7 ile | Faz 3 §3 sayıları, `limit`'ten bağımsız  |
| `app/summary` p95                      | 20 ardışık istek, ısıtılmış                  | < 120 ms                                 |
| İlk anlamlı boya                       | Lighthouse ya da Performance paneli          | raporda sayı                             |
| CLS                                    | Performance paneli, font yüklenmesi dahil    | < 0.1                                    |
| Ölçek adımı değişiminde yeniden render | React Profiler                               | yalnız adım değişince                    |
| Bundle etkisi                          | `next build` çıktısı, `/home` rota boyutu    | raporda sayı, palet ve takvim ayrı chunk |
| Uzun süreli çalışma                    | 10 dk açık bırak, bellek grafiği             | sızıntı yok, interval birikmiyor         |

Ek kontrol: sekmeyi 5 dk gizle, geri dön — geri sayım doğru, gereksiz istek yağmuru yok.

---

## 4. Güvenlik doğrulaması

`00-ortak-baglam.md` §5.1'in her maddesi, her yeni uç için işaretlenir. Tablo raporda:

| Uç  | 401 | Yetki | Redaksiyon | Rate limit | Zod | Dar DTO |
| --- | --- | ----- | ---------- | ---------- | --- | ------- |

Ek olarak elle doğrulanır:

1. **Görünmez kullanıcı testi.** İki hesap: A "Görünmez" seçer, sesli odaya girer. B'nin Ana
   Sayfası A'yı çevrimiçi göstermemeli, canlı oda katılımcısı olarak listelememeli, arkadaş
   şeridinde çevrimiçi saymamalı.
2. **Yetkisiz kanal testi.** A'nın göremediği özel kanalda mesaj/bahsedilme/etkinlik olsun;
   A'nın `app/recent`, `mentions`, `events/upcoming`, `search/command` sonuçlarında **çıkmamalı**.
3. **Sunucudan çıkarılma.** A bir sunucudan atıldıktan sonra Ana Sayfa'yı tazelesin; o sunucunun
   odası, etkinliği ve bahsedilmesi kaybolmalı.
4. **Açık yönlendirme.** `Notification.actionUrl` alanına dış URL yazılmış bir kayıt üret; Ana
   Sayfa ve Gelen kutusu bu satırı dış bağlantı olarak açmamalı.
5. **Rate limit.** Bir uca hızlı ardışık istek at; 429 dönmeli ve istemci döngüye girmemeli.

`pnpm --filter @wizards/web e2e:api` ve varsa güvenlik lint/semgrep kuralları koşulur.

---

## 5. Tam kapı

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm --filter @wizards/db test
pnpm --filter @wizards/web e2e:smoke
pnpm --filter @wizards/web e2e:api
pnpm --filter @wizards/web e2e:a11y
pnpm --filter @wizards/web e2e:visual
pnpm --filter @wizards/web exec playwright test e2e/specs/design
pnpm build
node scripts/quality/count-arbitrary-px.mjs
```

---

## 6. Kullanıcı doğrulama listesi

Kullanıcı kendi makinesinde tek tek işaretler. Rapor bu listeyi numaralı üretir:

1. `/` adresine git → Ana Sayfa açılıyor.
2. Açık ve koyu temada ekranı gez → renk sapması yok.
3. Pencereyi 1920, 2560, 3840 genişliğe getir → kompozisyon aynı, her şey birlikte büyüyor.
4. Ultra geniş ekranda (varsa) dikey taşma yok.
5. `Durumun` kartından `Meşgul` seç → ray/ayak/arkadaş görünümü anında güncelleniyor.
6. `Rahatsız etmeyin` aç → üst çubukta odak pill'i çıkıyor, çubuk ilerliyor.
7. Odak süresi dolunca durum eski hâline dönüyor.
8. Canlı bir odaya `Katıl` → buton `Ayrıl` oluyor, kart kenarı yeşile dönüyor.
9. Bir arkadaşlık isteğini `Kabul et` → satır kayboluyor, sayaç düşüyor.
10. `Hatırlat` → `Hatırlatılacak` oluyor, sayfayı yenileyince öyle kalıyor.
11. `⌘K` / `Ctrl+K` → palet açılıyor, sunucu/kanal/kişi bulunuyor, komut çalışıyor.
12. Nav satırlarının hepsi gerçek ekrana gidiyor.
13. `Takvim` butonu takvim görünümünü açıyor.
14. Pencereyi 900px'e daralt → tek kolon, drawer çalışıyor.
15. Klavyeyle tüm ekran geziliyor, `Esc` overlay'leri kapatıyor.

---

## 7. Paket raporu

`raporlar/09-faz8-rapor.md` şunları içerir:

- 12 parity çalıştırmasının sonucu + sapma listesi (boşsa "0 sapma")
- Performans tablosu (§3) ölçülen değerlerle
- Güvenlik tablosu (§4) + 5 elle testin sonucu
- Kalan `TODO(api):` listesi (boş olmalı)
- `count-arbitrary-px` son sayısı ve Faz 0'daki 1208'e göre düşüş
- Faz 1 §4'te bulunan ve başka paketlere devredilen görsel sapmalar
- Bir sonraki paket (Mesajlar) için devredilen sözleşmeler: kabuk API'si, ölçek motoru, ölçü
  sözlüğü, i18n düzeni

Commit için kullanıcıdan izin istenir. İzinsiz commit yok.
