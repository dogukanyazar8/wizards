# Hakkında ve masaüstü güncellemeleri

- Yenilik türü etiketlerinin metni, ortak genişlikteki etiketin yatay/dikey merkezine hizalandı.
- Hakkında `o3` ve Masaüstü `h1`, aynı `AppUpdateRow` bileşenini ve React Query durumunu kullanıyor. Sürüm ızgaraları da aynı başarılı kontrol zamanını okuyor.
- Masaüstü sürümü uygulama açıkken 30 dakikada bir, web dağıtımı mevcut 60 saniyelik aralıkla denetleniyor. Gizli sekmede periyodik sorgu yapılmıyor. Güncel sorgu sonucu ekran geçişlerinde yeniden istenmiyor.
- İndirme/kurulum yalnız kullanıcının “İndir ve kur” eylemi ve yeniden başlatma onayıyla başlıyor. Kurulum mevcut korumalı native komutu kullanıyor; onaylanan sürüm native tarafta tekrar doğrulanıyor. Otomatik kurulum eklenmedi.
- Çift tıklama ve ekran değişikliği ikinci kurulum başlatmıyor. Sunucu görüşmesi ve doğrudan arama, kurulumun başlatılmasını engelliyor. Kurulum hatası iki ekranda da görünür.
- Webde yeni build bulunduğunda “Yenile ve güncelle” gösteriliyor. Mevcut web güncelleme bildirimi ortak sorguyu kullanmaya devam ediyor.
- Güncelleyici kapalı bir masaüstü paketinde açıklayıcı durum gösteriliyor; başarılı kontrol yapılmadan güncel sürüm iddia edilmiyor.
- Türkçe ve İngilizce metinler eklendi. İlk sunucu çizimi ile istemci hidratasyonu aynı platform görünümüyle başlıyor.

## Doğrulama

- PASS: 50 odaklı test (sorgu paylaşımı, sürüm tespiti, hata, kurulum kilidi, native komut sözleşmesi, ayar bölümleri/blokları).
- PASS: web TypeScript; değişen kaynakların ESLint kontrolü; `git diff --check`.
- FAIL: ek olarak çalıştırılan `settings-screen-copy.test.ts` içinde 5 mevcut sözleşme uyumsuzluğu: eski sekme referansı, ses grubu/satır metinleri ve tüketilmeyen önceki ayar anahtarları. Yeni güncelleme metinleri iki dilde eşleşiyor. Bu kapsam dışında düzeltme yapılmadı.
- NOT RUN: gerçek masaüstü paketini indirme/kurma ve işletim sistemi üzerinde yeniden başlatma. Native komutlar testlerde taklit edildi.
- Görsel kabul: yerel sekme giriş ekranına yönlendi; kullanıcı kontrolü kendisinin yapacağını belirtti.

Test günlükleri yerel `.codex/about-update-tests.log`, `.codex/about-update-types.log`, `.codex/about-update-lint.log` ve `.codex/about-update-final-tests.log` dosyalarında.
