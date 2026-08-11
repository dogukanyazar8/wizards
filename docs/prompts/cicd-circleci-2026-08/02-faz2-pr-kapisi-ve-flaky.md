# Faz 2 — PR kapısı, merge queue, flaky ölçümü

> Başlamadan **[00-ortak-baglam.md](00-ortak-baglam.md)** oku. Bu faz §3.4, §3.5, §5-V3, §6'ya dayanır. Faz 1 kapısı geçmeden başlama.

## Amaç

Kalite sinyalini merge **öncesine** taşı ve kararsız testleri ölçülebilir hale getir.

Bugün `ci.yml`'ın her job'ında `if: github.event_name != 'pull_request'` var — merge öncesi sıfır sinyal. Bu, self-hosted runner'da yabancı kod koşturmamak için alınmış doğru bir karardı; CircleCI'nin efemer konteynerlerinde o kısıt yok.

İkinci hedef: `playwright.config.ts` `retries: isCI ? 2 : 0` şu an kararsızlığı gizliyor. **Önce ölç, sonra düşür.** Optimizasyon Faz 3'te.

---

## Görevler

### G1 — Dört şerit

`.circleci/main.yml` içinde workflow'ları ayır:

| Workflow      | Tetik                          | Job'lar                                                                                              |
| ------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `pr`          | `main` dışı dallar, PR açıkken | `install`, `static`, `security`, `unit-shared`, `unit-web`, `unit-mobile`*, `e2e(api)`, `e2e(smoke)` |
| `merge-queue` | merge queue dalı deseni        | `pr` + `semgrep`, `ts-shadow`, `coverage`, `build-web`                                               |
| `main`        | `main`, `staging`, `uat` push  | hepsi + `desktop` + `e2e(realtime)`                                                                  |
| `nightly`     | zamanlanmış                    | `main` + `e2e(a11y)`, `e2e(visual)`, `e2e(cross-browser)`, `e2e(full)`, `node22`, `device-gate`      |

`*` yol filtresine tabi.

`node22` bugün yalnız `workflow_dispatch` — V4 gereği nightly'ye taşınır, manuel tetik korunur.

`auto-cancel-redundant-workflows` açılır; tag pipeline'larında kapalı kalır (§4.8).

### G2 — JUnit çıktısı — üç koşucu

CircleCI Test Insights ve test bölme (Faz 3) **JUnit XML olmadan çalışmaz.** Üç koşucuya da eklenir:

| Koşucu                                                     | Nasıl                                                                                                                                                               |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `node --test` (web + mobile scripts + desktop + toolchain) | `--test-reporter=junit --test-reporter-destination=<path>` ile ikinci bir reporter. `spec`/varsayılan reporter stdout'ta kalmalı, yoksa CI logu okunmaz hale gelir. |
| jest (`apps/mobile/component-tests`)                       | `jest-junit` reporter, `jest.config.js` içinde CI koşulu ile                                                                                                        |
| Playwright                                                 | `reporter` dizisine `["junit", { outputFile: ... }]` eklenir; mevcut `list` ve `html` kalır                                                                         |

Her job sonunda `store_test_results`. Yol standardı: `reports/junit/<job>.xml`.

`run-node-tests.mjs` `process.argv.slice(2)`'yi dosya listesinden önce geçiriyor (§4.2) — reporter bayrakları oradan geçebilir, dosya listesi enjeksiyonu **Faz 3'ün işi**.

### G3 — Flaky ölçümü

1. Faz 2 boyunca `retries: 2` **korunur** — amaç ölçmek, henüz düzeltmek değil.
2. CircleCI Test Insights'ta flaky olarak işaretlenen her test `docs/prompts/cicd-circleci-2026-08/raporlar/02-flaky-envanteri.md` dosyasına yazılır: test adı, dosya, gözlenen oran, ilk görülme.
3. En az **20 pipeline koşusundan** sonra envanter dondurulur ve karar verilir:
   - Kök nedeni bir saatte bulunabilecekse **düzeltilir**.
   - Bulunamıyorsa **karantinaya** alınır (G4).
4. Envanter dondurulduktan sonra `retries: 2 → 1`.

Ölçüm bitmeden `retries` düşürülmez — yeşil bir hattı kırmızıya çevirmek bu fazın amacı değil.

### G4 — Karantina mekanizması

Minimal tutulacak. Yeni bir kütüphane yok.

