# 00 — Ortak bağlam (okunur, uygulanmaz)

Beş fazın paylaştığı zemin. **Kod değişikliği içermez.** Her faz promptunun başında okunur; faz dosyaları buradaki numaralara atıf yapar (ör. "§4.1 tuzağı").

---

## 1. Çalışma kuralları

1. Branch **`uat`**. Yeni branch açma, worktree açma yok.
2. **İzinsiz commit yok.** Faz bitince rapor yazılır, commit için kullanıcıya sorulur.
3. Kararsız kalınan her yerde **kullanıcıya sorulur**. "Muhtemelen böyledir" ile ilerleme yok.
4. **Gölge mod bağlayıcı.** Faz 1–4 boyunca `.github/workflows/` dosyaları çalışır durumda kalır. Silme yalnız Faz 5'te.
5. **Sözleşme testi kırık bırakılmaz.** CI yapılandırması değişiyorsa onu doğrulayan test **aynı fazda** güncellenir (§4.1).
6. Faz başında `graphify query "<dokunulacak yüzey>"`, faz sonunda `graphify update .`.
7. Her faz raporunda **kredi tahmini** olur: push başına tahmini CircleCI kredisi ve aylık 30.000 kredi bütçesine göre kaç push.

---

## 2. Over-engineering yasağı

- **Bazel / Buck / Nx yok.** Turborepo kalır. Build graph ihtiyacı `turbo --filter` ile karşılanır.
- **Kendi CI kontrol düzlemi yok.** CircleCI'nin verdiği ilkeller (workspace, cache, orb, dynamic config) yeterli.
- **Self-hosted runner yok.** Kaçılmak istenen problemi geri getirir.
- **Docker Layer Caching yok** — job başına 200 kredi; golden image aynı işi bir kez yapıyor.
- **Servis başına ayrı pipeline yok.** 3 app + 3 package tek boru hattı.
- Dinamik yapılandırma yalnız **yol filtresi** için. Parametre ağacı büyütülmez.
- Yeni bir kalite kapısı **eklenmez** — mevcut kapılar taşınır. İstisnalar Faz 4'te açıkça sayılmıştır (image scan + SBOM).
- Mevcut bir şey yeterse yenisi yazılmaz: yerel kapı `scripts/quality/local-gate-profiles.json`, dashboard `tools/local-quality-dashboard/`, tip kontrolü `scripts/quality/typescript-*.mjs`.

---

## 3. Doğrulanmış gerçekler — mevcut kod (2026-08-11)

### 3.1 Workflow envanteri

| Dosya                                                       | Satır | Tetik                                                                                        |
| ----------------------------------------------------------- | ----- | -------------------------------------------------------------------------------------------- |
| `.github/workflows/ci.yml`                                  | 788   | push (main/staging/uat + `v*`), nightly `17 2 * * *`, dispatch. **PR'da hiçbir job koşmaz.** |
| `.github/workflows/mobile-release.yml`                      | 678   | yalnız `workflow_dispatch`                                                                   |
| `.github/workflows/mobile-redesign-device-gate-nightly.yml` | 75    | nightly `17 3 * * *`, dispatch                                                               |

`ci.yml` job'ları ve runner etiketleri:

