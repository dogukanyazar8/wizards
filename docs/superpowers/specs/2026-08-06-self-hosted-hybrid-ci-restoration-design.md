# Self-Hosted Hybrid CI Restoration Design

## Goal

Restore the previously validated hybrid runner model: automatic Linux CI and every Mobile Release job run on the local self-hosted Linux virtual machines, while optional Windows and macOS native checks remain on GitHub-hosted runners.

## Scope

- Route CPU- and Docker-capable Linux jobs to `[self-hosted, linux, x64, wizards-ci]`.
- Route lightweight Linux contract jobs to `[self-hosted, linux, x64, ci-fast]`.
- Route all Mobile Release jobs to `[self-hosted, Linux, X64, mobile-release]`.
- Route the scheduled Mobile Redesign Device Gate to the `wizards-ci` Linux runner.
- Keep explicit Windows and macOS matrices on `windows-latest` and `macos-latest`.
- Remove GitHub-hosted-only disk reclamation and ephemeral scratch assumptions from Mobile Release.
- Restore self-hosted-safe dependency-cache behavior and actionlint label declarations.

## Runner mapping

- `wizards-ci`: Verify, Semgrep, Playwright smoke/cross-browser/accessibility/visual, automatic Linux Desktop Ops, Mobile Redesign Device Gate.
- `ci-fast`: actionlint and TypeScript compiler compatibility.
- `mobile-release`: preflight, contract validation, OTA publication, APK build/publication.
- GitHub-hosted Windows/macOS: manual compatibility matrices and platform-native desktop builds.

## Trust boundary

Persistent self-hosted runners must not execute `pull_request` event code. Self-hosted CI remains available for protected branch pushes, schedules, tags, and manual dispatches. Release jobs retain their existing UAT/environment/secret guards. GitHub-hosted Windows/macOS jobs keep their current event and input restrictions.

## Mobile build storage

The self-hosted release VM uses its persistent Android/Gradle toolchain and `$RUNNER_TEMP/eas-local-build` scratch directory. Hosted-only removal of `/usr/local/lib/android`, Docker images, CodeQL, Ruby, Go, and other system paths is removed because it is unsafe and unnecessary on a persistent machine. Existing APK signing, immutable R2 publication, certificate verification, and secret scrubbing remain unchanged.

## Verification

- Mobile Release workflow contract tests enforce four dedicated self-hosted jobs and reject hosted disk reclamation.
- CI contract tests enforce label routing, persistent-cache behavior, and pull-request isolation.
- `actionlint`, toolchain contracts, focused workflow tests, and `git diff --check` must pass.
- `graphify update .` refreshes repository topology after workflow changes.

## Operational limitation

Both registered Linux runners were offline during design validation. Repository changes can be verified locally, but dispatched jobs will remain queued until the virtual machines and runner services are online. Hyper-V state could not be inspected because the current process lacks Hyper-V management permission.
