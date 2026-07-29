# Android UAT Cihaz Performans Benchmark Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Android fiziksel cihazdaki UAT release uygulamasının gerçek performans senaryosunu çalıştırıp güvenli artifact raporu üretmek.

**Architecture:** Panel, beyaz listeli benchmark JSON'unu erişilebilirlik etiketi olarak sunar. Node runner ADB/Maestro ile gerçek davranışı sürer, panelden JSON'u alır ve artifact yazar. Workflow yalnız self-hosted Windows/Android runner üstünde yerel komutu çağırır.

**Tech Stack:** Expo 57, React Native 0.86, TypeScript, Node test runner, Maestro 2.6, ADB, PowerShell, GitHub Actions.

## Global Constraints

- UAT release APK; Metro/emülatör/debug APK yasak.
- Fixture yalnız git-dışı `.secrets/mobile-performance-benchmark.config.json` yazar; secret veya kimlik loglanmaz.
- Rapor mesaj, kimlik, token, URL veya SSID taşımaz.
- USB güç yalnız kullanıcı onayıyla `OVERRIDDEN`; varsayılan `FAIL`.
- Mevcut UAT veri seti yoksa sonuç `ENV BLOCKED`; runner veri yazmaz.
- Kullanıcı yeni commit izni vermedi; değişiklikler commitlenmez.

---

### Task 1: Benchmark report sözleşmesi

**Files:**

- Create: `apps/mobile/src/performance/mobile-performance-benchmark-report.ts`
- Create: `apps/mobile/scripts/mobile-performance-benchmark-report.test.ts`
- Modify: `apps/mobile/src/app/screens/mobile-performance-diagnostics-screen.tsx`
- Test: `apps/mobile/component-tests/mobile-performance-diagnostics.test.tsx`

**Interfaces:**

- Produces: `createMobilePerformanceBenchmarkReport(input): MobilePerformanceBenchmarkReport`
- Produces: `serializeMobilePerformanceBenchmarkReport(report): string`
- Consumes: summary rows, prefetch stats, store diagnostics, runtime dimensions.

- [ ] **Step 1: Write failing report unit tests**

Test a literal report with one startup row, prefetch `3/4`, sealed store and device metadata. Assert output contains p50/p95/p99 and omits `userId`, `email`, `token`, `message`, `url`, `ssid`, `conversationId`.

- [ ] **Step 2: Run report test red**

Run: `corepack pnpm --filter @wizards/mobile exec tsx --test scripts/mobile-performance-benchmark-report.test.ts`

Expected: FAIL because report module does not exist.

- [ ] **Step 3: Implement white-list report builder**

Define report version, timestamp, six summary rows, prefetch totals/rate, `{status,rowCount,cipherVersionPresent}`, `{environment,appVersion,buildId,deviceTier,networkClass,osName,osVersion}`. Never spread arbitrary context or dimensions.

- [ ] **Step 4: Add failing panel export test**

Render the panel and assert `performance-benchmark-report` has an accessibility label parseable as the report JSON with no message identity fields.

- [ ] **Step 5: Implement panel accessibility export**

Render an accessible, visually-hidden-by-size-but-mounted `View` with `testID="performance-benchmark-report"` and JSON `accessibilityLabel`. Refresh updates report state after retained sample/store reads settle.

- [ ] **Step 6: Run focused green tests**

Run: `corepack pnpm --filter @wizards/mobile exec tsx --test scripts/mobile-performance-benchmark-report.test.ts`

Run: `corepack pnpm --filter @wizards/mobile test:components -- mobile-performance-diagnostics.test.tsx --runInBand`

Expected: PASS.

### Task 2: Test config ve ADB parserları

**Files:**

- Create: `apps/mobile/scripts/mobile-device-performance.ts`
- Create: `apps/mobile/scripts/mobile-device-performance.test.ts`
- Create: `apps/mobile/scripts/mobile-device-performance.config.example.json`
- Modify: `apps/mobile/package.json`

**Interfaces:**

- Produces: `parseBenchmarkConfig`, `evaluateAndroidDevicePreflight`, `extractBenchmarkReportFromUiXml`.
- Consumes: config JSON, controlled ADB output, UIAutomator XML.

- [ ] **Step 1: Write failing parser tests**

Use literal ADB outputs. Assert one ready device, Wi-Fi enabled, low power `0`, USB power default failure, override `OVERRIDDEN`, eight unique deep links, no config values in thrown messages, and XML report extraction.

- [ ] **Step 2: Run runner test red**

Run: `corepack pnpm --filter @wizards/mobile exec tsx --test scripts/mobile-device-performance.test.ts`

Expected: FAIL because runner module does not exist.

- [ ] **Step 3: Implement pure parser/evaluator functions**