| Job                        | Runner etiketi | Timeout | Kapsam                                                                                                                                                                            |
| -------------------------- | -------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `verify`                   | `wizards-ci`   | 20 dk   | 14 adım: e2e-password-guard, gitleaks, `pnpm audit`, format, lint, typecheck, mobil Chromium kurulumu, types testi, ui testi, mobil kapı (5 komut), `test:coverage`, `pnpm build` |
| `actionlint`               | `ci-fast`      | 5 dk    | checksum doğrulanmış actionlint 1.7.12                                                                                                                                            |
| `semgrep`                  | `wizards-ci`   | 15 dk   | kural testi (`--test`) + `apps packages` taraması, imaj digest pinli                                                                                                              |
| `typescript-native-shadow` | `ci-fast`      | 12 dk   | `test:toolchain`, TS7 main, TS6 compat, declaration parity, JSON artifact                                                                                                         |
| `node22-compatibility`     | `wizards-ci`   | 35 dk   | yalnız `workflow_dispatch`; sharp/esbuild/Prisma + `cargo check`                                                                                                                  |
| `e2e-smoke`                | `wizards-ci`   | 35 dk   | api + smoke + realtime, nightly'de full                                                                                                                                           |
| `e2e-cross-browser`        | `wizards-ci`   | 35 dk   | Firefox + WebKit smoke                                                                                                                                                            |
| `e2e-a11y`                 | `wizards-ci`   | 35 dk   | erişilebilirlik                                                                                                                                                                   |
| `e2e-visual`               | `wizards-ci`   | 35 dk   | görsel regresyon                                                                                                                                                                  |
| `desktop-ops`              | `ci-fast`      | 20 dk   | cargo audit/fmt/clippy/test + Tauri `--no-bundle` build                                                                                                                           |

Dört e2e job'unun her biri **kendi** postgres + redis servisini kaldırıyor; imajlar digest pinli:

```
postgres:18.4-alpine@sha256:9a8afca54e7861fd90fab5fdf4c42477a6b1cb7d293595148e674e0a3181de15
redis:8.8.0-alpine@sha256:9d317178eceac8454a2284a9e6df2466b93c745529947f0cd42a0fa9609d7005
```

### 3.2 Sürüm pinleri

| Şey         | Değer                                                     | Kaynak                            |
| ----------- | --------------------------------------------------------- | --------------------------------- |
| Node        | `24.18.0`                                                 | `.nvmrc`                          |
| pnpm        | `11.20.0`                                                 | `package.json` → `packageManager` |
| turbo       | `2.10.6`                                                  | kök `devDependencies`             |
| TypeScript  | TS7 `typescript@7.0.2` + TS6 `@wizards/typescript6@6.0.2` | `pnpm-workspace.yaml` → `catalog` |
| JDK         | `17` temurin                                              | `mobile-release.yml`              |
| AWS CLI     | `2.27.41` **tam eşitlik**                                 | `mobile-release.yml` preflight    |
| Semgrep     | `1.164.0-nonroot` digest pinli                            | `ci.yml` env                      |
| actionlint  | `1.7.12` + sha256                                         | `ci.yml`                          |
| cargo-audit | `0.22.1`                                                  | `ci.yml` desktop-ops              |

`pnpm-workspace.yaml` → `strictDepBuilds: true`. Sürüm sapması sessizce geçmez, patlar.

### 3.3 Test koşucuları

| Paket              | Komut                                                       | Altında ne var                          |
| ------------------ | ----------------------------------------------------------- | --------------------------------------- |
| `@wizards/web`     | `test` → `node scripts/run-node-tests.mjs`                  | `src/**/*.test.ts(x)` kendi taranır     |
| `@wizards/web`     | `test:coverage` → `tsx scripts/run-coverage.ts`             | kapsam eşiği                            |
| `@wizards/mobile`  | `test` → `node --test --import tsx scripts/*.test.ts`       | saf modüller                            |
| `@wizards/mobile`  | `test:components` → `jest`                                  | `component-tests/*.test.tsx`            |
| `@wizards/desktop` | `test`                                                      | script testleri + `cargo test --locked` |
| kök                | `test:toolchain` → `node --test scripts/quality/*.test.mjs` | **CI sözleşme testleri** (§4.1)         |

### 3.4 Yerel kapı — `scripts/quality/local-gate-profiles.json`

`Fast`, `Standard`, `CI`, `Mobile`, `Desktop`, `MobileRelease`, `Security`, `E2ESmoke`, `E2EApi`, `E2ERealtime`, `E2EFull` profilleri. `Invoke-LocalGate.ps1` bunları koşturur, `Install-LocalGateHooks.ps1` git hook'una takar.

