# A5 — Hata avı: kod hataları + UI/işlevsel kusurlar

Ön koşul: `00-ortak-baglam.md` okundu.
Çıktı: `raporlar/A5.findings.json` + `raporlar/A5-rapor.md`.

## Amaç

Kullanıcının karşılaşacağı **somut yanlış davranışları** bulmak. `A1`–`A4` yapıyı ölçer; bu eksen ürünü kırar. Her bulgu bir kullanıcı cümlesiyle başlar: "X yaparsam Y oluyor, oysa Z olmalı."

Ölçüt: bir bulgu, geliştiriciye verildiğinde **başka soru sormadan** üretilebilir olmalı.

## Tohum sorgular

```bash
graphify query "optimistic update and cache reconciliation" --budget 8000
graphify explain "unread counter"
graphify explain "presence state"
graphify query "error handling and retry on network failure" --budget 8000
graphify query "empty and loading states in screens" --budget 8000
graphify path "apps/web/src/components" "apps/mobile/src/app/screens"
```

## Kapsam matrisi

| Yüzey                   | Birim                                               | Hedef kapsam                      |
| ----------------------- | --------------------------------------------------- | --------------------------------- |
| Mobil ekranlar          | `apps/mobile/src/app/screens` tamamı                | %100 dosya listesi, 20 ekran elle |
| Web sayfa/bileşen       | `apps/web/src/app` rota ağacı + `components`        | %100 rota, 20 bileşen elle        |
| Paylaşılan akışlar      | 10 kritik akış (aşağıda)                            | %100                              |
| Yerelleştirme           | `apps/mobile/src/locale`, `apps/web/src/lib/locale` | %100 anahtar karşılaştırması      |
| Desktop kabuk davranışı | `lib.rs` pencere/overlay/updater yolları            | %100                              |

### On kritik akış

Her akış üç yüzeyde (web, mobil, desktop kabuk farkı varsa) izlenir. Akışın her adımında dört durum sorulur: **boş, yükleniyor, hata, çevrimdışı.**

1. Kayıt → e-posta doğrulama → ilk açılış
2. Sunucu kur → kanal aç → davet üret → davetle katıl
3. Kanal mesajı gönder → düzenle → sil → tepki → yanıt/thread
4. DM aç → grup DM kur → sistem mesajı → sessize al/gizle
5. Ses odasına gir → mikrofon/kamera → ekran paylaş → çık
6. Bildirim: rozet artışı → bildirime dokun → doğru ekrana iniş → rozet düşüşü
7. Profil: durum değiştir (Görünmez dahil) → not/banner düzenle → başkasının profilini aç
8. Arama: mesaj/kişi/sunucu arama, sonuç yok, çok sonuç
9. Keşif: topluluk listele → profil kartı → katıl → ayrıl
10. Oturum: arka plana al → uzun süre bekle → dön → token yenile → çıkış yap

## Aranacak kusur sınıfları

### 1. Eşzamanlılık ve durum

- **Yarış**: iki olayın sırası garanti değilken sıraya bağlı yazma (socket olayı vs HTTP yanıtı, iyimser güncelleme vs sunucu yanıtı).
- **Çift yazıcı**: aynı durumu iki katmanın yazması (soket köprüsü + query invalidation) — hangisi kazanır, kaybeden veriyi geri getirir mi?
- Kaçırılan `await`, yüzen promise, `useEffect` içinde iptal edilmeyen istek (unmount sonrası setState).
- Yeniden giriş (re-entrancy): kullanıcı butona iki kez basarsa iki kayıt/iki katılım/iki gönderim oluşur mu? İdempotans anahtarı (`clientNonce` gibi) var mı, tüm gönderim yollarında mı?
- Zamanlayıcı sızıntısı: ekran değişince temizlenmeyen interval/timeout/abonelik.

### 2. Önbellek ve senkronizasyon

- İyimser güncelleme geri alınıyor mu (hata durumunda)? Geri alınırken kullanıcıya ne gösteriliyor?
- Query anahtarı tutarsızlığı: aynı veriyi iki farklı anahtarla tutan ekranlar → biri güncellenir, diğeri bayat kalır. Bu repoda daha önce görülen aile; anahtar listesini çıkar ve çakışanları ara.
- Envanter listesi vs açık akış ayrımı: liste ekranı ile detay ekranı aynı kaydın farklı sürümünü gösterebiliyor mu?
- Sayaç tutarsızlığı: okunmamış sayacı, üye sayacı, tepki sayacı — kaynak tek mi, türetilmiş mi, telafi yolu var mı?
- Çevrimdışı → çevrimiçi geçişinde kuyruğa alınan işlerin sırası ve tekrarı.

### 3. Hata yönetimi

- Yutulan hata: `catch {}` ve `.catch(() => {})` sayımı ve konumu. Yutulan her hata bir sessiz kusur adayıdır.
- Kullanıcıya gösterilmeyen hata: istek başarısız ama arayüz "başarılı" gösteriyor ya da sonsuz iskelet (skeleton) kalıyor.
- Yeniden deneme: hangi işlemler tekrar denenebilir, tekrar denemenin yan etkisi var mı (çift mesaj)?
- Zaman aşımı: uzun süren yükleme/gönderim için üst sınır ve kullanıcıya çıkış yolu var mı? (Bu repoda daha önce aşamalı watchdog gerektiren yükleme kilitlenmesi görüldü.)

