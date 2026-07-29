# 01 — Veri katmanı: Prisma modelleri, paylaşılan tipler, mobil API uçları

Önce `docs/prompts/hakkinda-redesign/00-ortak-baglam.md` dosyasını oku. Branch `uat`, commit yok.

Hedef: "Hakkında" yeniden tasarımının ihtiyaç duyduğu **tüm sunucu tarafını** kurmak.
Ekran yazılmayacak; bu prompt bittiğinde 13 ekranın beslendiği uçlar çalışır ve test edilmiş olur.

Tasarım sözleşmesi: `design_handoff/design_handoff_whispr_hakkinda/PROMPT.md` §5 (veri modeli)
ve §4 (davranışlar). Alan adları ve tipler §5'teki arayüzlerle birebir eşleşmeli.

---

## 1. Prisma şeması

`packages/db/prisma/schema.prisma` sonuna, mevcut biçim ve yorum düzenine uyarak ekle.

### Enum'lar

```prisma
enum ReleaseChannel {
  STABLE
  BETA
  UAT
}

enum ReleaseChangeType {
  NEW
  IMPROVED
  FIXED
}

enum HelpCategory {
  ACCOUNT
  CHAT
  MEDIA
  SERVER
}

enum BugReportCategory {
  VOICE
  CHAT
  NOTIFICATION
  PERFORMANCE
  OTHER
}

enum BugReportStatus {
  OPEN
  TRIAGED
  RESOLVED
  DISCARDED
}
```

### Modeller

**`Release`** — bir uygulama sürümü.

- `id` uuid, `version` `@unique` (semver metni, "0.8.15"), `codename String?`
- `channel ReleaseChannel @default(STABLE)`
- `releasedAt DateTime`, `buildNumber Int?`, `sizeBytes BigInt?`
- `summary String?` (1c/2a özet metni), `highlight String?` (geçmiş satırındaki "öne çıkan")
- `mandatory Boolean @default(false)` (1d "zorunlu değil" metni bunu okur)
- `publishedAt DateTime?` — **null ise mobil uçlarda görünmez** (taslak)
- `createdAt`, `updatedAt`
- İlişki: `changes ReleaseChange[]`
- `@@index([publishedAt, releasedAt])`, `@@index([channel, releasedAt])`

**`ReleaseChange`** — tek değişiklik maddesi.

- `id` uuid, `releaseId` (`onDelete: Cascade`), `type ReleaseChangeType`
- `title String`, `detail String?`, `position Int @default(0)`
- `@@index([releaseId, type, position])`

**`HelpArticle`**

- `id` uuid, `slug @unique`, `title String`, `category HelpCategory`
- `readMinutes Int`, `viewCount Int @default(0)`, `url String` (kanonik web adresi)
- `bodyMarkdown String?` (uygulama içi okuyucu için; boşsa `url` açılır)
- `publishedAt DateTime?`, `position Int @default(0)`, `createdAt`, `updatedAt`
- `@@index([category, position])`, `@@index([publishedAt, viewCount])`

**`BugReport`** — 2f'nin hedefi. Mevcut `ProductFeedback` tablosuna **dokunma**.

