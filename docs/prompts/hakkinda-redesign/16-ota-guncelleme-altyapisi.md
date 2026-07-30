# 16 — Katman A: kendi sunucumuzdan OTA güncelleme (expo-updates)

Önce `00-ortak-baglam.md` oku. Ön koşul: `01`, `02`, `05` (1d ekranı ve
`MobileUpdateController` arayüzü). Branch `uat`, commit yok.

Hedef: JS/asset değişikliklerini mağazaya ve APK indirmeye gerek kalmadan cihazlara
ulaştırmak. `expo-updates` **kendi manifest sunucumuza** bağlanır, bundle'lar R2'de durur,
manifest kod imzalı olur.

Kapsam kararı: iOS'a **özel** iş (TestFlight yönlendirmesi) bu iş kolunun dışında.
OTA katmanı platformdan bağımsız yazılır — protokol ve sunucu iki platformu da destekler,
doğrulama Android üzerinde yapılır. iOS istemcisi aynı uçtan beslenir; ayrı bir ekran
veya akış eklenmez.

---

## 0. Bugünkü durum (değiştirilecek)

- `apps/mobile/app.config.js` içinde **`updates` anahtarı yok** → `Updates.isEnabled === false`,
  bugün OTA hiç çalışmıyor.
- `expo-updates` bağımlılığı kurulu.
- `eas.json` kanalları ortam adlarıyla eşleşiyor: `development`, `uat`, `canary`, `production`.
  `cli.appVersionSource: "local"`.
- Desktop tarafında olgun bir updater pipeline'ı var:
  `updates.whispr.team/desktop/<ring>/latest.json`, değişmez release yolları, `.sig`,
  `desktop-release.yml` ile R2 publish + uzak manifest doğrulama.
  **Bu iş o deseni mobil tarafa taşır**; `apps/desktop/RELEASE.md` okunacak ve kurallar
  (değişmez artefakt yolu, ring başına ayrı manifest, publish sonrası uzak doğrulama)
  birebir korunacak.

---

## 1. Kod imzalama (ilk iş)

`expo-updates` CLI ile anahtar ve sertifika üret:

```bash
npx expo-updates codesigning:generate --key-output-directory keys --certificate-output-directory certs --certificate-validity-duration-years 10 --certificate-common-name "Whispr"
```

```bash
npx expo-updates codesigning:configure --certificate-input-directory certs --key-input-directory keys
```

Kurallar:

- **Özel anahtar repoya girmez.** `keys/` `.gitignore`'a eklenir; anahtar CI secret'ı olur
  (`WHISPR_MOBILE_OTA_PRIVATE_KEY`).
- Sertifika (`certs/certificate.pem`) uygulamaya gömülür — `codesigning:configure` bunu
  `app.json`/`app.config.js` içine `updates.codeSigningCertificate` +
  `updates.codeSigningMetadata` olarak yazar. Bu repoda config JS olduğu için değeri
  **elle** `app.config.js` içine taşı ve yorumla açıkla.
- Sertifika değişirse eski istemciler güncelleme alamaz. 10 yıl geçerlilik bilinçli.

---

## 2. `app.config.js` değişiklikleri

```js
updates: {
  enabled: true,
  url: `${OTA_MANIFEST_BASE}/api/v1/app/updates/manifest`,
  // Denetim tamamen kullanıcı eylemine bağlı: 1a "Denetle" butonu. Açılışta
  // otomatik denetim yapılmaz, soğuk başlangıç süresine dokunulmaz.
  checkAutomatically: "NEVER",
  fallbackToCacheTimeout: 0,
  requestHeaders: { "expo-channel-name": <ortam kanalı> },
  codeSigningCertificate: "./certs/certificate.pem",
  codeSigningMetadata: { keyid: "main", alg: "rsa-v1_5-sha256" },
},
runtimeVersion: { policy: "fingerprint" },
```

`OTA_MANIFEST_BASE` ortam başına `DEFAULT_PUBLIC_ENV[env].apiUrl` değeridir — ayrı bir
sabit uydurma, mevcut haritayı kullan.

`runtimeVersion` politikası **`fingerprint`**: parmak izi native bağımlılık/yapılandırma
değiştiğinde değişir. Bu tam olarak Katman A ile Katman B arasındaki sınırdır —
parmak izi aynıysa OTA yeter, değiştiyse APK gerekir (prompt 17 bunu okur).
`policy: "appVersion"` kullanmayın: sürüm metnini bump etmeden native değişiklik
yapıldığında bozuk bundle gönderir.

`scripts/mobile-app-config-contract.test.ts` bu alanları doğrulayacak şekilde genişletilir
(mevcut sözleşme testi, yeni anahtarları görmezse geçer — bilinçli olarak assert ekle).

---

## 3. Veri modeli

`packages/db/prisma/schema.prisma` — prompt 01'deki `Release` modelinin yanına:

**`OtaBundle`**

