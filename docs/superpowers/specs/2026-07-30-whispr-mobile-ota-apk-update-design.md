# Whispr Mobile OTA ve Android APK Güncelleme Tasarımı

**Tarih:** 2026-07-30
**Durum:** Kullanıcı tasarım yönünü onayladı; yazılı sözleşme incelemesi bekleniyor.
**Kaynaklar:** `docs/prompts/hakkinda-redesign/16-ota-guncelleme-altyapisi.md`,
`docs/prompts/hakkinda-redesign/17-android-apk-guncelleme.md`,
`design_handoff/design_handoff_whispr_hakkinda/Whispr Hakkında Ekranı.dc.html`.

## 1. Hedef

Whispr Mobile güncellemelerini iki güvenli katmanda sunmak:

1. Native çalışma zamanı değişmediyse imzalı `expo-updates` OTA paketi.
2. Native çalışma zamanı değiştiyse yalnız Android UAT/canary iç dağıtımlarında,
   mevcut EAS Android imza anahtarıyla imzalanmış APK.

Kullanıcı 1A Hakkında ekranındaki görünür `Denetle` butonuyla denetimi başlatır. Sunucu
güncelleme türünü seçer. 1D ekranı seçilen adaptörün gerçek yeteneklerini gösterir; sahte
yüzde, sahte doğrulama adımı veya desteklenmeyen yeniden başlatma vaadi üretmez.

## 2. Kapsam

### Dahil

- 1A tasarımındaki `Denetle` eyleminin her desteklenen durumda görünmesi.
- Kendi manifest sunucumuz ve R2 üstünden imzalı Expo Updates v1 OTA dağıtımı.
- Android UAT/canary iç dağıtımları için APK indirme, doğrulama ve kurulum.
- OTA ve APK yayın kayıtları, admin uçları, audit kayıtları ve hız sınırları.
- OTA ve APK yayın otomasyonları; publish sonrası uzak doğrulama.
- Kill-switch, kontrollü rollout, zorunlu APK güncellemesi.
- Mobil, web, Prisma ve yayın hattı testleri.

### Hariç

- iOS için mağaza dışı native paket kurulumu.
- Production Play Store uygulamasında APK self-update ve
  `REQUEST_INSTALL_PACKAGES`.
- Production OTA özel anahtarının bu UAT çalışmasında üretilmesi.
- Canlı Railway/R2/EAS mutasyonu, kullanıcı ayrıca hedefleri ve secret erişimini
  doğrulamadan yapılmaz.
- Cihaz kabulü, uygun native build ve fiziksel/emülatör ortamı yoksa `NOT RUN` veya
  `ENV BLOCKED` raporlanır.

## 3. Kaynak Önceliği ve Uyuşmazlık Kararları

UI için kaynak önceliği:

1. `screenshots/1a-hakkinda-ust.png`
2. HTML inline stilleri
3. `PROMPT.md`

Prompt 16 ve 17 ana iş kapsamıdır. Bu tasarım aşağıdaki güvenlik ve mağaza-politikası
uyuşmazlıklarını bilinçli olarak düzeltir:

- OTA özel anahtarı workspace içinde tutulmaz.
- OTA manifesti web isteği sırasında ham özel anahtarla imzalanmaz; yayın sırasında
  imzalanır.
- Web runtime ham OTA özel anahtarını görmez.
- APK, yeni keystore ile değil mevcut EAS Android credential ile imzalanır.
- `REQUEST_INSTALL_PACKAGES` yalnız UAT/canary iç dağıtımlarına eklenir; production
  store yapılandırmasından çıkarılır.
- Production store istemcisine sunucu `updateKind: "apk"` döndürmez.
- En yeni disabled OTA kaydı önce bulunur, sonra rollback kararı verilir; sorguda
  disabled kayıt baştan elenmez.
- Kod imzalama etkin istemciye manifest kadar `noUpdateAvailable` ve
  `rollBackToEmbedded` direktifleri de imzalı verilir.

## 4. Güven Sınırları ve Anahtar Yönetimi

### 4.1 Android uygulama imza anahtarı

- Mevcut EAS Android credential tek APK uygulama imza otoritesidir.
- Yeni keystore üretilmez.
- Keystore, parola ve alias repoya veya uygulama runtime'ına girmez.
- İlk self-update kabulünden önce baseline APK ile yeni EAS APK'nın imza sertifikası
  SHA-256 parmak izleri karşılaştırılır.
- Uyuşmazlık yayın öncesi fail-closed hatadır.

### 4.2 OTA kod imzalama anahtarı