**Bu dosya CI şeritlerinin yerel aynasıdır.** CircleCI şeritleri buradaki profillerle **aynı komutları** çağırmalı. İkinci bir gerçek üretilirse yerel yeşil / CI kırmızı sınıfı hatalar başlar.

### 3.5 E2E yüzeyi

- `apps/web/playwright.config.ts`: `fullyParallel: false`, `workers: 1`, `retries: isCI ? 2 : 0`, `isCI = process.env.CI === "true"` (CircleCI bunu sağlar).
- CI timeout'ları: test 75s, expect 30s, action 30s, navigation 60s.
- Projeler: `chromium`, `firefox`, `webkit` (webkit `voice.spec.ts` hariç).
- `webServer.command` CI'da `pnpm run e2e:web-server` = `build:server && start`. `PLAYWRIGHT_SKIP_WEB_SERVER=1` ile devre dışı bırakılabilir.
- Spec dağılımı: `api` 2, `smoke` 5, `realtime` 1, `voice` 1, `a11y` 1, `visual` 1, `mobile` 1 — toplam 16 dosya.
- `globalSetup: ./e2e/setup/global-setup.ts`.

### 3.6 Deploy yüzeyi

- **Web**: CI deploy etmiyor. `railway.toml` → `preDeployCommand = "pnpm --filter @wizards/db db:recover:uat-history && pnpm --filter @wizards/db db:migrate:deploy"`, `startCommand`, `healthcheckPath = "/ready"`, `healthcheckTimeout = 300`.
- **Mobil**: `mobile-release.yml` manuel dispatch. Dört job: `preflight` → `contract` → (`ota` | `apk`).
- **Desktop**: yalnız unsigned build sinyali; release yok. `desktop-native-build.yml` ve `desktop-release.yml` dosyalarının **var olmaması** sözleşme testiyle zorlanıyor.

### 3.7 Mobil release sözleşmesi

- Girdiler: `environment` (`uat` | `canary` | `production`), `release_id`, `rollout` (yüzde), `kind` (`ota` | `apk`), `preflight_only`, `version`.
- **Ama** `ota` ve `apk` job'ları `if: inputs.environment == 'uat' && github.ref_name == 'uat'` ile kilitli, `preflight` de UAT dışını reddediyor. Ring iskeleti duruyor, kapısı kapalı.
- OTA yolu: `expo export` → `expo-updates fingerprint:generate` → `publish-ota-bundle.mjs --prepare` → RSA imza → R2'ye immutable yükleme → admin API'ye kayıt → **uzaktan manifest ve tüm asset URL'lerinin doğrulanması**.
- `apps/web/src/app/api/v1/admin/releases/[releaseId]/ota/route.ts` hem `POST` hem **`PATCH`** ihraç ediyor → yayın sonrası yüzde değiştirilebilir.
- Mobil Sentry kurulu: `apps/mobile/src/observability/mobile-sentry.ts`.

---

## 4. Kırılgan noktalar — önden sayıldı

### 4.1 CI sözleşme testleri `.github/workflows/` içeriğini satır satır iddia ediyor

Bu paketin en büyük gizli maliyeti. `pnpm test:toolchain` (`node --test scripts/quality/*.test.mjs`) şunları doğruluyor:

| Dosya                                             | Ne iddia ediyor                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `runtime-toolchain-contract.test.mjs`             | `.github/workflows` dizinini tarıyor (satır 172, 382); `ci.yml`'ı en az yedi ayrı testte okuyor (204, 227, 252, 287, 335, 357); actionlint job'unun tam argüman dizisini eşleştiriyor (247)                                                                                                                  |
| `desktop-ops-workflow-contract.test.mjs`          | `ci.yml`'dan `desktop-ops` ve `semgrep` job'larını isimle çekiyor (satır 46, 70); **tüm workflow dosyalarının self-hosted runner kullanmasını zorluyor ve `ubuntu-*` kullanımını yasaklıyor** (107–120); `desktop-native-build.yml` / `desktop-release.yml` dosyalarının var olmamasını doğruluyor (123–124) |
| `semgrep-ci-contract.test.mjs`                    | `ci.yml`'daki Semgrep job'unu okuyor (satır 8)                                                                                                                                                                                                                                                               |
| `actionlint-contract.test.mjs` + `actionlint.mjs` | `.github/workflows` dizinini okuyor (`actionlint.mjs:117`)                                                                                                                                                                                                                                                   |
| `mobile-uat-build-contract.test.mjs`              | Mobil UAT build sözleşmesi                                                                                                                                                                                                                                                                                   |