- `id` uuid, `releaseId` (opsiyonel ilişki — bir sürüm notu birden fazla bundle taşıyabilir)
- `platform` (`ANDROID | IOS`), `channel ReleaseChannel`, `runtimeVersion String`
- `bundleKey String @unique` — R2 önekindeki değişmez kimlik (`mobile/ota/<key>/`)
- `manifest Json` — protokolün döndüreceği manifest gövdesi (id, createdAt, launchAsset, assets, extra)
- `rolloutPercent Int @default(100)`, `disabled Boolean @default(false)`
- `publishedAt DateTime?`, `createdAt`, `updatedAt`
- `@@index([platform, channel, runtimeVersion, publishedAt])`
- `@@unique([platform, channel, runtimeVersion, bundleKey])`

`disabled` = kill-switch. Bozuk bundle çıktığında admin bunu işaretler, sunucu
`rollBackToEmbedded` direktifi döner.

Migration `packages/db/prisma/rebaseline-migrations/` altına, zaman damgası en büyük.
`migrations/` klasörüne **yazma**.

---

## 4. Manifest ucu

`apps/web/src/app/api/v1/app/updates/manifest/route.ts` (+ `route-logic.ts` + testi).

**Kimlik doğrulaması yok** — cihaz güncellemeyi oturum açmadan da alabilmeli.
Bu yüzden `apps/web/src/app/api/v1/route-contract.test.ts` içindeki
`UNAUTHENTICATED_ROUTE_PATHS` kümesine `"app/updates/manifest"` eklenir; eklenmezse
sözleşme testi kırmızıya düşer.

Expo Updates protokolü (v1) sözleşmesi:

**Gelen başlıklar:** `expo-platform`, `expo-runtime-version`, `expo-channel-name`,
`expo-protocol-version`, `expo-expect-signature`, `expo-current-update-id`.

**Yanıt:** `Content-Type: multipart/mixed; boundary=...`, `expo-protocol-version: 1`,
`expo-sfv-version: 0`, `cache-control: private, max-age=0`.
Parçalar:

- `manifest` — JSON gövde; `expo-signature` başlığı özel anahtarla imzalanır
  (`sig="…", keyid="main", alg="rsa-v1_5-sha256"`).
- `directive` — güncelleme yoksa `{"type":"noUpdateAvailable"}`;
  `disabled` bundle varsa `{"type":"rollBackToEmbedded"}`.

İş mantığı (`apps/web/src/lib/app/ota-manifest-service.ts`):

1. Başlıkları doğrula; `expo-platform` veya `expo-runtime-version` yoksa 400.
2. `platform + channel + runtimeVersion` için `publishedAt != null`, `disabled = false`,
   en yeni bundle'ı bul.
3. Bulunamazsa `noUpdateAvailable` direktifi.
4. `expo-current-update-id` zaten en yeni bundle'a eşitse `noUpdateAvailable`.
5. `rolloutPercent < 100` ise cihaz kimliğinden (`expo-current-update-id` veya
   istemci başlığı) deterministik hash alarak yüzdeyi uygula — rastgele kullanma,
   yoksa aynı cihaz her denetimde farklı yanıt alır.
6. Manifest içindeki asset URL'lerini `updates.whispr.team/mobile/ota/<bundleKey>/…`
   olarak üret.
7. `expo-expect-signature` geldiyse imzala; imzalama anahtarı yoksa **imzasız yanıt
   dönme** — 500 ile başarısız ol. Sessizce imzasız dönmek istemcinin doğrulamayı
   atlamasına yol açar.

Hız sınırı eylemi: `app:updates:manifest` (`api-rate-limit.ts` union'ına ekle).
Kimliksiz uç olduğu için sınır IP bazlı olacak; mevcut sınırlayıcı yalnız `userId`
alıyorsa bu ucu ondan muaf tut ve Cloudflare tarafında sınırla — hangisini yaptığını
yorumla belirt.

---

## 5. Yayın hattı

Yeni script: `apps/mobile/scripts/publish-ota-bundle.mjs`

1. `npx expo export --platform android --output-dir dist`
2. Parmak izini hesapla (`npx expo-updates fingerprint:generate` veya `@expo/fingerprint`),
   `runtimeVersion` olarak kullan.
3. `dist/` içeriğini R2'ye yükle: `mobile/ota/<bundleKey>/…` (bundleKey = tarih + kısa hash,
   **değişmez**, üzerine yazma yok).
