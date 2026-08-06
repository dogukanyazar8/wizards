# GitHub-Hosted CI Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Linux CI ve mobil yayın işlerini `ubuntu-24.04` GitHub-hosted runner'lara taşımak ve ölçümsüz 20 GiB APK hard-fail'ini gözlemlenebilir disk telemetrisiyle değiştirmek.

**Architecture:** Runner seçimi yalnız workflow katmanında değişecek; testler runner, cache ve güvenlik sözleşmelerini koruyacak. Mobil APK build yerel EAS olarak kalacak; preflight ve APK job'ları kendi disk alanlarını raporlayacak. Gerçek kapasite ilk uzaktan APK çalışmasında ayrıca kabul edilecek.

**Tech Stack:** GitHub Actions YAML, Node.js `node:test`, Bash, actionlint, pnpm, Graphify

## Global Constraints

- Linux runner değeri tam olarak `ubuntu-24.04` olacak; `ubuntu-latest` kullanılmayacak.
- `desktop-ops`, yalnız `ubuntu-24.04` matrisinde resmî Tauri Debian/Ubuntu sistem paketlerini Rust derlemesinden önce kuracak.
- Semgrep `if: github.event_name != 'pull_request'` koşulu değişmeyecek.
- OTA, EAS credential, APK imzalama, R2 ve Railway yayın sözleşmeleri değişmeyecek.
- Action SHA pinleri, minimum permissions ve `persist-credentials: false` korunacak.
- APK build `eas build --local --freeze-credentials` kullanmaya devam edecek.
- `20971520 KiB` / 20 GiB hard-fail kaldırılacak; gerçek `ENOSPC` build hatası kalacak.
- İlgisiz WIP korunacak. Stage, commit, push, deploy ve uzaktan workflow dispatch yapılmayacak.

## File Map

- Modify: `.github/workflows/ci.yml` — GitHub-hosted Linux runner ve pnpm cache seçimi.
- Modify: `.github/workflows/mobile-release.yml` — mobil job runner'ları ve APK disk telemetrisi.
- Modify: `.github/actionlint.yaml` — artık kullanılmayan self-hosted label allowlist'ini kaldıran geçerli boş config.
- Modify: `scripts/quality/desktop-ops-workflow-contract.test.mjs` — hosted Desktop Ops/CI runner sözleşmesi.
- Modify: `scripts/quality/semgrep-ci-contract.test.mjs` — Semgrep hosted runner sözleşmesi; event politikası korunur.
- Modify: `scripts/quality/runtime-toolchain-contract.test.mjs` — dependency kuran hosted Node job'larında pnpm cache sözleşmesi.
- Modify: `apps/mobile/scripts/mobile-release-workflow.test.mjs` — mobil hosted runner ve eşiksiz disk telemetrisi sözleşmesi.

---

### Task 1: GitHub-hosted ana CI sözleşmesi

**Files:**

- Modify: `scripts/quality/desktop-ops-workflow-contract.test.mjs`
- Modify: `scripts/quality/semgrep-ci-contract.test.mjs`
- Modify: `scripts/quality/runtime-toolchain-contract.test.mjs`
- Modify: `.github/workflows/ci.yml`
- Modify: `.github/actionlint.yaml`

**Interfaces:**

- Consumes: GitHub Actions `runs-on`, `actions/setup-node` ve `desktop-ops` matrix YAML sözleşmeleri.
- Produces: Tüm otomatik Linux CI job'larında `ubuntu-24.04`; dependency kuran Node job'larında `cache: pnpm`; geçerli `{}` actionlint config.

- [x] **Step 1: Hosted runner contract testlerini yaz**

`desktop-ops-workflow-contract.test.mjs` içinde `ci-fast` beklentilerini aşağıdaki hosted sözleşmeyle değiştir:

