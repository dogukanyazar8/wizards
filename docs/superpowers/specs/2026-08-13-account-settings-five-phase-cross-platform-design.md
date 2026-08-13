# Hesap Ayarları — Beş Fazlı Web ve Mobile Tasarım Planı

## Durum

- Durum: Onay bekliyor
- Tarih: 2026-08-13
- Hedef: Her özelliği backend, web tasarımı ve mobile tasarımıyla aynı fazda tamamlamak
- Desktop: Tauri, web ayar yüzeyini kullandığı için web tasarımının desktop runtime durumları ayrıca doğrulanır.

## Değişmez Teslim Standardı

Her faz aşağıdaki parçaların tamamını içerir:

1. Veri modeli ve API davranışı.
2. Web bilgi mimarisi ve production UI uygulaması.
3. Mobile bilgi mimarisi ve production UI uygulaması.
4. Platforma uygun etkileşim: web'de dialog/select/popover; mobile'da screen/sheet/native control.
5. Türkçe ve İngilizce içerik.
6. Loading, empty, error, offline, pending, success ve destructive-confirmation durumları.
7. Klavye/focus, ekran okuyucu, minimum dokunma alanı, kontrast ve reduced-motion uyumluluğu.
8. Light/dark tema, web responsive boyutlar ve desteklenen mobile ekran boyutları.
9. Unit/contract/component/integration testleri.
10. Web görsel regresyonu ile mobile emulator/device görsel kabulü; bunlar fonksiyon testinden ayrı raporlanır.

Backend davranışı tamamlanmamış kontrol görünür veya tıklanabilir yapılmaz. “Önizleme” rozetiyle sahte özellik tutulmaz. Bir özellik kendi fazında uçtan uca hazır olduğunda görünür olur.

## Ortak Tasarım İlkeleri

- Web ve mobile aynı ayar adını, değerlerini, açıklamasını ve server-backed durumu kullanır.
- Piksel kopyası zorunlu değildir. Aynı ürün dili, platforma doğal yerleşim zorunludur.
- Ayarlar kategori temelli: Hesap, Güvenlik, Gizlilik, Bölgesel Tercihler, Erişilebilirlik/Görünüm, Veri ve Hesap.
- Satır yapısı: başlık, kısa sonuç odaklı açıklama, mevcut değer/durum, eylem.
- Riskli eylemler normal tercihlerden görsel ve yapısal olarak ayrılır.
- Save-on-change tercihler optimistic olabilir; hata halinde önceki server değeri geri yüklenir ve erişilebilir hata gösterilir.
- Destructive işlemler optimistic değildir.
- Aynı API sözleşmesine rağmen web ve mobile navigation bağımsızdır; route/sheet ayrımı platforma göre yapılır.
- Server tek doğruluk kaynağıdır. Device-local ayarlar yalnız gerçekten cihaza özgü olduğunda yerel kalır.

## Faz 1 — Ayar Temeli ve Çapraz Platform Kabuk

### İşlev

- `profileVisibility`, `presenceVisibility`, `timeZone`, `dateFormat`, `timeFormat`, `interfaceDensity` veri modeli ve ortak sözleşmeleri.
- Web settings GET/PATCH genişletmesi.
- Eski strict mobile account response'u bozmayan yeni mobile preferences GET/PATCH.
- Additive migration, doğrulama, export schema ve rollback temeli.

### Web tasarımı

- Ayarlar ekranı kategori hiyerarşisi yeniden düzenlenir.
- Desktop geniş görünüm: sabit kategori sidebar + içerik paneli.
- Dar web görünümü: kategori listesi + detay görünümü; geri navigasyonu.
- Mevcut gerçek kontroller yeni row/card sistemine taşınır.
- Sonraki fazların aktif olmayan preview satırları kaldırılır; yerine sahte kontrol gösterilmez.
- Ortak bileşen sözleşmeleri: preference row, select row, switch row, status badge, destructive action card, inline feedback.

### Mobile tasarımı

- Mobile ayarlar ana ekranı ve kategori detay ekranları aynı bilgi mimarisine uyarlanır.
- Preference seçimi için erişilebilir bottom sheet veya ayrı seçim ekranı standardı.
- Native back davranışı, safe-area, keyboard ve offline/pending geri bildirim standardı.
- Mevcut gerçek kontroller yeni row/card sistemine taşınır.
- Sonraki fazların aktif olmayan preview satırları gösterilmez.