**Sonuç:** `.circleci/` eklendiği anda değil, `ci.yml` **değiştiği** anda bu testler düşer. Ayrıca `ubuntu-*` yasağı CircleCI'nin convenience image'larıyla değil GitHub runner etiketiyle ilgili ama regex körlemesine tarıyor — kontrol et.

Kural: **her fazda dokunulan CI yapılandırmasının sözleşme testi aynı fazda güncellenir.** Faz 1 bu testlere `.circleci/main.yml` hedefini ekler; Faz 5 `.github/workflows` hedefini kaldırır.

### 4.2 `run-node-tests.mjs` test dosyalarını kendi tarıyor

`apps/web/scripts/run-node-tests.mjs:35` `collectTestFiles(srcRoot)` ile dosyaları kendisi buluyor ve `process.argv.slice(2)` argümanlarını **dosya listesinden önce** yerleştiriyor. Yani `circleci tests split` çıktısını dışarıdan veremezsin.

Faz 3'te bir enjeksiyon noktası eklenecek (`--files-from <path>` veya `WEB_TEST_FILES` ortam değişkeni). Mevcut çağıranlar (`turbo test`, yerel kapı) davranış değiştirmeden çalışmaya devam etmeli.

### 4.3 E2E dev-mode Next altında koşuyor

`apps/web/server.ts:15` → `const dev = process.env.NODE_ENV !== "production"`, e2e job'ları `NODE_ENV: test` veriyor. Yani `next({ dev: true })`.

İki sonucu var: (a) her rotada JIT derleme duraklaması — CI timeout'larının 75s/60s olmasının sebebi bu; (b) **görsel regresyon prod bundle'ını değil dev çıktısını ölçüyor.**

Prod-mode'a geçerken: `NEXT_PUBLIC_E2E_TEST_MODE` **build-time** değişkendir, `build-web` adımında verilmeli. `assertWebEnvironment(process.env, "production")` prod dalında ek zorunlu değişken isteyebilir — geçişten önce doğrula, eksikse e2e'ye özel sahte-prod profili yaz, **gerçek secret kullanma**.

### 4.4 Prisma migration dizini

Prisma bu depoda `packages/db/prisma/rebaseline-migrations/` okur; `packages/db/prisma/migrations/` **ölü**. E2E job'ları `db:migrate:deploy` çağırıyor — dizin yapılandırması bozulursa migration sessizce hiç koşmaz ve testler anlamsız bir şemaya karşı çalışır.

### 4.5 OTA anahtarları değişmez, retry release'i patlatır

`mobile-release.yml` R2'ye yüklemeden önce `head-object` ile kontrol ediyor; anahtar varsa **hard fail**. Yarım kalmış bir release job'unu yeniden koşturmak bu yüzden patlar. CircleCI'de release workflow'unda **otomatik retry kapalı** olmalı; yeniden deneme yeni bir `release_id` ile yapılır.

### 4.6 AWS CLI tam sürüm eşitliği

`preflight` `aws-cli/2.27.41` dışındaki her sürümü reddediyor. `.github/scripts/setup-aws-cli.sh` bunu kuruyor. Cloud image'a taşırken script aynen kullanılır; imajın kendi AWS CLI'ı varsa `PATH` sırası kontrol edilir.

### 4.7 Android SDK ARM'de çalışmaz

