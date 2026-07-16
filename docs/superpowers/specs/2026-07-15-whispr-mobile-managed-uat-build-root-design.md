# Whispr Mobile Managed UAT Build Root Design

## Goal

Expose all mutable Whispr Android UAT build state at `C:\whispr_dev\whispr_uat\whispr_mobile` while isolating it from the stale shared pnpm virtual store.

## Evidence

The 15 July emulator build copied the workspace successfully, then `pnpm install --frozen-lockfile` failed because `C:\wp\esbuild@0.28.1\node_modules\esbuild\package.json` was absent. The failure is a corrupt shared virtual store; Java, Android SDK, adb, and device checks had already passed. Robocopy exit code `3` is informational and not the cause.

An initial `subst` and then a long-root junction design both failed during real builds: React Native codegen mixed `W:` with canonicalized `C:` paths, and CMake then canonicalized the long physical root and exceeded its 250-character object-path limit. A short *physical* root is therefore required, not merely a short alias.

## Managed Build Home

The script owns this physical layout:

```text
C:\whispr_dev\whispr_uat\whispr_mobile\  (managed junction)
  -> C:\wm\                                (short physical root)
  workspace\
  pnpm-store\
  pnpm-virtual-store\
  gradle\
  artifacts\
  .whispr-mobile-uat-build-root.json
```

`workspace` is a mirrored staging copy of the active repository. The package-content store, pnpm virtual store, Gradle user home, and APK artifacts are all private to this build home.

## Path-Length Strategy

The script performs staging, pnpm, Gradle, and CMake operations in the short physical root `C:\wm`, then exposes the same state at `C:\whispr_dev\whispr_uat\whispr_mobile` through a validated junction. This keeps codegen and CMake on the same short `C:` path while preserving the requested managed access path. If the managed path is a normal directory or targets elsewhere, the script fails before changing data.

## Toolchain Boundary

JDK 17 and the Android SDK remain machine-installed prerequisites and are validated through the existing `JavaHome` and `AndroidHome` parameters. They are not copied into the build home because duplicating them creates an independent, large, and unpatched SDK installation. All mutable build state is moved into the managed home.

## Install and Recovery Rules

The staged `.npmrc` sets both `store-dir` and `virtual-store-dir` to the managed build home. A named mutex prevents concurrent UAT build processes from mutating that state. On a pnpm installation failure, the script clears only its owned workspace `node_modules`, pnpm virtual store, and pnpm store, then retries once with `pnpm install --force --frozen-lockfile`. A second failure is surfaced unchanged.

## Safety Rules

The short physical build home receives an ownership marker on creation; the public managed-root junction must target that exact marked home. Cleanup only targets descendants of the marked home. The legacy `C:\Wizards` and `C:\wp` locations are never deleted automatically. Existing package scripts continue to work without caller changes.

## Verification

Static mobile script tests lock the new default build home, drive mapping, isolated pnpm and Gradle locations, mutex, and recovery path. The focused mobile script test, mobile typecheck, and an emulator x86_64 APK build verify the change end to end.
