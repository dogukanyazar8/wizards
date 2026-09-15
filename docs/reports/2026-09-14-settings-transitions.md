# Ayarlar geçişleri — 14 Eylül 2026

## Değişiklik

- Rozetler, oturumlar, güvenlik olayları ve kurtarma kodu durumu ortak React Query önbelleğinden okunuyor. Sekmeye dönüş veriyi sıfırlamıyor; arka plan yenilemesi mevcut içeriği koruyor.
- Pencere içindeki bölüm/sekme değişiklikleri mevcut React penceresini koruyor. URL, arama hedefi ve geri/ileri eşleşmesi native History ile güncelleniyor. Doğrudan girişte sunucu rotası ve yetkilendirme devam ediyor. [Next.js History desteği](https://nextjs.org/docs/app/getting-started/linking-and-navigating#native-history-api).
- Hesap, görünüm, bildirim ve masaüstü değerleri mevcut veriden başlatılıyor; uzak güncellemeler boyamadan önce uygulanıyor. İlk okuma tamamlanmadan sahte varsayılan kontroller gösterilmiyor. Profil/avatar kaydı ortak hesap önbelleğini de güncelliyor.
- Ses/kamera cihaz listesi ortaklaştırıldı; tekrar girişte boş listeye dönmüyor. Cihaz değişimi ve pencereye dönüşte yenileniyor. Mikrofon/kamera yakalama yalnız kullanıcının başlattığı testte çalışıyor.
- Masaüstü sürüm bilgisi tekrar açılışlar arasında önbellekte kalıyor. Ağır kamera/mikrofon ekranları arka planda açık tutulmuyor.

## Doğrulama

- PASS: Web TypeScript (`pnpm.cmd exec tsc --noEmit`), değişen 25 TS/TSX dosyasında ESLint ve `git diff --check`.
- Odaklı 17 dosya: 205 test, 204 PASS / 1 FAIL. Ek pencere/registry kontrolleri: 19 test, 17 PASS / 2 FAIL. Toplam: 221 PASS / 3 FAIL. Yeni önbellek ve gezinme regresyonları geçti.
- Yerel giriş yapılmış web arayüzünde 23 ekran dolaşıldı: Hesabım 6, Görünüm 6, Bildirimler 7, Ses ve Video 3, Hakkında 1. İlk ziyaretlerde bildirim/paylaşım için yükleme görüldü; tekrar girişlerde içerik hazırdı. Rozetler → Görünüm → tarayıcı geri/ileri denemesinde rozet içeriği birebir korundu ve URL/seçili sekme eşleşti. Tam sayfa kapatma ana sayfaya döndü.
- Bu kontroller ilk kare/INP/FPS ölçümü değildir. İlk veri okuması, ilk JS parçası yüklemesi ve tam sayfa yenileme hâlâ yükleme gerektirebilir; önbellek kalıcı disk deposu değildir.
- NOT RUN: Tauri yerel ekranı, macOS/Linux cihazı, üretim build performans ölçümü. Masaüstünün ortak web yüzeyi kaynak ve bileşen testleriyle incelendi; beş masaüstü sekmesi tarayıcıda mevcut değil.
- ENV BLOCKED: `graphify update .` iki kez AST taramasını tamamladı; ikisinde de çıktı dosyasını değiştirme adımı `[WinError 5] Erişim engellendi: 'graphify-out\\.graph.tmp.json' -> 'graphify-out\\graph.json'` hatası verdi. Graphify sorgusu incelemede kullanıldı; grafiğin güncellendiği iddia edilmiyor.

## Additional observations

- minor — `av-device-select.test.tsx`: eski “Şu anda paylaşım yok” beklentisi, mevcut görüşme dışı “Paylaşım başlatmak için bir sesli görüşmeye katıl.” açıklamasıyla uyuşmuyor. Üretim paylaşım davranışı bu görevde değiştirilmedi.
- minor — `settings-sections.test.tsx`: e4/e5 için eski disabled beklentileri, önceki çalışma kapsamında etkinleştirilmiş kaynak seçimi kontrolleriyle uyuşmuyor.
- minor — `settings-window-state.test.ts`: sekiz kirli profil alanı beklentisi mevcut yedi alanlık sözleşmeyle uyuşmuyor. Bu eski beklentiler değiştirilmedi.
- medium — Yerel dar ekran ana sayfasında gezinme çekmecesi → hızlı menü → Ayarlar denemesi ayar rotasına ulaşmadı. Modal açılış/kapanış kabulü bu nedenle doğrulanamadı; doğrudan ayar rotası çalıştı. Kök neden bu görevde belirlenmedi.

Commit, push, deploy veya veritabanı işlemi yapılmadı.