- APK keystore'dan tamamen ayrı RSA anahtar çifti kullanılır.
- Bu çalışmada yalnız UAT anahtarı üretilir.
- Önerilen `keyid`: `whispr-mobile-ota-uat-2026-01`.
- UAT sertifika geçerliliği 1 yıldır.
- Özel anahtar workspace dışındaki güvenli dizinde üretilir, ardından CI secret
  manager/KMS/password manager'a alınır.
- Özel anahtar repoya, Railway web değişkenlerine, loglara veya build artefaktlarına
  girmez.
- Public sertifika `apps/mobile/certs/ota/uat/certificate.pem` altında tutulur ve UAT
  native build'e gömülür.
- Canary ve production ayrı anahtar/sertifika ister. Sertifika sağlanmamış profile
  code signing sessizce düşürülmez; build fail-closed olur.

### 4.3 Yayın-zamanı imza

OTA publish job:

1. Export edilen immutable manifest gövdesini oluşturur.
2. Manifesti UAT özel anahtarıyla imzalar.
3. Statik `noUpdateAvailable` ve `rollBackToEmbedded` direktiflerinin canonical JSON
   gövdelerini aynı anahtarla imzalar.
4. Gövde, imza, `keyid`, algoritma ve hash değerlerini admin API'ye kaydeder.

Web manifest ucu yalnız saklanan imzayı sunar. Eksik veya gövdeyle uyuşmayan imza varsa
500 döner; imzasız fallback yoktur. Gelecekte runtime'da dinamik imza zorunlu olursa ham
PEM yerine erişim kontrollü KMS/HSM `sign` işlemi kullanılır.

### 4.4 Rotasyon

- Sertifika uygulama runtime'ının parçasıdır.
- Rotasyon yeni native build ve yeni fingerprint runtime version gerektirir.
- Eski anahtar ve sertifika kurtarma/inceleme için güvenli arşivde saklanır.
- Yeni `keyid` tarihli ve ortama özgü olur.
- Sertifika sona ermeden yeni build kabulü tamamlanır.

## 5. İstemci Mimarisi

### 5.1 1A `Denetle` eylemi

`AboutIdentityCard` güncelleme satırı:

- `Denetle` butonunu tasarımdaki sağ konum, kontrol zemini, r12 ve indigo metinle
  gösterir.
- Görünürlük yalnız `Updates.isEnabled` değerine bağlanmaz.
- Basış güncelleme karar sorgusunu yeniler, sonra sunucunun `updateKind` kararına uygun
  controller çağrılır.
- OTA kapalı veya uyumlu controller yoksa satır dürüst açıklama gösterir; butonun
  kaybolmasıyla eylem sessizce yutulmaz.
- `checking` en az 800 ms görünür.
- `checking` sırasında eylem `Durdur`; `available` durumunda `Güncelle`.

### 5.2 Controller seçimi

Tek orkestratör aşağıdaki seçimi yapar:

- `updateKind === "ota"`: `createExpoOtaUpdateController()`
- `updateKind === "apk"` ve Android iç dağıtım:
  `createAndroidApkUpdateController()`
- `updateKind === "none"`: bilgi durumu; indirme başlatılmaz

Sunucu kararı istemci tarafından yeniden türetilmez. İstemci platform ve dağıtım
güvenlik kapılarını yine doğrular; iOS veya production store yapı yanlışlıkla `apk`
alırsa fail-closed davranır.

### 5.3 OTA controller

- `capabilities`: `isEnabled = Updates.isEnabled`, `reportsPercent = false`,
  `canPause = false`.
- `check()`: `Updates.checkForUpdateAsync()`.
- `download()`: `Updates.fetchUpdateAsync()`.
- `install()`: `Updates.reloadAsync()`.
- Yüzde, byte veya ETA uydurulmaz.
- Expo'nun imza doğrulaması ayrı görünür ilerleme sağlamadığı için `verify` satırı
  pending kalır.
- `isRollBackToEmbedded` sonucu açık geri-alma mesajı gösterir, sonra reload ister.
- `Updates.useUpdates()` yalnız gerçek indirme/indirilen güncelleme durumunu izler.

### 5.4 APK controller

- Yalnız Android UAT/canary iç dağıtımlarında enabled.
- `reportsPercent = true`, `canPause = true`.
- `expo-file-system` sürümündeki gerçek API yolu kaynak paketinden doğrulanır.
- Elle hücresel indirmede boyut gösteren onay gerekir.
- Boş alan `sizeBytes * 1.2` altındaysa indirme başlamaz.
- APK `cacheDirectory/whispr-<versionCode>.apk` yoluna iner.
- Hız ve ETA son beş örnekten hesaplanır.
- Pause/resume state AsyncStorage'da saklanır.
- Doğrulama sırası: boyut, artımlı SHA-256, Android paket imzası.
- Boyut/hash hatasında dosya silinir, state `danger`, telemetri güvenli hata kodu yazar.
- Kurulum `content://` URI, MIME
  `application/vnd.android.package-archive`, read grant flag ile açılır.
