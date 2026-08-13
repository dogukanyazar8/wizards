# Faz 4: Bölgesel Biçim ve Arayüz Yoğunluğu Tasarımı

## Kapsam

Bu belge, onaylı beş fazlı hesap ayarları tasarımındaki Faz 4'ü ayrıntılandırır. Web aynı React yüzeyini kullanan tarayıcı ve Tauri desktop'ı, mobile ise iOS ve Android'i kapsar.

Kullanıcı şu sunucu destekli tercihleri yönetir:

- Saat dilimi: `AUTO` veya doğrulanmış IANA adı.
- Tarih: `LOCALE`, `DMY`, `MDY`, `YMD`.
- Saat: `LOCALE`, `H12`, `H24`.
- Yoğunluk: `COMFORTABLE`, `COMPACT`.

## Karar

Tek bir saf `@wizards/types` adaptörü tarih/saat biçimleme, saat dilimi çözümleme, deterministik örnek üretme ve density metriklerini tanımlar. Web ve mobile yalnız platform sunumunu uygular. Böylece aynı instant ve tercih iki platformda aynı semantik sonucu üretir; API sözleşmesi veya veri tabanı değişmez.

Alternatifler:

- Platform başına formatter: daha az ilk bağlantı, fakat DST/locale ve hata davranışında drift üretir; reddedildi.
- Bütün repodaki tarih yüzeylerini tek seferde dönüştürmek: Faz 4 riskini gereksiz büyütür; reddedildi.
- Önerilen: ortak adaptör ve açık desteklenen yüzeyler. Mesaj zamanları, tarih ayraçları, bildirimler, oturumlar ve hesap ayarları Faz 4 kapsamındadır. Admin/audit, auth ve pazarlama yüzeyleri kapsam dışıdır.

## Ortak formatter sözleşmesi

- `AUTO`, çalışma anındaki sistem saat dilimini çözer; sistem değeri yok/geçersizse `UTC` güvenli varsayılandır.
- Açık IANA tercihi doğrulanır. UI listesi yalnız geçerli değer üretir; adaptör yine de bozuk cache/veride çökmez ve `UTC`'ye döner.
- Geçersiz instant kullanıcıya ham `Invalid Date` veya exception sızdırmaz; nötr yer tutucu döndürür.
- Açık tarih sıraları `Intl.DateTimeFormat#formatToParts` parçalarıyla kurulur; locale rakamlarını korur.
- `H12`/`H24`, `hourCycle` ile zorlanır. `LOCALE`, locale varsayılanını kullanır.
- Önizleme instant'ı sabittir; seçilen zone/locale/format değişince yeniden hesaplanır.
- Saat dilimi listesi `Intl.supportedValuesOf("timeZone")` varsa kullanır. `UTC`, sistem ve mevcut değer eklenir; eksik runtime'da güvenli çekirdek liste vardır.

## Yoğunluk sözleşmesi

- Ortak metrikler bölüm/row boşluklarını ve kontrol yüksekliğini tanımlar.
- `COMPACT` yalnız boşlukları azaltır; web odak alanları ve mobile dokunma hedefleri en az 44 px kalır.
- Web shell kökünde `data-interface-density` ve CSS değişkenleri uygulanır.
- Mobile provider seçili density'yi paylaşır; desteklenen liste/ayar yüzeyleri aynı metrikleri kullanır.
- Yoğunluk metin boyutunu küçültmez, içerik gizlemez ve bilgi mimarisini değiştirmez.

## Web/Tauri tasarımı

- Hesap > Tercihler içinde dilin yanında bölgesel tercihler bulunur.
- Saat dilimi kontrolü klavye ile aranabilen combobox/listbox'tır; `AUTO` ilk seçenektir, uzun IANA adları kırpılmadan erişilebilir adla sunulur.
- Tarih ve saat için native select kontrolleri kullanılır; her seçenek yanında sabit instant örneği vardır.
- Ayrı Görünüm ve erişilebilirlik kartında iki density seçimi ve küçük yerleşim örneği vardır.
- Kaydetme mevcut optimistic React Query mutation'ını kullanır; hata halinde cache geri alınır ve canlı hata mesajı gösterilir.
- Tauri ek köprü gerektirmez; web ayar/API akışını aynen kullanır.

## Mobile tasarımı

- Hesap ekranında Bölgesel tercihler ve Görünüm/erişilebilirlik bölümleri eklenir.
- Saat dilimi ayrı tam ekran modalda `FlatList` ile sanallaştırılır; arama, boş sonuç, seçili işareti ve `AUTO` bulunur.
- Tarih, saat ve density mevcut native-feel `OptionSheet` bileşenini kullanır; tarih/saat seçenekleri yerel örnek taşır.
- `AUTO`, uygulama tekrar active olduğunda sistem saat dilimini yeniden çözer.
- Optimistic mutation mevcut query katmanını kullanır; başarısızlıkta önceki değer görünür kalır.
- Compact görünümde her etkileşimli satır en az tema `minTouchTarget` değerindedir.

## Test ve kabul

- Ortak: DST ileri/geri sınırı, invalid zone/instant, locale, açık tarih sıraları, H12/H24, liste fallback'i ve density minimumları.
- Web: surface sözleşmesi, klavye/ARIA time-zone kontrolü, deterministic örnek, optimistic patch, shell density niteliği.
- Mobile: sanallaştırılmış arama listesi, sheets, patch, `AUTO` yeniden çözümleme ve 44 px minimum.
- Görsel durum sözleşmesi light/dark ile iki density kombinasyonunu test fixture/snapshot seviyesinde kapsar; gerçek cihaz görsel kabul ayrı kanıt sınıfıdır.

## Güvenlik ve performans

- Sunucu mevcut Zod + IANA doğrulamasını korur; istemci doğrulaması yetkilendirme veya trust boundary değildir.
- Kullanıcı girdisi HTML olarak basılmaz. Arama salt yerel, case-insensitive filtrelemedir.
- Saat dilimi listesi bir kez memoize edilir; render başına yeniden oluşturulmaz.
- Mesaj satırlarında formatter nesnesi/çözümlenmiş tercihler provider düzeyinde memoize edilir.
- Yeni bağımlılık, migration veya dış servis yoktur.