### Faz 1 kabulü

- Teknik sözleşme ve iki platformun production ayar kabuğu hazır.
- Yeni altı tercih API'de saklanabilir; fakat davranışı uygulanmayan kontroller UI'da görünmez.
- Web/mobile shell görsel ve erişilebilirlik kabulü ayrı tamamlanır.

Detay sözleşme: `2026-08-13-account-preferences-phase-1-design.md`.

## Faz 2 — Aktif Oturumlar ve Cihazlar

### İşlev

- Web, desktop ve mobile oturumlarını temsil eden güvenilir session registry.
- Cihaz/tarayıcı/işletim sistemi, yaklaşık konum veya IP gösterimi için gizlilik sınırları.
- Mevcut oturumu ayırt etme.
- Tek oturumu kapatma ve diğer tüm oturumları kapatma.
- Revoke sonrası access/refresh/session etkisinin gerçekten uygulanması.

### Web tasarımı

- Güvenlik kategorisinde cihaz listesi.
- Mevcut cihaz vurgusu; son etkinlik, cihaz türü ve güvenli konum özeti.
- Satır bazlı revoke; “diğer tüm oturumları kapat” destructive confirmation dialog'u.
- Empty, partial-data, loading, revoke-pending, success ve error durumları.

### Mobile tasarımı

- Güvenlik detayında cihaz kartları veya liste satırları.
- Cihaz detay sheet'i; mevcut cihazda self-revoke güvenli yönlendirmesi.
- “Diğer tüm oturumları kapat” native confirmation ve yeniden giriş sonucu.
- Küçük ekran, uzun cihaz adı ve erişilebilir tarih gösterimi.

### Faz 2 kabulü

- Her iki platform aynı session kaydını gösterir.
- Revoke yalnız UI'dan kaybolmaz; token/session gerçekten geçersiz olur.
- Web ve mobile destructive akış testleri, runtime smoke ve görsel kabul geçer.

## Faz 3 — Profil ve Çevrimiçi Görünürlüğü

### İşlev

- Profil görünürlüğünün bütün profil okuma/search/suggestion noktalarında merkezi uygulanması.
- Presence görünürlüğünün socket broadcast, cache, friends/shared-server ve profile payload noktalarında merkezi uygulanması.
- Block ve `INVISIBLE` kuralları preference'tan üstün.
- Cache invalidation ve realtime convergence.

### Web tasarımı

- Gizlilik kategorisinde iki ayrı gerçek seçim kontrolü.
- `Herkes`, `Arkadaşlar`, `Hiç kimse` açıklamaları; her seçimin etkisini açık söyler.
- Save pending, rollback ve güvenli hata mesajı.
- Başka kullanıcı profillerinde izin yoksa veri sızdırmayan restricted/not-found davranışı.

### Mobile tasarımı

- Gizlilik detayında aynı iki server-backed kontrol.
- Seçim bottom sheet'i; seçenek açıklamaları ve seçili durum.
- Eski AsyncStorage görünürlük değerleri sunucuya taşınmaz; başarılı server okuması sonrası temizlenir.
- Offline/pending durumda gerçek server değeriyle çelişen kalıcı başarı gösterilmez.

### Faz 3 kabulü

- Web ve mobile aynı tercihi okur/yazar.
- İzin verilmeyen profil/presence veri yollarında içerik, custom status veya zaman bilgisi sızmaz.
- Realtime, cache, çoklu cihaz, block ve `INVISIBLE` testleri geçer.
- UI ancak enforcement ile aynı dağıtımda görünür olur.

## Faz 4 — Saat Dilimi, Tarih/Saat Biçimi ve Yoğunluk

### İşlev

- `AUTO` veya doğrulanmış IANA zaman dilimi.
- `LOCALE | DMY | MDY | YMD` tarih biçimi.
- `LOCALE | H12 | H24` saat biçimi.
- `COMFORTABLE | COMPACT` arayüz yoğunluğu.
- Ortak formatter adaptörü; DST ve locale davranışı.
- Density token'larının desteklenen yüzeylerde merkezi uygulanması.

