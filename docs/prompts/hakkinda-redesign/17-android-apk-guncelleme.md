# 17 — Katman B: Android APK'yı uygulama içinden indirip kurma

Önce `00-ortak-baglam.md` oku. Ön koşul: `01`, `02`, `05`, `14`, `16`.
Branch `uat`, commit yok.

Hedef: native değişiklik içeren sürümleri mağazaya girmeden dağıtmak. Kullanıcı 1a'da
`Denetle`ye basar, güncelleme varsa 1d açılır, `Şimdi güncelle` APK'yı indirir, doğrular
ve sistem kurulum ekranını açar.

**iOS kapsam dışı.** Apple, App Store dışında uygulama kurulumuna izin vermiyor
(TestFlight / Ad Hoc / Enterprise dışında yol yok). Bu yüzden `Platform.OS === "ios"`
iken APK katmanı **hiç devreye girmez**; iOS yalnız Katman A (OTA) alır ve 1d'de
indirme kartı gösterilmez. Bu kısıt ekranda dürüstçe ele alınır, "yakında" gibi bir
söz verilmez.

---

## 0. Neden 1d tasarımı bu katmanda tam çalışır

`expo-file-system` (kurulu) indirme API'si şunları veriyor:

- `totalBytesWritten` / `totalBytesExpectedToWrite` → gerçek yüzde ve `18,4 MB / 48,2 MB`
- akış hızından türetilen gerçek ETA
- `pauseAsync()` / `resumeAsync()` → `Duraklat` / `Sürdür` **gerçekten** çalışır
- indirme durumu serileştirilebilir → uygulama kapanıp açılsa bile devam ettirilebilir

Yani bu adaptörde `capabilities.reportsPercent = true`, `canPause = true`.
Prompt 05'teki belirsiz mod Android'de devreye girmez.

**Doğrula:** `expo-file-system` API girişi sürümle değişti; indirme fonksiyonlarının
kurulu sürümde `expo-file-system` mi `expo-file-system/legacy` mi altında olduğunu
`node_modules` içinden **kontrol et**, varsayma.

---

## 1. Yeni bağımlılık ve tavuk-yumurta sorunu

Kurulum intent'i için `expo-intent-launcher` gerekiyor (**kurulu değil**).
Bu ve `REQUEST_INSTALL_PACKAGES` izni yeni bir native build gerektirir.

Sonuç: **bu özelliği taşıyan ilk APK elle kurulur.** O APK'dan sonraki tüm sürümler
uygulama içinden gelir. Bu, README'ye ve sürüm notuna açıkça yazılır.

---

## 2. Yapılandırma

### İzin

`REQUEST_INSTALL_PACKAGES` doğrudan `app.config.js`'e yazılmaz — izin listesi
`src/release/mobile-store-contract-data.json` içindeki `permissionDisclosures`
dizisinden üretiliyor (`getWhisprMobileAndroidPermissions`). Oraya yeni bir giriş ekle:

```json
{
  "id": "app-updates",
  "androidPermission": "REQUEST_INSTALL_PACKAGES",
  "iosInfoPlistKey": null,
  "usageDescription": "Whispr, mağaza dışı yapılarda güncellemeyi uygulama içinden kurabilmek için kurulum izni ister.",
  "userActionRequired": true
}
```

`iosInfoPlistKey: null` olduğu için iOS tarafına hiçbir şey eklenmez —
`getWhisprMobileIosInfoPlistUsageDescriptions` bunu zaten filtreliyor.
`mobile-store-contract.test.ts` ve izin sözleşmesi testleri yeni girdiyi bekleyecek
şekilde güncellenir.

> Mağazaya çıkışta bu izin **kaldırılacak** — Play Store, kendi güncelleme mekanizmasını
> taşıyan uygulamaları reddediyor. Kaldırma işini `docs/prompts/` altına bir TODO notu
> olarak değil, `mobile-store-contract-data.json` içindeki girdiye açık bir yorum
> alanı (`storeBlocker: true` gibi) ile işaretle ve mağaza hazırlık testine assert ekle.

