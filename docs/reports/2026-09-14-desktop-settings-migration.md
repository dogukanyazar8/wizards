# Masaüstü ayarlarının birleştirilmesi

## Teslim edilen kapsam

- Başlangıç, pencere kapanışı ve cihazda oyun algılama doğrudan Ayarlar → Masaüstü → Uygulama ekranında.
- Global kısayollar: etkinleştirme, fiziksel tuş yakalama, atamayı silme, yerel doğrulama, kaydet/iptal ve varsayılana sıfırlama. Kayıt işletim sistemi üzerinden yapılır; başarısız yazma mevcut değerleri değiştirmez. Ses çalışma zamanı başarılı değişiklikle hemen eşitlenir.
- Güncelleme kontrolü ve onaylanan sürümü yükleyip yeniden başlatma. Kontrol edilmeden “güncel” gösterilmez. Onay penceresi uygulamanın ortak modalını kullanır.
- Tanı paketi dışa aktarma; mini ses penceresi, oyun katmanı ve ana pencere kurtarma kontrolleri aynı bölümde.
- Bildirim testi, mevcut cihaz izinleri ve işletim sistemi ayarlarına geçiş korunur.
- Ortak sorgu önbelleği sekme açılışında bilinen değerleri korur. Arka plan okuması hata verdiğinde seçenekler kaybolmaz. Yerel yazmalar aynı anda çalıştırılmaz; eski okuma sonucu başarılı yazmayı geri alamaz.
- Eski bağımsız ayar arayüzü kaldırıldı. Yerel pencere yalnız mikrofon/kamera onayı için kullanılır; onaydan sonra gizlenir.

## Güvenlik ve uyumluluk

Kullanıcının onayladığı mimari değişiklikle ana pencereye sekiz belirli Whispr komutu tanımlandı. Rust, pencere etiketi ve yapılandırılmış uygulama adresinin origin bilgisini doğrular. OAuth adresleri, farklı protokol/port, benzer alan adları ve URL kimlik bilgileri reddedilir. Genel dosya sistemi, işlem başlatma veya güncelleyici eklenti yetkileri açılmadı.

Mikrofon/kamera onayını sonuçlandırma yetkisi yalnız ağ erişimi olmayan yerel pencerede kalır. Bu pencerenin yetkileri durum okuma ve onay sonucunu gönderme ile sınırlandı.

Pencere kurtarma mevcut işçi kuyruğunu kullanır. Kısayol düzenleme ekranı odaktayken kayıtlı global tuşların basma olayları ses işlemlerini tetiklemez; bas-konuş bırakma olayları işlenmeye devam eder.

Native komut ve capability değişiklikleri masaüstü uygulamasının yeniden derlenmesini/başlatılmasını gerektirir. Sunucu migrasyonu veya yeni bağımlılık yok.

## Doğrulama

- PASS: Web bölüm, önbellek, eşzamanlı yazma, istemci ve kısayol testleri: 44.
- PASS: Masaüstü yetki sınırı, yerel onay ve mevcut kısayol sözleşmesi testleri: 11.
- PASS: Windows üzerinde Rust kitaplık testleri: 50; derleme başarılı.
- PASS: Değişen masaüstü ayar dosyalarında ESLint; Rust biçim kontrolü.
- Genel Web TypeScript kontrolü bir ara geçti; son çalışma alanı kontrolü, bu işte değiştirilmeyen `apps/web/src/components/chat/message-media-preferences.test.tsx:22` dosyasında eksik `onRemoveOptimistic` ve `onRetry` test özellikleri nedeniyle başarısız. Masaüstü ayar dosyalarında tip hatası raporlanmadı.
- Geniş ayar kanıt testinde 2 hata: mevcut görünüm satırı envanteri ve devre dışı görünüm satırları sözleşmesi uyuşmuyor. Masaüstü `q1` kaydı yeni etkin davranışa güncellendi; ilgisiz beklentiler değiştirilmedi.
- NOT RUN: Gerçek Tauri arayüzünde görsel/etkileşim kabulü; Windows OS başlangıcı, bildirim, güncelleme kurulumu ve global tuş kaydı kabulü; macOS/Linux derleme ve cihaz testleri. Birim/sözleşme testleri bu kabul testlerinin yerine geçmez.

## Additional observations

- **medium:** `apps/desktop/src-tauri/src/lib.rs`, `desktop_control_recover` içindeki `RefreshOverlay`, mevcut davranışıyla oyun katmanını varsayılan boyut/konuma taşır. Seçili özel yerleşim geçici olarak değişebilir. Taşıma kapsamında davranış değiştirilmedi.