### Web tasarımı

- Bölgesel Tercihler kategorisinde time zone arama/select, tarih ve saat biçimi seçimleri.
- Her format için canlı fakat deterministik örnek.
- Görünüm/Erişilebilirlik kategorisinde density seçimi ve küçük yerleşim önizlemesi.
- Klavye ile aranabilir time zone kontrolü; uzun IANA adları ve dar ekran desteği.

### Mobile tasarımı

- Time zone için aranabilir tam ekran seçim veya sanallaştırılmış liste.
- Tarih/saat formatı için native-feel sheet; yerel örnekler.
- Density seçimi; dokunma hedeflerini accessibility minimumunun altına düşürmez.
- Sistem time zone değişikliği ve `AUTO` durumunda yeniden hesaplama.

### Faz 4 kabulü

- Desteklenen web/mobile yüzeyleri aynı instant'ı seçilen zone/format ile gösterir.
- DST sınırları, invalid zone, locale değişimi ve 12/24 saat testleri geçer.
- Compact density içerik kaybı, taşma veya küçük dokunma hedefi üretmez.
- Web ve mobile görsel regresyonları light/dark ve iki density için geçer.

## Faz 5 — Veri Dışa Aktarma ve Hesap Silme

### İşlev

- Mevcut data-export backend'inin UI'ya bağlanması.
- Büyük export için bellek/timeout sınırına göre streaming veya job tabanlı güvenli teslim.
- Hesap silme backend'inin purpose-bound reauth ve confirmation akışıyla bağlanması.
- Owned-server engeli, revoke, anonymization ve hata davranışı.

### Web tasarımı

- Veri ve Hesap kategorisinde ayrı export ve danger zone kartları.
- Export hazırlama/indirme/hata/yeniden deneme durumları.
- Silme öncesi sonuç özeti; owned-server blocker; reauth; exact confirmation; son onay dialog'u.
- Silme başladıktan sonra çift submit engeli ve güvenli çıkış durumu.

### Mobile tasarımı

- Export oluşturma ve platform share/download akışı.
- Uzun süren export için uygulama yeniden açıldığında durum devamlılığı.
- Hesap silme ayrı full-screen destructive flow; keyboard/safe-area desteği.
- Reauth, exact confirmation ve owned-server blocker için erişilebilir hata/yardım içeriği.

### Faz 5 kabulü

- Export her iki platformdan başlatılabilir; yetkisiz kullanıcı başka hesabın verisini alamaz.
- Büyük hesap export'u ölçülmüş bellek ve süre sınırlarını aşmaz.
- Silme işlemi reauth olmadan başlamaz; hata halinde kısmi/yanıltıcı başarı gösterilmez.
- Web/mobile destructive E2E, backend karakterizasyonu ve görsel kabul geçer.

## Fazlar Arası Teslim Kapısı

Bir faz şu dört kanıt ayrı ayrı mevcut olmadan tamamlanmış sayılmaz:

- Backend/contract: test ve migration kanıtı.
- Web: fonksiyon + accessibility + responsive + görsel kabul.
- Mobile: fonksiyon + native navigation + emulator/device + görsel kabul.
- Runtime: UAT smoke; source ve local test kanıtından ayrı.

Bir platform eksikse faz “kısmi” kalır. Web hazır diye mobile, mobile hazır diye web tamamlanmış sayılmaz.

## Onayla Kilitlenecek Kararlar

1. Her faz web ve mobile production UI içerir.
2. Platformlar aynı sözleşmeyi, platforma doğal farklı yerleşimlerle sunar.
3. Preview/fake kontrol yok; davranış hazır olmadan kontrol görünmez.
4. Faz 1 ayar kabuğunu iki platformda yeniden tasarlar; yeni davranış kontrollerini kendi fazlarına bırakır.
5. Fonksiyon, accessibility, görsel kabul ve UAT kanıtları ayrı raporlanır.
6. Desktop, web tasarımının Tauri runtime varyantı olarak doğrulanır.

Onaydan sonra önce Faz 1 için uygulama planı hazırlanır. Faz 2–5 kendi başlangıcında ayrı dar uygulama planı ve onay kapısı alır.