- `apps/web/e2e/quarantine.json` — karantinadaki spec/test adları + gerekçe + tarih.
- Playwright tarafında `grep-invert` ile ana koşudan çıkarılır; ayrı bir `e2e-quarantine` job'unda koşar ve **workflow'u bloklamaz** (`when: always` + hata yutulur, ama sonuç `store_test_results`'a yazılır).
- Node/jest tarafında karantina şu an gerekmiyorsa **yazılmaz** — envanter boşsa mekanizma da yok. Gerekirse aynı desen tekrarlanır.
- `circleci-config-contract.test.mjs`'e bir iddia eklenir: karantina job'u **required check listesinde olamaz**.

Karantina kalıcı değildir: her girdiye tarih yazılır, 30 günden eski girdiler rapora "borç" olarak düşer.

### G5 — Merge queue ve required checks

- GitHub merge queue açılır (V3).
- `main` korumalı: doğrudan push kapalı.
- Required checks = `pr` şeridinin job'ları. `merge-queue` şeridi kuyrukta koşar.
- Karantina job'u, nightly job'ları, `device-gate` **required değil**.

`main` dışındaki `staging` ve `uat` dalları bu fazda korumalı yapılmaz — ring davranışı Faz 4'ün konusu.

### G6 — E2E parolası ve maskeleme (§4.8)

`ci.yml`'daki `::add-mask::` mekanizmasının CircleCI karşılığı yok. Parola:

- job içinde `node -e "...randomBytes(32)..."` ile üretilir,
- **stdout'a yazılmaz**, doğrudan `$BASH_ENV`'e eklenir,
- hiçbir `echo`/`printf` adımında geçmez.

`scripts/quality/e2e-password-guard.mjs` bu kuralın zaten bir bekçisi; `security` job'unda koştuğu doğrulanır.

---

## Yasaklar

- Kapsam **daraltılmaz**. PR şeridi tam suite koşmaz ama merge queue koşar; hiçbir kapı tamamen düşmez.
- Flaky test **silinmez**, `.skip` edilmez. Karantina görünür bir borç kaydıdır.
- `retries` ölçüm bitmeden değiştirilmez.
- Yeni test kütüphanesi, yeni reporter paketi yok — `jest-junit` istisnası dışında (jest'in kendi JUnit çıktısı yok).
- Merge queue'ya `nightly` job'ları bağlanmaz; kuyruk 20 dakikayı aşmamalı.

---

## Kabul kriterleri

1. Bir PR açıldığında CircleCI'de `pr` şeridi koşuyor ve GitHub'da required check olarak görünüyor.
2. `pr` şeridi ölçülmüş p95 süresi rapora yazılmış (hedef Faz 3'te < 10 dk; bu fazda yalnız ölçüm).
3. Üç koşucunun da JUnit çıktısı `store_test_results` ile CircleCI'ye ulaşıyor; Test Insights sekmesinde testler görünüyor.
4. `raporlar/02-flaky-envanteri.md` en az 20 koşudan türetilmiş, her satırda oran ve karar (düzeltildi / karantina) var.
5. `retries` envanter dondurulduktan sonra `1`'e indirilmiş.
6. Karantinadaki test varsa ayrı job'da koşuyor ve workflow'u bloklamıyor; yoksa karantina mekanizması **hiç yazılmamış**.
7. `main` dalına doğrudan push kapalı, merge queue çalışıyor.
8. `pnpm test:toolchain` yeşil; `circleci-config-contract.test.mjs` karantina-required-değil iddiasını içeriyor.
9. E2E parolası hiçbir log satırında görünmüyor (bir başarısız koşunun tam logu gözle taranır).

---

## Doğrulama

```bash
circleci config validate .circleci/config.yml
```

```bash
pnpm test:toolchain
```

```bash
pnpm --filter @wizards/web test
```

```bash
pnpm --filter @wizards/mobile test:components
```

```bash
graphify update .
```

---

## Kullanıcının elle yapacakları

1. GitHub'da `main` için branch protection + merge queue aç.
2. Required check listesini `pr` şeridinin job adlarıyla doldur.
3. En az 20 pipeline koşusu birikene kadar normal çalışmaya devam et — flaky envanteri buna dayanıyor.
4. Envanter dondurulurken hangi testlerin karantinaya gireceğini onayla.

---

## Rapora yazılacak ek

- `pr` / `merge-queue` / `main` / `nightly` şeritlerinin p50 ve p95 süreleri.
- Flaky envanteri özeti: toplam test, flaky sayısı, düzeltilen, karantinaya alınan.
- Kredi tüketiminin şerit bazında dağılımı — PR şeridinin aylık paydaki payı.
- Karantina borcu: her girdi için son geçerlilik tarihi.
