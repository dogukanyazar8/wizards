# Hesap ayarları — 14 Eylül 2026

## Uygulanan kapsam

- **Emoji:** `@emoji-mart/data` yükleme ve indeksleme Web Worker'a taşındı. Eşzamanlı açılışlar tek yüklemeyi paylaşır; hata sonrası yeniden deneme var. 3395 emoji/varyant korunur, sayfa başına en fazla 72 emoji çizilir. Pencere, kapatma, seçim ve işlem düğmeleri ortak ayar bileşenlerini kullanır. Çoklu seçim, tek tek kaldırma ve 64 UTF-16 birim sınırı korunur.
- **Oyun:** paylaşım tercihi **Hesabım → Gizlilik** içinde kalır; cihazda algılama **Masaüstü → Uygulama → Oyun etkinliği** üzerinden güvenilen yerel Desktop Control ekranında açılır. Yerel algılama varsayılan olarak kapalıdır. Windows/macOS/Linux süreç okuyucusu; CS2, Valorant, LoL, Dota 2, Fortnite, PUBG, Minecraft, GTA V ve Apex Legends kimlikleri eklendi. Java için Minecraft istemcisi/sunucusu ayrımı yapıldı. Bu liste bütün oyunların bütün işletim sistemlerinde çalıştığı iddiası değildir.
- **Oyun gizliliği:** yalnız izin verilen oyun kimliği sunucuya gönderilir; süreç listeleri, komut satırları ve yollar cihazda kalır. Algılama arka plan işinde, en sık 15 saniyede; yayın 20 saniyede çalışır. Redis kaydı 70 saniyede sona erer. Tek etkin masaüstü sahipliği, durdurma, bağlantı kaybı, görünmez/çevrimdışı durum, engeller ve profil/durum görünürlüğü uygulanır. Web ve mobil profil kartları etkinliği gösterir. Ses bağlantısı gerekmez.
- **Okundu:** Web/Desktop ayarı mevcut mesaj gizliliği API'sine, mobil ayar aynı `showReadReceipts` kolonuna bağlandı. Kapalıyken halka açık okuma zamanı ilerlemez; kişisel okunmamış/bahsedilme sayaçları temizlenir. Geçmiş, grup okuma durumları ve mobil sohbet listesi kapalı kullanıcıların okuma bilgisini sunmaz; teslim bilgisi korunur.
- **Mobil uyumluluk:** eski istemcilerin katı şemasını bozmamak için yeni cevap alanı `x-whispr-account-fields: read-receipts` başlığıyla talep edilir. Eski sunucudan alan gelmezse yeni mobil arayüz seçeneği göstermez.
- **İçerik filtresi:** son kullanıcı kararıyla ayar satırı, boş içerik grubu, çevirileri ve uygulama tip sözleşmesindeki alan kaldırıldı. Model veya tarama servisi kurulmadı. Kullanılmayan eski kullanıcı DB kolonu/enum'u yerinde; veri silen migration yapılmadı. Ayrı sunucu moderasyonu kolonu bu kapsamda değiştirilmedi.

## Gözlenen doğrulama

| Kontrol                                                                                | Sonuç                               |
| -------------------------------------------------------------------------------------- | ----------------------------------- |
| Web emoji, okundu, ayar ağacı/bölümleri, mobil API uyumluluğu, masaüstü bileşen sınırı | **97/97 PASS**                      |
| Oyun hizmeti, gerçek yerel Redis                                                       | **6/6 PASS**                        |
| Mobil hesap istemcisi                                                                  | **8/8 PASS**                        |
| Mobil hesap ve profil kartı bileşenleri                                                | **34/34 PASS**                      |
| Paylaşılan ayar/hesap/mobil şemaları                                                   | **34/34 PASS**                      |
| Windows `cargo test --lib`                                                             | **49/49 PASS**                      |
| Desktop Control JavaScript güven sınırı/kısayol testleri                               | **8/8 PASS**                        |
| Web, mobil, types TypeScript kontrolleri                                               | **PASS**                            |
| Değişen davranışlara odaklı Web/mobil ESLint                                           | **PASS**                            |
| Kapsamlı dosya listesinde `git diff --check`                                           | **PASS**                            |
| `graphify update .`                                                                    | **PASS — 38951 düğüm, 92503 kenar** |

Toplam 236 odaklı test geçti. Bu, bütün depo testlerinin veya bütün cihazların doğrulandığı anlamına gelmez. Redis testlerinde Redis gerçektir; Prisma erişimi test çiftleriyle yürür, PostgreSQL kilitlerinin eşzamanlı entegrasyon testi değildir. Graphify HTML çıktısını 5000 düğüm sınırı nedeniyle atladı; JSON ve rapor güncellendi.

Yerel, oturum açılmış Web arayüzünde: emoji araması/ilk odak, kategori, sayfalama, çoklu seçim, temizleme, Escape ve odağın geri dönmesi kontrol edildi. Son pencere 384 × 601.75 CSS px. Gizlilik ekranında okundu ve oyun seçenekleri sunucu verisiyle etkinleşti; içerik filtresi bulunmuyor. Kullanıcının kayıtlı tercihleri değiştirilmedi.

Geçici ölçüm koduyla geliştirme ortamında emoji verisi + çizim hazır zamanı ilk açılışta 36.1 ms, sonraki açılışlarda 5.3–9.8 ms görüldü. Bu ölçüm INP veya üretim performans testi değildir. İlk saniyede 85–108 ms uzun görevler de gözlendi; kaynakları tarayıcı kontrolü/geliştirme yükünden ayrıştırılmadı. Dolayısıyla tüm takılmaların giderildiği doğrulanmış değildir. Ölçüm kodu kaldırıldı.

## Çalıştırma notları ve açık sınırlar

- Kökten typecheck: `pnpm.cmd --filter @wizards/types typecheck`, ardından `@wizards/web` ve `@wizards/mobile`.
- Web Node testleri `apps/web` içinde `node --import tsx --test --test-force-exit <test dosyaları>` ile çalıştı. İçe aktarma için yerel test `DATABASE_URL` verildi; bu testler veritabanı şemasını değiştirmedi.
- Oyun testi: `GAME_ACTIVITY_TEST_REDIS_URL=redis://127.0.0.1:6379` ile `src/lib/game-activity/service.test.ts`. Benzersiz test anahtarları oluşturuldu, test sonunda yalnız bu anahtarlar silindi.
- Mobil Jest: `pnpm.cmd exec jest --runInBand component-tests/mobile-account-settings-screen-integration.test.tsx component-tests/mobile-profile-card.test.tsx component-tests/mobile-profile-card-lifecycle.test.tsx`.
- Yeni yerel bağımlılık `sysinfo 0.39.6`, Rust **1.95+** ister. Yerelde Rust 1.95 ile Windows testi geçti; mevcut CI stable kullanıyor.
- **NOT RUN:** gerçek oyun süreçleriyle dokuz oyunun matrisi; macOS/Linux derleme ve cihaz testleri; Tauri arayüzünde gerçek oyun yayını; Android/iOS cihaz testi; iki gerçek hesapla okundu uçtan uca testi; üretim Web performans/build ve tüm depo testleri.
- Commit, push, dağıtım veya DB migration yapılmadı. Başlangıçtaki ilgisiz çalışma ağacı değişiklikleri korundu.