```js
assert.match(desktopOps, /\{"os":"ubuntu-24.04","staged":false\}/u);
const linuxDependencies = readWorkflowStep(desktopOps, "Install Tauri Linux system dependencies");
assert.match(linuxDependencies, /^        if: matrix\.os == 'ubuntu-24\.04'$/mu);

test("automatic CI jobs use pinned GitHub-hosted Linux runners", () => {
  const workflow = readFileSync(workflowPath, "utf8");
  const actionlintConfig = readFileSync(join(root, ".github", "actionlint.yaml"), "utf8");

  for (const jobName of [
    "verify",
    "actionlint",
    "semgrep",
    "typescript-native-shadow",
    "e2e-smoke",
    "e2e-cross-browser",
    "e2e-a11y",
    "e2e-visual",
  ]) {
    assert.match(readWorkflowJob(workflow, jobName), /^    runs-on: ubuntu-24\.04$/mu, jobName);
  }

  assert.equal(actionlintConfig.trim(), "{}");
  assert.match(readWorkflowJob(workflow, "semgrep"), /\bdocker run\b/u);
});
```

`semgrep-ci-contract.test.mjs` runner assertion'ını değiştir; PR skip assertion'ına dokunma:

```js
assert.match(semgrepJob, /^    runs-on: ubuntu-24\.04$/mu);
assert.match(semgrepJob, /^    if: github\.event_name != 'pull_request'$/mu);
```

`runtime-toolchain-contract.test.mjs` cache testlerini şu davranışı koruyacak biçimde değiştir:

```js
test("setup-node v5 keeps cache policy explicit", () => {
  // Her setup-node adımı ya `cache: pnpm` ya da bilinçli
  // `package-manager-cache: false` taşır. Node 22 test runtime'ı tek opt-out'tur.
  // Beklenen opt-out sayısı: 1.
});

test("dependency-installing CI jobs use pnpm cache archives", () => {
  const workflow = readText(join(".github", "workflows", "ci.yml"));
  for (const jobName of [
    "verify",
    "typescript-native-shadow",
    "e2e-smoke",
    "e2e-cross-browser",
    "e2e-a11y",
    "e2e-visual",
    "desktop-ops",
    "node22-compatibility",
  ]) {
    assert.match(readWorkflowJob(workflow, jobName), /^          cache: pnpm$/mu, jobName);
  }
});
```

Mutation hedefleri: herhangi bir job'ın self-hosted etikete dönmesi, `ubuntu-latest` kullanması veya dependency kuran job'da cache'in kaldırılması testi düşürür.

- [x] **Step 2: RED doğrulaması çalıştır**

Run:

```powershell
node --test scripts/quality/desktop-ops-workflow-contract.test.mjs scripts/quality/semgrep-ci-contract.test.mjs scripts/quality/runtime-toolchain-contract.test.mjs
```

Expected: FAIL. Eski `ci-fast` / `[self-hosted, ...]` runner değerleri ve `{}` olmayan actionlint config nedeniyle yeni assertion'lar düşer.

- [x] **Step 3: Ana CI workflow'unu minimum değiştir**

`.github/workflows/ci.yml` içinde:

```yaml
runs-on: ubuntu-24.04
```

değerini `verify`, `actionlint`, `semgrep`, `typescript-native-shadow`, `e2e-smoke`, `e2e-cross-browser`, `e2e-a11y`, `e2e-visual` job'larına uygula.

`desktop-ops` matrix JSON değerlerinde yalnız `ci-fast` değerlerini değiştir:

```yaml
matrix: ${{ inputs.desktop_hosted && fromJSON('{"include":[{"os":"ubuntu-24.04","staged":false},{"os":"windows-latest","staged":false},{"os":"macos-latest","staged":false}]}') || fromJSON('{"include":[{"os":"ubuntu-24.04","staged":false}]}') }}
```

Dependency kuran yedi Linux job'ındaki `package-manager-cache: false` değerlerini değiştir:

```yaml
cache: pnpm
```

`node22-compatibility` içindeki ikinci, yalnız test runtime'ını seçen Node 22 setup adımında `package-manager-cache: false` kalsın. Self-hosted/persistent-store yorumlarını GitHub-hosted gerçekliğiyle güncelle. Semgrep event koşulunu değiştirme.

`desktop-ops` içinde Rust adımlarından önce ve yalnız Linux matrisinde resmî Tauri prerequisites paketlerini kur:

