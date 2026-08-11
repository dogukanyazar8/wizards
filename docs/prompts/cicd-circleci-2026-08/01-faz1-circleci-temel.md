# Faz 1 — CircleCI temel katmanı (gölge mod)

> Başlamadan **[00-ortak-baglam.md](00-ortak-baglam.md)** oku. Bu faz §3.1, §3.2, §4.1, §4.6, §4.8'e dayanır.

## Amaç

`ci.yml`'ın yaptığı her işi CircleCI'de, **iş tekrarı olmadan** koşan bir yapılandırma üret. GitHub Actions kapatılmaz — iki hat bir süre yan yana koşar, çıktıları karşılaştırılır.

Bu fazın çıktısı hız değil **doğruluk**: aynı kapılar, aynı sonuçlar, daha az tekrar. Hız Faz 3'te gelir.

---

## Görevler

### G1 — Golden image

`docker/ci/Dockerfile` oluştur. İçerik:

- Taban: `node:24.18.0-bookworm-slim` (`.nvmrc` ile birebir; §3.2)
- `corepack enable && corepack prepare pnpm@11.20.0 --activate`
- Playwright sistem bağımlılıkları + üç tarayıcı (`playwright install --with-deps chromium firefox webkit`). Sürüm depodaki `@playwright/test` sürümünden okunur, sabit yazılmaz.
- Rust stable + `rustfmt` + `clippy` + `cargo-audit@0.22.1`
- Tauri Linux sistem bağımlılıkları (`apps/desktop/src-tauri` derlenebilmeli)
- `jq`, `curl`, `git`, `openssl`, `unzip`, `gnupg`, `flock`
- `docker` **kurma** — Semgrep artık ayrı bir CircleCI job'ında kendi imajıyla koşacak (bkz. G4)

`.github/workflows/` **yerine** basit bir yayın yolu: imaj elle bir kez üretilip GHCR'ye push edilir, digest `.circleci/main.yml` içine yazılır. Otomatik yeniden basım Faz 3'e bırakılır — şimdi tek bir digest yeterli.

Kabul: imaj içinde `node -v` = `v24.18.0`, `pnpm -v` = `11.20.0`, `cargo --version` var, `playwright --version` var.

### G2 — Setup pipeline ve yol filtresi

`.circleci/config.yml`:

- `setup: true`
- `circleci/path-filtering` orb'u **sürüm pinli**
- `base-revision: main`
- Eşleme:

```
apps/web/.*        run-web      true
apps/mobile/.*     run-mobile   true
apps/desktop/.*    run-desktop  true
packages/.*        run-web      true
packages/.*        run-mobile   true
packages/.*        run-desktop  true
scripts/.*         run-all      true
.circleci/.*       run-all      true
pnpm-lock.yaml     run-all      true
```

`run-all` true olduğunda diğer üç parametre de true kabul edilir — bu mantık `main.yml` içindeki `when` ifadelerinde kurulur, orb'a ek yük bindirilmez.

### G3 — Executor ve ortak komutlar

`.circleci/main.yml` içinde:

- `executors.ci` — golden image, `resource_class: medium`
- `executors.ci-db` — golden image + postgres + redis **yan konteyner** olarak, digest'ler §3.1'den birebir kopyalanır, `resource_class: large`
- `commands.attach` — `attach_workspace` + `TURBO_TELEMETRY_DISABLED` / `NEXT_TELEMETRY_DISABLED` ayarı

Yan konteynerler aynı ağda `localhost`'ta açılır; `DATABASE_URL` ve `REDIS_URL` `ci.yml`'daki değerlerle aynı kalır.

### G4 — Job'lar

`ci.yml`'ın 788 satırı aşağıdaki job'lara **bölünür**. `verify` tek zincir olmaktan çıkar (bugün 14 adım seri; lint hatası 18. dakikada görünüyor).

