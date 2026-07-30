# Mobile Release Identity Automation Implementation Plan

## 1. Update decision

- Same-SemVer/higher-versionCode regression test.
- Select Android artifact before the semantic-version early return.
- Return APK decision when installed `versionCode` is behind.

## 2. Native About identity

- Add a pure native identity resolver and tests.
- Extend runtime identity with native `versionName`.
- Render About version and Build from native values; never use admin Build as installed Build.

## 3. Admin metadata synchronization

- Test artifact registration metadata synchronization.
- Create artifact and update Release Build/size in one Prisma transaction.
- Make Admin Build read-only and remove it from manual PATCH payloads.

## 4. Workflow automation

- Add workflow-contract tests for no manual `version_code`, APK `versionName` verification, actual-code metadata, and real installed-version probe.
- Allow pre-build contract generation without `versionCode`.
- Read `versionName`/`versionCode` from APK, validate them, then finalize artifact metadata.
- Use finalized metadata for upload, manifest, Admin registration, and parity checks.

## 5. Verification

- Run focused Node/Jest tests and typechecks.
- Run formatting/diff checks.
- Update Graphify and review scoped diff.
