# Android UAT Cihaz Performans Benchmark Tasarımı

## Amaç

USB ile bağlı gerçek Android cihazda Whispr UAT release uygulamasını tekrar üretilebilir biçimde çalıştırmak; 10 cold start, 10 warm resume, 15 cache-hit sohbet açılışı, 8 ilk-açılış sohbeti ve 20 mesaj gönderimini ölçmek; paneldeki sonuçları makine-okunur ve insan-okunur artifact olarak üretmek.

## Sınırlar

- Hedef yalnız Android fiziksel cihaz ve `team.whispr.mobile` UAT release APK'dır.
- Cihaz USB ile güç alıyor. Bu, varsayılan preflight ihlalidir; kullanıcı onayıyla yalnız bu koşul `OVERRIDDEN` olarak rapora yazılır. Wi-Fi ve düşük güç modu yine zorunludur.
- Ölçüm uygulama içindeki gerçek startup, navigation ve send enstrümanlarından gelir. Emülatör, Metro veya sentetik zamanlayıcı ölçümü kabul edilmez.
- Rapor token, e-posta, kullanıcı kimliği, sohbet kimliği, mesaj içeriği, URL veya SSID içermez.
- UAT verisi yalnız ayrı test hesabı ve önceden sağlanmış UAT deep linkleriyle kullanılır. Runner veritabanına yazmaz veya hesap şifresi değiştirmez.
- GitHub self-hosted job tanımı eklenir; Windows makinede runner kaydı ve secret oluşturma dış sistem işlemidir. Yerel komut önce çalışır.

## Mimari

`mobile-performance-benchmark-report.ts` paneldeki altı percentile satırını, prefetch özetini, şifreli store durumunu, build ve cihaz sınıfını beyaz liste ile JSON'a dönüştürür. Performans paneli bu JSON'u erişilebilirlik etiketi olarak verir. Android runner yalnız panel açıkken UIAutomator XML'inden bu etiketi okur, JSON'u doğrular, sonra ham XML'i siler.

`mobile-device-performance.ts` ADB preflight, release APK doğrulaması, Maestro akışları, deep-link senaryoları ve artifact üretiminden sorumludur. Maestro kullanıcı davranışını sürer; Node runner zamanlayıcı, cihaz kontrolü, config doğrulama ve rapor toplamayı yapar. Hiçbiri metrikleri üretmez.

## Girdi ve Çıktı

Runner yalnız fixture’ın yazdığı git-dışı `.secrets/mobile-performance-benchmark.config.json` yolunu alır. Config; UAT giriş kimlik bilgilerini, cache-hit deep linkini, 8 benzersiz network deep linkini ve mesaj gönderilecek deep linki taşır. Bu dosya gizlidir, loglanmaz.

Artifact dizini `artifacts/mobile/performance/<UTC-run-id>/` olur:

- `report.json`: doğrulanmış ölçüm, preflight, commit ve build bilgisi.
- `report.md`: `PASS`, `FAIL`, `OVERRIDDEN`, `NOT RUN` özeti ile p50/p95/p99 tablosu.
- `performance-panel.png`: yalnız tanılama paneli görüntüsü.

## Davranış

1. Preflight tek `adb` cihaz, Wi-Fi, düşük güç, pil güç kaynağı, paket kurulumu ve release flag'ini doğrular.
2. `allowUsbPowered` config değeri yoksa USB güç `FAIL` ile durur. Varsa rapora `OVERRIDDEN` yazılır.
3. Runner girişten sonra doğrudan gerçek içeriği bekler; giriş ekranı görünürse kimlik bilgileriyle Maestro login akışı çalışır.
4. Cold start `force-stop` + launch ile 10 kez; warm resume Home + launch ile 10 kez yürür.
5. Cache-hit ve network deep-link akışları başarıyla içerik ekranına ulaştığını doğrular. Network listesi tam 8, benzersiz olmalıdır.
6. Mesaj akışı yalnız benchmark deep linkindeki 20, benzersiz, zararsız test mesajını gönderir.
7. Runner paneli açar, export etiketini okur, JSON şemasını doğrular, raporları yazar.

## Güvenlik ve Operasyon

- Rapor exportu hiç bir kullanıcı veya sohbet verisini serialize etmez.
- Config ve Maestro ortam değişkenleri hata çıktısına yazılmaz.
- Release doğrulaması debug APK ile yanlış baseline alınmasını engeller.
- GitHub workflow yalnız `workflow_dispatch` ve `self-hosted`, `windows`, `android-device` etiketli runner ile çalışır.
- UAT test hesabı/config yoksa runner `ENV BLOCKED` çıkarır; mevcut kullanıcı verisini seçmeye veya oluşturmaya çalışmaz.

## Doğrulama

- Report builder ve runner parserları node testleriyle test-first korunur.
- Panel component testi export etiketinin yalnız beyaz listeli veriyi taşıdığını doğrular.
- Maestro akışları gerçek release APK üzerinde çalışır.
- Son başarı, local test veya GitHub artifact değil; fiziksel cihaz artifact raporu ve canlı panel ekranıdır.
