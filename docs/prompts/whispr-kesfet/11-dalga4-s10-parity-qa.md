# Dalga 4 · Ş10 — Parity kapısı, e2e, kabul

**Ön koşul:** Ş0–Ş9 hepsi. **Kapı:** bu dosyadaki kabul listesi tamamen işaretli.

Bu şerit yeni özellik yazmaz. Tasarımla kodu karşılaştırır, sapmaları kapatır, kanıtı raporlar.

---

## Sahiplenilen dosyalar

```
apps/web/e2e/specs/discover/discover.spec.ts
apps/web/e2e/specs/discover/discover-a11y.spec.ts
docs/prompts/whispr-kesfet/raporlar/11-parity-rapor.md
docs/prompts/whispr-kesfet/raporlar/ekranlar/          (alınan ekran görüntüleri)
```

Sapma bulunduğunda ilgili şeridin dosyasına **doğrudan** düzeltme yapılır; her düzeltme rapora
`şerit · dosya · ne · neden` satırıyla yazılır.

---

## 1. Parity matrisi — 12 durum × 2 tema

`design_handoff/kesfet-paketi/screens/` ile karşılaştırma. Her satır için 1360×920'de açık ve
koyu temada ekran görüntüsü alınır.

| #   | Durum                                          | Nasıl kurulur                       |
| --- | ---------------------------------------------- | ----------------------------------- |
| 01  | Tüm dizin (varsayılan, öne çıkan blok görünür) | `/discover`                         |
| 02  | Kategori: Oyun                                 | `/discover?cat=oyun`                |
| 03  | Filtre aktif (Çalışma + en çok çevrimiçi)      | `/discover?cat=calisma&sort=online` |
| 04  | Arama sonuçları ("dil")                        | `/discover?q=dil`                   |
| 05  | Kişiler şeridi                                 | `/discover?lane=people`             |
| 06  | Kanallar şeridi                                | `/discover?lane=channels`           |
| 07  | Etkinlikler şeridi                             | `/discover?lane=events`             |
| 08  | Sunucu profili paneli açık                     | `/discover?panel=<serverId>`        |
| 09  | Sunucuya katıl modalı                          | `/discover?modal=join`              |
| 10  | Katıldım — onay şeridi + raya eklenen sunucu   | katılma akışı koşulur               |
| 11  | Boş durum                                      | `/discover?q=zzzzzzz`               |
| 12  | Hata durumu                                    | uç 502 döndürecek şekilde kesilir   |

Her karşılaştırmada bakılacaklar: kolon genişlikleri (276 / kalan / 326) · yarıçaplar · bant ve
tile hizası · tipografi ağırlık ve boyutu · boşluklar · ton eşleşmesi · metinlerin birebirliği.

Sapma **piksel farkı** olarak değil, **hangi ölçünün yanlış olduğu** olarak raporlanır
(`serverCard.tile.marginTop 19 yerine 16 çizilmiş`).

---

## 2. Çözünürlük matrisi

1360×920 · 1600×900 · 1920×1080 · 2560×1440 · 3840×2160 · 5120×1440 — her biri açık ve koyu.

Her boyutta: yatay kaydırma yok · metin kırpılmıyor · başlık tek satırda · öne çıkan blok
sarmıyorsa taşmıyor · ızgara kolon sayısı doğal artıyor · panel açıkken ızgara tek kolona
düşüyor · ölçek adımı beklenen değerde (`getComputedStyle(document.documentElement).fontSize`).

---

## 3. e2e

`discover.spec.ts`:

1. `/discover` açılıyor, dizin kolonu 6 kategori ve doğru sayaçlarla çiziliyor
2. Kategori seçimi URL'i değiştiriyor, ızgara süzülüyor, öne çıkan blok gizleniyor
3. Sıralama seçimi URL'i değiştiriyor ve listeyi yeniden sıralıyor
4. Dört şerit sekmesi de kendi kart dilini çiziyor
5. Arama 250 ms sonra tetikleniyor (daha erken istek yok), sonuç yoksa boş durum
6. Kart `Önizle` paneli açıyor; panel açıkken şerit sekmeleri ve ikon grubu DOM'da yok
7. `Esc` önce modalı, sonra paneli kapatıyor
8. Katılma: kart `Katıl` → onay şeridi çıkıyor, sunucu rayında ve `Sunucularım` listesinde
   `Yeni` etiketiyle görünüyor, kart `Katıldın` oluyor
9. Geri tuşu: kategori → şerit → arama zinciri geri sarılıyor
10. Kart boyutu ikonu ızgarayı değiştiriyor ve sayfa yenilendiğinde tercih korunuyor

`discover-a11y.spec.ts`: `axe` taraması (kritik/ciddi sıfır) · klavye ile dizin kolonundan
ızgaraya, karttan panele, panelden modala tam tur · odak dönüşleri.