- Bilinmeyen kaynak izni önceden açıklanır; `AppState.active` dönüşünde tekrar deneme
  sunulur.
- Yeni versionCode açıldığında eski APK cache dosyaları temizlenir.

## 6. Mobil Yapılandırma

### 6.1 Expo Updates

UAT config:

- `updates.enabled: true`
- `updates.url`: mevcut UAT `apiUrl` üstünde
  `/api/v1/app/updates/manifest`
- `checkAutomatically: "NEVER"`
- `fallbackToCacheTimeout: 0`
- `requestHeaders.expo-channel-name: "uat"`
- `codeSigningCertificate`:
  `./certs/ota/uat/certificate.pem`
- `codeSigningMetadata.keyid`:
  `whispr-mobile-ota-uat-2026-01`
- `codeSigningMetadata.alg: "rsa-v1_5-sha256"`
- `runtimeVersion.policy: "fingerprint"`

Development OTA varsayılan kapalı kalır. Canary/production sertifikası yoksa ilgili
code-signed build fail-closed olur.

### 6.2 EAS profilleri

- UAT `autoIncrement: true`.
- UAT/canary `android.buildType: "apk"`.
- Production `distribution: "store"` ve AAB olarak kalır.
- Production profilinden `REQUEST_INSTALL_PACKAGES` çıkarılır.
- UAT/canary APK'ları mevcut EAS Android credential ile üretilir.

### 6.3 İzin sözleşmesi

Store contract kaydı `storeBlocker: true` taşır. Permission üretimi profile duyarlı olur:

- UAT/canary: `REQUEST_INSTALL_PACKAGES` var.
- Production store: yok.
- iOS: karşılık gelen Info.plist anahtarı yok.

Testler production config'in store-blocking izni sızdırmadığını doğrular.

## 7. Sunucu ve Veri Modeli

### 7.1 `OtaBundle`

Prompt 16 alanlarına ek:

- `signingKeyId String`
- `manifestSignature String?`
- `noUpdateDirectiveSignature String?`
- `rollbackDirectiveSignature String?`
- `manifestSha256 String?`

Bir kayıt `publishedAt` almadan önce tüm gerekli imza/hash alanları dolu olmalıdır.

### 7.2 `ReleaseArtifact`

Prompt 17 sözleşmesi korunur:

- Platform, kind, channel, versionCode, immutable URL, size, SHA-256.
- `signingCertSha256` yayın doğrulamasında zorunlu Android APK kanıtı olur.
- `(platform, kind, channel, versionCode)` unique.
- `Release.minSupportedVersionCode` zorunlu güncelleme kapısıdır.

Migration yalnız `packages/db/prisma/rebaseline-migrations/` altında, mevcut en büyük
zaman damgasından yeni bir zaman damgasıyla oluşturulur.

### 7.3 Manifest seçimi

İşlem sırası:

1. `expo-platform`, `expo-runtime-version`, `expo-channel-name`,
   `expo-protocol-version` doğrulanır.
2. Platform + kanal + runtime için en yeni published kayıt disabled dahil bulunur.
3. En yeni kayıt disabled ise imzalı `rollBackToEmbedded`.
4. Kayıt yoksa imzalı `noUpdateAvailable`.
5. Current update id en yeni id ise imzalı `noUpdateAvailable`.
6. Rollout deterministik cihaz kimliği hash'iyle uygulanır; uygun değilse imzalı
   `noUpdateAvailable`.
7. Uygunsa immutable asset URL'li manifest ve saklanan imza döner.

İmzalı gövde veritabanında saklanan hash ile tekrar doğrulanmadan sunulmaz.

### 7.4 Güncelleme karar ucu

Mobil istek platform, channel, runtimeVersion ve versionCode gönderir. Sunucu:

- Fingerprint uyumlu, published OTA varsa `ota`.
- Fingerprint uyumsuz, Android UAT/canary ve uygun APK varsa `apk`.
- iOS native uyumsuzsa `none`.
- Production store native uyumsuzsa `none` ve mağaza güncellemesi gerektiği bilgisi.

`minSupportedVersionCode` ve Android artifact metadatası yanıtlanır. APK kararı production
store profile için verilemez.

### 7.5 Admin uçları

- OTA kayıt/publish/disable.
- Release artifact kayıt.
- `release.write` yeteneği.
- Şema doğrulaması, unique çatışmada 409, audit kaydı.
- Immutable URL yalnız izin verilen HTTPS R2/updates hostundan kabul edilir.
- Publish, eksik imza/hash veya erişilemeyen asset ile reddedilir.

