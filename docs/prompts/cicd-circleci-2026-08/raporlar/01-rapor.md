# Faz 1 raporu — CircleCI temel katmanı (gölge mod)

Tarih: 2026-08-11. Branch `uat`. **Bu düzeltme commit edilmedi.**

Durum: İlk setup koşusu `path-filtering@1.3.0` kaynaklı PEP 668 hatasını gösterdi.
`2.1.0` düzeltmesi yerelde hazır; uzak doğrulama commit/push sonrasını bekliyor.

## Güncelleme — 2026-08-11, aynı gün

- Golden image basıldı ve GHCR'ye push edildi:
  `ghcr.io/dogukanyazar8/wizards-ci@sha256:20333aa986fc36c972cad63cc16c5ab787d257c357d21c9327861df0ed69f71d`.
  Placeholder hem `docker/ci/IMAGE` hem `.circleci/main.yml`'daki üç executor'da
  gerçek digest'le değiştirildi.
- İmajı basarken Dockerfile'da üç düzeltme gerekti (kullanıcı yaptı):
  `COREPACK_HOME` + `COREPACK_DEFAULT_TO_LATEST=0` ve corepack dizinine
  `chmod a+rX` — yoksa `node` kullanıcısı corepack shim'lerini okuyamıyor;
  `/etc/profile.d` içine PATH dosyası; ve `PNPM_HOME` PATH'inde eksik olan
  `/bin` soneki.
- gitleaks 8.30.1'de `detect` alt komutu `--help`'ten kaldırılmış (8.19'da
  deprecate edilmişti). `security` job'u `gitleaks git .` kullanacak şekilde
  düzeltildi; sözleşme testi artık `detect`/`protect` kullanımını yasaklıyor.
- `context: [ghcr]` altın imajı çeken **32 workflow girdisinin hepsine** bağlandı;
  `semgrep` bilerek dışarıda (machine executor, yalnız public imaj çekiyor).
  Sözleşme testi bu eşlemeyi iki yönlü zorluyor: imajı çeken context almalı,
  çekmeyen almamalı.
- Sözleşme testi 10 → **12 test**. `pnpm test:toolchain` **73/73**.

---

## Yapılanlar

| Dosya                                               | Ne      | Neden                                                                                                                                  |
| --------------------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `docker/ci/Dockerfile`                              | yeni    | Golden image: Node 24.18.0, pnpm 11.20.0, Playwright 1.61.1 Chromium, Rust + cargo-audit 0.22.1, gitleaks, Tauri Debian bağımlılıkları |
| `docker/ci/IMAGE`                                   | yeni    | Yayınlanmış imaj referansı için tek doğru kaynak. Şu an **placeholder**                                                                |
| `docker/ci/README.md`                               | yeni    | Basma, digest okuma, doğrulama ve yeniden basma yordamı                                                                                |
| `.circleci/config.yml`                              | yeni    | Setup pipeline + `circleci/path-filtering@2.1.0` yol eşlemesi                                                                          |
| `.circleci/main.yml`                                | yeni    | 14 job, 3 executor, 4 workflow                                                                                                         |
| `scripts/quality/circleci-config-contract.test.mjs` | yeni    | 12 sözleşme testi; `pnpm test:toolchain` glob'una otomatik giriyor                                                                     |
| `docs/prompts/cicd-circleci-2026-08/01-faz1-*.md`   | değişti | Sonuna rapora yönlendiren uygulama notu eklendi                                                                                        |

`.github/workflows/` altındaki hiçbir dosyaya dokunulmadı (gölge mod, K5).

### Job haritası — `ci.yml` → `.circleci/main.yml`