Return structured statuses rather than shell strings. Validate report schema/version before artifact write. Reject malformed XML/report and config lists other than eight unique `whispr://` links.

- [ ] **Step 4: Implement command runner and local artifacts**

Invoke `adb` and `maestro` with argument arrays. Write JSON/Markdown/screenshot under ignored `artifacts/mobile/performance/`. Scrub config values from every error. Delete pulled UI XML after parse.

- [ ] **Step 5: Add package command**

Add `performance:device:android` mapped to `node --import tsx scripts/mobile-device-performance.ts`.

- [ ] **Step 6: Run focused green test**

Run: `corepack pnpm --filter @wizards/mobile exec tsx --test scripts/mobile-device-performance.test.ts`

Expected: PASS.

### Task 3: Maestro real-device scenarios

**Files:**

- Create: `.maestro/mobile-performance-cold-warm.yml`
- Create: `.maestro/mobile-performance-cache-hit.yml`
- Create: `.maestro/mobile-performance-network.yml`
- Create: `.maestro/mobile-performance-send.yml`
- Modify: `apps/mobile/scripts/mobile-device-performance.ts`

**Interfaces:**

- Consumes: authenticated app session, benchmark config deep links, `team.whispr.mobile` release APK.
- Produces: exit status per scenario and panel report capture.

- [ ] **Step 1: Add runner test for generated Maestro environment**

Assert the command environment exposes only named variables and never prints their values; assert cache flow runs 15, cold/warm flows 10, send flow 20, network flow once for each of eight links.

- [ ] **Step 2: Run test red**

Run: `corepack pnpm --filter @wizards/mobile exec tsx --test scripts/mobile-device-performance.test.ts`

Expected: FAIL because scenario orchestration is absent.

- [ ] **Step 3: Create flows**

Use `stopApp`/`launchApp` for cold starts, Home/launch for warm resumes, deep links plus screen assertions for chat paths, and stable composer identifiers for sends. Every flow waits for real content, never a fixed sleep alone.

- [ ] **Step 4: Wire flow orchestration**

Run each Maestro flow with explicit argument arrays, capture per-scenario duration/exit, then open diagnostics and extract report.

- [ ] **Step 5: Run focused test green**

Run: `corepack pnpm --filter @wizards/mobile exec tsx --test scripts/mobile-device-performance.test.ts`

Expected: PASS.

### Task 4: Self-hosted GitHub artifact workflow

**Files:**

- Create: `.github/workflows/mobile-android-device-performance.yml`
- Modify: `docs/operations/mobile-component-device-testing.md`

**Interfaces:**

- Consumes: self-hosted labels `self-hosted`, `windows`, `android-device`; protected benchmark config secret.
- Produces: GitHub job summary and `mobile-performance-artifacts` upload.

- [ ] **Step 1: Write workflow contract test**

Add a node test that parses the YAML and asserts `workflow_dispatch`, exact self-hosted labels, no pull-request trigger, artifact upload, and no echo of benchmark config.

- [ ] **Step 2: Run test red**

Run the new node test. Expected: FAIL because workflow is absent.

- [ ] **Step 3: Add workflow and operating instructions**

Write config secret to a runner-local temporary file with restrictive ACL, run preflight/benchmark command, upload only report JSON/Markdown/screenshot, remove temporary config in `finally`.

- [ ] **Step 4: Run workflow contract test green**

Run the node test. Expected: PASS.

### Task 5: Release build and physical-device evidence

**Files:**

- Output: `artifacts/mobile/performance/<run-id>/report.json`
- Output: `artifacts/mobile/performance/<run-id>/report.md`
- Output: `artifacts/mobile/performance/<run-id>/performance-panel.png`

- [ ] **Step 1: Validate external prerequisites**

Require UAT benchmark config, a signed-in test account or E2E credentials, eight UAT deep links, and a registered self-hosted runner only for GitHub execution. Missing values must report `ENV BLOCKED`.

- [ ] **Step 2: Build phone release APK**

Run: `corepack pnpm --filter @wizards/mobile android:uat:local:apk:phone:release`

Expected: arm64/armeabi release APK under `artifacts/`.

- [ ] **Step 3: Install release APK and prove release state**

Install only after successful APK build. Record package version and non-debuggable package state; do not infer release from filename.

- [ ] **Step 4: Run real benchmark**

Run: `corepack pnpm --filter @wizards/mobile performance:device:android`

Expected: report has `PASS` outcomes or explicit `ENV BLOCKED`; never silently partial success.

- [ ] **Step 5: Verify artifacts and report result**

Validate report JSON schema, markdown table, screenshot existence, run `git diff --check`, and report device model/build plus all exact PASS/FAIL/OVERRIDDEN/ENV BLOCKED values.