Mevcut e2e altyapısı kullanılır (`apps/web/e2e/helpers/*`); yeni fixture yazılmaz, gerekiyorsa
`db.ts` yardımcısına keşfedilebilir sunucu tohumlama eklenir.

---

## 4. Performans ölçümü

- İlk ızgara boyaması: dizin kolonu ızgaradan **önce** görünüyor mu (Performance timeline)
- 200 kartlık listede kaydırma: kare düşüşü var mı → varsa sanallaştırma ayrı iş olarak açılır
  (Ş6 §5 kararı)
- Arama: 250 ms debounce doğrulanır, tuş başına istek yok
- `online` sıralaması: havuz kesme logu tetikleniyor mu ve kullanıcıya sessiz bir yalan
  söylenmiyor mu

---

## 5. Kabul kriterleri (PROMPT.md'den birebir)

- [ ] Sol taraf (sunucu rayı, gezinme paneli, kullanıcı barı) hiç değişmedi; diff yalnızca Keşfet
      bölgelerine, rota bağlantısına ve katılma mutasyonuna dokunuyor
- [ ] Gezinme panelindeki `Keşfet` satırı aktif
- [ ] Katıldıktan sonra sunucu hem rayda hem `Sunucularım` listesinde `Yeni` etiketiyle görünüyor;
      onay şeridi ve kart durumu aynı anda güncelleniyor
- [ ] Dizin kolonu 276 px: arama, 6 kategori satırı (doğru iki harfli tile, ad ve sayı),
      3 sıralama satırı, alt davet kartı
- [ ] Şerit sekmeleri dördü de çalışıyor ve her şerit kendi kart dilini kullanıyor
- [ ] Öne çıkan blok yalnızca Sunucular + Tümü + arama boş durumunda; detay paneli açıldığında
      gizleniyor; dar genişlikte sarıyor, metin sıkışmıyor
- [ ] Sunucu kartı: 46 px kategori bandı, 44 px tile 3 px `surface-card` halkayla banda oturuyor,
      çevrimiçi/üye satırı, açıklama, etiketler, `Katıl` + `Önizle`. Katılınca buton `Katıldın` ve
      kenar `--success/0.4`
- [ ] Hiçbir sunucu adının yanında mavi doğrulama ikonu yok
- [ ] Sunucu profili paneli 326 px: üstte `Sunucu profili` etiketi + kategori pili + kapat;
      54 px tile arka planla çakışmıyor; 3 kutulu istatistik ızgarası; `Kanallar` listesi;
      `Tanıdıkların` satır listesi (avatarlar üst üste binmiyor); alt CTA
- [ ] Katıl modalı 496 px: davet kodu alanı (`whispr.app/` öneki + `Yapıştır`), ayırıcı,
      3 dizin seçeneği radio, görünürlük anahtarı; `Esc` kapatıyor
- [ ] Başlık tek satırda kalıyor; detay paneli açıkken şerit sekmeleri ve ikonlar gizleniyor
- [ ] Filtre şeridi yalnızca aktif filtre varken; boş ve hata durumları tasarımdaki metinlerle
      birebir (hata kodu satırı dâhil)
- [ ] Tema anahtarı çalışıyor; dört çözünürlükte kırpma yok
- [ ] Tüm metinler birebir; placeholder/lorem yok. Tip kontrolü, lint ve testler geçiyor

Ek kapılar (bu paketin kendi kuralları):

- [ ] `components/discover/**` içinde arbitrary px sınıfı sıfır
- [ ] `components/discover/**` içinde hex renk sıfır, sabit font adı sıfır
- [ ] Yeni token üretilmedi (`--info` zaten vardı)
- [ ] Uydurma endpoint çağrısı yok; her karşılıksız alan `TODO(api):` ile işaretli ve raporda
- [ ] `pnpm --filter @wizards/web typecheck` · `lint` · `test` yeşil
- [ ] `pnpm --filter @wizards/mobile typecheck` yeşil (paylaşılan `@wizards/types` değişti)

---

## 6. Rapor

`raporlar/11-parity-rapor.md` şunları içerir: 12 durumun karşılaştırma tablosu (geçti/sapma) ·
kapatılan sapmaların listesi · kapatılmayan sapmalar ve gerekçesi · `TODO(api):` envanteri ·
ölçüm çıktıları (kontrast, ilk boyama, kaydırma) · Ş1 §6 (öne çıkan sunucunun ızgarada da
görünmesi), Ş6 §1 (kart üzerinden ayrılmanın onay istememesi) ve Ş8 §1.3 (görünürlük anahtarının
ürün karşılığının olmaması) kararlarının kullanıcıya sorulmak üzere derlenmiş hâli.