### 7.6 Hız sınırı

- Public manifest: IP/Cloudflare tabanlı.
- Mobile update decision: mevcut güvenli sınır.
- Admin publish/artifact: kimlik + yetenek tabanlı.
- Public uç kullanıcı oturumu gerektirmez; abuse koruması nedeniyle sınırsız bırakılmaz.

## 8. Yayın Hatları

### 8.1 OTA

`publish-ota-bundle.mjs`:

1. Android export.
2. Fingerprint runtime version.
3. Immutable bundle key.
4. Asset hash ve manifest.
5. Workspace dışı private-key path/KMS ile imza.
6. R2 upload.
7. Admin kayıt ve publish.
8. Gerçek headers ile manifest isteği.
9. İmza doğrulaması.
10. Tüm asset URL'lerinde uzak erişim/hash kontrolü.

Her hata publish'i başarısız yapar. Mutable bundle overwrite yoktur.

### 8.2 APK

`mobile-release.yml` yalnız UAT/canary APK self-update ringlerini işler:

1. Ring/version/versionCode sözleşmesi.
2. EAS APK build; mevcut Android credential.
3. APK SHA-256, size ve signing certificate SHA-256.
4. Baseline imza parmak izi eşleşmesi.
5. Immutable R2 upload.
6. `latest.json`.
7. Admin artifact kayıt.
8. Uzak `HEAD`, `Range: bytes=0-1023`, API karar doğrulaması.

Production store AAB bu self-update workflow'undan ayrı kalır.

## 9. Hata ve Geri Alma

- OTA imza eksik/bozuk: 500, imzasız fallback yok.
- OTA asset hash uyumsuz: publish başarısız.
- Disabled en yeni OTA: imzalı rollback directive.
- APK hash/boyut uyumsuz: yerel dosya silinir; kurulum açılmaz.
- APK signing certificate uyumsuz: yayın başarısız.
- Disk yetersiz: indirme başlamaz.
- Bilinmeyen kaynak izni yok: kullanıcıya açıklama ve tekrar deneme.
- Bozuk APK kurulmuşsa otomatik downgrade yok; uyumlu runtime varsa OTA düzeltmesi,
  değilse daha yüksek versionCode APK gerekir.
- Zorunlu güncellemede 1D kapatılamaz, skip gizlidir.

## 10. Test Stratejisi

TDD zorunlu: her davranış için önce doğru nedenle kırmızı test, sonra en küçük uygulama.

### Mobil

- 1A `Denetle` görünürlük, basış, checking/stop/update state geçişleri.
- OTA capability, 800 ms floor, disabled, download, rollback, sahte yüzde yokluğu.
- APK disk, son beş örnek ETA, pause/resume persistence, boyut/hash hata temizliği,
  iOS ve production fail-closed.
- UAT/canary izin var; production store izin yok.
- App config updates URL, channel, cert, keyid, fingerprint.
- 1D gerçek/indeterminate progress, forced gate, izin açıklaması.

### Web

- Manifest başlık doğrulama.
- Signed manifest, signed no-update, signed rollback.
- Eksik/uyuşmayan stored signature 500.
- Disabled latest seçim sırası.
- Deterministik rollout.
- Asset URL allowlist.
- `updateKind` ota/apk/none; iOS ve production APK reddi.
- Admin yetenek, validation, conflict, audit.
- Public route contract ve rate-limit action.

### Prisma ve yayın scriptleri

- Migration/schema contract.
- Publish overwrite reddi.
- İmza/hash üretim ve doğrulama.
- APK `HEAD`/Range/API post-publish gate.
- Private key veya keystore'un çıktı/log/artefakta sızmaması.

## 11. Doğrulama ve Raporlama

Ayrı raporlanır:

- Yerel focused testler.
- Mobil typecheck.
- Web typecheck.
- Prisma validate/migrate status.
- Graphify update.
- CI.
- EAS native build.
- R2/Railway canlı publish.
- Android cihaz OTA kabulü.
- Android cihaz APK update, bozuk hash ve forced update kabulü.
- iOS OTA kabulü.

Bir kategori başka kategoriyi kanıtlamaz. Sonuçlar yalnız `PASS`, `FAIL`, `NOT RUN`,
`ENV BLOCKED` olarak verilir.

## 12. Teslim Sınırları

- Mevcut yoğun WIP korunur.
- İlgisiz dosya düzeltilmez.
- Stage, commit, push, PR veya deploy yapılmaz.
- Özel anahtar, keystore, token ve parolalar komut çıktısına yazılmaz.
- Anahtar üretimi sırasında hedef mutlak yol doğrulanır.
- Production/canary anahtar sağlanmadıkça uydurma sertifika veya shared key kullanılmaz.
