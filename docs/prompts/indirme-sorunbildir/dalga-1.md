# Dalga 1 — Sözleşme, veri ve sunucu katmanı

Önce `00-ortak-baglam.md` oku. Branch `uat`, commit yok. **Bu dalgada hiçbir ekran dosyasına
dokunulmaz** — UI Dalga 2 ve 3'ün işi. Dalga sonunda iki uç Postman/curl ile çalışır durumda olur.

---

## Ş1 · Sözleşmeler (`packages/types`)

**Dosya:** yeni `packages/types/src/app-downloads.ts`, mevcut `packages/types/src/mobile.ts`,
`packages/types/src/index.ts`.

1. **Sorun bildir — web varyantı.** `MobileBugReportRequestSchema` yeniden kullanılır, kopyalanmaz.
   `packages/types/src/mobile.ts:1306`'daki şemayı dışa aktarılan bir web takma adıyla ver
   (`WebBugReportRequestSchema = MobileBugReportRequestSchema`) ve şu iki noktayı belgele:
   - `platform` web'de `"web"` veya `"desktop"` taşır (kolon `VarChar(16)`, şema `min(1).max(16)` — değişiklik gerekmez).
   - `releaseChannel` `stable | beta | uat`. Desktop `releaseRing` eşlemesi:
     `production` ve `production-small` → `stable`, `uat` → `uat`. Eşleme saf fonksiyon olarak
     `packages/types` içinde yaşar ve node testi olur.
