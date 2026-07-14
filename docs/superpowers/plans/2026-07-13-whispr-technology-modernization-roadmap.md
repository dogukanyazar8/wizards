# Whispr Technology Modernization Roadmap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Whispr'ın geliştirme, test, dağıtım ve çalışma zamanı süreçlerini ölçülebilir biçimde hızlandırırken güvenlik, gözlemlenebilirlik ve geri dönüş güvenliğini güçlendirmek.

**Architecture:** Modernizasyon bir big-bang yükseltme değil, ölçüm kapılı bir tren olarak yürütülür. Önce CI ve telemetri güvenilir hale getirilir; ardından düşük riskli sürümler, koordineli platform major'ları ve son olarak yalnızca ölçümle gerekçelenen servis/veri ayrıştırmaları uygulanır. Web, realtime ve worker süreçleri bağımsız ölçeklenebilir sınırlara taşınır; PostgreSQL, Redis/Valkey, Expo ve Tauri kararları sağlayıcı ve gerçek yük kanıtı olmadan değiştirilmez.

**Tech Stack:** Node.js, pnpm, Turborepo, TypeScript, Next.js, React, Auth.js, Prisma, PostgreSQL, Redis/Valkey, Socket.IO, LiveKit, Expo/React Native, Tauri/Rust, Playwright, Jest, Maestro, GitHub Actions, Railway, Sentry, OpenTelemetry.

## Global Constraints

- Doğruluk ve güvenlik hızdan önce gelir; hiçbir hız işi auth, izin, CSRF, SSRF, rate-limit, PII redaksiyonu veya sürüm imzalama sınırını zayıflatamaz.
- Mevcut `uat` çalışma ağacı kirli ve Mobile Phase 4 M1/M2/M3 işi içeriyor. Modernizasyon bağımlılık değişiklikleri bu iş kapanmadan aynı lockfile/schema yüzeyine bindirilmez.
- Her major aile ayrı PR'dır. Prisma, Next, Expo, Zod, Tailwind, pnpm ve TypeScript major'ları tek PR'da birleştirilmez.
- Her davranış değişikliği odaklı kırmızı testle başlar; patch/minor yükseltmeler mevcut doğrulama kapılarıyla kanıtlanır.
- UAT gözlemi olmadan production etkinleştirmesi yapılmaz. Runtime değişiklikleri en az 48 saat UAT, ardından küçük canary, sonra production sırasını izler.
- Veritabanı değişiklikleri expand/contract olmalı; deploy sırasında geri alınamaz migration ile uygulama major yükseltmesi aynı dalgada yapılmaz.
- Secret, token ve credential hiçbir dosyada veya komutta sabitlenmez; GitHub, Railway, EAS ve Sentry'de least-privilege secret/variable olarak tutulur.
- Yeni Kubernetes, Kafka, GraphQL, event-sourcing, service mesh veya framework rewrite eklenmez. Bunlar ancak mevcut sistemin ölçülmüş bir sınırı karşılayamadığı ayrı bir ADR ile gündeme gelir.
- `apps/web/src/lib/logger.ts` redaksiyon sınırı Sentry/OTel dahil bütün off-box telemetride korunur.
- `graphify-out/GRAPH_REPORT.md` kod araştırmasının ana haritasıdır; generated/test artifact düğümleri bilgi grafiğine geri sokulmaz.

---

## 1. Doğrulanmış Başlangıç Fotoğrafı — 13 Temmuz 2026

### Repo ve mimari

| Alan                    |                                                                                 Doğrulanmış durum | Sonuç                                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------: | ---------------------------------------------------------------------------------------------- |
| Graphify                |                                  1.095 dosya, yaklaşık 996 bin kelime, 11.691 düğüm, 408 topluluk | Harita güçlü fakat eski Playwright trace düğümleri ve 3.467 izole düğüm nedeniyle temizlenmeli |
| Web                     |                       645 TS/TSX dosyası, yaklaşık 122.706 satır, 150 test dosyası, 117 API route | En büyük bakım ve regresyon yüzeyi                                                             |
| Mobile                  |                               178 source dosyası, yaklaşık 35.542 satır; 64 script/contract testi | Kontrat yaklaşımı güçlü, gerçek cihaz otomasyonu CI'da çalışmıyor                              |
| Desktop                 |                                                Rust `lib.rs` 3.856 satır; 11 release-script testi | Release güvenliği güçlü, Rust modül sınırı zayıf                                               |
| Veri                    |                                                           45 Prisma model, 90 index, 29 migration | Migration ve query gözlemi olmadan major ORM/DB geçişi riskli                                  |
| En büyük web dosyaları  | `live-voice-provider.tsx` 2.849, `settings-panel.tsx` 2.617, `voice-channel-view.tsx` 2.037 satır | Yeni özellik eklerken büyüme ratchet'i gerekli                                                 |
| En büyük mobile dosyası |                                                                 `settings-screen.tsx` 1.910 satır | Değişiklikle birlikte bölümleme gerekli                                                        |

### Runtime ve bağımlılık durumu

| Aile       | Mevcut                              | Canlı registry / resmi hedef                   | Karar                                                                              |
| ---------- | ----------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------- |
| Node.js    | `.nvmrc` ve CI: 22; yerel: 24.14    | 24 LTS; 26 Current                             | 24 LTS'ye kontrollü hizala; Current kullanma                                       |
| pnpm       | 10.33.2                             | 11.12.0                                        | Node 24 sonrasında tek koordineli PR                                               |
| TypeScript | web/shared 5.x; mobile 6.0.3        | 7.0.2 native                                   | Önce 6.x hizalama, TS7'yi yan yana typecheck pilotu yap                            |
| Next.js    | 15.5.18                             | 16.2.10                                        | Auth.js stable beklemek zorunlu değil; bağımsız uyumluluk pilotu                   |
| Auth.js    | `next-auth@5.0.0-beta.31` exact pin | Beta kanalının ucu; peer Next 14/15/16         | Exact pin korunur, mevcut auth runbook ile Next 16 test edilir                     |
| Prisma     | 5.22.0                              | 6.19.3 ara hedef, 7.8.0 güncel                 | 5→6 uyumluluk dalgası, sonra ayrı Rust-free v7 projesi                             |
| Zod        | lockfile 3.25.76                    | 4.4.3                                          | `zod/v4` ile kontrat-kontrat kademeli geçiş                                        |
| Tailwind   | 3.4.19                              | 4.3.2                                          | Ayrı görsel regresyon PR'ı                                                         |
| Expo / RN  | SDK 56 / RN 0.85.3                  | SDK 57 / RN 0.86                               | Şu an bloke: `@config-plugins/react-native-webrtc@15.0.1` peer'i yalnız Expo `^56` |
| Tauri      | crate 2.11.0, CLI 2.11.0            | compatible patch'ler: crate 2.11.5, CLI 2.11.4 | Patch wave; sonra `lib.rs` domain ayrıştırması                                     |
| PostgreSQL | local/CI 16                         | 18 current; 17 ve 16 destekli                  | Railway gerçek sürümü/backups doğrulanmadan major geçiş yok                        |
| Redis      | local/CI 7                          | Redis 8.x veya Valkey 9.x                      | Provider, lisans, failover ve load testiyle karar; acil migration yok              |

