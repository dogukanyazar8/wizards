# Bağımlılık güncellemeleri — 15 Eylül 2026

UAT çalışma ağacında uyumlu güncellemeler uygulandı. Alt ajan kullanılmadı. Commit, push, deployment ve canlı veritabanı değişikliği yapılmadı. Mevcut diğer çalışma korundu; eşzamanlı düzenleme kullanıcı tarafından durdurulduktan sonra Rust kilidi yeniden doğrulandı.

## Uygulanan sürümler

| Alan                                           | Önce                       | Sonra            |
| ---------------------------------------------- | -------------------------- | ---------------- |
| Node / pnpm                                    | 24.18.0 / 11.22.0          | 24.21.0 / 12.4.2 |
| Turbo                                          | 2.10.6                     | 2.10.13          |
| Next.js                                        | 16.3.4                     | 16.3.5           |
| Prisma client, adapter, instrumentation ve CLI | 7.9.1                      | 7.10.0           |
| Web React / React DOM                          | 19.2.8                     | 19.3.0           |
| Framer Motion                                  | 12.43.0                    | 13.3.0           |
| Expo / React Native                            | 57.0.12 / 0.86.2           | 57.0.22 / 0.86.3 |
| Playwright                                     | 1.61.1                     | 1.63.0           |
| Web / mobil ESLint                             | 10.8.0 / 9.39.4            | 10.10.0          |
| Rust                                           | 1.95.0; CI floating stable | 1.98.1           |
| Tauri notification / updater                   | 2.3.3 / 2.10.1             | 2.4.0 / 2.11.0   |
| PostgreSQL / Redis imajları                    | 18.4 / 8.8.0               | 18.6 / 8.10.1    |
| ClamAV / LiveKit server imajları               | 1.5.2 / 1.13.4             | 1.5.4 / 1.13.7   |
| Semgrep / cargo-audit                          | 1.164.0 / 0.22.1           | 1.177.0 / 0.22.2 |
| sccache / EAS CLI                              | 0.16.0 / 21.3.0            | 0.18.0 / 24.5.0  |

Toplam 106 npm bağımlılık tanımı düzenlendi; 84 ayrı paket adı etkileniyor. Buna WebRTC'nin güvenli sürümde sabitlenmesi de dahil. Tam mevcut/önceki sürüm dökümü: `.codex/dependency-upgrade-20260915/npm-changes.csv`. Node ve pnpm gibi çalışma zamanı pinleri bu CSV sayısından ayrıdır.

Rust'ta altı doğrudan crate güncellendi: `open`, `sentry`, notification, deep-link, single-instance ve updater. Ardından Cargo, bildirilen uyumluluk aralıkları içinde 100 geçişli paket için yeni çözüm oluşturdu; `chacha20` 0.10.1 → 0.10.2 geçişi geri çekilmiş sürümü kaldırdı.

GitHub Actions: checkout 7.0.1, setup-node 7.0.0, upload-artifact 7.0.1, download-artifact 8.0.1, cache 6.1.0, github-script 9.0.0, setup-java 6.0.1, pnpm/action-setup 6.1.0, rust-cache 2.9.2. Etiketlerin çözümlendiği tam commit SHA'ları kullanılıyor. Rust action'ın güncel stable commit'i ve derleyicinin tam sürümü ayrı sabitlendi. Gitleaks action zaten günceldi.

## Uyumluluk düzeltmeleri

- pnpm 12'nin native çalıştırılabilir dosyası artık Node'a JavaScript dosyası olarak verilmez. Ortak çalıştırıcı shell açmadan Node tabanlı ve native pnpm'i destekler; eksik başlatıcıda güvenli şekilde durur.
- Next'in React tipleri tüketici paketten çözülür. Web 19.3 ve Expo'nun zorunlu 19.2 tipleri birbirine karışmaz.
- Next router test adaptörü, Lucide sınıf adı ve sürüm sözleşmeleri yeni API'lerle eşleştirildi. CI metin testinde Windows/Linux satır sonları normalize edildi.
- Sentry yapılandırması yeni `@sentry/nextjs/config` girişini kullanır.
- `brace-expansion` 5.0.12'de güvenlik sınırları korunarak eski CommonJS çağıranları destekleyen yama yenilendi; Jest'in gerçek eski minimatch tüketicisiyle sınandı.
- Expo notifications 57.0.18 aynı iptal düzeltmesini upstream içerdiğinden eski yerel yama kaldırıldı. `image-size` ve NextAuth yamaları korundu.
- Mobil görsel karşılaştırıcının yeni SSIM veri tipi sRGB bilgisiyle karşılandı; gerçek görüntü karşılaştırma testleri geçti. Lisans envanteri yeniden üretildi.

## Doğrulama

