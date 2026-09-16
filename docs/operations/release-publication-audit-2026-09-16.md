# İndirme paketleri ve sürüm yayınlama incelemesi

Tarih: 16 Eylül 2026. Kaynak tabanı: `0fc1657b611d6189ab96eb4ed384aaa85998ef38` ve mevcut çalışma ağacı.

UAT yayın incelemesi eki: Aşağıdaki EAS sürüm beklentisi bu çalışma ağacında `24.5.0` olarak düzeltildi; mobil workflow ve OTA imza testleri yeniden çalıştırıldı, **10/10 PASS**. Workflow'un sabit CLI sürümü ve yayın korumaları değişmedi. Diğer uzak yayın bulguları bu düzeltmeyle kapanmış sayılmaz; aşağıdaki tablolar ilk incelemenin sonuçlarını kaydeder.

Yayın workflow'ları, GitHub ortamları ve R2 nesneleri değiştirilmedi. Yeni build, deploy, mağaza gönderimi veya migration çalıştırılmadı. Gizli değerler okunmadı; yalnız secret/variable adları ve koruma kuralları listelendi.

## Tamamlanan form

Yol: **Yönetim Konsolu → İçerik & Destek → İndirme Paketleri** (`/admin/downloads`).

- OWNER/ADMIN: Paket Ekle, Düzenle, Yayınla, Yayından kaldır. Diğer yönetim rolleri salt okunur.
- PROD (`STABLE`) / UAT; Windows, macOS, Linux, Android, iOS; doğrudan HTTPS, mağaza, TestFlight bağlantıları.
- Sürüm, derleme, yerel saatle sürüm tarihi, TR/EN paket etiketi ve platform açıklaması, isteğe bağlı bayt boyutu ve SHA-256.
- Yükleme alanı yok. Kurulum dosyası backend'e taşınmıyor; JSON bağlantı ve metadata kaydediliyor.
- Yeni kayıt taslak. Yayın ayrı işlem. Yayındaki kayıt düzenlenince mevcut yayın durumu korunuyor ve değişiklik hemen etkili oluyor; formda açıklanıyor.
- Ortam/platform çakışması, oturum/yetki, hız sınırı, kayıp kayıt ve ağ hatalarında anlaşılır mesaj; başarısız kayıtta form korunuyor. İşlem sırasında tekrarlı gönderim ve eşzamanlı ekran eylemleri engelleniyor.
- Silinen kaydın düzenlenmesindeki Prisma `P2025`, artık doğru 404 yanıtına çevriliyor.
- Mevcut tek `(channel, platform)` kaydı kuralı korunuyor. Aynı platformda x64/ARM64 veya birden çok paket biçimi için ayrı satır desteği eklenmedi.

Kaynak: `apps/web/src/components/admin/sections/admin-downloads.tsx`, `admin-download-form.tsx`, `apps/web/src/lib/downloads/admin-download-client.ts`, `admin-download-service.ts`.

## Birbirinden bağımsız yayın yüzeyleri

| Yüzey                          | Veri kaynağı                              | Ne yapar?                                                               |
| ------------------------------ | ----------------------------------------- | ----------------------------------------------------------------------- |
| İndirme Paketleri              | `DownloadArtifact`                        | Kullanıcının indirme penceresinde gösterilen güncel bağlantıyı yönetir. |
| Sürümler                       | `Release`                                 | Sürüm notları, kanal, zorunlu sürüm ve yayın durumunu yönetir.          |
| Mobil uygulama güncellemesi    | `ReleaseArtifact`, `OtaBundle`, `Release` | Uygulamaya APK/OTA/mağaza güncellemesi kararı verir.                    |
| Masaüstü otomatik güncellemesi | R2 `desktop/<ring>/latest.json`           | Tauri updater'a imzalı Windows paketini sunar.                          |

Workflow'lar `DownloadArtifact` tablosunu güncellemiyor. Başarılı derleme/yayından sonra doğrulanmış kurulum URL'si ve metadata bu forma ayrıca girilmeli. Formda Yayınla, Tauri feed'ini veya mobil OTA kaydını değiştirmez. Bu ayrım kullanıcının seçtiği manuel katalog yönetimiyle uyumlu.

## Mevcut yayın kapsamı