Canlı `pnpm outdated -r --format json` sonucu 69 kayıt gösteriyor. Bunların 35'i major numara geçişi olarak görünse de Expo modülleri tek SDK ailesidir; gerçek planlama birimi yaklaşık 9–10 koordineli major ailedir. İki deprecated paket vardır: `@types/ioredis` ve `@types/bcryptjs`.

### Güvenlik ve operasyon

- `pnpm audit --json`: 0 info/low/moderate/high/critical.
- `cargo audit --json`: 0 vulnerability; fakat informational `unsound` uyarıları var. `anyhow 1.0.102` için `>=1.0.103` düzeltmesi compatible lock update ile alınabiliyor. GTK3/glib uyarıları Linux transitive ağacında ayrıca kayda alınmalı.
- GitHub Actions SHA-pin, Gitleaks ve pnpm audit kullanıyor; Dependabot yalnız npm ve GitHub Actions izliyor, Cargo eksik.
- `docker-compose.yml` içinde `livekit:latest` ve `clamav:stable` tekrar üretilebilirliği bozuyor.
- pnpm monorepo içinde ikinci bir `packages/db/package-lock.json` bulunuyor; tek lockfile politikasını ihlal ediyor.
- Web CSP/CSRF/secure cookie ve Tauri capability sınırları mevcut ve korunmalı.
- Merkezi hata/APM platformu henüz kaynak ağacında etkin değil; performans metrikleri çoğunlukla process-local console JSON.

### CI gerçekliği

- GitHub API, `CI` workflow durumunu `disabled_manually` olarak raporluyor. 11 Temmuz'dan sonraki commit'lerde CI kanıtı yok.
- Son incelenen run yaklaşık 31 dakika sürdü ve cross-browser job yüzünden başarısız oldu.
- Verify job yaklaşık 7 dakika; lint 35 sn, typecheck 49 sn, coverage 95 sn, build 146 sn.
- Ana Playwright job yaklaşık 24 dakika; realtime/voice dilimi tek başına yaklaşık 13 dakika.
- Desktop build yaklaşık 16,5 dakika; `cargo-audit` kurulum/çalışma bölümü yaklaşık 11 dakika.
- Workflow yedi ayrı `pnpm install`, dört ayrı Playwright browser install çalıştırıyor.
- PR'da mobile-only commit dahi web E2E ve desktop build'i tetikliyor.
- Playwright CI sunucusu `NODE_ENV=test` nedeniyle production build yerine Next development server çalıştırıyor; önceki OOM sinyaliyle doğrudan ilişkili risk.

---

## 2. Yaklaşım Seçenekleri

### Seçenek A — Big-bang “her şeyi latest yap”

En kısa takvim görüntüsünü verir ama Prisma, Next, Expo, TypeScript, Zod ve Tailwind kırılmalarını aynı hata alanında toplar. Rollback ve root-cause ayrımı zayıftır. **Reddedildi.**

### Seçenek B — Yalnız dependency upgrade treni

Sürüm borcunu azaltır fakat disabled CI, dev-server E2E, telemetri boşluğu, tekrar kurulumlar ve büyük modül sınırları değişmez. Uygulama daha güncel olur ama süreçler yeterince hızlanmaz. **Tek başına yetersiz.**

### Seçenek C — Ölçüm kapılı platform modernizasyonu

Önce CI ve gözlemlenebilirlik, sonra düşük riskli sürümler, ardından birer major aile ve en son ölçümle gerekçelenmiş servis/veri ayrıştırması. Her milestone bağımsız doğrulanır ve geri alınır. **Önerilen yaklaşım.**

---

## 3. Başarı Ölçütleri

İlk iki haftada mevcut değerler otomatik ölçülür; aşağıdaki hedefler 90 günlük çıkış kriteridir.

| Alan               | 90 günlük hedef                                                                                                  |
| ------------------ | ---------------------------------------------------------------------------------------------------------------- |
| PR fast path       | P95 ≤ 10 dakika                                                                                                  |
| Tam CI             | P95 ≤ 20 dakika; nightly full ≤ 30 dakika                                                                        |
| CI güvenilirliği   | Son 50 gerekli run'da altyapı/flaky kaynaklı başarısızlık < %2                                                   |
| Change selectivity | Mobile-only değişiklikte web E2E ve desktop build çalışmaz                                                       |
| Web E2E            | Production-mode server; OOM yok; retry ile gizlenen test yok                                                     |
| Deploy             | UAT deploy başarısı ≥ %95; rollback/runbook her runtime milestone'da kanıtlı                                     |
| API                | UAT p95 hedefi başlangıçta 300 ms, p99 1 sn; iki haftalık baseline sonrası endpoint sınıfına göre sıkılaştırılır |
| Realtime           | Mesaj ack p95 ≤ 250 ms; iki istemci görünür teslim p95 ≤ 500 ms                                                  |
| Outbox             | `oldestPendingAgeMs` p95 < 10 sn; exhausted failure oranı < %0,1                                                 |
| Web UX             | p75 LCP ≤ 2,5 sn, INP ≤ 200 ms, CLS ≤ 0,1                                                                        |
| Mobile             | Mevcut kontrat: cold launch ≤ 2.500 ms, warm resume ≤ 700 ms, composer p95 ≤ 50 ms, idle ≤ 180 MB                |
| Coverage           | Web lines 23→35+, functions 51→60+, branches 67→72+; güvenlik/izin kodu %100 davranış sınırı testi               |
| Supply chain       | 0 açık high/critical; bütün istisnalar owner + expiry içerir; release artifact SBOM/attestation üretir           |
| Freshness          | Desteklenen major ailelerde 30 günden eski patch/minor borcu yok                                                 |

---

## 4. Fazlar ve Bağımlılıklar

```text
Faz 0 (0-2 hafta): baseline + CI yeniden etkinleştirme + graph/lock hijyeni
           |
           +--> Faz 1A (2-6 hafta): observability + düşük riskli patch/minor
           |
           +--> Faz 1B (2-6 hafta): Node 24 + pnpm 11 + Cargo bakım
                         |
                         +--> Faz 2 (6-12 hafta): Next 16, Prisma 6, Zod 4, Tailwind 4
                                      |
                                      +--> Faz 3 (3-6 ay): Prisma 7, Expo 57, TS7 pilot/promosyon
                                                   |
                                                   +--> Faz 4 (6-12 ay): web/realtime ayrıştırma, DB/Redis kararı
```

