# Ş0.2 — 2026-09-17

Web/mobile gerçek RTP health: null bilinmeyenler, 2 saniye örnekleme; mobil mevcut 90 ms ticker /22. Gönderici start/60s/end özetleri mevcut client-health endpointine, 32 KiB UTF-8 sınırıyla gider. Yeni DB tablosu yok. Yanıt/kimlik/eski track yarışlarına generation guard; unmount temizliği. Kaynak başlığı/exe/kullanıcı kimliği telemetriye girmez.

Web çipi gerçek fps/yükseklik/limit sebebi; mobil fullscreen yalnız eşleşen track ölçümünü gösterir. Capture-start, ilk decoded-frame ve stop-cleanup ölçülür. İlk kare ölçümü 2s örneklemeye bağlı üst sınırdır; kesin render p95 ölçümü değildir.

PASS: web typecheck; web 8730 test, 8722 PASS, 8 SKIP; mobile 2004 test, component 39; types 653. Mobile typecheck PASS. Önceki Ş0.1 raporundaki 6 web type hatası giderildi. 4K seçeneği yerel disabled, klavye atlar; yetenek kapısını Ş1 açar.

Baseline: 01-s03-baseline-windows-headless.json. Sahte görüntü kaynağı + gerçek RTP/LiveKit; donanım kabulü değildir.