| Hedef                         | Kaynakta doğrulanan süreç                                                                                                      | Sınır                                                                                                                 |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| Windows x64 UAT               | `uat`, manuel Desktop Release, NSIS, Windows + updater imzası, R2 ve isteğe bağlı GitHub Release                               | Gerçek güncel native kurulum/güncelleme denemesi yapılmadı.                                                           |
| Windows x64 PROD              | `main`, `stable`, açık onay, PROD web origin, başarılı aynı-SHA CI, OV/EV koşulu                                               | Güncel uzak ayarlarda ve feed'de aşağıdaki engeller var.                                                              |
| macOS / Linux / Windows ARM64 | Bu release workflow'unda build/publish işi yok                                                                                 | Formun platform desteği, derleme hattı desteği değildir.                                                              |
| Android UAT APK               | GitHub Ubuntu üzerinde EAS local build, mevcut EAS kimliği, artan versionCode, SHA-256/boyut/Range kontrolü, R2, backend kayıt | Workflow sözleşme testi şu an başarısız.                                                                              |
| Android UAT OTA               | Expo export/fingerprint, RSA imzalı metadata, R2 varlıkları, backend kayıt                                                     | Kademeli dağıtım doğrulamasında hata var.                                                                             |
| Android PROD / iOS            | EAS production store profili mevcut                                                                                            | GitHub mobile workflow'u yalnız UAT/Android çalıştırıyor; AAB/IPA/TestFlight/store gönderimi burada uygulanmış değil. |
| PROD OTA                      | Ayrı güven kökü hazır olana kadar kapalı                                                                                       | UAT sertifikasını PROD için kullanmak mevcut sözleşmeye aykırı.                                                       |

Kaynak: `.github/workflows/desktop-release.yml:187`, `apps/desktop/scripts/validate-update-manifest.mjs:7`, `.github/workflows/mobile-release.yml:55`, `apps/mobile/eas.json`, `apps/mobile/app.config.js:16`, `docs/operations/release-channels.md`.

## Bulgular

### 1. critical — Mobil yayın contract adımında duruyor

`.github/workflows/mobile-release.yml:203` her gerçek yayından önce `mobile-release-workflow.test.mjs` çalıştırıyor. Testin 249. satırı `eas-cli@21.3.0` bekliyor; workflow'un 465. satırı `eas-cli@24.5.0` kuruyor. Yerel doğrulama: bu grup **9/10**, bir gerçek assertion hatası.

Sonuç: APK/OTA yayın job'ları `needs: contract` nedeniyle başlamaz. Sürüm sabiti ile doğrulama aynı kaynağa bağlanmalı veya test mevcut kabul edilmiş sürüm için güncellenmeli. Sadece yeşil test elde etmek için CLI sürümünü düşürmek doğru değil. Bu incelemede değiştirilmedi.

### 2. critical — PROD Windows signing ayarı eksik; PROD feed 404

GitHub repository ve `desktop-stable` environment variable envanterinde `WHISPR_DESKTOP_WINDOWS_SIGNING_CERT_KIND` bulunmadı. `.github/workflows/desktop-release.yml:334` Stable için bu değeri `OV` veya `EV` olarak zorunlu tutuyor. Repository'de Windows sertifikası ve updater secret adları mevcut; değerlerin gerçekliği, süresi, OV/EV niteliği incelenmedi.

`https://updates.whispr.team/desktop/stable/latest.json` canlı GET **404** döndü. Bu adresi kullanan mevcut istemciler güncelleme feed'ine ulaşamaz. Güncel Stable yayını hazır kabul edilemez.

Gerekli işlem: gerçek üretim sertifikasını ve anahtar eşleşmesini doğrulamak, ortam ayarlarını tamamlamak, yeni sürümü normal korumalı yayın akışından geçirmek. Yalnız bir değişkeni `OV` yapmak sertifikanın güvenilir olduğunu kanıtlamaz.

### 3. medium — OTA rollout kontrolü normal no-update yanıtını hata sayıyor

`.github/workflows/mobile-release.yml:367` doğrulama isteğini `expo-installation-id: ci-<run_id>` ile gönderiyor ve 392. satırda yanıt içinde yeni bundle id'sini koşulsuz arıyor. Oysa `apps/web/src/lib/app/ota-manifest-service.ts:180` kurulum kimliğinin hash'ine göre yüzdeye dahil olmayan cihazlara imzalı `noUpdateAvailable` döndürüyor.

Saf servis çağrısıyla `%0` yeniden üretildi: `kind=directive`, `noUpdateAvailable`, workflow'un id kontrolü `false`. `%1–99` için de CI kimliği kapsam dışına düşebilir. Kayıt doğrulamadan önce `enabled: true` ile oluşturulduğu için job kırmızı olduğunda yayın DB'de etkin kalabilir.