2. **İndirme kataloğu.** Yeni şemalar, hepsi `.strict()`:
   - `DownloadEnvironmentSchema = z.enum(["prod","uat"])`
   - `DownloadPlatformSchema = z.enum(["windows","macos","linux","android","ios"])`
   - `DownloadDeliverySchema = z.enum(["direct","store","testflight"])` — düğme ikonunu belirler
     (SPEC B.5: mağaza = dış bağlantı ikonu, direct/testflight = indirme oku).
   - `DownloadArtifactSchema`: `platform`, `delivery`, `url` (`https://` zorunlu, max 2048),
     `extensionLabel` (`.exe`, `.dmg`, `.AppImage · .deb`, `Play Store`, `TestFlight`…, max 40),
     `metaLabel` (SPEC'teki meta satırı, max 120), `sizeBytes` (sayı, `BigInt` değil),
     `versionLabel`, `buildLabel`, `sha256` (opsiyonel).
   - `DownloadCatalogSchema`: `environment`, `desktop: { versionLabel, releasedAt, artifacts[] }`,
     `mobile: { versionLabel, noteLabel, artifacts[] }`, `notice: { versionPill }`.
   - `AppDownloadsResponseSchema`: `{ defaultEnvironment, catalogs: { prod, uat } }` — iki ortam
     **tek istekte** döner, ortam değiştirme ağa çıkmaz (SPEC B.2 anında geçiş).
3. Sabitler: `BUG_REPORT_BODY_MIN_LENGTH`/`MAX_LENGTH` zaten `mobile.ts`'te; yeniden tanımlama.

**Kabul:** `pnpm --filter @wizards/types test` yeşil; yeni şemaların her biri için geçerli/geçersiz
örnek testi var; `index.ts` dışa aktarımları eksiksiz.

---

## Ş2 · Katalog verisi (`packages/db`)

**Dosya:** `packages/db/prisma/schema.prisma`, `packages/db/prisma/rebaseline-migrations/…`.

Yeni model `DownloadArtifact`. **`ReleaseArtifact` genişletilmez** — o tablo mobil OTA zincirine
(`MobileUpdatePlatform`, `OtaBundle`, `@@unique([platform,kind,channel,versionCode])`) bağlı;
oraya masaüstü satırı sokmak güncelleme yolunu riske atar.

```
enum DownloadPlatform { WINDOWS MACOS LINUX ANDROID IOS }
enum DownloadDelivery { DIRECT STORE TESTFLIGHT }

model DownloadArtifact {
  id             String           @id @default(uuid())
  channel        ReleaseChannel            // STABLE = PROD kartı, UAT = UAT kartı
  platform       DownloadPlatform
  delivery       DownloadDelivery
  url            String           @db.VarChar(2048)
  extensionLabel String           @db.VarChar(40)
  metaLabel      String           @db.VarChar(120)
  versionLabel   String           @db.VarChar(32)
  buildLabel     String?          @db.VarChar(32)
  sizeBytes      BigInt?
  sha256         String?          @db.VarChar(64)
  releasedAt     DateTime
  publishedAt    DateTime?                 // NULL = taslak, uç döndürmez
  createdAt      DateTime         @default(now())
  updatedAt      DateTime         @updatedAt

  @@unique([channel, platform])
  @@index([channel, publishedAt])
}
```

- `publishedAt = NULL` **taslaktır**, hiçbir kullanıcı ucu döndürmez (`Release` modelindeki
  aynı sözleşme).
- `@@unique([channel, platform])`: bir ortamda bir platformun tek güncel satırı olur; kart
  çoğaltma sorunu doğmaz.
- Migration `prisma/rebaseline-migrations` altına yazılır ve yerel DB'de koşturulur.
- `packages/db/prisma/schema-*.test.mjs` desenine uygun yeni bir şema testi ekle
  (`schema-download-artifact.test.mjs`): enum değerleri, unique, index, `publishedAt` nullable.

**Kabul:** `pnpm --filter @wizards/db test` yeşil; migration yerelde koşmuş; `schema-index-audit`
testi yeni tabloyu şikayet etmiyor.

---

## Ş3 · `POST /api/v1/support/report`

**Dosya:** `apps/web/src/app/api/v1/support/report/{route.ts,route-logic.ts,route-logic.test.ts}`.

Mobil ucun (`api/v1/mobile/support/report/route-logic.ts`) birebir kardeşi; **tek fark kimlik**:

- `requireApiUserId()` (oturum) — `requireMobileApiUserId` **değil**.
- `enforceApiRateLimit(userId, "support:report")`; yeni eylem `apps/web/src/lib/api-rate-limit.ts`
  içine mobil ile aynı bütçeyle eklenir: `{ limit: 5, windowSeconds: 600 }`.
- Gövde `WebBugReportRequestSchema` (= mobil şema, `.strict()`).
- Servis `submitMobileBugReport({ ...input, userId })` — **K5**, ikinci yazma yolu yok.
- `201` + `{ ticket, createdAt }`, `Cache-Control: no-store, no-cache, must-revalidate`.
- Sunucu tarafı `logExcerpt`'i zaten `trimBugReportLog` ile 500 satıra kırpıyor; istemci
  maskelemesine **güvenme**, Ş6'daki maskeleme sunucuda da uygulanır.

`route-logic.test.ts`: yetkisiz 401, hız sınırı 429, geçersiz gövde 400, başarılı 201 + `no-store`,
`userId`'nin servise geçtiği, fazladan anahtarın reddedildiği.

**Kabul:** `route-contract.test.ts` yeşil (uç kimlik doğrulamalı, allowlist'e **girmez**).

---

## Ş4 · `GET /api/v1/app/downloads`

**Dosya:** `apps/web/src/app/api/v1/app/downloads/{route.ts,route-logic.ts,route-logic.test.ts}`,
`apps/web/src/lib/downloads/download-catalog-service.ts` (+ testi).

- Oturum zorunlu (`requireApiUserId`), hız sınırı `app:downloads` `{ limit: 60, windowSeconds: 60 }`.
- Tek `findMany`: `where: { publishedAt: { not: null } }`, `orderBy` platform sırası SPEC'teki
  sırayla (Windows, macOS, Linux, Android, iOS) sabit bir dizi üzerinden yapılır — DB sıralamasına
  bırakılmaz.
- `BigInt sizeBytes` tele **sayı** olarak çıkar (`Number`), `null` ise `metaLabel` boyutu zaten
  taşıyor.
- Çıkış `AppDownloadsResponseSchema` ile doğrulanır; `defaultEnvironment` sunucu ortamından gelir
  (**K4**): `WHISPR_RELEASE_CHANNEL`/dağıtım ortamı `uat` ise `"uat"`, değilse `"prod"`.
- `Cache-Control: private, max-age=60` — katalog kullanıcıya özel değil ama oturum arkasında;
  `no-store` gereksiz, 60 sn tazelik yeter.
- Yayınlanmış satırı olmayan ortam **boş dizi** döner; UI o durumu Dalga 3'te ele alır.

**Kabul:** servis testi (sıralama, taslak filtresi, BigInt dönüşümü, boş ortam), route testi
(401/429/200 + başlıklar), `route-contract.test.ts` yeşil.

---

## Ş5 · Ekran görüntüsü yükleme iznini oturuma açma

**Dosya:** `apps/web/src/lib/mobile/mobile-media-uploadthing.ts` (+ testi).

`authorizeMobileMediaUpload` bugün yalnız `requireMobileApiUserId` kullanıyor. **K3**:

- Yalnız `purpose === "feedback-attachment"` için ikili kimlik: önce bearer token denenir,
  yoksa oturum (`requireApiUserId`) kabul edilir. Diğer purpose'ların davranışı **değişmez**.
- Kimlik çözümü tek bir yardımcıya (`resolveUploadOwnerId`) alınır, bağımlılık olarak enjekte
  edilir, testte iki yol da kanıtlanır.
- Hız sınırı, temizlik ve claim akışı aynen kalır; `claimMobileFeedbackAttachmentUploads`
  dokunulmaz.
- Güvenlik notu: oturum yolu yalnız `feedback-attachment` içindir; `server-icon` gibi izin isteyen
  bir purpose'un oturumla geçmediği **testle** kanıtlanır.

**Kabul:** iki kimlik yolu için ayrı testler, yetkisiz istek `UploadThingError("Unauthorized")`,
diğer purpose'lar için oturumun reddedildiği test.

---

## Ş6 · Web günlük halka tamponu

**Dosya:** yeni `apps/web/src/lib/observability/fault-log.ts` (+ testi), mevcut
`apps/web/src/lib/observability/reporter.ts`.

**K2.** Mobil `apps/mobile/src/feedback/mobile-fault-log.ts` ve
`apps/mobile/src/about/mobile-bug-report-model.ts`'teki maskeleme deseninin web karşılığı:

- Sabit boyutlu halka (kapasite 500), `{ at, kind, reference }` üçlüsü. **Ham hata mesajı
  saklanmaz** — mobildeki gerekçe aynen geçerli: mesaj metni, kanal adı veya token taşıyabilir.
  `kind` sınıflandırması: `bundle | network | render | storage`.
- `reportError(scope, error)` çağrıldığında halkaya bir satır düşer (Sentry yolu değişmez).
- `redactBugReportLogLines(lines, limit)` — mobil `SENSITIVE_LOG_PATTERN`'ın **birebir aynısı**;
  desen tek yerde yaşasın diye `packages/types` içine taşınabilir, kopyalanamaz.
- Şüpheli satır kısmen maskelenmez, **tümüyle** `[redacted]` olur.
- Saf fonksiyonlar: `appendFault`, `readFaults`, `redact…`, `collectRecentLogLines(limit=500)`.
  Tümü node testli.

**Kabul:** kapasite taşması en eskiyi düşürüyor; token/e-posta/mesaj gövdesi/dosya adı içeren
satır `[redacted]`; 500 satır sınırı hem istemcide hem `trimBugReportLog` ile sunucuda uygulanıyor.

---

## Ş7 · i18n anahtarları

**Dosya:** `apps/web/src/lib/locale/messages/tr.ts`, `…/en.ts`.

- `report.*`: başlık, alt satır, grup etiketleri, 5 kategori, placeholder, ipucu, sayaç, 3 toggle
  başlığı + alt metni, gizlilik notu, 4 hata/uyarı metni, 5 alt bar notu, buton metinleri,
  vazgeçme onayı, tam ekran, başarı ekranı (başlık, alt metin, kopyala/kopyalandı, kapat).
- `download.*`: başlık, alt satır, ORTAM/MASAÜSTÜ/MOBİL/FARK etiketleri, PROD/UAT kart metinleri,
  iki uyarı şeridi metni, 4 fark satırı ve iki sütun değeri, alt bar notu, iki buton.
- Türkçe **SPEC'ten birebir**. İngilizce için önce `mobile-copy.ts` `en` bloğu.
- Anahtar sayısı iki dosyada eşit; mevcut i18n bütünlük testi varsa yeşil kalmalı.

**Kabul:** `pnpm --filter @wizards/web test` ve `lint` yeşil; SPEC'teki her cümlenin bir anahtarı var.

---

## Dalga 1 çıkış kriteri

- [ ] `pnpm --filter @wizards/types test` · `@wizards/db test` · `@wizards/web typecheck` ·
      `@wizards/web test` · `@wizards/web lint` — beşi de yeşil.
- [ ] Migration yerel DB'de koştu.
- [ ] `POST /api/v1/support/report` oturumla 201 dönüyor, bilet `WSP-#####` biçiminde.
- [ ] `GET /api/v1/app/downloads` iki ortamın kataloğunu tek istekte dönüyor.
- [ ] Hiçbir `.tsx` ekran dosyası değişmedi.