`setup-android-build-tools.sh` + `eas build --local` yalnız `linux-x86_64`. Bu paket boyunca **ARM executor kullanılmaz**. Not: bu, Oracle Cloud gibi ARM ücretsiz katmanların neden elendiğinin de sebebi.

### 4.8 Diğerleri

- **CRLF.** Depo dosyalarının bir kısmı CRLF; `Edit` yaparken eşleşen metni dosyadan kopyala, elle yazma.
- **`turbo db:generate` cache'siz** (`turbo.json` → `"cache": false`). Prisma client workspace'e persist edilir, yeniden üretilmez.
- **`typecheck` `db:generate`'e bağlı** (`"typecheck": "pnpm db:generate && turbo typecheck"`). Workspace'ten client gelmezse typecheck düşer.
- **Coverage `cache: false`** ve uzun bir env listesi taşıyor (`turbo.json` → `test:coverage.env`). Env eksikse kapsam farklı çıkar.
- **Gizli bilgi maskeleme.** E2E parolası şu an iş içinde üretilip `::add-mask::` ile maskeleniyor. CircleCI'de karşılığı yok — parola loglanmayan bir yolla üretilmeli (dosyaya yaz, echo etme).
- **Concurrency.** `ci.yml` `cancel-in-progress` kullanıyor ama tag push'larında kapatıyor. CircleCI karşılığı: `auto-cancel-redundant-workflows`; tag pipeline'larında kapalı olmalı.

---

## 5. Alınmış bağlayıcı kararlar

| No  | Karar                                                                                                                                                       |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| K1  | **CircleCI cloud, ücretsiz katman.** Self-hosted CircleCI runner yok. Hyper-V VM'ler Faz 5'te kapatılır.                                                    |
| K2  | **Turborepo kalır.** Bazel/Buck/Nx değerlendirmesi kapalıdır.                                                                                               |
| K3  | **30.000 kredi/ay bağlayıcı kısıt.** Her faz push başına kredi tahminini raporlar. Bir faz bütçeyi aşıracaksa durur ve sorar.                               |
| K4  | **Sözleşme testleri kırık bırakılmaz** (§4.1). CI değişikliği ve testi aynı fazda.                                                                          |
| K5  | **Gölge mod.** GH Actions Faz 1–4 boyunca açık kalır; silme Faz 5'te.                                                                                       |
| K6  | **Güvenlik kapıları zayıflatılmaz.** gitleaks, Semgrep, `pnpm audit`, `cargo audit`, `e2e-password-guard` hiçbir fazda kaldırılmaz; yalnız yerleri değişir. |
| K7  | **GitHub kod barındırma olarak kalır.** CircleCI yalnız compute. PR, review, merge queue GitHub'da.                                                         |
| K8  | **Yeni kalite kapısı eklenmez** — Faz 4'teki image scan + SBOM istisnası dışında.                                                                           |

### Varsayımlar (itiraz gelmezse geçerli)

| No  | Varsayım                                                                                                                                                                    |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V1  | Golden image **GHCR**'de private yayınlanır (`ghcr.io/dogukanyazar8/wizards-ci`). CircleCI çekmek için `read:packages` yetkili PAT'i bir context'ten alır.                  |
| V2  | Turbo remote cache **Railway'de yeni bir servis**, depolama **R2'de ayrı bucket**. OTA bucket'ı ile karışmaz.                                                               |
| V3  | Merge queue **GitHub merge queue**; required check listesi hızlı şeridin job'ları.                                                                                          |
| V4  | `node22-compatibility` nightly'ye taşınır (bugün yalnız dispatch). Kredi maliyeti nightly'de kabul edilebilir.                                                              |
| V5  | APK build'i **CircleCI cloud large** üzerinde koşar (tahmini ~800 kredi/release, ayda ≤4 release varsayımıyla). Codemagic'e düşmek yalnız bu tahmin tutmazsa gündeme gelir. |
| V6  | Görsel regresyon prod-mode'a geçince **baseline görselleri bir kez yenilenir**; ilk yenileme kullanıcı onayıyla yapılır, sessizce kabul edilmez.                            |
| V7  | E2E parolası CircleCI'de her job içinde üretilmeye devam eder (context'e sabit parola konmaz).                                                                              |
| V8  | Faz 4'teki runtime image **golden image'dan ayrıdır**. Golden image = CI araçları; runtime image = uygulama.                                                                |
| V9  | Ring promotion `uat → staging → main` sırasıyla; her ring bir git dalı, promotion aynı digest'in yeni ortama işaretlenmesi.                                                 |

