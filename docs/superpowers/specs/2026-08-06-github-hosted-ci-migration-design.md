# GitHub-Hosted CI Migration Design

**Tarih:** 2026-08-06
**Durum:** Onaylandı ve yerel olarak uygulandı; remote CI doğrulaması bekliyor

## 1. Amaç

Linux tabanlı CI ve mobil yayın işlerini çevrimdışı self-hosted runner'lardan GitHub-hosted runner'lara taşımak. Projeye özgü fakat ölçümle doğrulanmamış 20 GiB boş disk engelini kaldırmak; disk kullanımını görünür tutmak.

## 2. Kapsam

### Dahil

- `.github/workflows/ci.yml` içindeki Linux işleri
- `desktop-ops` Linux matris girdisi
- Temiz GitHub-hosted VM için Tauri Linux sistem bağımlılıkları
- GitHub-hosted geçici makinelerde pnpm cache kullanımı
- `.github/workflows/mobile-release.yml` içindeki `preflight`, `contract`, `ota` ve `apk` işleri
- APK işi içinde build öncesi/sonrası disk telemetrisi
- Actionlint yapılandırması, yorumlar ve workflow contract testleri

### Hariç

- Semgrep tetikleme politikasını değiştirmek
- OTA, APK imzalama, EAS credential, R2 yükleme veya Railway davranışını değiştirmek
- APK işini EAS Cloud Build'e taşımak
- Mevcut self-hosted runner kayıtlarını silmek veya makineleri kapatmak
- Commit, push, deploy veya uzaktan workflow dispatch çalıştırmak

## 3. Tasarım kararları

### 3.1 Runner seçimi

- Linux işleri `ubuntu-24.04` kullanacak.
- `ubuntu-latest` kullanılmayacak; image değişimi kontrollü olacak.
- `ci.yml` içindeki doğrudan Linux işleri ve `desktop-ops` temel Linux matris girdisi GitHub-hosted olacak.
- Opsiyonel `windows-latest` ve `macos-latest` davranışı korunacak.
- `mobile-release.yml` içindeki dört iş de `ubuntu-24.04` kullanacak.
- `desktop-ops`, yalnız `ubuntu-24.04` matrisinde [Tauri'nin resmî Debian/Ubuntu prerequisites](https://v2.tauri.app/start/prerequisites/) paketlerini build öncesi kuracak; Windows/macOS matrisine Linux komutu uygulanmayacak.

### 3.2 Dependency cache

- GitHub-hosted Node işleri `actions/setup-node` üzerinden `cache: pnpm` kullanacak.
- Mevcut lockfile ve pnpm sürüm sözleşmeleri korunacak.
- Action pinleri, izinler ve `persist-credentials: false` güvenlik ayarları değişmeyecek.

### 3.3 Mobil disk kontrolü

- `20971520 KiB` / 20 GiB sabit alt sınırı ve bu nedenle verilen hard-fail kaldırılacak.
- Disk ölçümü korunacak; mevcut alan job summary'ye yazılacak.
- `preflight` ile `apk` ayrı GitHub makinelerinde çalıştığı için APK işi kendi alanını build başlamadan hemen önce ölçecek.
- APK işi `if: always()` adımıyla build sonrasında da alanı ölçecek. Böylece tüketim ve gerçek kapasite görülebilecek.
- Preflight ölçümünün parse edilememesi yapılandırma/ortam hatası sayılacak. Build sonrası telemetri best-effort olacak ve asıl build sonucunu maskelemeyecek.
- Gerçek `ENOSPC` hatası build hatası olarak kalacak; retry, sahte eşik veya doğrulanmamış image temizliği eklenmeyecek.
- Üçüncü taraf disk temizleme action'ı veya GitHub image'ının araçlarını topluca silen destructive adım eklenmeyecek.

### 3.4 Kapasite fallback'i

İlk gerçek GitHub-hosted APK çalışması kapasite kabul testidir. `ENOSPC` oluşursa genel CI self-hosted'a dönmeyecek. Yalnız APK build adımı için EAS Cloud Build ayrı tasarım/değişiklik olarak ele alınacak.

## 4. Güvenlik ve güven sınırları

- GitHub-hosted geçici makineler kalıcı workspace ve runner state riskini azaltır.
- Mevcut `mobile-uat` environment, secret kontrolleri ve yayın izinleri korunur.
- Credential içerebilen ham EAS log'u artifact olarak yayımlanmaz.
- Cleanup adımları `if: always()` ile çalışmaya devam eder.
- Semgrep'in mevcut event koşulu bu runner taşımasında değiştirilmez.
- Runner taşıması secret isimlerini, değerlerini veya erişim kapsamlarını değiştirmez.

## 5. Test yaklaşımı

Değişiklik test-first uygulanacak. Önce contract testleri yeni sözleşmeyi ifade edecek ve mevcut workflow'da fail edecek; sonra workflow düzeltilecek.

Test sözleşmeleri:

- Hedef Linux işlerinin tamamı `ubuntu-24.04` kullanır.
- Workflow'larda `self-hosted`, `wizards-ci`, `ci-fast` ve runner etiketi olarak `mobile-release` kalmaz.
- `desktop-ops` temel matrisi GitHub-hosted Linux kullanır.
- `desktop-ops` Tauri Linux prerequisites adımını Rust derlemesinden önce ve yalnız `ubuntu-24.04` üzerinde çalıştırır.
- GitHub-hosted Node işleri pnpm cache kullanır.
- Mobil workflow'da sayısal 20 GiB hard-fail bulunmaz.
- APK işinde build öncesi ve `always()` build sonrası disk telemetrisi bulunur.
- Actionlint config artık özel self-hosted etiketlere ihtiyaç duymaz ve geçerli kalır.
- Action pinleri, minimum permissions, secret guard'ları ve Semgrep event koşulu korunur.

Odaklı doğrulama komutları:

```powershell
node --test apps/mobile/scripts/mobile-release-workflow.test.mjs
node --test scripts/quality/desktop-ops-workflow-contract.test.mjs
node --test scripts/quality/semgrep-ci-contract.test.mjs
node --test scripts/quality/runtime-toolchain-contract.test.mjs
pnpm.cmd actionlint
pnpm.cmd test:toolchain
git diff --check
graphify update .
```

## 6. Kabul ölçütleri

- İlgili yerel contract testleri ve actionlint geçer.
- `.github/workflows` altında self-hosted runner bağımlılığı kalmaz.
- 20 GiB alt sınırı build'i engellemez.
- Mobil APK build alanı başlangıç/bitiş olarak job summary'de görünür.
- Graphify güncellemesi tamamlanır.
- Yerel doğrulama, GitHub'da workflow başarısı veya APK cihaz kabulü olarak raporlanmaz.
- İlk push sonrası gerçek GitHub-hosted APK çalışması ayrıca değerlendirilir; bu spec uzaktan başarı iddiası oluşturmaz.

## 7. Geri dönüş ve teslim sınırı

- Workflow ve contract test değişiklikleri dar kapsamlı ve geri alınabilir olacak.
- Self-hosted runner kayıtları bu değişiklikte silinmeyeceği için operasyonel geri dönüş yolu korunur.
- Mevcut ilgisiz WIP ve Graphify çıktıları korunur.
- Bu uygulama kapsamında stage, commit, push, deploy ve uzaktan dispatch yapılmaz.