4. Manifest gövdesini üret (launchAsset + assets, her biri `key`, `contentType`, `url`, `hash`).
5. Admin ucuna kaydet: `POST /api/v1/admin/ota-bundles`
   (yetenek `release.write`, prompt 14'teki yetenek haritasına ekle).
6. Yayınla: `POST /api/v1/admin/ota-bundles/[bundleId]/publish`.
7. Doğrula: manifest ucuna gerçek başlıklarla istek at, imzayı ve asset URL'lerinin
   erişilebilirliğini kontrol et. Desktop'taki "publish sonrası uzak manifest doğrulama"
   adımının karşılığı — **atlanmaz**.

R2 yükleme aracı: desktop hattının kullandığı yöntemi kullan (`apps/desktop` scriptlerini
oku, `wrangler r2 object put` mı `aws s3` uyumlu endpoint mi olduğunu oradan al).
Yeni bir yükleme yolu icat etme.

Cloudflare tarafı:

- `updates.whispr.team/mobile/ota/**` → `cache-control: public, max-age=31536000, immutable`
- Bundle yolları değişmez olduğu için cache invalidation gerekmez.

---

## 6. İstemci: OTA adaptörü

`apps/mobile/src/about/mobile-update-controller.ts` içine
`createExpoOtaUpdateController()` (prompt 02'de iskeleti var, burada gerçek hâli):

```ts
capabilities: {
  isEnabled: Updates.isEnabled,
  reportsPercent: false,   // expo-updates yüzde vermiyor
  canPause: false,
}
```

- `check()` → `Updates.checkForUpdateAsync()`; en az 800 ms `checking` (§4.3).
  `isEnabled === false` ise anında "OTA kapalı" durumu döner (1a bunu dürüstçe gösterir).
- `download()` → `Updates.fetchUpdateAsync()`; `step: "download"` → bitince `"install"`.
  `verify` adımı istemci tarafında **yok** — imza doğrulaması `expo-updates` içinde,
  bizim göremediğimiz yerde yapılıyor. 1d'nin "İmza doğrulanıyor" satırı bu adaptörle
  gri bekleyen kalır (prompt 05 §0 bunu zaten öngörüyor).
- `install()` → `Updates.reloadAsync()`.
- `rollBackToEmbedded` direktifi geldiğinde: `Updates.checkForUpdateAsync()` sonucu
  `isRollBackToEmbedded` ile döner; kullanıcıya "Bu sürüm geri alındı, uygulama
  yeniden başlatılacak" mesajı gösterilip `reloadAsync()` çağrılır.

`Updates.useUpdates()` hook'u ile `isDownloading` / `downloadedUpdate` durumu izlenir;
yüzde **uydurulmaz**.

---

## 7. Testler

`apps/web` içinden:

- `src/app/api/v1/app/updates/manifest/route-logic.test.ts`
  — eksik başlık 400; eşleşen bundle yoksa `noUpdateAvailable`; `disabled` bundle →
  `rollBackToEmbedded`; `expo-current-update-id` en yeniye eşitse `noUpdateAvailable`;
  `expo-expect-signature` varken imza başlığı dönüyor; imzalama anahtarı yokken 500;
  `rolloutPercent` deterministik (aynı cihaz iki çağrıda aynı yanıt).
- `src/lib/app/ota-manifest-service.test.ts` — asset URL üretimi, kanal/parmak izi eşleşmesi.
- `src/app/api/v1/route-contract.test.ts` — güncellenmiş kimliksiz yol kümesi.

`apps/mobile` içinden:

- `scripts/mobile-update-controller.test.ts`'e ekleme: OTA adaptörünün `capabilities`
  değerleri, 800 ms alt sınırı, `isEnabled=false` yolunda `fetchUpdateAsync` çağrılmıyor,
  rollback direktifi akışı.
- `scripts/mobile-app-config-contract.test.ts` — `updates.url`, `checkAutomatically`,
  `codeSigningMetadata`, `runtimeVersion.policy` assert'leri.

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
node --test --import tsx scripts/mobile-app-config-contract.test.ts
```

Cihaz doğrulaması (yeni native build gerektirir — `updates` anahtarı eklendiği için):

1. `uat` profiliyle APK üret ve cihaza kur.
2. JS'de görünür bir değişiklik yap, `publish-ota-bundle.mjs` ile yayınla.
3. 1a → `Denetle` → 1d akışı → uygulama yeniden başlıyor ve değişiklik görünüyor.
4. Bundle'ı admin panelden `disabled` yap; sonraki denetimde geri alma çalışıyor.

---

## 9. Bitiş kriterleri

1. Kod imzalama anahtarı üretildi, özel anahtar repoda **yok**, sertifika gömülü.
2. `app.config.js` `updates` + `runtimeVersion: fingerprint` taşıyor; sözleşme testi assert ediyor.
3. `OtaBundle` modeli + migration `rebaseline-migrations/` altında.
4. Manifest ucu protokol v1'e uygun; imzasız yanıt dönmüyor; `UNAUTHENTICATED_ROUTE_PATHS`
   güncellendi.
5. `noUpdateAvailable` ve `rollBackToEmbedded` direktifleri çalışıyor ve test ediliyor.
6. Yayın scripti export → R2 → kaydet → yayınla → **uzak doğrulama** adımlarını yapıyor.
7. OTA adaptörü `reportsPercent: false` ile 1d'ye bağlı; hiçbir yerde sahte yüzde yok.
8. Cihazda uçtan uca bir OTA güncellemesi ve bir geri alma denendi.
9. Web + mobil typecheck 0 hata, yeni testler yeşil. **Commit atılmadı.**