```yaml
- name: Install Tauri Linux system dependencies
  if: matrix.os == 'ubuntu-24.04'
  shell: bash
  run: |
    sudo apt-get update
    sudo apt-get install --yes --no-install-recommends \
      libwebkit2gtk-4.1-dev \
      build-essential \
      curl \
      wget \
      file \
      libxdo-dev \
      libssl-dev \
      libayatana-appindicator3-dev \
      librsvg2-dev
```

`.github/actionlint.yaml` içeriğini geçerli boş mapping yap:

```yaml
{}
```

- [x] **Step 4: GREEN doğrulaması çalıştır**

Run:

```powershell
node --test scripts/quality/desktop-ops-workflow-contract.test.mjs scripts/quality/semgrep-ci-contract.test.mjs scripts/quality/runtime-toolchain-contract.test.mjs
```

Expected: PASS; sıfır failed test.

---

### Task 2: GitHub-hosted mobil release ve eşiksiz disk telemetrisi

**Files:**

- Modify: `apps/mobile/scripts/mobile-release-workflow.test.mjs`
- Modify: `.github/workflows/mobile-release.yml`

**Interfaces:**

- Consumes: `RUNNER_TEMP`, `GITHUB_STEP_SUMMARY`, EAS local-build workspace ve mevcut release secret guard'ları.
- Produces: Dört mobil job'da `ubuntu-24.04`; preflight disk görünürlüğü; APK build öncesi ve `always()` sonrası disk görünürlüğü.

- [x] **Step 1: Mobil hosted runner ve disk contract testini yaz**

Mevcut self-hosted runner assertion'ını değiştir:

```js
assert.equal(
  workflow.match(/^    runs-on: ubuntu-24\.04$/gm)?.length,
  4,
  "every mobile release job must use pinned GitHub-hosted Linux",
);
assert.doesNotMatch(workflow, /runs-on:\s*\[self-hosted/u);
assert.match(workflow, /Verify GitHub-hosted release runner toolchain/);
```

Preflight ve APK job metinlerini ayırıp disk sözleşmesini doğrula:

```js
const preflightJob = workflow.slice(
  workflow.indexOf("\n  preflight:"),
  workflow.indexOf("\n  contract:"),
);
const apkJob = workflow.slice(workflow.indexOf("\n  apk:"));

assert.match(preflightJob, /df -Pk "\$RUNNER_TEMP"/u);
assert.doesNotMatch(preflightJob, /20971520|at least 20 GiB/u);
assert.match(apkJob, /- name: Record APK build disk start/u);
assert.match(apkJob, /- name: Record APK build disk end\r?\n\s+if: always\(\)/u);
assert.equal(apkJob.match(/df -Pk "\$RUNNER_TEMP"/gu)?.length, 2);
```

Mevcut EAS workspace, log redaction, credential, imza ve yayın assertion'larını koru.

Mutation hedefleri: 20 GiB eşiğinin geri gelmesi, APK başlangıç ölçümünün silinmesi veya bitiş ölçümünde `always()` kaldırılması testi düşürür.

- [x] **Step 2: RED doğrulaması çalıştır**

Run:

```powershell
node --test apps/mobile/scripts/mobile-release-workflow.test.mjs
```

Expected: FAIL. Workflow halen dört self-hosted runner, eski isim ve `20971520` eşiği kullanır; APK job-local iki ölçüm yoktur.

- [x] **Step 3: Mobil workflow'u minimum değiştir**

`.github/workflows/mobile-release.yml` içinde dört job için:

```yaml
runs-on: ubuntu-24.04
```

İsimleri hosted gerçekliğine getir:

```yaml
name: Verify GitHub-hosted release runner toolchain
```

`persistent` kelimesini Android toolchain step adlarından kaldır. Preflight disk parse kontrolünü koru; şu hard-fail bloğunu tamamen kaldır:

```bash
(( runner_temp_available_kb >= 20971520 )) || {
  echo "::error::RUNNER_TEMP requires at least 20 GiB free for a local Android build."
  exit 1
}
```

Preflight summary başlığını `### GitHub-hosted mobile release runner` yap.

