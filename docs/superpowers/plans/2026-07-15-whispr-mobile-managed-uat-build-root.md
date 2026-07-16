# Whispr Mobile Managed UAT Build Root Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose all mutable Android UAT build state at `C:\whispr_dev\whispr_uat\whispr_mobile` and automatically recover from pnpm virtual-store corruption.

**Architecture:** `build-android-uat.ps1` owns the short physical root `C:\wm` and exposes it at the requested `C:\whispr_dev\whispr_uat\whispr_mobile` path through a validated NTFS junction. React Native codegen and CMake canonicalize links, so a short physical root is necessary to avoid both drive-root and 250-character object-path failures. Derived workspace, pnpm store, pnpm virtual store, Gradle home, and artifacts never share `C:\Wizards`, `C:\wp`, or user-level Gradle state.

**Tech Stack:** Windows PowerShell 5.1, pnpm 10 via Corepack, Gradle, Android SDK, Node built-in test runner.

## Global Constraints

- Managed public root is exactly `C:\whispr_dev\whispr_uat\whispr_mobile`.
- Physical build paths use the marked `C:\wm` root, validated through the public managed-root junction.
- Do not automatically remove `C:\Wizards` or `C:\wp`.
- JDK and Android SDK remain configurable external toolchains.
- Build-only APK scripts must keep `-SkipInstall` and `-SkipUninstall`.

---

### Task 1: Lock the managed build-home contract with a failing test

**Files:**
- Modify: `apps/mobile/scripts/mobile-phase-zero-native-config.test.ts`
- Test: `apps/mobile/scripts/mobile-phase-zero-native-config.test.ts`

**Interfaces:**
- Consumes: `apps/mobile/scripts/build-android-uat.ps1`
- Produces: source-level regression guards for `BuildHome`, `ManagedBuildRoot`, pnpm store, Gradle home, mutex, and recovery helper.

- [ ] **Step 1: Add failing assertions**

```ts
assert.match(buildScript, /\[string\]\$BuildHome\s*=\s*"C:\\\\whispr_dev\\\\whispr_uat\\\\whispr_mobile"/);
assert.match(buildScript, /\[string\]\$ManagedBuildRoot\s*=\s*"C:\\whispr_dev\\whispr_uat\\whispr_mobile"/);
assert.match(buildScript, /function Ensure-WhisprUatManagedRootLink/);
assert.match(buildScript, /function Invoke-PnpmInstallWithRecovery/);
assert.match(buildScript, /store-dir/);
assert.match(buildScript, /GRADLE_USER_HOME/);
assert.match(buildScript, /WhisprMobileUatBuild/);
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run: `corepack pnpm --filter @wizards/mobile exec node --test --import tsx scripts/mobile-phase-zero-native-config.test.ts`

Expected: FAIL because the script still defaults to `C:\Wizards` and has no managed-build helpers.

### Task 2: Implement the managed, recoverable build home

**Files:**
- Modify: `apps/mobile/scripts/build-android-uat.ps1`
- Test: `apps/mobile/scripts/mobile-phase-zero-native-config.test.ts`

**Interfaces:**
- Consumes: `BuildHome`, `ManagedBuildRoot`, `JavaHome`, `AndroidHome`, existing build switches.
- Produces: `Ensure-WhisprUatManagedRootLink`, `Initialize-WhisprUatBuildHome`, `Use-WhisprMobileUatBuildMutex`, and `Invoke-PnpmInstallWithRecovery`.

- [ ] **Step 1: Add managed-root parameters and derive effective paths**

```powershell
[string]$BuildHome = "C:\wm",
[string]$ManagedBuildRoot = "C:\whispr_dev\whispr_uat\whispr_mobile"
```

Create the short physical root and marker, create or validate the public `C:\whispr_dev\whispr_uat\whispr_mobile` junction, then derive `C:\wm\workspace`, `C:\wm\pnpm-store`, `C:\wm\pnpm-virtual-store`, and `C:\wm\gradle` unless a caller supplies an explicit compatible override.

- [ ] **Step 2: Keep package-manager and Gradle state private**

```powershell
Ensure-ProjectNpmrc -Root $resolvedBuildRoot -StoreDir $pnpmStoreDir -VirtualStoreDir $pnpmVirtualStoreDir -VirtualStoreMaxLength $PnpmVirtualStoreMaxLength
$env:GRADLE_USER_HOME = $gradleUserHome
```

Write `store-dir`, `virtual-store-dir`, and `virtual-store-dir-max-length` into the staged `.npmrc`.

- [ ] **Step 3: Add one bounded pnpm recovery**

```powershell
try {
  Invoke-CommandChecked -Command "corepack" -Arguments @("pnpm", "install", "--frozen-lockfile") -WorkingDirectory $resolvedBuildRoot
} catch {
  Clear-WhisprUatPnpmState -BuildHome $resolvedBuildHome -WorkspaceRoot $resolvedBuildRoot -StoreDir $pnpmStoreDir -VirtualStoreDir $pnpmVirtualStoreDir
  Invoke-CommandChecked -Command "corepack" -Arguments @("pnpm", "install", "--force", "--frozen-lockfile") -WorkingDirectory $resolvedBuildRoot
}
```

Use a named mutex around sync, install, and Gradle build; release it in `finally`.

- [ ] **Step 4: Run the focused test and confirm it passes**

Run: `corepack pnpm --filter @wizards/mobile exec node --test --import tsx scripts/mobile-phase-zero-native-config.test.ts`

Expected: PASS.

### Task 3: Document and verify the migration

**Files:**
- Modify: `apps/mobile/README.md`
- Modify: `apps/mobile/scripts/mobile-phase-zero-native-config.test.ts`

**Interfaces:**
- Consumes: managed build-home contract from Task 2.
- Produces: operator instructions for new output paths and a focused regression suite.

- [ ] **Step 1: Document the managed root and recovery boundary**

State that build outputs are under `C:\whispr_dev\whispr_uat\whispr_mobile\artifacts`, source is staged under `workspace`, and legacy folders are not automatically removed.

- [ ] **Step 2: Run non-device verification**

Run:

```powershell
corepack pnpm --filter @wizards/mobile exec node --test --import tsx scripts/mobile-phase-zero-native-config.test.ts
corepack pnpm --filter @wizards/mobile typecheck
```

Expected: both commands exit `0`.

- [ ] **Step 3: Run an x86_64 emulator APK build**

Run:

```powershell
cd apps/mobile
powershell -ExecutionPolicy Bypass -File .\scripts\build-android-uat.ps1 -SkipInstall -SkipUninstall -NoStartMetro -AndroidArchitectures x86_64
```

Expected: an archived debug APK under `C:\whispr_dev\whispr_uat\whispr_mobile\artifacts` and no references to `C:\Wizards` or `C:\wp` in the active build output.