| Job           | Executor     | Kaynak `ci.yml` adımları                                                                                                    |
| ------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `install`     | `ci`         | checkout, pnpm store restore/save, `pnpm install --frozen-lockfile`, `pnpm db:generate`, `persist_to_workspace`             |
| `static`      | `ci`         | `pnpm format`, `pnpm lint`, `pnpm typecheck`                                                                                |
| `security`    | `ci`         | `node scripts/quality/e2e-password-guard.mjs`, gitleaks, `pnpm audit --audit-level moderate`                                |
| `semgrep`     | `ci`         | Semgrep imajı `docker` executor ile ayrı job — kural testi (`--test`) + tarama, digest pinli                                |
| `unit-shared` | `ci`         | `@wizards/types` + `@wizards/ui` testleri                                                                                   |
| `unit-web`    | `ci`         | `pnpm --filter @wizards/web test` (bölme Faz 3'te)                                                                          |
| `unit-mobile` | `ci`         | `test`, `test:components`, `validate:env`, `release:check`, `quality:check`                                                 |
| `coverage`    | `ci`         | `pnpm test:coverage`, `WEB_COVERAGE_API_E2E: "0"`                                                                           |
| `ts-shadow`   | `ci`         | `test:toolchain`, `typecheck:main:ci`, `typecheck:compat`, `typecheck:declarations`, `store_artifacts artifacts/typescript` |
| `build-web`   | `ci` (large) | `pnpm build`, `persist_to_workspace: apps/web/.next, apps/web/dist`                                                         |
| `e2e`         | `ci-db`      | parametreli (`suite`), `db:migrate:deploy`, `e2e:check-env`, `pnpm --filter @wizards/web e2e:<<suite>>`                     |
| `desktop`     | `ci`         | cargo audit/fmt/clippy/test + `release:ops` + `test` + `build:desktop:config` + `build:desktop -- --no-bundle`              |
| `node22`      | `ci`         | Node 22 native doğrulaması + `cargo check` — nightly (V4)                                                                   |
| `device-gate` | `ci`         | `visual:gate` + artifact + başarısızlıkta bildirim (nightly)                                                                |

Kurallar:

- `e2e` job'u `build-web`'e bağlıdır ve **kurulum tekrarı yapmaz** — workspace'ten gelir. Bugünkü dört ayrı kurulum (install + db:generate + migrate + playwright install, job başına ~8–10 dk) bu fazda ölür.
- Playwright tarayıcıları golden image'da; `playwright install` adımı **kalkar**.
- `unit-mobile` yalnız `run-mobile`, `desktop` yalnız `run-desktop` parametresi true iken koşar.
- Bu fazda tetik yalnız push + nightly + manuel. **PR şeridi Faz 2'de açılır.**

### G5 — Cache

`save_cache` / `restore_cache` anahtarları:

| Ne             | Anahtar                                                              | Yol                                                               |
| -------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------- |
| pnpm store     | `pnpm-v1-{{ checksum "pnpm-lock.yaml" }}`                            | pnpm store dizini (`pnpm store path` ile çözülür, sabit yazılmaz) |
| cargo registry | `cargo-v1-{{ checksum "apps/desktop/src-tauri/Cargo.lock" }}`        | `~/.cargo/registry`, `~/.cargo/git`                               |
| cargo target   | `cargo-target-v1-{{ checksum "apps/desktop/src-tauri/Cargo.lock" }}` | `apps/desktop/src-tauri/target`                                   |

Kısmi anahtar (`pnpm-v1-`) fallback olarak eklenir.

### G6 — Sözleşme testlerinin taşınması (§4.1) — bu fazın en riskli parçası

`pnpm test:toolchain` şu an `.github/workflows/ci.yml`'ı satır satır iddia ediyor. Gölge modda **iki hedef birden** doğrulanacak.

Yapılacak:

1. `scripts/quality/runtime-toolchain-contract.test.mjs` — `ci.yml`'a bakan yedi testin yanına `.circleci/main.yml` karşılıkları eklenir. `ci.yml` testleri **silinmez** (gölge mod, K5).
2. `scripts/quality/desktop-ops-workflow-contract.test.mjs` — `desktop-ops` ve `semgrep` iddiaları CircleCI'deki `desktop` ve `semgrep` job'ları için tekrarlanır. **Satır 107–120'deki `ubuntu-*` yasağı ve self-hosted zorlaması** yalnız `.github/workflows` dizinine uygulanacak şekilde daraltılır — CircleCI yapılandırması bu regex'e takılmamalı.
3. `scripts/quality/semgrep-ci-contract.test.mjs` — Semgrep imaj digest'inin ve `--oss-only --metrics=off --strict` bayraklarının CircleCI job'ında da bulunduğunu doğrular.
4. **Yeni:** `scripts/quality/circleci-config-contract.test.mjs` — şunları iddia eder:
   - her executor golden image'ı **digest ile** kullanıyor
   - postgres/redis imajları digest pinli
   - `e2e` job'ları `build-web`'e bağlı (kurulum tekrarı geri gelmesin)
   - release job'larında `retries`/otomatik yeniden deneme yok (§4.5 — Faz 5'te dolar, şimdi iskelet)
   - orb sürümleri pinli, `@volatile` yok