Öneri: rollout davranışı ile kayıt/varlık bütünlüğü kontrollerini ayırmak; kapsam içi ve dışı kararları deterministik doğrulamak. Yanlış negatif hatayı geçmek için dağıtımı herkese açmamak.

### 4. medium — “Protected environment” adı uzaktaki koruma anlamına gelmiyor

GitHub API envanterinde `desktop-uat` ve `desktop-stable`: `protection_rules=[]`, `deployment_branch_policy=null`. Mobile UAT yalnız `uat` dal politikası taşıyor; required reviewer yok. Emekli `desktop-canary` ortamı hâlâ mevcut.

Kaynakta Stable dal/origin/onay kontrolleri bulunuyor; bunlar değerli fakat environment onayı ile aynı koruma değil. UAT ve Stable ortamlarında ayrı secret override yok; R2, Windows signing ve updater secret'ları repository seviyesinden geliyor. Ayrı ring anahtarları/bucket yetkileri envanterden doğrulanamıyor.

Öneri: özellikle Stable için gerçek environment reviewer/dal politikası ve en az yetkili yayın kimliği; emekli ortamın kontrollü envanteri. Uzak ayarlar bu çalışmada değiştirilmedi.

### 5. medium — Mobil yayında aynı commit için başarılı CI zorunluluğu yok

Desktop `.github/workflows/desktop-release.yml:82`, tam SHA için başarılı push CI arıyor. Mobile workflow'unda eşdeğer kontrol yok; yayın contract aşaması yalnız iki release script testini çalıştırıyor. Bu nedenle normal web/mobile testleri başarısız bir `uat` commit'i, release script testleri geçerse yayın yoluna girebilir.

Öneri: mobil yayını aynı SHA'nın tamamlanmış, başarılı zorunlu kalite kapısına bağlamak. `uat` dal kısıtı tek başına CI başarısı kanıtı değildir.

### 6. medium — Masaüstü latest işaretçisi uzak doğrulamadan önce değişiyor

Desktop workflow 835–844 civarında immutable installer/signature/manifest yükleyip `desktop/<ring>/latest.json` işaretçisini değiştiriyor. Uzak doğrulama sonraki adımda (847) yapılıyor. Başarısız doğrulamada eski işaretçiyi geri alan otomatik adım yok. Uzak artifact kontrolü yalnız HEAD erişilebilirliğini doğruluyor; indirilen byte'ları yerel SHA-256 ile kıyaslamıyor (`validate-update-manifest.mjs:209`).

Öneri: immutable nesneleri ve içerik hash'ini önce doğrulamak, sonra işaretçiyi taşımak; önceki manifesti kayıtlı tutan, kontrollü geri alma akışı. Tauri istemcisinin imza doğrulaması bozuk paketin kurulmasını sınırlar fakat bozuk feed'in erişilebilirlik etkisini çözmez.

### 7. medium — Manuel QA ve performans beyanı, ölçüm kanıtı değil

`release:promotion` yerel audit geçince `ready-for-promotion` üretip manuel QA adımlarını listeye koyuyor; tamamlanmış QA sonuçlarını girdi olarak zorunlu almıyor. Uzak Stable environment da reviewer zorunlu tutmuyor. `release-ops.mjs:122` içindeki UAT kanıtı, rollback hazırlığı ve destek sorumlusu maddeleri otomatik olarak ispatlanmış değil.

Mobil `release:check` **PASS**, fakat `performance.status=unmeasured`: startup, resume, cached/network chat, echo, ACK, composer için **7 ölçüm eksik**. Bu sonuç native cihaz veya mağaza yayını kabulü değildir.

### 8. minor — Stable dispatch formu varsayılan olarak UAT web adresi veriyor

Desktop workflow'un `web_url` varsayılanı UAT. Operatör yalnız ring'i `stable` yaparsa güvenli guard yayını durdurur. Mevcut contract ile yeniden üretildi: `Stable desktop releases must use https://whispr.team/ as web_url.`

Bu yanlış ortama yayın kaçışı değil; yanlış varsayılan nedeniyle operatör tuzağı. Stable için `https://whispr.team/` açıkça girilmeli veya ring'e göre sunucu tarafında belirlenmeli.

## Canlı, salt okunur kanıt

