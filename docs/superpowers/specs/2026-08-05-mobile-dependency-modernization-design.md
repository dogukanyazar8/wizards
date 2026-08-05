# Mobile Dependency Modernization Design

**Date:** 2026-08-05

**Branch:** `uat`

**Status:** Approved continuation of dependency option 2

**Publication:** No stage, commit, or push

## Goal

Bring the Expo SDK 57 mobile application onto Expo's current compatible dependency matrix, then update compatible direct mobile patch/minor dependencies without crossing major-version or runtime boundaries.

## Scope

- Resolve all 14 mismatches reported by both `expo install --check` and Expo Doctor.
- Update compatible same-major mobile runtime and test dependencies reported by `pnpm outdated`.
- Keep Node on `>=24.18.0 <25`, pnpm on `11.20.0`, Expo on SDK 57, React Native on `0.86.x`, React on `19.2.x`, and Jest on 29.
- Preserve all existing application behavior, native config plugins, OTA behavior, SQLCipher configuration, Sentry upload contract, and unrelated working-tree changes.
- Regenerate the checked-in mobile open-source license manifest after lockfile convergence.

## Delivery Strategy

### Cohort 1: Expo SDK 57 compatibility matrix

Use Expo's validated versions, even when a newer registry release exists:

- `expo ~57.0.10`
- `expo-asset ~57.0.8`
- `expo-constants ~57.0.9`
- `expo-dev-client ~57.0.10`
- `expo-image ~57.0.2`
- `expo-image-manipulator ~57.0.7`
- `expo-image-picker ~57.0.7`
- `expo-notifications ~57.0.8`
- `expo-system-ui ~57.0.2`
- `expo-updates ~57.0.12`
- `react-native 0.86.2`
- `react-native-reanimated 4.5.1`
- `react-native-worklets 0.10.1`
- `jest-expo ~57.0.3`

Also align `@react-native/jest-preset` to `0.86.2` and update `babel-preset-expo` to the latest SDK 57 patch, `~57.0.5`.

### Cohort 2: Compatible mobile patch/minor updates

Update current same-major releases where Expo's matrix does not require a narrower pin:

- `@react-native-google-signin/google-signin 16.1.4`
- React Navigation bottom tabs/native/native stack to `7.18.14`, `7.3.14`, and `7.18.6`
- `@sentry/cli 3.6.2` and `@sentry/react-native 8.21.0`
- `livekit-client 2.21.0`
- `@types/react 19.2.18`
- `globals 17.9.0`, `pixelmatch 7.2.0`, `tsx 4.23.5`, and `typescript-eslint 8.66.0`

## Deliberate Holds

- Babel 8, Jest 30, ESLint 10, AsyncStorage 3, Gesture Handler 3, and `js-sha256` 1 are major migrations, not maintenance patches.
- `@types/node` 26 conflicts with the Node 24 engine contract.
- `react-native-reanimated 4.5.3` and `react-native-worklets 0.11.3` are newer than Expo SDK 57's validated matrix; use `4.5.1` and `0.10.1`.
- Keep `@shopify/flash-list 2.0.2`, React/React DOM `19.2.3`, `react-native-keyboard-controller 1.21.9`, `react-native-safe-area-context ~5.7.0`, `react-native-svg 15.15.4`, and exact `react-native-view-shot 5.1.0`; Expo Doctor rejects their newer same-major releases for this SDK matrix.
- `@playwright/test 1.62.1` remains held with the existing web/tooling compatibility decision to avoid a split Playwright type graph.
- TypeScript remains excluded from Expo validation because the workspace intentionally separates the TS7 CLI from the TS6 compiler API dependency.

## Expo Notifications Patch

The upstream `57.0.8` source still treats only an error named `AbortError` as cancellation. The local patch additionally treats `signal.aborted` as cancellation, preventing retry/warning behavior when React Native's fetch polyfill throws a nonstandard abort error. Move the patch registration and filename from `57.0.7` to `57.0.8`; do not drop or broaden it. Installation must prove the patch applies cleanly.

## Verification

- Use `expo install --check`, Expo Doctor, and `pnpm outdated` as executable RED evidence before changing the manifest; do not add tests that merely mirror version strings.
- Resolve the lockfile with root `corepack pnpm`; do not run `expo install --fix`, which previously selected an incompatible pnpm store layout.
- Require `expo install --check` and Expo Doctor to report no SDK mismatch.
- Run mobile script tests, component tests, typecheck/lint, quality and release checks, audit, and a temporary Android JavaScript export.
- Regenerate and test the open-source license manifest.
- Run `graphify update .` after code/config changes.
- Report native device build, emulator/device acceptance, CI, deployment, and production as separate states; none is implied by local checks.

## Working-Tree Safety

- Modify only `apps/mobile/package.json`, the exact native dependency contract test, the generated license manifest, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, the versioned Expo Notifications patch, these design/plan documents, and compatibility files proven necessary by a failing check.
- Preserve existing mobile/web/desktop/badge/Graphify WIP.
- Never reset, clean, stash, revert, broadly stage, commit, push, deploy, or mutate production.

## Success Criteria

- Expo's 14-package compatibility check is clean.
- All approved Cohort 2 packages reach the listed versions.
- The Expo Notifications abort patch applies to `57.0.8`.
- License output matches the resolved dependency graph.
- Required local gates pass or receive an explicit `FAIL`, `NOT RUN`, or `ENV BLOCKED` result.
- No deliberate hold or unrelated WIP is silently changed.