Bu dört dosyanın hepsi `scripts/quality/*.test.mjs` glob'una girer, yani `pnpm test:toolchain` ve yerel `Fast` profili otomatik kapsar.

### G7 — Yerel kapı senkronu

`scripts/quality/local-gate-profiles.json` içindeki `Fast` profili bugün `pnpm actionlint` çağırıyor. CircleCI yapılandırması eklendiğine göre aynı profile `circleci config validate` adımı eklenir (**`circleci` CLI yoksa adım atlanmalı**, precondition olarak `{ "type": "executable", "name": "circleci" }` eklenir; kurulu değilse profil düşmez).

`actionlint` adımı **kalır** — `.github/workflows` hâlâ canlı.

---

## Yasaklar

- `.github/workflows/` altındaki hiçbir dosya silinmez, devre dışı bırakılmaz.
- Kalite kapısı **kaldırılmaz**. Bir adımın CircleCI karşılığı yoksa (`::add-mask::` gibi) eşdeğeri yazılır, atlanmaz (§4.8).
- Yeni test, yeni lint kuralı, yeni kapı eklenmez. G6'daki `circleci-config-contract.test.mjs` istisnadır — o yeni kapı değil, yeni yapılandırmanın sözleşmesidir.
- `resource_class` büyütülerek hız kazanılmaz. Bu fazda `medium`, yalnız `build-web` ve `e2e` için `large`.
- Test bölme, remote cache, prod-mode E2E **bu fazda yok** — Faz 3.

---

## Kabul kriterleri

1. `circleci config validate .circleci/config.yml` temiz.
2. `pnpm test:toolchain` yeşil — hem `.github/workflows` hem `.circleci` iddiaları geçiyor.
3. Bir `uat` push'unda CircleCI'de şu job'lar koşuyor ve yeşil: `install`, `static`, `security`, `semgrep`, `unit-shared`, `unit-web`, `unit-mobile`, `coverage`, `ts-shadow`, `build-web`, `e2e(api)`, `e2e(smoke)`, `desktop`.
4. `e2e` job'larının hiçbirinde `pnpm install`, `db:generate` veya `playwright install` adımı **yok**.
5. Aynı push'ta GitHub Actions da yeşil (gölge mod doğrulaması) ve iki hattın sonuçları çelişmiyor.
6. Yalnız `apps/web` değiştiren bir push'ta `unit-mobile` ve `desktop` job'ları **hiç başlamıyor**.
7. `.circleci/` içindeki her imaj referansı digest'li, her orb sürüm pinli.
8. Rapor `raporlar/01-rapor.md`'de; süre ve kredi tablosu dolu.

---

## Doğrulama

```bash
circleci config validate .circleci/config.yml
```

```bash
circleci config process .circleci/main.yml
```

```bash
pnpm test:toolchain
```

```bash
pnpm lint
```

```bash
graphify update .
```

---

## Kullanıcının elle yapacakları

1. CircleCI hesabı aç, `dogukanyazar8/wizards` deposunu bağla (GitHub App).
2. GHCR için `read:packages` yetkili bir PAT üret, CircleCI'de `ghcr` adında bir context'e `GHCR_USERNAME` + `GHCR_TOKEN` olarak koy.
3. Golden image'ı bir kez basıp GHCR'ye push et, digest'i ajana ver.
4. İlk yeşil koşudan sonra CircleCI'deki gerçek job sürelerini rapora işlenmek üzere paylaş.

---

## Rapora yazılacak ek

- Her job için: resource class, gerçek süre, kredi.
- Push başına toplam kredi ve 30.000 kredi bütçesinde kaç push.
- GitHub Actions ile CircleCI arasında **sonuç farkı** çıktıysa hepsi tek tek.
- Sözleşme testlerinde daraltılan her regex ve gerekçesi.

---

## Uygulama notu (2026-08-11)

Bu plan yazıldıktan sonra kodun okunmasıyla ortaya çıkan altı gerçek, birkaç
görevi ve kabul kriterini geçersiz kıldı. Hepsi
[raporlar/01-rapor.md](raporlar/01-rapor.md) → **Sapmalar** bölümünde gerekçesiyle
kayıtlı. Bu dosyayı yeniden okuyan biri **önce raporu okusun**; özellikle G6, G7
ve 4. ile 6. kabul kriterleri raporda yeniden ifade edilmiştir.