### eas.json

- `uat` profilinde `autoIncrement: false` → **`true`** yapılmalı; `versionCode` her yapıda
  artmazsa Android downgrade sayıp kurulumu reddeder.
- APK (AAB değil) üretimi için `uat` ve `canary` profillerine
  `"android": { "buildType": "apk" }` eklenir. `production` profili `store` dağıtımında
  kalır, AAB üretmeye devam eder.

### İmzalama

APK, kurulu uygulamayla **aynı anahtarla** imzalanmalı. EAS'taki mevcut Android
credential'ı kullanılır; yeni keystore üretilmez. Farklı anahtar
`INSTALL_FAILED_UPDATE_INCOMPATIBLE` verir ve kullanıcı uygulamayı silmeden güncelleyemez.

---

## 3. R2 düzeni (desktop deseninin aynısı)

`apps/desktop/RELEASE.md` kurallarını birebir uygula: değişmez artefakt yolu,
ring başına ayrı manifest, publish sonrası uzak doğrulama.

```
whispr-mobile-updates/
  mobile/uat/latest.json
  mobile/uat/releases/v0.9.0-uat.1/whispr-0.9.0-8200.apk
  mobile/uat/releases/v0.9.0-uat.1/whispr-0.9.0-8200.apk.sha256
  mobile/canary/...
  mobile/production/...
```

- Ring kökündeki APK yolları **asla üzerine yazılmaz**; yalnız `latest.json` mutable.
- Rollback = `latest.json`'ı eski sürüme çevirmek. Kurulu istemciye dokunulmaz.
- Cloudflare: APK'lar `public, max-age=31536000, immutable`; `latest.json` kısa TTL
  (60 sn). **Range request'ler geçmeli** — `Duraklat`/`Sürdür` bunu kullanıyor,
  R2 destekliyor, önde bir Worker varsa `Range` başlığını kırpmamalı.

`latest.json` bu mimaride **ikincil** (parity/hata ayıklama için); istemcinin okuduğu
otorite API'dir (§4).

---

## 4. Veri modeli ve uçlar

### Prisma

Prompt 01'deki `Release` modelinin yanına:

**`ReleaseArtifact`**

- `id` uuid, `releaseId` (`onDelete: Cascade`)
- `platform` (`ANDROID | IOS`), `kind` (`APK | AAB | IPA`)
- `channel ReleaseChannel`
- `versionCode Int`, `url String`, `sizeBytes BigInt`, `sha256 String`
- `signingCertSha256 String?`
- `createdAt`
- `@@unique([platform, kind, channel, versionCode])`
- `@@index([releaseId])`

`Release` modeline ek alan: `minSupportedVersionCode Int?` — zorunlu güncelleme kapısı.

Migration `rebaseline-migrations/` altına, zaman damgası en büyük.

### Mobil uç (mevcut ucun genişletilmesi)

`GET /api/v1/mobile/app/update` yanıtı `android` bloğu kazanır:

```ts
android?: {
  versionCode: number;
  url: string;
  sizeBytes: number;
  sha256: string;
  signingCertSha256?: string;
}
```

Ayrıca yanıt kökünde `minSupportedVersionCode?: number` ve
`updateKind: "ota" | "apk" | "none"` döner.

**`updateKind` kararı sunucuda verilir**, istemcide değil:

