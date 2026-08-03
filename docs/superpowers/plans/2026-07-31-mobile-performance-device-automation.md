# Mobile Performance Device Automation Implementation Plan

**Goal:** Automate Android UAT performance scenarios 06-14 while preserving the signed-in session and exporting one verified TXT report per script.

**Architecture:** Add a fail-closed `performance-automation` deep-link command available only when the runtime environment is `uat`. A dependency-injected executor reuses the existing query cache, SQLCipher store, prefetch functions, diagnostics reset, report builder, and bounded event-loop monitor. PowerShell drives ADB/Maestro and reconstructs checksum-verified report chunks from filtered logcat output.

**Tech Stack:** Expo 57, React Native 0.86, TanStack Query 5, Node test runner, PowerShell 7/Windows PowerShell, ADB, Maestro.

**Scope guard:** Work in the existing dirty `uat` worktree. Do not branch, stage, commit, push, deploy, reinstall, clear app data, or run live device workloads. Commit steps are intentionally omitted.

---

## Task 1: Red tests for the UAT command contract

**Files:**

- Modify: `apps/mobile/scripts/mobile-deep-link-contract.test.ts`
- Create: `apps/mobile/scripts/mobile-performance-automation.test.ts`

1. Add failing tests for valid reset/purge/prefetch/export links and invalid command, run ID, scope, target, or extra query fields.
2. Add failing executor tests proving production rejection, signed-in target requirements, command ordering, fixed error markers, and chunk/checksum framing.
3. Run only these tests and observe the expected failures.

## Task 2: Implement the in-app bridge

**Files:**

- Modify: `apps/mobile/src/deep-link/mobile-deep-links.ts`
- Modify: `apps/mobile/src/app/providers/mobile-deep-link-provider.tsx`
- Modify: `apps/mobile/src/app/providers/mobile-app-providers.tsx`
- Modify: `apps/mobile/src/app/screens/mobile-performance-diagnostics-screen.tsx`
- Create: `apps/mobile/src/performance/mobile-performance-diagnostics-runtime.ts`
- Create: `apps/mobile/src/performance/mobile-performance-automation.ts`
- Create: `apps/mobile/src/app/providers/mobile-performance-automation-provider.tsx`

1. Parse an allowlisted `whispr://performance/<command>` intent with bounded identifiers and no unknown parameters.
2. Extract the screen's existing reset/report input construction into a shared diagnostics runtime; preserve Share export behavior.
3. Implement a dependency-injected command executor and URI-encoded, SHA-256-verified `WHISPR_PERF` frames.
4. Adapt it to auth/query/store/prefetch dependencies in a UAT-only provider; production emits rejection and performs no action.
5. Run the focused Node and diagnostics component tests until green.

## Task 3: Add the shared host runner and nine thin scripts

**Files:**

- Create: `apps/mobile/scripts/performance-device/WhisprPerformanceDevice.psm1`
- Create: `apps/mobile/scripts/performance-device/06-cold-start.ps1`
- Create: `apps/mobile/scripts/performance-device/07-warm-resume.ps1`
- Create: `apps/mobile/scripts/performance-device/08-cached-dm.ps1`
- Create: `apps/mobile/scripts/performance-device/09-cached-channel.ps1`
- Create: `apps/mobile/scripts/performance-device/10-sqlcipher.ps1`
- Create: `apps/mobile/scripts/performance-device/11-prefetch-network.ps1`
- Create: `apps/mobile/scripts/performance-device/12-send.ps1`
- Create: `apps/mobile/scripts/performance-device/13-content-scroll.ps1`
- Create: `apps/mobile/scripts/performance-device/14-event-loop.ps1`
- Create: `.maestro/performance/open-dm.yml`
- Create: `.maestro/performance/open-channel.yml`
- Create: `.maestro/performance/send-dm.yml`
- Create: `.maestro/performance/scroll-dm.yml`
- Create: `apps/mobile/scripts/mobile-performance-device-scripts.test.ts`

1. Add artifact-level tests that invoke the module in dry-run mode with fake device/tool output; assert one reset, exact repetition count, one export, checksum failure, and partial-report behavior.
2. Implement exact-device selection, installed-package check, UAT bridge handshake, retry-free bounded marker waits, Maestro calls, and report reconstruction without clearing global logcat.
3. Keep each scenario file parameterized but otherwise one call into the shared runner. Test 12 names real UAT messages `perf-auto-<run-id>-<ordinal>` and documents that it mutates UAT.
4. Run PowerShell parser checks and the focused artifact tests.

## Task 4: Verify without touching the device

**Files:**

- Modify generated graph files via `graphify update .`

1. Run focused Node tests, diagnostics Jest test, mobile typecheck, and formatting checks for changed files.
2. Run every script with `-DryRun -Repetitions 1`; do not invoke ADB/Maestro.
3. Run `git diff --check` and `graphify update .`.
4. Report device smoke and the 30-repeat evidence wave as NOT RUN; a new UAT APK containing the bridge is required first.