Faz 0 kapanmadan hiçbir major upgrade başlamaz. Expo 57 ayrıca WebRTC config plugin uyumluluğuna, Prisma 7 query/pool baseline'ına, infrastructure major'ları ise sağlayıcı backup/restore kanıtına bağlıdır.

---

## Task 0: Mevcut WIP'yi koru ve ölçüm baseline'ını kilitle

**Öncelik:** P0<br>
**Efor:** 1–2 gün
**Bağımlılık:** Yok

**Files:**

- Create: `docs/operations/modernization-scorecard.md`
- Create: `scripts/quality/modernization-baseline.mjs`
- Create: `scripts/quality/modernization-baseline.test.mjs`
- Create: `scripts/quality/graph-corpus-contract.mjs`
- Create: `scripts/quality/graph-corpus-contract.test.mjs`
- Modify: `package.json`
- Read-only inputs: `graphify-out/graph.json`, `.github/workflows/ci.yml`, all package manifests

**Produces:** Tekrarlanabilir repo/CI/dependency ölçüm komutu ve tarihli scorecard.

- [ ] Mobile Phase 4 M1/M2/M3 değişikliklerini kendi planlarıyla kapat; bu roadmap PR'ına `pnpm-lock.yaml`, Prisma schema/migration veya Phase 4 kaynaklarını karıştırma.
- [ ] Baseline scriptinde yalnız anonim/toplu veri üret: tracked source/test sayıları, büyük dosya ratchet'i, `pnpm outdated` aile özeti, audit özetleri ve CI workflow statüsü.
- [ ] `graph-corpus-contract` ile `actions_report/`, `playwright-report/`, `test-results/`, `artifacts/`, `node_modules/`, generated Tauri schema ve `graphify-out/` kaynak düğümlerini reddet.
- [ ] Temiz tracked corpus üzerinden full graph rebuild yap; `GRAPH_REPORT.md` içinde eski `actions_report` ilişkisi kalmadığını doğrula. 5.000'den fazla düğümde HTML visualizer çalıştırma.
- [ ] `modernization-scorecard.md` içine baseline tarihini, commit'i, komut sonuçlarını ve sonraki ölçüm tarihini yaz.
- [ ] Kişisel veri, endpoint secret'ı, kullanıcı adı veya token basılmadığını test et.

**Verify:**

```powershell
node --test scripts/quality/modernization-baseline.test.mjs scripts/quality/graph-corpus-contract.test.mjs
node scripts/quality/modernization-baseline.mjs
node scripts/quality/graph-corpus-contract.mjs graphify-out/graph.json
```

**Exit criteria:** Baseline aynı commit'te iki çalıştırmada aynı yapısal sonucu verir; generated artifact düğümü sıfırdır.

---

## Task 1: CI'ı yeniden etkinleştir ve hızlı/selektif hale getir

**Öncelik:** P0 — en yüksek hız getirisi<br>
**Efor:** 3–5 gün
**Bağımlılık:** Task 0

**Files:**

- Create: `scripts/ci/changed-scopes.mjs`
- Create: `scripts/ci/changed-scopes.test.mjs`
- Create: `.github/workflows/mobile-device.yml`
- Modify: `.github/workflows/ci.yml`
- Modify: `apps/web/package.json`
- Modify: `apps/web/playwright.config.ts`
- Modify: `apps/web/server.ts`
- Reuse: `.github/workflows/desktop-release.yml` cargo-audit cache pattern

**Produces:** `changes`, `fast-verify`, seçmeli platform job'ları, production-mode E2E ve tek required summary gate.

- [ ] Önce workflow'u yalnız `workflow_dispatch` ile test et; gerekli job'lar yeşil olmadan push/PR tetiklerini yeniden açma.
- [ ] `changed-scopes.mjs` için web, mobile, desktop, db, shared, workflow ve docs-only fixture'ları yaz. `packages/types` değişikliği web+mobile; `packages/db` web; root lock/config değişikliği bütün ilgili platformları tetiklemeli.
- [ ] PR fast path'i lint, typecheck, changed unit/contract tests, web API smoke ve secret/audit kapılarından oluştur.
- [ ] Cross-browser, tam realtime/voice, a11y ve visual suite'i nightly/manual'a taşı; kritik smoke Chromium'u PR'da bırak.
- [ ] Playwright server'ı `NODE_ENV=production` altında önceden oluşturulmuş `.next` + `dist/server.js` artifact'i ile çalıştır. `E2E_TEST_MODE=true` test semantiğini koru; Next development compiler'ını CI E2E'den çıkar.
- [ ] Tek E2E build artifact'i üret ve Chromium/a11y/visual/nightly tüketicilerine dağıt; public build env'lerinin artifact ile uyumunu test et.
- [ ] CI desktop job'ına release workflow'daki version-keyed `cargo-audit` binary cache'ini taşı; cache miss/hit testini workflow contract testine ekle.
- [ ] `.turbo` için GitHub cache veya güvenli remote cache pilotu ekle. Secret gerektiren remote cache kullanılacaksa fork PR'larda read-only/fail-safe davranışı belgele.
- [ ] Node 22 ve 24 compatibility'yi bir hafta ölç; 24 yeşilse default'u 24 yap, 22'yi yalnız nightly compatibility lane'e indir.
- [ ] Bütün conditional job'ları toplayan her zaman çalışan `required-gate` ekle; skipped platform job'ları branch protection'ı kilitlememeli.
- [ ] Workflow'u yeniden etkinleştir ve üç kanıt çalıştır: docs-only, mobile-only, web/shared değişikliği.

**Verify:**

```powershell
node --test scripts/ci/changed-scopes.test.mjs
gh workflow run ci.yml -f e2e_scope=smoke
gh run list --workflow ci.yml --limit 5
```

**Exit criteria:** PR fast path P95 ≤ 10 dakika; mobile-only run web E2E/desktop build çalıştırmaz; production-mode E2E'de OOM yok; workflow `active` durumdadır.

**Rollback:** Conditional seçimde belirsizlik varsa fail-open yapıp bütün doğrulamaları çalıştır; hiçbir zaman doğrulamayı sessizce atlama.

---

## Task 2: Sentry + OpenTelemetry gözlemlenebilirlik omurgasını kur

**Öncelik:** P0/P1<br>
**Efor:** 4–6 gün + 48 saat UAT gözlemi
**Bağımlılık:** Task 1

**Files:**

- Create: `apps/web/src/instrumentation.ts`
- Create: `apps/web/src/lib/observability/*`
- Create: `apps/mobile/src/observability/*`
- Create: `apps/desktop/src-tauri/src/observability.rs`
- Create: `docs/operations/observability.md`
- Modify: `apps/web/src/lib/logger.ts`
- Modify: `apps/web/server.ts`
- Modify: `apps/web/scripts/run-outbox-worker.ts`
- Modify: `apps/mobile/app.config.js`
- Modify: `apps/mobile/eas.json`
- Modify: `apps/desktop/src-tauri/src/lib.rs`
- Modify: `railway.toml`
- Modify: `railway.outbox-worker.toml`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**