Bir faz bu varsayımlardan birine dokunmadan ilerleyemiyorsa **durur ve sorar**.

---

## 6. Hedef mimari — tek şema

```
setup (path-filtering orb)
  └─ install ─────────────────────────► workspace: node_modules + prisma client
       ├─ static      format + lint + typecheck
       ├─ security    gitleaks + pnpm audit + semgrep + e2e-password-guard
       ├─ unit-web    (bölünmüş, timings ile)
       ├─ unit-mobile node --test + jest        [run-mobile]
       ├─ ts-shadow   TS6/TS7 + declaration parity
       ├─ desktop     cargo audit/fmt/clippy/test [run-desktop]
       └─ build-web ──────────────────► workspace: .next + dist  ─► (Faz 4) image digest
            ├─ e2e-api    ┐
            ├─ e2e-smoke  ├─ postgres + redis sidecar, prod-mode Next
            ├─ e2e-a11y   │  [nightly]
            ├─ e2e-visual │  [nightly]
            └─ e2e-cross  ┘  [nightly]
```

Şeritler:

| Şerit       | Ne koşar                                                            | Hedef süre |
| ----------- | ------------------------------------------------------------------- | ---------- |
| PR          | static + security + unit(impact) + e2e-api + e2e-smoke              | < 10 dk    |
| Merge queue | + full unit + ts-shadow + build                                     | ≤ 20 dk    |
| main push   | + desktop + tüm e2e                                                 | ≤ 25 dk    |
| nightly     | + cross-browser + a11y + visual + full e2e + Node 22 + cihaz kapısı | serbest    |

---

## 7. Doğrulama komutları

Kök kapılar:

```bash
pnpm test:toolchain
```

```bash
pnpm lint
```

```bash
pnpm typecheck
```

```bash
pnpm --filter @wizards/web test
```

```bash
pnpm --filter @wizards/mobile test
```

CircleCI yapılandırması (Faz 1'den itibaren her fazda):

```bash
circleci config validate .circleci/config.yml
```

Dinamik yapılandırmanın derlenmiş halini görmek için:

```bash
circleci config process .circleci/main.yml
```

Bir job'u yerelde koşturmak (docker gerekir, workspace/cache adımları atlanır):

```bash
circleci local execute --job static
```

Grafiği güncelle (her faz sonunda):

```bash
graphify update .
```

---

## 8. Rapor formatı

Her faz `docs/prompts/cicd-circleci-2026-08/raporlar/<no>-rapor.md` yazar:

```markdown
# Faz <no> raporu — <başlık>

## Yapılanlar

- <dosya>: <ne değişti, neden>

## Bağlayıcı kararlar

- <sonraki fazı kısıtlayan her karar>

## Sapmalar

- <plandan sapma + gerekçe + kullanıcıya soruldu mu>

## Kapı sonucu

| Komut | Sonuç |
| ----- | ----- |

## Süre ve kredi tablosu

| Job                                                          | Resource class | Süre | Kredi |
| ------------------------------------------------------------ | -------------- | ---- | ----- |
| Toplam push başına: <kredi> → aylık 30.000 kredide ~<N> push |

## Kullanıcının yapacakları (elle)

1. <adım> → <beklenen>

## Bilinen boşluklar

- <sonraki faza devredilen>
```