- İstemcinin `runtimeVersion`/parmak izi en yeni bundle ile uyumluysa → `"ota"`
- Uyumsuzsa (native değişiklik var) ve platform Android ise → `"apk"`
- Platform iOS ve uyumsuzsa → `"none"` (istemci "Bu güncelleme için mağaza sürümü
  gerekiyor" bilgisini gösterir; TestFlight bağlantısı kapsam dışı)

İstemci `expo-runtime-version` + `versionCode` bilgisini istek başlığında/sorguda gönderir.

### Admin ucu

`POST /api/v1/admin/releases/[releaseId]/artifact` — yetenek `release.write`
(prompt 14'teki haritaya ekle), gövde `ReleaseArtifact` alanları.
Aynı `(platform, kind, channel, versionCode)` ikinci kez gelirse 409.
Her yazım audit kaydı düşürür.

Hız sınırı eylemleri: `mobile:app:update` mevcut; `admin:release:artifact` eklenir.

---

## 5. İstemci: indirme, doğrulama, kurulum

Yeni modül: `apps/mobile/src/about/mobile-apk-updater.ts`

### İndirme

1. Ağ kontrolü: `whispr.settings.autoUpdate` açıkken yalnız Wi-Fi'de otomatik;
   kullanıcı elle başlattığında hücresel veri için **onay sor** (boyutu söyleyerek).
2. Disk alanı kontrolü: boş alan `sizeBytes * 1.2`'den küçükse indirmeyi başlatma,
   sheet'te "Yeterli alan yok · {n} MB gerekiyor" göster.
3. Hedef: `cacheDirectory` altında `whispr-<versionCode>.apk`
   (`documentDirectory` **değil** — yedeklenmemesi gereken geçici dosya).
4. İlerleme geri çağrımı 1d'yi besler; hız penceresi son 5 örnekten ortalanır
   (anlık hız ETA'yı zıplatır).
5. `pauseAsync`/`resumeAsync` `Duraklat` butonuna bağlanır. Duraklatma durumu
   AsyncStorage'a yazılır ki uygulama kapanıp açılsa bile devam edilebilsin.

### Doğrulama — "İmza doğrulanıyor" aşaması

Üç katman, sırayla:

1. **Boyut** manifesttekiyle eşleşiyor mu.
2. **Özet (hash)** doğrulaması. `expo-crypto` yalnız metin özetliyor; 48 MB dosyayı
   belleğe almak kabul edilemez. İki seçenek, ikisi de yazılır:
   - Ucuz kontrol: dosya bilgisi sorgusunda MD5 hesabı (kurulu `expo-file-system`
     sürümünde bu seçenek varsa) → hızlı bütünlük kontrolü.
   - Tam kontrol: dosyayı 1 MB'lık parçalar hâlinde base64 okuyup **artımlı** SHA-256
     ile özetle (saf JS, native build gerektirmeyen bir hash kütüphanesi eklenebilir).
     Bu adım 1d'nin ikinci aşamasını gerçek işle doldurur; ilerleme yüzdesi
     okunan bayt / toplam bayt olarak gösterilir.
     Manifest özeti eşleşmezse: **dosyayı sil**, sheet `danger` durumuna geç
     ("Doğrulama başarısız, tekrar dene"), telemetriye yaz.
3. **Gerçek güvence: Android'in kendi imza doğrulaması.** Kurulum sırasında sistem,
   APK'nın imzasını kurulu uygulamanın sertifikasıyla karşılaştırır; farklıysa kurulum
   reddedilir. Bu atlanamaz ve bizim kodumuza bağlı değil. `signingCertSha256` alanı
   manifest ile karşılaştırma için bilgi amaçlı taşınır.

### Kurulum

1. `const contentUri = await FileSystem.getContentUriAsync(fileUri)` — `file://` URI'si
   doğrudan intent'e verilirse Android 7+ `FileUriExposedException` atar.
2. `expo-intent-launcher` ile:
   ```
   action: "android.intent.action.VIEW"
   data: contentUri
   type: "application/vnd.android.package-archive"
   flags: 1   // FLAG_GRANT_READ_URI_PERMISSION
   ```
3. Kullanıcı "bilinmeyen kaynak" iznini vermemişse sistem ayarlara yönlendirir.
   Bunu sürprize çevirme: kurulum intent'inden **önce** 1d sheet'inde tek satırlık
   açıklama göster ("Android bir kez izin isteyecek"). Kullanıcı ayarlardan dönerse
   kurulum tekrar denenebilir olmalı — `AppState` `active` olduğunda "Kuruluma devam et"
   eylemi sunulur.
4. Kurulum sonrası uygulama sistem tarafından yeniden başlatılır. Açılışta
   `versionCode` yeni ise `cacheDirectory` altındaki eski APK'lar silinir.

### Zorunlu güncelleme kapısı

`minSupportedVersionCode` mevcut `versionCode`'dan büyükse: 1d kartı kapatılamaz,
`Neler yeni?` yanındaki "Bu sürümü atla" gizli, uygulama ana akışı kilitli.
Kilit ekranı yeni bir tasarım değil — 1d'nin scrim'siz, kapatılamaz hâli.

### Adaptör

`createAndroidApkUpdateController()`:

```ts
capabilities: { isEnabled: Platform.OS === "android", reportsPercent: true, canPause: true }
```

`mobile-update-controller.ts` içindeki seçim:
`updateKind === "apk" && Platform.OS === "android"` → APK adaptörü;
`updateKind === "ota"` → OTA adaptörü (prompt 16); `"none"` → bilgi durumu.

---

## 6. CI

Yeni workflow: `.github/workflows/mobile-release.yml` — `desktop-release.yml` deseninin
mobil karşılığı. Sırayla:

1. Sürüm/kanal sözleşmesini doğrula (ring, versiyon, `versionCode` monotonluğu).
2. EAS ile APK üret (`--profile <ring> --platform android`).
3. Artefaktı indir, `sha256` hesapla, imza sertifikası parmak izini çıkar.
4. R2'ye yükle: `mobile/<ring>/releases/<tag>/`. Desktop hattının kullandığı yükleme
   aracını kullan (`apps/desktop` scriptlerinden oku), yeni yol icat etme.
5. `latest.json` üret ve `mobile/<ring>/latest.json` olarak yükle.
6. Admin ucuna kaydet: `POST /api/v1/admin/releases/[releaseId]/artifact`.
7. **Uzak doğrulama:** APK URL'sine `HEAD` at (boyut eşleşiyor mu), `Range: bytes=0-1023`
   ile kısmi indirme dene (devam ettirme buna bağlı), `/api/v1/mobile/app/update`
   yanıtının yeni artefaktı gösterdiğini doğrula. Bu adım geçmezse iş **başarısız** olur.

Gizli anahtarlar: R2 erişim anahtarı, EAS token, admin API token. Hiçbiri repoya girmez.

---

## 7. Testler

`apps/web` içinden:

- `src/app/api/v1/mobile/app/update/route-logic.test.ts` (genişletme)
  — `updateKind` kararı: parmak izi uyumlu → `ota`; uyumsuz + Android → `apk`;
  uyumsuz + iOS → `none`. `minSupportedVersionCode` yanıtta.
- `src/app/api/v1/admin/releases/[releaseId]/artifact/route-logic.test.ts`
  — yetenek reddi 403, aynı `versionCode` ikinci kez 409, audit yazımı.

`apps/mobile` içinden:

- `scripts/mobile-apk-updater.test.ts`
  — hız/ETA hesabı son 5 örnekten ortalanıyor; boyut uyuşmazlığında dosya siliniyor;
  hash uyuşmazlığında `danger` durumu; disk alanı yetmezse indirme başlamıyor;
  duraklatma durumu kalıcı yazılıyor ve devam ettirilebiliyor;
  `Platform.OS === "ios"` iken adaptör `isEnabled: false`.
- `scripts/mobile-update-controller.test.ts` (genişletme) — `updateKind`'a göre adaptör
  seçimi; APK adaptörü `reportsPercent: true`.
- `scripts/mobile-store-contract.test.ts` — yeni izin girdisi ve mağaza engeli işareti.
- `component-tests/mobile-about-update-1d.test.tsx` (genişletme)
  — APK adaptörüyle yüzde metni, `Duraklat`/`Sürdür` aynı buton, üç aşama sırayla
  ilerliyor; zorunlu güncellemede sheet kapatılamıyor ve "Bu sürümü atla" görünmüyor;
  izin açıklama satırı kurulumdan önce görünüyor.

---

## 8. Doğrulama

```bash
pnpm --filter @wizards/web typecheck
```

```bash
pnpm --filter @wizards/mobile typecheck
```

`apps/mobile` içinden:

```bash
node --test --import tsx scripts/mobile-apk-updater.test.ts
```

```bash
npx jest component-tests/mobile-about-update-1d.test.tsx
```

Cihaz doğrulaması (bu özelliğin ilk APK'sı elle kurulur):

1. `versionCode` 8200 APK'yı elle kur.
2. `versionCode` 8201 APK'yı CI ile yayınla.
3. 1a → `Denetle` → 1d → `Şimdi güncelle` → indirme yüzdesi ilerliyor, `Duraklat` çalışıyor.
4. Doğrulama aşaması geçiyor, sistem kurulum ekranı açılıyor, kurulum bitiyor,
   uygulama 8201 olarak açılıyor, eski APK cache'ten silinmiş.
5. Bozuk sha256 ile bir kayıt gir → sheet `danger` durumuna geçiyor, dosya silinmiş.
6. `minSupportedVersionCode = 8201` yap → 8200'de kilit ekranı çıkıyor.

---

## 9. Bilinmesi zorunlu kısıtlar

- **Otomatik geri alma yok.** Bozuk APK yayınlanırsa kullanıcı elle indirmek zorunda.
  Bu yüzden `latest.json` ve API kaydını geri almak yeterli değil — bozuk sürüm zaten
  kurulmuş cihazlarda kalır. Kritik hatada kurtarma yolu OTA katmanıdır (prompt 16):
  parmak izi aynıysa JS düzeltmesi OTA ile gider.
- R2 ele geçerse imzasız APK dağıtılabilir. Azaltma: APK baytları R2'de, `sha256`
  API'de — iki ayrı kaynak. Ek olarak Android'in imza doğrulaması geçilemez.
- Play Store'a çıkışta `REQUEST_INSTALL_PACKAGES` ve bu akış **kaldırılacak**;
  mağaza politikası kendi güncelleme mekanizmasını yasaklıyor.
- Android 14+ için `PackageInstaller` session API'si `ACTION_VIEW` intent'inden daha
  sağlam. Intent yolu sorun çıkarırsa küçük bir native modül yazılır; bu iş kolunda
  intent yolu denenir, sorun görülürse yükseltilir.

---

## 10. Bitiş kriterleri

1. `expo-intent-launcher` eklendi; `REQUEST_INSTALL_PACKAGES` izni store-contract
   verisinden üretiliyor; mağaza engeli işaretli ve test ediyor.
2. `eas.json`: `uat` `autoIncrement: true`, `uat`/`canary` APK üretiyor.
3. `ReleaseArtifact` modeli + `minSupportedVersionCode` + migration
   `rebaseline-migrations/` altında.
4. `updateKind` kararı **sunucuda**; iOS'ta `apk` asla dönmüyor.
5. İndirme gerçek yüzde/ETA veriyor, `Duraklat`/`Sürdür` aynı butonda çalışıyor.
6. Doğrulama aşaması gerçek iş yapıyor; uyuşmazlıkta dosya siliniyor ve `danger` durumu.
7. Kurulum `content://` URI ile açılıyor; izin akışı kullanıcıya önceden açıklanıyor.
8. Zorunlu güncelleme kapısı çalışıyor; "Bu sürümü atla" o durumda gizli.
9. CI: APK üret → R2 → kaydet → **uzak doğrulama** (HEAD + Range + API kontrolü).
10. Cihazda uçtan uca bir güncelleme, bir bozuk-hash denemesi ve bir zorunlu güncelleme
    denendi.
11. Web + mobil typecheck 0 hata, yeni testler yeşil. **Commit atılmadı.**