- HTTP resource attributes: `service.name`, `service.version`, `deployment.environment`, `service.instance.id`.
- Correlation: bounded random `requestId`/`traceId`; user ID, email, server ID, channel ID ve message body attribute olmaz.
- Service names: `whispr-web`, `whispr-outbox-worker`, `whispr-mobile`, `whispr-desktop`; ileride `whispr-realtime`.
- Logger bridge yalnız redacted payload alır; raw `Error` off-box reporter'a verilmez.

- [ ] Sentry'de web/server, worker, mobile ve desktop projelerini ayrı oluştur; UAT/prod environment'larını ayır.
- [ ] Source-map/release token'ını organization token + gerekli minimum scope ile oluştur; `SENTRY_AUTH_TOKEN` sensitive secret'tır.
- [ ] Web ve worker secret setlerini ayır. Worker'a web-only auth, Turnstile, UploadThing veya LiveKit secret'ı kopyalama.
- [ ] `logger.ts` redaksiyonunu export edilebilir saf scrubber sınırına çıkar ve circular/Error/PII/JWT/secret testlerini koru.
- [ ] Node tarafında OTel traces ve metrics stable bileşenlerini kullan; browser OTel experimental olduğu için web client'ta Sentry performance + Core Web Vitals ile başla.
- [ ] Prisma, HTTP, Socket.IO handshake/event, LiveKit token mint ve outbox drain span'leri ekle. Message content/body, auth headers ve raw query parameter'ları kaydetme.
- [ ] Sentry sample rate'lerini UAT'ta yüksek, production'da budget'lı tanımla; noisy expected 4xx ve validation error'larını filtrele.
- [ ] Mobile crash/native error ve release/environment tag'lerini EAS profile ile eşle; public env içine DSN dışında secret koyma.
- [ ] Desktop panic hook'un local redacted diagnostics davranışını koru; off-box gönderimi opt-in sampling ve release ring ile sınırla.
- [ ] Dashboard/alert oluştur: availability, API p95/p99, error rate, socket connect/reconnect, message ack/delivery, outbox age/failure, Prisma pool/query latency, mobile crash-free session, desktop updater failure.
- [ ] Önce UAT'ta sentetik hata ve trace smoke'u çalıştır; redaksiyon incelemesi tamamlanınca 48 saat gözle; sonra canary/prod.

**Verify:**

```powershell
corepack pnpm --filter @wizards/web test:coverage
corepack pnpm --filter @wizards/mobile test
corepack pnpm --filter @wizards/mobile test:components
corepack pnpm --filter @wizards/desktop test
```

**Exit criteria:** Dört runtime release ile korele; Sentry örneklerinde secret/PII yok; UAT dashboard'ları gerçek web/socket/worker/mobile/desktop sinyali alıyor.

---

## Task 3: Düşük riskli bakım dalgası ve supply-chain hijyeni

**Öncelik:** P1<br>
**Efor:** 2–3 gün
**Bağımlılık:** Task 1; Mobile Phase 4 lockfile işi kapanmış olmalı

**Files:**

- Modify: root/app/package manifests
- Modify: `pnpm-lock.yaml`
- Delete: `packages/db/package-lock.json`
- Modify: `packages/db/package.json`
- Modify: `.github/dependabot.yml`
- Modify: `docker-compose.yml`
- Modify: `apps/desktop/src-tauri/Cargo.lock`
- Create: `scripts/quality/single-lockfile.test.mjs`

- [ ] `packages/db` seed/sync scriptlerini repo standardı `tsx` ile çalıştır; `ts-node` ve nested npm lockfile'ı kaldır.
- [ ] `@types/ioredis` kaldır; bcryptjs 3 dalgası gelene kadar deprecated `@types/bcryptjs` için owner/expiry kaydı tut.
- [ ] Web/root patch-minor ailelerini ayrı, mobile native aileyi ayrı PR yap: Turbo, Prettier, Playwright, React web patch, React Query, ioredis, LiveKit web SDK'ları, Tauri JS patch'leri.
- [ ] Mobile native patch/minor için `npx expo install --fix` ve `npx expo-doctor` kullan; registry'nin bağımsız “latest” değerini doğrudan uygulama.
- [ ] `cargo update --dry-run` sonucundaki compatible patch'leri al; `anyhow >=1.0.103` geldiğini ve Tauri 2.11 patch hattının üç OS kontratında yeşil olduğunu doğrula.
- [ ] Dependabot'a `cargo` ecosystem, directory `/apps/desktop/src-tauri`, target `uat`, weekly schedule ekle.
- [ ] `livekit:latest` ve `clamav:stable` yerine doğrulanmış version+digest pin kullan. PostgreSQL/Redis en az current minor/digest ile pinlenir; local ve CI image contract testi eklenir.
- [ ] `single-lockfile.test.mjs` yalnız `pnpm-lock.yaml` ve `apps/desktop/src-tauri/Cargo.lock` izinli olacak şekilde yeni nested lockfile'ı reddetsin.

**Verify:**

```powershell
corepack pnpm install --frozen-lockfile
corepack pnpm audit --audit-level moderate
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
cargo audit
cargo test
```

**Exit criteria:** 0 high/critical; nested npm lockfile yok; compatible patch/minor borcu sıfıra yakın; container startup smoke yeşil.

---

## Task 4: Node 24, pnpm 11 ve TypeScript toolchain hizalaması

**Öncelik:** P1<br>
**Efor:** 3–4 gün
**Bağımlılık:** Task 3

**Files:**

