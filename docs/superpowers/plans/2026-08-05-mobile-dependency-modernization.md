# Mobile Dependency Modernization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align the UAT mobile app with Expo SDK 57's current compatibility matrix and approved same-major dependency updates without publishing the work.

**Architecture:** Apply an exact Expo-native cohort first, then a compatible community/tooling cohort. Use Expo's compatibility commands and the registry inventory as executable version contracts, preserve the versioned Expo Notifications patch, converge the shared lockfile once, regenerate licenses, and verify from narrow contracts through a temporary Android bundle.

**Tech Stack:** Expo SDK 57, React Native 0.86, React 19.2, pnpm 11.20.0, Node 24.18+, Jest 29, Node test runner, TypeScript 6/7 project runners.

## Global Constraints

- Work directly on existing `uat`; starting divergence is `0 0`.
- Preserve every pre-existing dirty or untracked file.
- No reset, clean, stash, revert, broad stage, commit, push, deployment, migration, or production mutation.
- Keep Node `>=24.18.0 <25`, pnpm `11.20.0`, Expo SDK 57, React Native `0.86.x`, and Jest 29.
- Use Expo's exact validated versions for Reanimated and Worklets rather than registry latest.
- Keep `@sentry/react-native` and TypeScript in `expo.install.exclude`.
- Report each gate as `PASS`, `FAIL`, `NOT RUN`, or `ENV BLOCKED`.

---

### Task 1: Capture executable RED compatibility evidence

**Files:**

- Read: `apps/mobile/package.json`

**Interfaces:**

- Consumes: current manifest, Expo's SDK 57 matrix, and the npm registry inventory.
- Produces: observed failing compatibility output and the exact approved target list.

- [ ] **Step 1: Run Expo's compatibility check**

Run:

```powershell
corepack pnpm --filter @wizards/mobile exec expo install --check
```

Expected: `FAIL` with the 14 package mismatches listed in the design.

- [ ] **Step 2: Run Expo Doctor and registry inventory**

Run:

```powershell
corepack pnpm dlx expo-doctor@latest
corepack pnpm --filter @wizards/mobile outdated --format json
```

Expected: Expo Doctor fails only the SDK version check; outdated inventory supplies the approved same-major targets and deliberate holds. This is the RED evidence. Do not add tests that merely mirror version strings.

### Task 2: Apply the Expo and community dependency cohorts

**Files:**

- Modify: `apps/mobile/package.json`
- Modify: `apps/mobile/scripts/mobile-phase-zero-native-config.test.ts`
- Modify: `pnpm-workspace.yaml`
- Modify: `pnpm-lock.yaml`
- Create: `patches/expo-notifications@57.0.8.patch`
- Delete: `patches/expo-notifications@57.0.7.patch`

**Interfaces:**

- Consumes: exact versions observed and approved in Task 1.
- Produces: a pnpm-resolved mobile dependency graph with the Notifications abort patch applied to `57.0.8`.

- [ ] **Step 1: Patch the mobile manifest**

Apply every exact version/range listed in the design. Do not change deliberate holds, workspace protocols, Expo exclusions, scripts, or application version.

Update the existing Sentry CLI build prerequisite assertion from `3.6.1` to `3.6.2`; do not add new version-mirroring assertions.

- [ ] **Step 2: Version the Notifications patch**

Copy the existing two-hunk abort-cancellation patch to `patches/expo-notifications@57.0.8.patch`, delete the `57.0.7` file, and change only the matching `patchedDependencies` key/path in `pnpm-workspace.yaml`.

- [ ] **Step 3: Resolve with the workspace package manager**

Run:

```powershell
corepack pnpm install
```

Expected: install exits `0`; pnpm reports the `expo-notifications@57.0.8` patch as applicable.

- [ ] **Step 4: Verify the existing native contract**

Run:

```powershell
corepack pnpm --filter @wizards/mobile exec node --import tsx --test scripts/mobile-phase-zero-native-config.test.ts
```

Expected: `PASS`.

- [ ] **Step 5: Inspect exact scope**

Run:

```powershell
git diff --check -- apps/mobile/package.json apps/mobile/scripts/mobile-phase-zero-native-config.test.ts pnpm-workspace.yaml pnpm-lock.yaml patches/expo-notifications@57.0.7.patch patches/expo-notifications@57.0.8.patch
git diff -- apps/mobile/package.json apps/mobile/scripts/mobile-phase-zero-native-config.test.ts pnpm-workspace.yaml
```

Expected: only approved dependency/version/patch changes plus preserved pre-existing workspace changes.

### Task 3: Regenerate mobile license evidence

**Files:**

- Modify: `apps/mobile/src/legal/mobile-open-source-license-manifest.ts`
- Read: `apps/mobile/scripts/generate-mobile-open-source-licenses.ts`
- Test: `apps/mobile/scripts/mobile-open-source-licenses.test.ts`

**Interfaces:**

- Consumes: resolved `pnpm-lock.yaml` and installed mobile dependency graph.
- Produces: deterministic checked-in license groups matching the new versions.

- [ ] **Step 1: Generate licenses**

Run:

```powershell
corepack pnpm --filter @wizards/mobile licenses:generate
```

- [ ] **Step 2: Test license output**

Run:

```powershell
corepack pnpm --filter @wizards/mobile exec node --import tsx --test scripts/mobile-open-source-licenses.test.ts
```

Expected: `PASS`; generated-file marker and package coverage remain intact.

### Task 4: Run compatibility and mobile gates

**Files:**

- Modify only if a gate proves a compatibility defect: nearest mobile source/config file and its existing focused test.
- Read: `apps/mobile/package.json`, `apps/mobile/app.config.js`, final lockfile and status.

**Interfaces:**

- Consumes: Tasks 2-3 dependency graph.
- Produces: local compatibility evidence without device, CI, deployment, or production claims.

- [ ] **Step 1: Validate Expo matrix**

```powershell
corepack pnpm --filter @wizards/mobile exec expo install --check
corepack pnpm dlx expo-doctor@latest
```

Expected: both exit `0`; no SDK version mismatch.

- [ ] **Step 2: Run focused package gates**

```powershell
corepack pnpm --filter @wizards/mobile test
corepack pnpm --filter @wizards/mobile test:components -- --runInBand
corepack pnpm --filter @wizards/mobile typecheck
corepack pnpm --filter @wizards/mobile quality:check
corepack pnpm --filter @wizards/mobile release:check
corepack pnpm audit --audit-level moderate
```

If any check fails, diagnose the root cause and change source only after a focused regression test fails for that defect.

- [ ] **Step 3: Prove JavaScript bundling outside the worktree**

Create a temporary directory and run Expo export for Android into it. Remove only that verified temporary directory afterward. Expected: bundle exits `0`.

- [ ] **Step 4: Confirm deliberate holds and final inventory**

Run `corepack pnpm --filter @wizards/mobile outdated --format json`. Confirm remaining mobile entries are only the documented major/matrix/tooling holds.

### Task 5: Refresh Graphify and perform final safety audit

**Files:**

- Modify: generated `graphify-out/` files via required incremental update.
- Read: all task deltas and repository status.

**Interfaces:**

- Consumes: verified dependency work.
- Produces: current code graph and final UAT/WIP evidence.

- [ ] **Step 1: Refresh the graph**

```powershell
graphify update .
```

- [ ] **Step 2: Run final immutable install and safety checks**

```powershell
corepack pnpm install --frozen-lockfile
git diff --check
git status --short
git rev-list --left-right --count origin/uat...uat
```

Expected: frozen install exits `0`, branch remains `uat`, divergence remains `0 0`, no stage/commit/push occurred, and unrelated WIP remains present.