| ci.yml                         | CircleCI                                                                                                |
| ------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `verify` (tek zincir, 14 adım) | `install` + `static` + `security` + `unit-shared` + `unit-web` + `unit-mobile` + `coverage` **(6 job)** |
| `actionlint`                   | karşılığı yok — `.github/workflows` yaşadığı sürece GitHub tarafında kalır                              |
| `semgrep`                      | `semgrep` (machine executor)                                                                            |
| `typescript-native-shadow`     | `ts-shadow`                                                                                             |
| `node22-compatibility`         | `node22` (nightly)                                                                                      |
| `e2e-smoke`                    | `e2e-smoke` (api + smoke + realtime tek job'da, bugünkü gibi)                                           |
| `e2e-cross-browser`            | `e2e-cross-browser`                                                                                     |
| `e2e-a11y` / `e2e-visual`      | `e2e-a11y` / `e2e-visual`                                                                               |
| `desktop-ops`                  | `desktop`                                                                                               |
| device gate (ayrı workflow)    | `device-gate` (nightly)                                                                                 |
| —                              | `build-web` (`verify`'ın son adımı ayrı job oldu)                                                       |

`verify` zincirinin bölünmesi bu fazın tek gerçek davranış kazancı: bugün lint
hatası 18. dakikada görünüyor, bölünmüş hatta ~5. dakikada.

---

## Bağlayıcı kararlar

| No  | Karar                                                                                                                                                                                                                                                                                                                                                                    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| F1  | **node_modules asla workspace'e persist edilmez.** Ölçüldü: kök `node_modules` **1,9 GB**. Ücretsiz planda 2 GB depolama var; pipeline başına 1,9 GB yazmak bütçeyi tek koşuda bitirir. Bağımlılıklar pnpm store cache'inden (lockfile anahtarlı, tek kopya) gelir; her job kendi `pnpm install --frozen-lockfile --prefer-offline` adımını koşar.                       |
| F2  | **Opsiyonel şeritler ayrı workflow.** CircleCI 2.1'de workflow içindeki tek bir job'a `when` verilemez — yalnız workflow ve step seviyesinde destekleniyor. `mobile` ve `desktop` bu yüzden kendi workflow'ları.                                                                                                                                                         |
| F3  | **Korumalı dallar her zaman tam koşar.** `base-revision: main` ile `main`'e push'ta diff boş kalır ve yol filtresi her şeyi kapatırdı. `main`/`staging`/`uat` dallarında filtre yok sayılır; filtreleme yalnız özellik dallarını (Faz 2'de PR'ları) etkiler.                                                                                                             |
| F4  | **Semgrep machine executor'da.** Mevcut sözleşme `docker run --volume "$WORKSPACE:/src:ro"` istiyor. CircleCI'nin remote Docker'ı job dosya sistemini bind-mount **edemez**, docker executor'da da yerel daemon yok. Machine executor sözleşmeyi birebir korur. Alternatif (Semgrep imajını executor yapmak) `checkout` için git+ssh gerektirir ve imajda garanti değil. |
| F5  | **gitleaks imaja gömüldü, checksum zorunlu.** GitHub tarafındaki `gitleaks-action` SHA pinliydi; karşılığı da doğrulanmış olmalı. `GITLEAKS_VERSION` ve `GITLEAKS_SHA256` **zorunlu build arg** — verilmezse imaj basılmaz.                                                                                                                                              |
| F6  | **E2E parolası yalnız `$BASH_ENV`'e yazılır.** `::add-mask::`in CircleCI karşılığı yok. Değer argv'ye, stdout'a veya bir log satırına hiç girmiyor; sözleşme testi bunu zorluyor.                                                                                                                                                                                        |
| F7  | **Golden image digest'inin tek kaynağı `docker/ci/IMAGE`.** `main.yml` ile uyuşmazlığı sözleşme testi kırar. Otomatik yeniden basım Faz 3'te; o zaman bile digest'i config'e **el** yazar.                                                                                                                                                                               |

---

## Sapmalar

Hepsi kodu okuduktan sonra ortaya çıktı; planı yazarken bilinmiyordu.

**S1 — G6 beklenenden çok küçük çıktı.** §4.1'de mevcut sözleşme testlerinin
CircleCI eklenince kırılacağından endişe edilmişti. Okuyunca görüldü ki hepsi
yalnız `.github/workflows` dizinini hedefliyor:
`desktop-ops-workflow-contract.test.mjs:114` yalnız `workflowsDirectory` tarıyor,
`runtime-toolchain-contract.test.mjs:172,382` aynı şekilde. Yani `ubuntu-*` yasağı
CircleCI yapılandırmasına **hiç değmiyor**. Gölge modda mevcut testlerde
**tek satır değişiklik gerekmedi**; sadece yeni test eklendi. Bu testlerin
gerçekten kırılacağı an **Faz 5'te `.github/workflows` silindiğinde**.

**S2 — G7 (yerel kapı senkronu) Faz 2'ye ertelendi.** `Fast` profiline
`circleci config validate` eklemek üç yerde zincirleme değişiklik istiyor:
`local-gate-contract.test.mjs:54-63` profil adımlarını `deepEqual` ile birebir
sabitlemiş, `:149` `Invoke-LocalGate.ps1`'in `ValidateSet("git","node","pnpm","powershell","cargo")`
listesini sabitlemiş — yeni bir çalıştırılabilir eklemek runner'ı da testi de
değiştirmeyi gerektiriyor. Üstelik `circleci config validate` **API token
istiyor** (S6), yani token'sız bir makinede pre-commit hook'u kırardı. Kazanç
küçük, risk gerçek. Yerine: yapılandırmanın şekli CLI gerektirmeyen saf Node
sözleşme testiyle doğrulanıyor; o test zaten `Fast` profilinin koştuğu
`pnpm test:toolchain` içinde.

**S3 — Kabul kriteri 4 yeniden ifade edildi.** Plan "e2e job'larında `pnpm install`
adımı yok" diyordu. F1 gereği bu imkânsız: node_modules workspace'e konmuyor, her
job kurulumu sıcak store'dan yapıyor. Gerçek hedef — **tekrar eden pahalı iş** —
yine de kalktı: `playwright install` artık imajda (job başına ~2-3 dk × 5 job),
`db:generate` bir kez koşup workspace'le taşınıyor, tarayıcı indirme yok.
Yeni ifade: _e2e job'larında `playwright install` ve `db:generate` adımı yok;
kurulum yalnız cache'ten yapılıyor._

**S4 — Kabul kriteri 6 yeniden ifade edildi.** "Yalnız `apps/web` değiştiren bir
push'ta `unit-mobile` başlamıyor" — F3 gereği korumalı dallarda **her zaman**
başlar, bu bilinçli. Yeni ifade: _korumalı olmayan bir dala yapılan, yalnız
`apps/web` dokunan push'ta `mobile` ve `desktop` workflow'ları hiç oluşmuyor._

**S5 — `e2e` job'ları `build-web`'e bağlanmadı.** Plan workspace ile `.next`
taşımayı öngörüyordu. İzlendiğinde görüldü ki e2e sunucusu bugün **dev modda**
koşuyor (`server.ts:15` + job'ların `NODE_ENV: test` vermesi) ve `.next` çıktısını
hiç tüketmiyor — `e2e:web-server` yalnız `build:server` çalıştırıyor. Faz 1
parite fazı olduğu için davranış korundu; `.next` workspace devri **prod-mode
geçişiyle birlikte Faz 3'e** taşındı. `build-web` şimdilik bağımsız bir build
kapısı.

**S6 — `circleci config validate` yerelde koşturulamadı.** CLI kurulu
(`1.0.46913-pre`) ama doğrulama sunucu tarafı derleyiciyi çağırıyor ve API token
istiyor: `error: No CircleCI API token found`. Yerine yapılan: her iki dosya
`js-yaml` ile ayrıştırıldı — YAML iyi biçimli, 14 job / 3 executor / 4 workflow
beklenen şekilde çözülüyor. İlk gerçek setup pipeline'ı orb'u çözüp
`resolve-changed-paths` job'unu başlattı; devam yapılandırmasındaki
`<< pipeline.schedule.name >>` kullanımı ve executor şeması henüz sınanmadı.

**S7 — Push şeridi daraltılmadı.** `e2e-cross-browser`, `e2e-a11y` ve `e2e-visual`
bugün her push'ta koşuyor; CircleCI'de de öyle bırakıldı. Bunları nightly'ye
taşımak Faz 2'nin kararı — Faz 1'de yapılırsa gölge mod karşılaştırması anlamını
yitirir.

**S8 — Yol filtresi orb sürümü doğrulandı ve düzeltildi.** İlk gerçek koşuda
`circleci/path-filtering@1.3.0`, Python paket kurulumu sırasında PEP 668 nedeniyle
`Set parameters` adımında exit 1 verdi. Python bootstrap kullanmayan, shell tabanlı
ve full-checkout davranışını koruyan `circleci/path-filtering@2.1.0` pinlendi.
Sözleşme testi artık bu tam sürümü zorunlu kılıyor.

---

## Kapı sonucu

| Komut                                                           | Sonuç                                                                                                                                                                           |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `node --test scripts/quality/circleci-config-contract.test.mjs` | **12/12 geçti**                                                                                                                                                                 |
| `pnpm test:toolchain`                                           | **73/73 geçti** (yeni test glob'a girdi)                                                                                                                                        |
| `js-yaml` ile `.circleci/*.yml` ayrıştırma                      | **geçti** — 14 job, 3 executor, 4 workflow                                                                                                                                      |
| `pnpm format`                                                   | **kırmızı — bu fazdan bağımsız.** 34 dosya biçimsiz; hiçbiri bu fazın dosyası değil (hepsi devam eden grup DM işinin dosyaları). Bu fazın 6 dosyası prettier'dan temiz geçiyor. |
| `circleci config validate`                                      | **koşturulamadı** — API token yok (S6)                                                                                                                                          |
| CircleCI'de gerçek koşu                                         | **yok** — golden image basılmadı                                                                                                                                                |

---

## Süre ve kredi tablosu

**Ölçülmedi.** Aşağıdakiler yapının şeklinden çıkarılmış **tahmindir**; ilk yeşil
koşudan sonra gerçek değerlerle değiştirilecek.

| Job                 | Resource class | Tahmini süre | Tahmini kredi |
| ------------------- | -------------- | ------------ | ------------- |
| `install`           | medium (10/dk) | 4 dk         | 40            |
| `static`            | medium         | 8 dk         | 80            |
| `security`          | medium         | 5 dk         | 50            |
| `semgrep`           | machine medium | 6 dk         | 60            |
| `unit-shared`       | medium         | 3 dk         | 30            |
| `unit-web`          | medium         | 10 dk        | 100           |
| `unit-mobile`       | medium         | 8 dk         | 80            |
| `coverage`          | large (20/dk)  | 12 dk        | 240           |
| `ts-shadow`         | medium         | 8 dk         | 80            |
| `build-web`         | large          | 8 dk         | 160           |
| `desktop`           | medium         | 15 dk        | 150           |
| `e2e-smoke`         | large          | 20 dk        | 400           |
| `e2e-cross-browser` | large          | 15 dk        | 300           |
| `e2e-a11y`          | large          | 10 dk        | 200           |
| `e2e-visual`        | large          | 10 dk        | 200           |

**Push başına ≈ 2.170 kredi → aylık 30.000 kredide ~13 push.**

Bu **bütçeye uymuyor** ve uyması da beklenmiyordu: Faz 1 parite ve yapı fazı, hız
fazı değil. Bütçeyi getirecek üç kaldıraç sırada:

- Faz 2 şerit ayrımı (a11y + visual + cross-browser nightly'ye) → tahmini −700
- Faz 3 turbo remote cache → tahmini −400
- Faz 3 test impact filtresi (PR şeridinde) → tahmini −500

Faz 3 kapısı zaten "push başına < 500 kredi" diyor. Ara dönemde GitHub Actions
hâlâ açık olduğu için gerçek maliyet tek hatta değil; gölge modun bir haftadan
uzun sürmemesi gerekiyor.

---

## Kullanıcının yapacakları

Faz kapısı bu iki adım olmadan kapanmaz:

1. **Golden image'ı bas ve digest'i ver.** `docker/ci/README.md` yordamı. Bir
   gitleaks sürümü seç ve checksum'ını o sürümün `checksums.txt` dosyasından al —
   build arg'lar zorunlu. Dönen `name@sha256:...` değerini paylaş; `docker/ci/IMAGE`
   ve `.circleci/main.yml` aynı anda güncellenecek.
2. **CircleCI projesini bağla.** GitHub App ile `dogukanyazar8/wizards`. Sonra:
   - `ghcr` context'i: `GHCR_USERNAME`, `GHCR_TOKEN` (`read:packages` yeter)
   - Zamanlanmış pipeline adı **tam olarak** `nightly` (S6 riski: adı tutmazsa
     nightly workflow hiç koşmaz, sessizce)
   - Depolama saklama süresini düşür: workspace 1 gün, cache 7 gün, artifact 3
     gün. Ücretsiz planda 2 GB var; varsayılan saklama süresiyle taşar.
   - `CIRCLE_TOKEN` üret ve paylaş ki `circleci config validate` yerelde
     koşturulabilsin (S6)

Sonra: `uat`'a bir push at, iki hattın sonucunu karşılaştır, gerçek süreleri
paylaş.

---

## Bilinen boşluklar

- ~~Golden image basılmadı~~ — kapandı, bkz. Güncelleme.
- `circleci config validate` yerelde token olmadığı için koşmadı (S6). Devam
  yapılandırmasının semantik kontrolü uzaktaki tekrar koşuyu bekliyor.
- ~~Orb sürümü doğrulanmadı (S8)~~ — ilk gerçek koşudaki PEP 668 hatasından sonra
  shell tabanlı `circleci/path-filtering@2.1.0` pinlendi; uzaktaki tekrar koşu push
  sonrasını bekliyor.
- Bu orb düzeltmesi commit/push edilmedi. CircleCI yapılandırmayı depodan okur;
  yeni sürüm uzak pipeline'da henüz sınanmadı.
- `actionlint` job'unun CircleCI karşılığı yok — `.github/workflows` yaşadığı
  sürece gerekmiyor, Faz 5'te tamamen kalkacak.
- `gitleaks git .` tüm git geçmişini tarıyor (gitleaks-action paritesi). Uzun
  geçmişte yavaş olabilir; ilk koşuda süresi ölçülüp gerekirse `--log-opts` ile
  daraltılacak.
- Yerel kapı senkronu Faz 2'ye devredildi (S2).
- Faz 2'ye devreden ek iş: `auto-cancel-redundant-workflows` ayarı (tag'lerde
  kapalı), JUnit çıktısı, `store_test_results`.