### 4. UI durumları ve gezinme

- Dört durum eksikliği: boş, yükleniyor, hata, çevrimdışı. Ekran ekran taranır; eksik durum bulgudur (`severity` en az `medium` eğer kritik akıştaysa).
- Geri gezinme: yığın çoğaltma (aynı ekranın iki kez yığında olması), derin linkten geri gelince yanlış ekran, donanım geri tuşu.
- Klavye: giriş alanı klavye altında kalıyor mu, gönderim sonrası odak, çok satırlı girişte yükseklik.
- Kaydırma: liste konumunun korunması (yeni mesajda zıplama), sayfalama sınırında tekrar/atlama, "en alta git" davranışı.
- Uzun içerik: çok uzun kullanıcı adı/kanal adı/mesaj, taşma, kırpma, RTL olmayan ama uzun kelime.
- Dokunma hedefi ve erişilebilirlik: 44pt altı hedefler, ekran okuyucu etiketi olmayan ikon butonlar, yalnız renkle taşınan bilgi, kontrast.
- Tema: koyu/açık modda okunamayan yüzeyler; `theme` token'ı yerine sabit renk kullanımı.
- Ölçek: sistem yazı tipi büyütmesinde bozulan yerleşimler; küçük ekran (360pt) ve tablet.

### 5. Platformlar arası ayrışma

`A1 §4`'ün kavram listesini burada **davranış** düzeyinde doğrula:

- Aynı eylem web'de ve mobilde farklı sonuç veriyor mu (mesaj gruplama süresi, okundu işareti, presence etiketi, tarih biçimi, sıralama)?
- Aynı metin iki tarafta farklı mı (`locale` anahtarları karşılaştırılır: bir tarafta olup diğerinde olmayan anahtarlar, aynı anahtarda ayrışan metin).
- Bir tarafta olan yeteneğin diğerinde sessizce olmaması (buton var ama işlevsiz, ya da hiç yok).
- Desktop kabuğun web'den ayrıştığı yerler: pencere durumu, bildirim, derin link, oyun overlay, dosya sürükle-bırak.

### 6. Sınır değerler ve veri kusuru

- Boş koleksiyon, tek eleman, tam sayfa sınırı (`take` sınırında kalan kayıt), silinmiş yazarın mesajı, ayrılan üyenin tepkisi.
- Tarih/saat: yerel saat vs UTC, "dün/bugün" hesabı, gece yarısı sınırı, cihaz saati yanlışsa.
- Sayı biçimlendirme ve çoğul kuralları (Türkçe çoğul/ek uyumu).
- Unicode: emoji, birleşik karakter, sıfır genişlikli karakter, çok uzun tek kelime.
- Null/undefined ayrımı: opsiyonel alanın "temizle" anlamı ile "dokunma" anlamının karışması (PATCH uçlarında klasik).

## Yöntem

1. **Statik tarama** ile aday üret (yukarıdaki desenler için `rg` sorguları).
2. **Kod okuma** ile adayı doğrula: kusurun gerçekleştiği tam koşulu bul.
3. **Çürüt**: bu koşulu engelleyen guard/test var mı? Varsa bulguyu düş.
4. Mümkünse **üret**: ilgili birim/bileşen testini geçici olarak koşarak (yeni test dosyası **yazmadan**, var olan testi çalıştırarak) veya `node -e` ile saf fonksiyonu çağırarak kusuru gözle. Üretilebilen kusur `confirmed`, üretilemeyen `probable`.

## Yapılmayacaklar

- Düzeltme yapmak. Tek satır bile.
- Yeni test dosyası eklemek (üretim için geçici çalıştırma serbest, dosya bırakmak yasak).
- Kozmetik tercih bildirmek ("bu renk daha iyi olur"). Kusur ölçütü: tutarsızlık, erişilemezlik, okunamazlık ya da tasarım kaynağından sapma.
- Zaten `A2`/`A3`'e ait bulguları burada tekrarlamak. Çakışma varsa tek yerde tut, diğerinde `impact` içinde adıyla an.

## Teslim

1. `raporlar/A5.findings.json` — her bulguda `failureScenario` **kullanıcı cümlesi** biçiminde.
2. `raporlar/A5-rapor.md`, ek olarak:
   - **Akış × durum matrisi**: 10 akış × {boş, yükleniyor, hata, çevrimdışı} — her hücre: tamam / eksik / bilinmiyor.
   - **Ayrışma tablosu**: davranış, web sonucu, mobil sonucu, doğru kabul edilen.
   - **Locale anahtar farkı**: yalnız web'de olan, yalnız mobilde olan, metni ayrışan.
3. Kritik akışta kullanıcıyı kilitleyen (ilerleyemediği) her kusur `severity: high` tabanıyla başlar.

## Kapı

`00 §8` üç kontrol + :

```bash
node -e "const f=require('./docs/prompts/platform-denetimi-2026-08/raporlar/A5.findings.json');const z=f.findings.filter(x=>!/[.!?]/.test(x.failureScenario||'')||x.failureScenario.length<40);console.log('bulgu',f.findings.length,'zayif senaryo',z.length,z.map(x=>x.id).join(','))"
```

`zayif senaryo 0` olmalı — başarısızlık senaryosu tek kelimelik olamaz.