APK build adımından hemen önce fail-closed başlangıç telemetrisi ekle:

```yaml
- name: Record APK build disk start
  shell: bash
  run: |
    set -euo pipefail
    available_kb="$(df -Pk "$RUNNER_TEMP" | awk 'NR == 2 { print $4 }')"
    [[ "$available_kb" =~ ^[0-9]+$ ]] || {
      echo "::error::Could not determine available space for RUNNER_TEMP before APK build."
      exit 1
    }
    {
      echo "### APK build disk"
      echo "- Before build: $((available_kb / 1024 / 1024)) GiB available"
    } >> "$GITHUB_STEP_SUMMARY"
```

EAS build adımından hemen sonra, asıl build sonucunu maskelemeyen telemetri ekle:

```yaml
- name: Record APK build disk end
  if: always()
  shell: bash
  run: |
    set -u
    available_kb="$(df -Pk "$RUNNER_TEMP" 2>/dev/null | awk 'NR == 2 { print $4 }')"
    if [[ "$available_kb" =~ ^[0-9]+$ ]]; then
      echo "- After build: $((available_kb / 1024 / 1024)) GiB available" >> "$GITHUB_STEP_SUMMARY"
    else
      echo "::warning::Could not determine available space for RUNNER_TEMP after APK build."
    fi
```

EAS build, redacted failure log'u ve cleanup davranışını değiştirme.

- [x] **Step 4: GREEN doğrulaması çalıştır**

Run:

```powershell
node --test apps/mobile/scripts/mobile-release-workflow.test.mjs
```

Expected: PASS; sıfır failed test.

---

### Task 3: Workflow doğrulama ve graph güncellemesi

**Files:**

- Verify: `.github/workflows/ci.yml`
- Verify: `.github/workflows/mobile-release.yml`
- Verify: `.github/actionlint.yaml`
- Update generated graph: `graphify-out/**`

**Interfaces:**

- Consumes: Task 1 ve Task 2 çıktıları.
- Produces: Yerel test/actionlint kanıtı ve güncel Graphify topology.

- [x] **Step 1: Kapsam taraması çalıştır**

Run:

```powershell
rg -n "runs-on:.*self-hosted|runs-on:.*wizards-ci|runs-on:.*ci-fast|runs-on:.*mobile-release|20971520|at least 20 GiB" .github/workflows
```

Expected: exit 1 ve eşleşme yok. Bu `rg` için exit 1, aranan eski sözleşmenin bulunmadığı anlamına gelir.

- [x] **Step 2: Tüm odaklı contract testlerini çalıştır**

Run:

```powershell
node --test apps/mobile/scripts/mobile-release-workflow.test.mjs scripts/quality/desktop-ops-workflow-contract.test.mjs scripts/quality/semgrep-ci-contract.test.mjs scripts/quality/runtime-toolchain-contract.test.mjs
```

Expected: PASS; sıfır failed test.

- [x] **Step 3: Repository kalite komutlarını çalıştır**

Run:

```powershell
pnpm.cmd actionlint
pnpm.cmd test:toolchain
git diff --check
```

Expected: her komut exit 0. Bir komut fail olursa exact hata düzeltilir ve ilgili en dar komut tekrar çalıştırılır.

- [x] **Step 4: Graphify güncelle ve değişiklik kapsamını denetle**

Run:

```powershell
graphify update .
git status --short
git diff -- .github/workflows/ci.yml .github/workflows/mobile-release.yml .github/actionlint.yaml scripts/quality/desktop-ops-workflow-contract.test.mjs scripts/quality/semgrep-ci-contract.test.mjs scripts/quality/runtime-toolchain-contract.test.mjs apps/mobile/scripts/mobile-release-workflow.test.mjs docs/superpowers/specs/2026-08-06-github-hosted-ci-migration-design.md docs/superpowers/plans/2026-08-06-github-hosted-ci-migration.md
```

Expected: Graphify exit 0. Kaynak diff yalnız listelenen CI/test/spec/plan dosyalarında; mevcut Graphify WIP ayrı korunur. Commit/push yapılmaz.