| Kontrol                                     | Sonuç                                                                                                                                                                   |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Çalışma zamanı / araç sözleşmeleri          | PASS: 87 test                                                                                                                                                           |
| Paket typecheck                             | PASS: 5 paket                                                                                                                                                           |
| TypeScript 7 ana CI, TypeScript 6 uyumluluk | PASS; çalışan dev sunucusunun geçici dosya yarışından sonra TS6 tekrar doğrulandı                                                                                       |
| TypeScript declaration parity               | PASS                                                                                                                                                                    |
| Lint                                        | PASS: 5 paket; mobil hook kontrolünde 20 mevcut uyarı                                                                                                                   |
| Üretim derlemesi                            | PASS; son Motion/Turbo pinleriyle tekrar derlendi                                                                                                                       |
| Expo bağımlılık uyumu                       | PASS; Sentry ve TypeScript mevcut explicit exclude kapsamındadır                                                                                                        |
| Mobil birim testleri                        | PASS: 1986 test, 369 suite                                                                                                                                              |
| Mobil bileşen testleri                      | PASS: 1376 test, 141 suite; Jest worker kapanış uyarısı devam ediyor                                                                                                    |
| Masaüstü script testleri                    | PASS: 120 test                                                                                                                                                          |
| Rust fmt / Clippy / test                    | PASS; `-D warnings`, 60 Rust testi                                                                                                                                      |
| Actionlint                                  | PASS                                                                                                                                                                    |
| Semgrep kuralları                           | PASS: 10/10                                                                                                                                                             |
| Semgrep kaynak taraması                     | PASS: 3923 JS/TS/Rust dosyası, 10 kural, 0 bulgu; read-only kaynak arşivi Linux container içinde tarandı                                                                |
| Web geniş test koşusu                       | FAIL: 8572 test; 8560 PASS, 4 FAIL, 8 SKIP. Sürüm/satır sonu kaynaklı kalan hata sonradan düzeltildi; 66 odaklı test PASS. Aşağıdaki 3 diğer çalışma ağacı hatası kaldı |

Web'de kalan güncelleme dışı hatalar:

- `apps/web/src/app/api/v1/mobile/app/update/route-logic.test.ts`: `channel` beklentisi `uat`, mevcut sonuç `beta`.
- `apps/web/src/app/api/v1/support/report/route-logic.test.ts`: aynı `uat` / `beta` sözleşme uyuşmazlığı.
- `apps/web/src/lib/locale/settings-screen-copy.test.ts`: `settings.row.z5.title` için “Yalnız konuşanları göster” / “Yalnızca konuşanları göster” metin uyuşmazlığı.

Geniş web koşusu başarısız olduğundan coverage raporu tamamlanmış kabul edilmez. Odaklı koşunun geçmesi tüm web suite'inin geçtiği anlamına gelmez. Ayrıntılı komut çıktıları `.codex/upgrade-*.log` dosyalarındadır.

## Bilinçli korunan sürümler ve sınırlar

- Expo 58 modülleri, bağımsız RN 0.87, React 19.3 mobil, Babel 8, Jest 30 ve yeni native companion sürümleri SDK 57 matrisine zorlanmadı. Android Gradle/AGP/Kotlin/NDK/JDK zinciri de bu uyumluluk kapsamında tutuldu. [Expo SDK referansı](https://docs.expo.dev/versions/v57.0.0/)
- LiveKit RN 3 ve WebRTC 144.2 birlikte değerlendirilmelidir. Expo plugin 1.0.2'nin peer aralığı yalnız SDK 2'yi kabul ediyor. SDK 2.12.0 korundu; WebRTC **144.1.2 tam sürüme sabitlendi**, böylece `^144.1.2` üzerinden uyumsuz native namespace değişimi sızamaz. Plugin/native cihaz doğrulaması tamamlanmadan SDK 3 destekleniyor denmedi.
- Wry 0.55.1 doğrudan `webview2-com` 0.38 / `windows` 0.61 nesnelerini dışarı veriyor. Bunlar 0.39 / 0.62'ye zorlanmadı; izin bridge'inde iki farklı COM tipi oluşturulmadı.
- Prisma 8 RC üretim hedefi değildir. NextAuth'ın mevcut 5 beta hattı 4.x'e düşürülmedi. Node 26 tipleri Node 24 projesine taşınmadı.
- Motion 13 geçişinde CSS-in-JS prop filtreleme değişimi incelendi; mevcut Tailwind tabanlı tüketiciler bu entegrasyonu kullanmıyor. [Resmi geçiş rehberi](https://motion.dev/docs/react-upgrade-guide)
- İlk envanterde sayısal olarak en büyük görünen fakat yanlış yayımlanmış RN 1000.0.0 ve LiveKit React components 3.0.0 hedefleri dışlandı; rapor ve envanter filtresi düzeltildi.

Güvenlik gözlemleri:

- **medium:** `pnpm audit` mevcut iki `image-size` istisnasıyla başarılı; metadata hâlâ 2 high sayıyor. İstisnalar yalnız yerel yamayla ve güvenlik regresyon testleriyle kapsanan iki advisory içindir. Bu, “hiç advisory yok” anlamına gelmez.
- **medium:** Cargo audit 0 vulnerability, 7 bilgilendirici uyarı: 6 unmaintained ve GTK tarafındaki `glib` 0.18.5 unsound uyarısı. Üst bağımlılık geçişi gerektiren bu hatlar zorlanmadı.
- **medium:** `@emoji-mart/react` 1.1.1'in React peer bildirimi yalnız 16/17/18'i kapsıyor. Daha yeni wrapper sürümü yok; önceden var olan bu uyarı gizlenmedi.

Tarayıcı E2E, gerçek kamera/mikrofon/ekran paylaşımı, Android/iOS native derleme/cihaz kabulü, remote CI ve deployment çalıştırılmadı. PostgreSQL/Redis imaj pinlerinin değişmesi mevcut veritabanını yükseltmez. Sistem genelindeki Node kurulumu 24.18.0 olarak bırakıldı; kontroller checksum doğrulanmış taşınabilir 24.21.0 ile yapıldı. Gerekli geliştirme watcher'ı kullanıcı izniyle durduruldu. Tekrar başlatma için güncel Node/Corepack kurulumunu Windows onboarding belgesinden kullanın.

Graphify kaynak grafiği güncellendi. 39 bin düğüm HTML sınırını aştığından görsel çıktı üretilmedi; JSON grafiği ve rapor üretildi.