| Kontrol                        | 16 Eylül sonucu                                                                                                                                                 |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Desktop UAT feed               | HTTP 200; `0.8.15`; yalnız `windows-x86_64`; `no-cache, no-store, must-revalidate`                                                                              |
| UAT Windows installer          | HTTP 200; 3.240.272 bayt; Range 206; immutable cache                                                                                                            |
| Desktop Stable feed            | HTTP 404                                                                                                                                                        |
| Mobile UAT feed                | HTTP 200; `0.8.15`, versionCode `8218`; cache 60 saniye                                                                                                         |
| UAT APK                        | HTTP 200; 104.404.407 bayt, manifest boyutuyla eşit; Range 206; immutable cache                                                                                 |
| Son listelenen Desktop Release | [25 Haziran başarılı run](https://github.com/dogukanyazar8/wizards/actions/runs/28195345785); SHA `bca20f3c`; build ve publish job'ları başarılı                |
| Son listelenen Mobile Release  | [11 Ağustos başarılı run](https://github.com/dogukanyazar8/wizards/actions/runs/31530817831); SHA `9e5ac6a5`; eski self-hosted akışta APK başarılı, OTA skipped |

Bu geçmiş run'lar mevcut `0fc1657b` kaynaklarının yayınlandığını kanıtlamaz. APK/EXE bütünü indirilip yeniden hash veya imza doğrulanmadı; kurulum yapılmadı. GitHub secrets yalnız isimleriyle görülebiliyor; geçerlilik ve Cloudflare bucket IAM kapsamı doğrulanmadı. Canlı DB migration durumu bu incelemede doğrulanmadı.

## Çalıştırılan kontroller

| Katman                                                                                  | Sonuç                                                                               |
| --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Form, katalog, servis, route, yetki testleri                                            | PASS 70/70                                                                          |
| Gerçek React formu + Chromium, izole API                                                | PASS 4/4; ekle/düzenle/yayın/geri çek, hata/retry, salt okunur, vazgeç, 390/1440 px |
| Değişen form dosyalarının TypeScript bağımlılıkları                                     | PASS; uygulamanın NextAuth augmentation dosyası dahil                               |
| Form dosyaları ESLint, Prettier                                                         | PASS                                                                                |
| Desktop release scriptleri                                                              | PASS 70/70; cwd `apps/desktop`                                                      |
| Mobile workflow + OTA signing scriptleri                                                | FAIL: 9/10; EAS pin uyuşmazlığı                                                     |
| Mobile release contract/evidence/APK controller/client                                  | PASS 19/19; cwd `apps/mobile`                                                       |
| Web OTA/APK/update/auth servis ve route testleri                                        | PASS 52/52                                                                          |
| Desktop + Mobile actionlint                                                             | PASS                                                                                |
| Mobil release:check                                                                     | PASS; 7 performans ölçümü unmeasured                                                |
| Tam monorepo suite/build, yeni GitHub build/publish, cihaz/macOS/Linux/iOS/store kabulü | NOT RUN                                                                             |

Graphify güncellemesi: **ENV BLOCKED**. AST çıkarımı tamamlandı; `.graph.tmp.json` dosyasının `graph.json` yerine geçirilmesi `WinError 5` ile reddedildi. Grafik güncel kabul edilmedi; rapor kaynakları doğrudan doğrulandı.

Tekrar çalıştırma (PowerShell, depo kökünden):

```powershell
pnpm.cmd --filter @wizards/web exec node --test scripts/admin-downloads-browser.test.mjs
pnpm.cmd --filter @wizards/desktop exec node --test scripts/desktop-release-workflow.test.mjs scripts/desktop-release-artifacts.test.mjs scripts/desktop-release-publish-plan.test.mjs scripts/create-update-manifest.test.mjs scripts/validate-update-manifest.test.mjs scripts/release-ops.test.mjs scripts/release-audit.test.mjs scripts/release-promotion.test.mjs scripts/desktop-trust-boundary.test.mjs
pnpm.cmd --filter @wizards/mobile exec node --test scripts/mobile-release-workflow.test.mjs scripts/publish-ota-bundle.test.mjs
pnpm.cmd --filter @wizards/mobile exec node --import tsx --test scripts/mobile-release-contract.test.ts scripts/mobile-release-evidence.test.ts scripts/android-apk-update-controller.test.ts scripts/mobile-about-update-client.test.ts
node scripts/quality/actionlint.mjs .github/workflows/desktop-release.yml .github/workflows/mobile-release.yml
pnpm.cmd --filter @wizards/mobile release:check
```

Öncelik: EAS contract uyumsuzluğu; gerçek Stable signing/koruma/feed hazırlığı; OTA rollout doğrulaması; mobil aynı-SHA CI kapısı; ardından çok platformlu dağıtım ve kanıtlı QA. Bunlar form geliştirmesinden ayrı yayın süreci işleridir.