- `id` uuid, `ticket String @unique` (`WSP-#####` biçimi)
- `userId String?` + `user User? @relation(..., onDelete: SetNull)`
- `category BugReportCategory`, `body String`
- `includesLogs Boolean`, `includesScreenshot Boolean`, `includesDeviceInfo Boolean`
- `logExcerpt String?` (en fazla 500 satır), `deviceInfo Json?`
- `screenshotUrl String?` (UploadThing anahtarı/URL'i)
- `appVersion String?`, `appBuild String?`, `releaseChannel String?`, `platform String?`
- `status BugReportStatus @default(OPEN)`, `createdAt`, `purgeAfter DateTime`
  (yazarken `createdAt + 90 gün`; §4.10 "90 gün sonra silinir" sözü buradan tutulur)
- `@@index([status, createdAt])`, `@@index([purgeAfter])`, `@@index([userId, createdAt])`

### Migration

`packages/db/prisma/rebaseline-migrations/20260729120000_about_releases_help_reports/migration.sql`
(zaman damgası mevcut son migration'dan büyük olacak şekilde ayarla; `migrations/` klasörüne
**yazma** — orası okunmuyor).

SQL, üstteki modellerin karşılığı olan `CREATE TYPE` / `CREATE TABLE` / `CREATE INDEX`
ifadelerini içerir. Sonra:

```bash
pnpm --filter @wizards/db exec prisma generate
```

---

## 2. Paylaşılan tipler (`packages/types/src/mobile.ts`)

Mevcut zod deseni (şema + `z.infer`) ile ekle. Adlandırma: `Mobile<Alan><Amaç>Schema`.

```ts
MobileReleaseChangeSchema; // { type: "new"|"improved"|"fixed", title, detail? }
MobileReleaseSummarySchema; // liste satırı: version, codename?, releasedAt, changeCount, highlight?, installed?, skipped?
MobileReleaseDetailSchema; // MobileReleaseSummary + summary?, buildNumber?, sizeBytes?, changes[]
MobileReleaseListResponseSchema; // { releases: MobileReleaseSummary[], nextCursor: string|null, total: number }
MobileAppUpdateResponseSchema; // { state, lastCheckedAt, latest?, otaEnabled: boolean }
MobileAppChannelRequestSchema; // { channel: "stable"|"beta"|"uat", consentAt?: string }
MobileAppChannelResponseSchema; // { channel, requiresRestart: boolean, effectiveFrom: "next-build"|"immediate" }
MobileServiceStatusResponseSchema; // { level: "ok"|"degraded"|"down", label: string, url: string, checkedAt: string }
MobileHelpArticleSchema; // { id, slug, title, category, readMinutes, views, url, hasBody }
MobileHelpArticleListResponseSchema; // { articles: [], categories: [{ key, label, articleCount }] }
MobileBugReportRequestSchema; // { category, body(20..1000), includesLogs, includesScreenshot, includesDeviceInfo, logExcerpt?, deviceInfo?, screenshotUploadKey? }
MobileBugReportResponseSchema; // { ticket: string, createdAt: string }
```

Kurallar:

- `state`: `"current" | "available" | "checking" | "downloading" | "ready" | "failed"`
  (PROMPT.md §5 `UpdateState` ile birebir).
- `sizeBytes` istemciye **number** olarak gider (Prisma `BigInt` serileştirilmez).
- `body` uzunluk sınırı `.min(20).max(1000)` — 2f'nin gönderim kuralı sunucuda da geçerli.
- `total` alanı 2b'deki `38` rozeti ve `Tüm sürüm geçmişi (38)` satırı için gerekli;
  istemci sayamaz, sunucu döner.
- Her şema `packages/types/src/index.ts` üzerinden dışa açılır (mevcut ihracat düzenine bak).
- `packages/types/src/mobile.test.ts` içine her yeni şema için en az bir geçerli + bir
  geçersiz örnek testi ekle.

---

## 3. Servis katmanı (`apps/web/src/lib/`)

Yeni dosyalar; rotalar iş mantığını burada çağırır (rota dosyaları ince kalır).

- `apps/web/src/lib/releases/release-service.ts`
  - `listMobileReleases({ limit, cursor, installedVersion })` — `publishedAt != null`,
    `releasedAt desc` sıralı, `limit` varsayılan 20 / azami 50, cursor = `releasedAt|id`.
    Dönüşte `total` = yayınlanmış sürüm sayısı.
  - `getMobileRelease(version)` — değişiklikleri `type` ve `position` ile sıralı döner;
    bulunamazsa `null`.
  - `getMobileLatestRelease(channel)` — güncelleme durumu için.
- `apps/web/src/lib/help/help-service.ts`
  - `listMobileHelpArticles({ popular, category, limit })` — `popular` ise `viewCount desc`
    ilk 4; kategori sayıları tek `groupBy` ile.
  - `searchMobileHelpArticles(query)` — başlıkta `contains`, `mode: "insensitive"`;
    boş sonuç boş dizi döner (hata değil).
  - `recordMobileHelpArticleView(slug)` — `viewCount` artırımı, best-effort.
- `apps/web/src/lib/support/bug-report-service.ts`
  - `submitMobileBugReport(input)` — `ticket` üretir (`WSP-` + 5 hane, çakışmada tekrar
    dener), `purgeAfter = now + 90 gün` yazar, `logExcerpt`i 500 satıra kırpar.
  - `purgeExpiredBugReports()` — `purgeAfter < now` olanları siler (mevcut bakım işleri
    nerede toplanıyorsa oraya bağla; yoksa yalnız fonksiyonu yaz ve testini ekle).
- `apps/web/src/lib/app/service-status.ts`
  - `getMobileServiceStatus()` — mevcut `@/lib/health` `getReadinessPayload()` sonucunu
    üç seviyeye indirger: tüm bağımlılıklar sağlıklı → `ok`; bir bağımlılık bozuk ama
    servis yanıt veriyor → `degraded`; readiness başarısız → `down`.
    `label` sunucudan **gönderilmez** (i18n istemcide) — yalnız `level` ve durum sayfası
    `url` döner; şemadaki `label` alanı istemcinin çevirdiği metni taşımak için opsiyonel
    tutulacaksa şemadan çıkar. **Karar: `label` alanını şemadan çıkar, `level` + `url` yeterli.**

---

## 4. Mobil API uçları

Hepsi `apps/web/src/app/api/v1/mobile/` altında, `route.ts` + `route-logic.ts` ikilisi,
`MobileXRouteDependencies` DI deseni, `requireMobileApiUserId` ile kimlik,
`Cache-Control: no-store` başlığı.

| Metot | Yol                         | Yanıt                           | Notlar                                      |
| ----- | --------------------------- | ------------------------------- | ------------------------------------------- |
| GET   | `app/releases`              | `MobileReleaseListResponse`     | `?limit=&cursor=` · 2b sayfalama (20'lik)   |
| GET   | `app/releases/[version]`    | `MobileReleaseDetail`           | 2a · bulunamazsa 404                        |
| GET   | `app/update`                | `MobileAppUpdateResponse`       | 1a durum satırı + 1d kartı                  |
| POST  | `app/channel`               | `MobileAppChannelResponse`      | 2c kaydet · gövde `MobileAppChannelRequest` |
| GET   | `app/status`                | `MobileServiceStatusResponse`   | 1b servis durumu                            |
| GET   | `help/articles`             | `MobileHelpArticleListResponse` | `?popular=1&category=` · 2e                 |
| GET   | `help/search`               | `MobileHelpArticleListResponse` | `?q=` · en az 2 karakter, yoksa 400         |
| POST  | `help/articles/[slug]/view` | `{ ok: true }`                  | görüntülenme sayacı, gövdesiz               |
| POST  | `support/report`            | `MobileBugReportResponse`       | 2f · `application/json`                     |

Kararlar:

- **`support/report` JSON alır, multipart almaz.** Ekran görüntüsü mevcut UploadThing
  akışıyla ayrı yüklenir ve gövdeye `screenshotUploadKey` olarak girer
  (`apps/mobile/src/feedback/use-mobile-feedback-attachment-upload.ts` deseni). Böylece
  yeni bir yükleme yolu açılmaz.
- `app/update` **OTA gerçeğini gizlemez**: sunucu yalnız yayınlanmış en son sürümü ve
  yüklü sürümle karşılaştırmayı döner. `otaEnabled` alanı, istemcinin `Updates.isEnabled`
  değerini yansıtacağı yer değil; sunucunun OTA dağıtımı yapılandırılmış mı bilgisidir
  (bugün `false` sabiti + yorum satırıyla açıklanır).
- `app/channel` kanal tercihini kullanıcı ayarına yazar; **EAS kanalını değiştirmez**.
  `effectiveFrom: "next-build"` döner ve 2c ekranı bunu kullanıcıya söyler.
  Tercihi nereye yazacağın: mevcut kullanıcı ayar tablosuna alan eklemek yerine
  `User` üzerinde yeni bir `preferredReleaseChannel ReleaseChannel?` alanı aç (aynı
  migration içinde).
- Hız sınırı eylemleri (`api-rate-limit.ts` union'ına ekle):
  `mobile:app:releases`, `mobile:app:release-detail`, `mobile:app:update`,
  `mobile:app:channel`, `mobile:app:status`, `mobile:help:list`, `mobile:help:search`,
  `mobile:help:view`, `mobile:support:report`.
  `mobile:support:report` için sıkı sınır (örn. 5 / 10 dk) — mevcut sınır tanımlarının
  biçimine uy.
- `route-contract.test.ts`: `POST help/articles/[slug]/view` gövdesizdir →
  `BODYLESS_MUTATING_METHOD_PATHS` içine `"POST mobile/help/articles/[slug]/view"` eklenir.
  Diğer uçlar kimlik ister; `UNAUTHENTICATED_ROUTE_PATHS`'e hiçbir şey eklenmez.

---

## 5. Tohum verisi (seed)

Ekranlar boş veriyle geliştirilemez. `packages/db` altındaki mevcut seed düzenine
(varsa `prisma/seed.ts`, yoksa `packages/db/src/seed/`) **idempotent** bir ekleme yap:

- `0.8.15 "Echo"` — 24 Tem 2026, build 8150, 46,8 MB, yayınlanmış, özet:
  "Okunabilirlik güncellemesi. Mesaj tipografisi baştan ölçeklendi, sesli mesaj kaydı
  yenilendi ve thread bildirimlerindeki uzun süreli hata kapatıldı."
  Değişiklikler (2a'daki tam liste, 7 madde): 2 `NEW`, 3 `IMPROVED`, 2 `FIXED` —
  metinler HTML `2a` bloğundan (satır 65–109) birebir alınır.
- `0.8.14` (10 Tem · 6 değişiklik · "sunucu keşfet sekmesi"),
  `0.8.13 "Ripple"` (27 Haz · 11 · "ekran paylaşımı"),
  `0.8.12` (12 Haz · 4 · "uçtan uca ses"),
  `0.8.11` (29 May · 9 · "sohbet arama"),
  `0.8.10 "Chime"` (15 May · 14 · "yeni ses altyapısı"),
  `0.7.9` (18 Ara 2025 · 8 · "thread'ler").
  Bu yedisinin `changeCount` değeri `highlight` ile birlikte 1c/2b satırlarını üretir.
- Toplam yayınlanmış sürüm sayısı **38** olacak şekilde kalan sürümler üretilebilir
  (sentetik ama tutarlı: sürüm numarası, tarih, `changeCount`). 2b'nin `38` rozeti ve
  "Daha eskisini yükle" sayfalaması bunu gerektirir.
- Yardım makaleleri: 2e'deki 4 popüler başlık (`3 dk / 24B`, `2 dk / 18B`, `5 dk / 11B`,
  `4 dk / 9B`) + kategori sayıları `ACCOUNT 14`, `CHAT 22`, `MEDIA 17`, `SERVER 9`
  toplamına ulaşacak kadar makale.

---

## 6. Testler (bu prompt bitmeden hepsi yeşil)

`apps/web` içinden:

- `src/app/api/v1/mobile/app/releases/route-logic.test.ts`
  — sayfalama cursor'u, `limit` üst sınırı, taslak sürümün listede olmaması, `total`.
- `src/app/api/v1/mobile/app/releases/[version]/route-logic.test.ts`
  — değişiklik sıralaması (tip + position), 404.
- `src/app/api/v1/mobile/app/update/route-logic.test.ts`
  — `current` / `available` ayrımı, yüklü sürüm en son sürümden büyükse `current`.
- `src/app/api/v1/mobile/app/channel/route-logic.test.ts`
  — geçersiz kanal 400, başarılı yanıtta `effectiveFrom: "next-build"`.
- `src/app/api/v1/mobile/app/status/route-logic.test.ts`
  — readiness bozuk → `degraded`, readiness patlıyor → `down`.
- `src/app/api/v1/mobile/help/articles/route-logic.test.ts` ve `help/search/route-logic.test.ts`
  — popüler sıralama, kategori sayıları, 2 karakterden kısa sorgu 400, boş sonuç 200 + boş dizi.
- `src/app/api/v1/mobile/support/report/route-logic.test.ts`
  — 20 karakterden kısa gövde 400, ticket biçimi `^WSP-\d{5}$`, `purgeAfter` = +90 gün,
  `logExcerpt` 500 satıra kırpılıyor, `includesDeviceInfo=false` iken `deviceInfo` yazılmıyor.
- `src/lib/support/bug-report-service.test.ts` — ticket çakışmasında yeniden üretim.

Testlerde DB yok: tüm bağımlılıklar `route-logic`e enjekte edilir (mevcut
`mobile/feedback/route-logic.ts` deseni birebir örnektir).

---

## 7. Doğrulama

```bash
pnpm --filter @wizards/web typecheck
```

```bash
pnpm --filter @wizards/types typecheck
```

`apps/web` içinden yeni test dosyalarının her biri + mevcut sözleşme testleri:

```bash
node --test --import tsx src/app/api/v1/route-contract.test.ts
```

## 8. Bitiş kriterleri

1. `schema.prisma` 4 model + 5 enum ile derleniyor, `prisma generate` temiz.
2. Migration `rebaseline-migrations/` altında ve dosya adı zaman damgası en büyük.
3. 9 uç `route.ts` + `route-logic.ts` + test üçlüsüyle mevcut.
4. `api-rate-limit.ts` union'ı 9 yeni eylemi içeriyor; `route-contract.test.ts` yeşil.
5. `@wizards/types` şemaları PROMPT.md §5 alan adlarıyla eşleşiyor.
6. Seed 38 yayınlanmış sürüm ve 2e'deki kategori sayılarını üretiyor.
7. Web typecheck 0 hata; yeni testlerin tamamı yeşil.
8. **Commit atılmadı.**