- Modify: `.nvmrc`
- Modify: `package.json`
- Modify: app/package manifests
- Modify: `pnpm-lock.yaml`
- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/desktop-release.yml`
- Modify: `apps/web/scripts/build-server.mjs`
- Create: `scripts/quality/toolchain-contract.test.mjs`

- [ ] Önce Node 24 lane'ini required olmayan compatibility job olarak çalıştır; native Sharp/Prisma/esbuild/Tauri build'ini doğrula.
- [ ] Node 24 yeşilse `.nvmrc`, engines, Actions ve build target'ı tek kaynak sözleşmesine bağla; Node 22 lane'ini bir release boyunca nightly tut.
- [ ] pnpm 11'i tek PR'da yükselt; lockfile'ı yalnız pnpm 11 ile yeniden üret; `allowBuilds`/`onlyBuiltDependencies` ve script approval davranışını test et.
- [ ] Web/shared/db TypeScript'i önce 6.x hattında mobile ile hizala. `ts-node` kaldırılmış olmalı; Next/ESLint/tsx/Prisma compatibility doğrulanmalı.
- [ ] TypeScript 7.0.2'yi `@typescript/native` alias ile side-by-side pilot et; mevcut TS6 compiler/tooling'i kaldırma.
- [ ] `packages/types`, sonra web `src/lib`, sonra bütün repo için `tsc` ve native TS sonuçlarını karşılaştıran report-only CI lane ekle.
- [ ] Error parity ve unsupported build/declaration özellikleri kapanmadan TS7'yi default compiler yapma.

**Verify:**

```powershell
node --version
corepack pnpm --version
corepack pnpm install --frozen-lockfile
corepack pnpm typecheck
corepack pnpm build
node --test scripts/quality/toolchain-contract.test.mjs
```

**Exit criteria:** Local/CI aynı Node+pnpm kullanır; TS6 default yeşil; TS7 pilot süresi ve hata parity'si scorecard'da ölçülür.

---

## Task 5: Next.js 16 geçişi ve web build/runtime hızlandırması

**Öncelik:** P1/P2<br>
**Efor:** 4–6 gün
**Bağımlılık:** Tasks 1, 2, 4

**Files:**

- Modify: `apps/web/package.json`
- Modify: `apps/web/next.config.ts`
- Rename/Modify: `apps/web/src/middleware.ts` → `apps/web/src/proxy.ts`
- Modify: route/page/layout files using sync request APIs
- Modify: `apps/web/server.ts`
- Modify: `apps/web/scripts/build-server.mjs`
- Modify: `apps/web/playwright.config.ts`
- Modify: `docs/operations/authjs-v5-beta-risk-runbook.md`

- [ ] İlk PR'da yalnız Next 15 latest patch ve bundle baseline al; route bundle, build süresi, Fast Refresh ve E2E sürelerini kaydet.
- [ ] Next 16 codemod diff'ini ayrı worktree'de üret; otomatik diff'i körlemesine kabul etme.
- [ ] `middleware.ts` CSRF/CSP davranışını `proxy.ts` Node runtime'a taşı; mevcut middleware testlerini davranış testi olarak koru.
- [ ] `cookies`, `headers`, `params`, `searchParams` sync kullanımlarını async API'lere geçir; route signature contract testlerini çalıştır.
- [ ] Turbopack build'i varsayılan dene; bundle-analyzer/plugin uyumsuzluğunda geçici `--webpack` fallback kullan ve owner+expiry kaydet.
- [ ] Auth.js beta exact pin'i koru. Registry peer'i Next 16'yı destekliyor; stable v5 beklemek yerine mevcut runbook'taki credentials, 2FA, session revocation, OAuth, desktop handoff ve mobile exchange kapılarını çalıştır.
- [ ] Cache Components ve React Compiler'ı upgrade PR'ına ekleme. Upgrade baseline stabil olduktan sonra ayrı benchmark PR'larıdır.
- [ ] Custom server'ın Automatic Static Optimization kaybını ADR'ye kaydet; Task 11 öncesi runtime mimarisini aynı PR'da değiştirme.

**Verify:**

```powershell
corepack pnpm --filter @wizards/web lint
corepack pnpm --filter @wizards/web typecheck
corepack pnpm --filter @wizards/web test:coverage
corepack pnpm --filter @wizards/web build
corepack pnpm --filter @wizards/web e2e:api
corepack pnpm --filter @wizards/web e2e:smoke
```

**Exit criteria:** Next 16 production build ve auth/realtime smoke yeşil; build/Fast Refresh baseline'dan kötü değil; webpack fallback varsa süreli kaydı var.

---

## Task 6: Prisma 6 uyumluluk dalgası, ardından Prisma 7 mimari geçişi

**Öncelik:** P1/P2<br>
**Efor:** Prisma 6: 3–4 gün; Prisma 7: 1–2 hafta
**Bağımlılık:** Tasks 2, 3, 4

**Files:**

- Modify: `packages/db/package.json`
- Modify: `packages/db/prisma/schema.prisma`
- Modify: `packages/db/prisma/prisma.config.ts`
- Modify: `packages/db/src/index.ts`
- Modify: `apps/web/package.json`
- Modify: `pnpm-lock.yaml`
- Create: `packages/db/src/client-contract.test.ts`
- Create: `docs/operations/prisma-upgrade.md`

### Milestone 6A — Prisma 5 → 6.19.3

- [ ] Query count/latency ve connection baseline'ını OTel ile 48 saat UAT'ta topla.
- [ ] `prisma` ve `@prisma/client` sürümlerini bütün workspace'te birlikte 6.19.3 yap; schema migration ekleme.
- [ ] Generate, migrate deploy, 29 mevcut migration replay, seed ve 117 route build kontratını çalıştır.
- [ ] 48 saat UAT'ta pool, slow query, error rate ve outbox davranışını karşılaştır.

### Milestone 6B — Prisma 7.8

- [ ] Ayrı ADR'de yeni `prisma-client` generator output yolunu ve `@prisma/adapter-pg` pool ayarlarını seç.
- [ ] Generated client'ı explicit workspace output'a taşı; bütün import'ları tek `@wizards/db` facade arkasında tut.
- [ ] v6 pool timeout/size davranışını adapter config'inde açıkça yeniden üret; provider connection limitine göre hesapla.
- [ ] Removed middleware/metrics/CLI/seed davranışlarını repo scriptlerinde ara ve explicit karşılıklarını ekle.
- [ ] Shadow/direct URL ve migration config'ini secret-safe `prisma.config.ts` üzerinden yönet.
- [ ] Aynı fixture/load altında query latency, memory, startup ve bundle/deploy size karşılaştır; en az eşit olmadan promote etme.

**Verify:**

```powershell
corepack pnpm --filter @wizards/db db:generate
corepack pnpm --filter @wizards/db exec prisma validate
corepack pnpm --filter @wizards/db typecheck
corepack pnpm --filter @wizards/web test:coverage
corepack pnpm --filter @wizards/web e2e:api
```

**Exit criteria:** UAT query/error/pool metrikleri baseline'dan kötü değil; migration replay ve rollback runbook kanıtlı; generated client yalnız db package'tan tüketiliyor.

---

## Task 7: Zod 4 ve Tailwind 4'ü iki ayrı göç olarak tamamla

**Öncelik:** P2<br>
**Efor:** Zod 4: 4–6 gün; Tailwind 4: 3–5 gün
**Bağımlılık:** Tasks 1, 2, 3

### Milestone 7A — Zod 4

**Files:** `packages/types/src/**`, web/mobile boundary parsers, form resolvers, manifests.

- [ ] Mevcut Zod 3.25 üzerinden `zod/v4` subpath kullan; önce `@wizards/types` şemalarını aile aile taşı.
- [ ] Her şema ailesinde success, unknown field, boundary length, enum ve error mapping snapshot'ını iki sürüm arasında karşılaştır.
- [ ] Mobile/web aynı shared schema'yı tüketmeye devam etmeli; iki ayrı contract tanımı yaratma.
- [ ] Web form'ları aşamasında `@hookform/resolvers` major'ını birlikte ve yalnız bu PR'da yükselt.
- [ ] Parse/typecheck süresi ve generated type complexity ölç; bütün şemalar taşınmadan root `zod` import'unu kaldırma.

### Milestone 7B — Tailwind 4.3

**Files:** `apps/web/tailwind.config.ts`, `apps/web/postcss.config.mjs`, global CSS, web package manifest, visual baselines.

- [ ] Upgrade tool diff'ini izole worktree'de üret; CSS-first config'e taşınacak token/plugin kararlarını kaydet.
- [ ] Web ve Tauri remote webview browser matrix'ini Safari 16.4+ dahil doğrula.
- [ ] Visual test `continue-on-error` durumunu migration PR'ında geçici olarak required yap; bilinçsiz baseline update yasak.
- [ ] Full build ve incremental CSS build süresini önce/sonra ölç.

**Verify:**

```powershell
corepack pnpm --filter @wizards/types test
corepack pnpm --filter @wizards/types typecheck
corepack pnpm --filter @wizards/web typecheck
corepack pnpm --filter @wizards/web build
corepack pnpm --filter @wizards/web e2e:visual
```

**Exit criteria:** Zod error/API davranışı eşdeğer; Tailwind görsel diff'i gözden geçirilmiş; performans kazanımı scorecard'da kayıtlı.

---

## Task 8: Expo 57 geçiş kapısı ve gerçek mobile device CI

**Öncelik:** P2<br>
**Efor:** Uyumluluk çözümü 2–5 gün; SDK geçişi 4–7 gün
**Bağımlılık:** Mobile Phase 4 closure, Tasks 1–3

**Files:**

- Modify: `apps/mobile/package.json`
- Modify: `apps/mobile/app.config.js`
- Modify: `apps/mobile/eas.json`
- Modify: mobile Jest config/tests
- Modify: `pnpm-lock.yaml`
- Create: `.eas/workflows/mobile-e2e-android.yml` veya Expo'nun güncel workflow konumu
- Reuse: `.maestro/*.yml`

- [ ] İlk gate: `@config-plugins/react-native-webrtc` Expo 57 peer desteğini resmi release/registry ile doğrula. Destek yoksa current SDK 56'da kal veya küçük bir spike'ta plugin'in yaptığı native değişiklikleri maintained alternatif/custom plugin ile kanıtla; production işine bypass/force-peer ekleme.
- [ ] Expo'nun incremental upgrade sırasını izle: `expo@^57`, `expo install --fix`, `expo-doctor`, native prebuild diff review.
- [ ] RN 0.86, gesture-handler 3, AsyncStorage 3, Jest 30/jest-expo 57'yi Expo 57 uyumlu tek SDK ailesi olarak taşı.
- [ ] SecureStore session, notifications, image picker/upload, LiveKit/WebRTC, screen share, reanimated/worklets ve deep link native smoke'larını çalıştır.
- [ ] Mevcut Maestro flow'larını yalnız veri yapısı içinde “required” saymakla yetinme; EAS/ci workflow'da gerçekten binary üzerinde koştur.
- [ ] PR fast path'te contract/component; nightly Android device; release gate'te Android+iOS device matrix uygula.
- [ ] Cold launch, resume, composer p95 ve idle memory kanıtını release artifact'e yaz; budget aşımında promotion durur.

**Verify:**

```powershell
corepack pnpm --filter @wizards/mobile typecheck
corepack pnpm --filter @wizards/mobile test
corepack pnpm --filter @wizards/mobile test:components
corepack pnpm --filter @wizards/mobile validate:env
corepack pnpm --filter @wizards/mobile release:check
npx expo-doctor
```

**Exit criteria:** Peer override yok; Android+iOS native flows ve LiveKit/WebRTC kanıtlı; performance budgets geçiyor.

---

## Task 9: Desktop Rust/Tauri bakımını ve modül sınırlarını güçlendir

**Öncelik:** P1/P2<br>
**Efor:** Patch 1–2 gün; modülerleştirme 1–2 hafta
**Bağımlılık:** Task 3

**Files:**

- Modify: `apps/desktop/src-tauri/Cargo.toml`
- Modify: `apps/desktop/src-tauri/Cargo.lock`
- Split: `apps/desktop/src-tauri/src/lib.rs`
- Create: `apps/desktop/src-tauri/src/{commands,diagnostics,windows,overlay,voice_shortcuts,deep_links,updater}.rs`
- Modify: Tauri capability contracts and desktop script tests

- [ ] Tauri compatible patches ve Cargo lock update'i üç OS desktop-ops + Windows bundle ile doğrula.
- [ ] `cargo audit` informational sonuçlarını sınıflandır: vulnerability ve `unsound` fail; unavoidable unmaintained transitive için owner+expiry+target exposure kaydı.
- [ ] `lib.rs`'yi davranış değiştirmeden domain modüllerine taşı. Public Tauri command isimleri, generated permission IDs ve main-window authorization kontrolleri değişmemeli.
- [ ] Her komutun input validation, wrong-window rejection, diagnostic redaction ve failure mapping testini ilgili modüle taşı.
- [ ] Windows build artifact'ine SBOM, SHA-256, signature, provenance/attestation ve cargo audit summary ekle.

**Verify:**

```powershell
cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml -- --check
cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml --all-targets --all-features -- -D warnings
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml
cargo audit --file apps/desktop/src-tauri/Cargo.lock
corepack pnpm --filter @wizards/desktop test
corepack pnpm --filter @wizards/desktop release:ops
```

**Exit criteria:** `lib.rs` bootstrap/composition ağırlıklı ve <500 satır; capability least privilege değişmemiş; updater/release smoke yeşil.

---

## Task 10: PostgreSQL, Redis/Valkey ve runtime altyapı kararını kanıta bağla

**Öncelik:** P2/P3<br>
**Efor:** 1–2 hafta analiz/load test; migration ayrıca planlanır
**Bağımlılık:** Tasks 2 ve 6A

**Files:**

- Create: `docs/adr/00xx-data-runtime-versions.md`
- Create: `scripts/load/*`
- Modify later: `docker-compose.yml`, CI service images, Railway service config

- [ ] Railway UAT/prod PostgreSQL ve Redis gerçek engine/minor, connection limit, storage, replica, backup, PITR ve restore SLA bilgisini çıkar; repo image'ını production ile hizala.
- [ ] PostgreSQL `pg_stat_statements`, slow query sampling, pool saturation, lock wait, table/index bloat ve migration sürelerini dashboard'a ekle.
- [ ] Restore drill yapmadan PostgreSQL major yükseltme kararı verme. 16 halen destekli; 17/18 seçimi provider desteği ve restore/load sonucu ile yapılır.
- [ ] Redis 7 baseline'ında memory fragmentation, eviction, reconnect, pub/sub lag ve rate-limit latency ölç.
- [ ] Redis 8 ile Valkey 9'u lisans, Railway/provider desteği, ioredis/Socket.IO adapter compatibility, persistence, failover ve benchmark üzerinden karşılaştır.
- [ ] LiveKit/ClamAV/Postgres/Redis container'larını version+digest pinle; aylık refresh otomasyonu ekle.
- [ ] Load profile'ları chat send, unread fanout, permission cache, Socket.IO reconnect storm ve outbox backlog senaryolarını içersin; synthetic user/PII-free fixture kullan.

**Verify:**

```powershell
docker compose config --quiet
corepack pnpm --filter @wizards/db typecheck
corepack pnpm exec tsx scripts/load/run.mts --profile chat-baseline --assert-slo
corepack pnpm exec tsx scripts/load/run.mts --profile reconnect-storm --assert-slo
```

**Exit criteria:** ADR seçimi sayısal kanıta dayanıyor; backup/restore ve failover smoke geçiyor; major migration ayrı implementation planına bölünmüş.

---

## Task 11: Web, realtime ve worker process sınırlarını ayrıştır

**Öncelik:** P3 — yalnız telemetry gerekçelendirirse<br>
**Efor:** 2–4 hafta
**Bağımlılık:** Tasks 2, 5, 6A, 10

**Current topology:** `apps/web/server.ts` Next, `/health`/`/ready`, Socket.IO ve opsiyonel outbox worker'ı aynı process'te birleştiriyor. Dedicated worker config'i var fakat realtime hâlâ web custom server'a bağlı.

**Target topology:**

```text
Client ──HTTP──> whispr-web (Next/API)
Client ──WS────> whispr-realtime (Socket.IO)
                       │
                 Redis adapter
                       │
Database <── whispr-outbox-worker
```

**Files:**

- Create: `apps/realtime/package.json`
- Move/Reuse: `apps/web/src/lib/socket/**`
- Create: `railway.realtime.toml`
- Modify: `apps/web/server.ts`, environment contracts, mobile/web socket config
- Preserve: `@wizards/types` event schemas and Redis adapter

- [ ] Önce dedicated worker'ın bütün env'lerde gerçekten ayrı process olduğunu ve web içinde kapalı olduğunu telemetriyle kanıtla.
- [ ] Realtime package'ını mevcut typed event/schema/authorization/rate-limit kodunu taşıyarak kur; kopya socket event tanımı üretme.
- [ ] Auth/session doğrulamasını paylaşılan dar interface üzerinden kullan; realtime servisine gereksiz web secret'ları verme.
- [ ] Polling kullanılacaksa sticky-session gereksinimini açıkça çöz; aksi halde kontrollü websocket-only kararı ve fallback UX'i test et.
- [ ] `NEXT_PUBLIC_SOCKET_URL` ve mobile socket config üzerinden UAT canary'yi yeni servise yönlendir; dual-write/event duplication yapma.
- [ ] Web'i standart Next production server/standalone mode'a geçirme imkanını yeniden ölç; custom server kaldırılabiliyorsa Automatic Static Optimization ve deployment size kazanımını kaydet.
- [ ] Reconnect storm, rolling deploy, Redis outage, multi-replica room membership ve message ordering load testlerini geç.

**Verify:**

```powershell
corepack pnpm --filter @wizards/realtime lint
corepack pnpm --filter @wizards/realtime typecheck
corepack pnpm --filter @wizards/realtime test
corepack pnpm --filter @wizards/realtime build
corepack pnpm --filter @wizards/web e2e:realtime
corepack pnpm exec tsx scripts/load/run.mts --profile reconnect-storm --assert-slo
```

**Exit criteria:** Web/realtime/worker ayrı health, readiness, deploy ve scaling sınırına sahip; ack/delivery SLO bozulmuyor; rollback yalnız endpoint variable değişimiyle yapılabiliyor.

---

## Task 12: Büyük dosya ve test stratejisi ratchet'i uygula

**Öncelik:** P2<br>
**Efor:** 3–5 gün başlangıç, sonra sürekli
**Bağımlılık:** Task 0

**Files:**

- Create: `scripts/quality/source-size-ratchet.mjs`
- Create: `scripts/quality/source-size-ratchet.test.mjs`
- Create: `docs/operations/source-size-ratchet.md`
- Modify: `docs/operations/coverage-ratchet.md`
- Modify when touched: large web/mobile/Rust files listed in baseline

- [ ] Mevcut büyük dosyaları grandfather et fakat satır artışını reddet; yeni production source için 800 satır soft cap, 1.200 satır hard review gate tanımla.
- [ ] Refactor'ı bağımsız “temizlik sprinti” olarak değil, ilgili özellik/değişiklik sırasında domain seam'i çıkararak yap.
- [ ] Web coverage ratchet'ini sprint başına 2–3 puan mevcut politikayla sürdür; branch/function ve security boundary testlerini line coverage'dan öncele.
- [ ] Flaky test bütçesi oluştur: retry ile geçen test flaky sayılır; owner ve 7 günlük düzeltme SLA'sı olmadan quarantine yok.
- [ ] Mobile'da contract/component testleri yanında nightly gerçek binary Maestro; desktop'ta Rust unit + üç OS ops + Windows bundle; web'de API fast path + nightly full browser ayrımını koru.
- [ ] `graphify` god nodes (`jsonError`, `useI18n`, `enforceApiRateLimit`, `requireApiUserId`, `parseJsonBody`) için değişiklik etkisi test matrisi tanımla.

**Verify:**

```powershell
node --test scripts/quality/source-size-ratchet.test.mjs
node scripts/quality/source-size-ratchet.mjs --check
corepack pnpm --filter @wizards/web test:coverage
corepack pnpm --filter @wizards/mobile test
corepack pnpm --filter @wizards/desktop test
```

**Exit criteria:** Baseline büyük dosyaların hiçbiri büyümüyor; yeni hard-cap ihlali yok; coverage ve flaky trendi scorecard'da görünür.

---

## Task 13: Release, dependency ve güvenlik yönetişimini otomatikleştir

**Öncelik:** P2<br>
**Efor:** 3–5 gün
**Bağımlılık:** Tasks 1–3

**Files:**

- Modify: `.github/dependabot.yml`
- Create: `.github/workflows/security.yml`
- Create: `docs/operations/dependency-policy.md`
- Create: `docs/operations/security-exceptions.md`
- Modify: release workflows

- [ ] Dependabot gruplarını platforma göre ayır: web patch/minor, mobile Expo-compatible, desktop npm, Cargo, GitHub Actions. Major PR'lar otomatik merge edilmez.
- [ ] Weekly full audit: pnpm audit, cargo audit, secret scan, JS/TS CodeQL, container/image scan ve license/SBOM üretimi.
- [ ] Informational/false-positive istisnası yalnız package/advisory, exposure gerekçesi, owner ve expiry ile kabul edilir.
- [ ] Release artifact'lerinde build ID, commit, dependency lock hash, SBOM, checksum, signature ve attestation zorunlu olur.
- [ ] Patch/minor için haftalık bakım penceresi; major için aylık tek aile; runtime/DB için UAT+canary release treni tanımla.
- [ ] 30 günden eski supported-line patch borcu ve 7 günden eski high/critical bulgu alert üretir.

**Verify:**

```powershell
corepack pnpm audit --prod --audit-level high
cargo audit --file apps/desktop/src-tauri/Cargo.lock
corepack pnpm exec prettier --check .github/dependabot.yml .github/workflows/security.yml docs/operations/dependency-policy.md docs/operations/security-exceptions.md
corepack pnpm --filter @wizards/desktop release:artifacts
```

**Exit criteria:** Supply-chain kanıtı release artifact'te; dependency borcu ölçülüyor; istisna dosyasında süresiz kayıt yok.

---

## 5. 30 / 60 / 90 Günlük Teslim Sırası

### İlk 30 gün

1. Mobile Phase 4 WIP kapanışı ve baseline kilidi.
2. CI workflow yeniden etkin; changed-scope fast path; production-mode Playwright.
3. Cargo-audit cache, single lockfile, graph corpus temizliği.
4. Sentry/OTel UAT başlangıcı ve redaksiyon review.
5. Low-risk patch/minor + Tauri compatible Cargo lock update.
6. Node 24 compatibility/default cutover kararı.

### 31–60 gün

1. pnpm 11 ve TS6 hizalaması.
2. TS7 side-by-side typecheck pilotu.
3. Next 16 migration.
4. Prisma 6.19.3 migration ve 48 saat UAT.
5. Real mobile EAS/Maestro nightly workflow.
6. Source-size ve flaky-test ratchet.

### 61–90 gün

1. Zod 4 kademeli closure.
2. Tailwind 4.3 izole migration.
3. Prisma 7 ADR/spike ve performans karşılaştırması.
4. Expo 57 plugin gate sonucu; uygunsa SDK migration.
5. PostgreSQL/Redis provider inventory + restore/load drill.
6. Security/SBOM/attestation workflow required hale gelir.

### 3–12 ay

1. Prisma 7 production promotion.
2. Expo 57 production/store promotion.
3. TS7 default promotion kararı.
4. Tauri Rust modül ayrıştırması.
5. Telemetry kanıtlıysa realtime service ayrıştırması.
6. Provider/load kanıtlıysa PostgreSQL ve Redis/Valkey major migration'ı.

---

## 6. Karar Kapıları

| Karar                  | Go koşulu                                                         | No-go / bekleme koşulu                               |
| ---------------------- | ----------------------------------------------------------------- | ---------------------------------------------------- |
| CI re-enable           | Manual run fast/full yeşil, required summary doğru                | Conditional job doğrulama atlıyor                    |
| Node 24 default        | Build/native/E2E iki lane parity                                  | Prisma/Sharp/Tauri native farkı                      |
| TS7 default            | TS6 error parity, tooling ve declaration/build desteği yeterli    | Sadece typecheck hızlı ama ekosistem uyumsuz         |
| Next 16                | Auth/realtime/API smoke ve production build yeşil                 | Middleware/proxy veya custom server blocker          |
| Prisma 7               | v6 baseline, pool/query/load parity, restore runbook              | Pool semantics veya latency regresyonu               |
| Expo 57                | WebRTC plugin/native config ve LiveKit device proof               | Peer override/force install gerekli                  |
| PostgreSQL major       | PITR+restore ve load test, provider support                       | Sadece “latest” olma motivasyonu                     |
| Redis/Valkey migration | Failover/adapter/provider/license kararı                          | Mevcut Redis 7 SLO'yu karşılıyor ve fayda ölçülmemiş |
| Realtime split         | Custom server/scale/availability metriği yatırımı haklı çıkarıyor | Yalnız moda/mikroservis tercihi                      |

---

## 7. İlk Açılması Gereken Implementation Plan'lar

Bu belge portföy roadmap'idir. Aşağıdaki işler birbirinden bağımsız review/rollback sınırlarına sahip olduğu için ayrı implementation plan olmalıdır:

1. `ci-fast-path-and-production-e2e`
2. `observability-foundation`
3. `dependency-hygiene-and-compatible-patches`
4. `node24-pnpm11-typescript-alignment`
5. `next16-upgrade`
6. `prisma6-upgrade`
7. `zod4-contract-migration`
8. `tailwind4-visual-migration`
9. `expo57-upgrade` — yalnız plugin gate geçerse
10. `desktop-rust-module-split`
11. `data-runtime-version-decision`
12. `realtime-service-extraction` — yalnız telemetry gate geçerse

Her alt plan TDD adımları, exact diff scope, UAT/canary/rollback, env/clickops ve bağımsız commit sınırı içermelidir.

---

## 8. Resmi Kaynaklar

- [Node.js release policy ve LTS durumu](https://nodejs.org/en/about/previous-releases)
- [Next.js 16 release](https://nextjs.org/blog/next-16)
- [Next.js 16 upgrade guide](https://nextjs.org/docs/app/guides/upgrading/version-16)
- [Next.js custom server trade-off](https://nextjs.org/docs/app/guides/custom-server)
- [Expo SDK version matrisi](https://docs.expo.dev/versions/latest/)
- [Expo SDK upgrade akışı](https://docs.expo.dev/workflow/upgrading-expo-sdk-walkthrough/)
- [TypeScript 7 duyurusu](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/)
- [Prisma ORM 7 upgrade guide](https://www.prisma.io/docs/guides/upgrade-prisma-orm/v7)
- [Tailwind CSS 4.3](https://tailwindcss.com/blog/tailwindcss-v4-3)
- [PostgreSQL versioning policy](https://www.postgresql.org/support/versioning/)
- [Redis 8 yenilikleri](https://redis.io/docs/latest/develop/whats-new/8-0/)
- [Valkey 9.1](https://valkey.io/blog/valkey-9-1-delivers-improvements-in-security-performance-and-more/)
- [OpenTelemetry JavaScript status](https://opentelemetry.io/docs/languages/js/)

---

## 9. Roadmap Self-Review

- Kapsam, bağımsız subsystem implementation plan'larına bölündü; big-bang iş yok.
- Bütün major ailelerde açık go/no-go ve rollback sınırı var.
- Mevcut Mobile Phase 4 WIP ve dirty worktree korunuyor.
- Güvenlik redaksiyonu, least privilege, migration ve artifact signing global constraint olarak bağlayıcı.
- “Latest” tek başına karar gerekçesi değil; runtime/data major'ları ölçüm ve provider kanıtına bağlı.
- Repo dışı secret/clickops işleri kod adımlarından ayrıldı.
- Yer tutucu veya belirsiz “test ekle” adımı yok; her task exact doğrulama ve exit criteria içeriyor.
