# Whispr Mobile OTA + Android APK Update Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add the always-visible About 1A “Denetle” action, signed UAT Expo OTA delivery, and UAT/canary Android APK self-update without weakening Play Store or signing security.

**Architecture:** One version-decision API tells the mobile client whether the next action is OTA, APK, store-managed, or none. Expo OTA remains the JavaScript-compatible path and is served as Expo protocol multipart responses from immutable R2 artifacts plus pre-signed database metadata. APK updates are limited to internal UAT/canary builds; the client streams the download, hashes it, and hands installation to Android, which enforces the unchanged application signing certificate.

**Tech Stack:** Expo SDK 57, React Native 0.86, TypeScript, Next.js route handlers, Zod, Prisma/PostgreSQL, Cloudflare R2 S3 API, EAS Build/Update, Node test runner, Jest.

**Global constraints:** Work in the existing dirty `uat` checkout because the About/config/prompts are in-scope WIP. Preserve unrelated changes. Do not stage, commit, push, deploy, publish, rotate EAS credentials, or mutate Railway/R2/EAS live state. Every production behavior change follows RED → GREEN. Generated Prisma code and formatter output are exempt from hand-authored TDD, but their consuming behavior is tested first.

---

### Task 1: Extend shared update contracts

**Files:**

- Modify: `packages/types/src/mobile.ts`
- Modify: `packages/types/src/mobile.test.ts`
- Modify: `apps/web/src/app/api/v1/mobile/app/update/route-logic.test.ts`

**Step 1: Write failing contract tests**

Add literal fixtures proving:

- `MobileAppUpdateQuerySchema` accepts `runtimeVersion`, Android `versionCode`, `platform`, and `buildEnvironment`.
- the response distinguishes `updateKind: "ota" | "apk" | "store" | "none"`;
- APK metadata requires positive `versionCode`, HTTPS `url`, positive `sizeBytes`, and a lowercase 64-character SHA-256 digest;
- invalid Android metadata is rejected.

**Step 2: Run RED**

Run:

```powershell
pnpm.cmd --filter @wizards/types test -- mobile
```

Expected: FAIL because the new fields/schemas do not exist.

**Step 3: Implement minimal schemas**

Add and export:

```ts
export const MobileUpdateKindSchema = z.enum(["ota", "apk", "store", "none"]);
export const MobileBuildEnvironmentSchema = z.enum(["development", "uat", "canary", "production"]);
export const MobileUpdatePlatformSchema = z.enum(["android", "ios"]);
export const MobileAndroidArtifactSchema = z.object({
  versionCode: z.number().int().positive(),
  url: z
    .string()
    .url()
    .refine((value) => value.startsWith("https://")),
  sizeBytes: z.number().int().positive(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  signingCertSha256: z
    .string()
    .regex(/^[A-F0-9:]{95}$/)
    .optional(),
});
```

Extend the query and latest-response contracts without removing the existing release/version fields.

**Step 4: Run GREEN**

Run the Task 1 command and confirm zero failures.

---

### Task 2: Add Prisma OTA/artifact persistence

**Files:**

- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/db/prisma/rebaseline-migrations/20260730100000_mobile_update_delivery/migration.sql`
- Modify: `packages/db/scripts/prisma-validate.test.mjs` if a focused schema assertion already exists there

**Step 1: Write failing schema validation/contract test**

Add a focused test that loads Prisma DMMF or validates the schema and proves these observable constraints:

- OTA bundle key is unique;
- release artifacts are unique per release/platform/kind/versionCode;
- both models reference `Release`;
- version codes and rollout percentages are representable;
- the publication record stores pre-computed manifest/directive signatures and hashes, never a private key.

**Step 2: Run RED**

Run:

```powershell
pnpm.cmd --filter @wizards/db test -- prisma-validate
```

Expected: FAIL because models/enums are absent.

**Step 3: Implement schema and SQL**

Add:

```prisma
enum MobileUpdatePlatform { ANDROID IOS }
enum ReleaseArtifactKind { APK AAB IPA }

model OtaBundle {
  id                         String               @id @default(uuid())
  releaseId                  String
  platform                   MobileUpdatePlatform
  channel                    ReleaseChannel
  runtimeVersion             String
  bundleKey                  String               @unique
  manifestBody               String
  manifestSignature          String
  manifestSha256             String
  noUpdateDirectiveSignature String
  rollbackDirectiveSignature String
  signingKeyId               String
  rolloutPercentage          Int                  @default(100)
  enabled                    Boolean              @default(true)
  publishedAt                DateTime?
  createdAt                  DateTime             @default(now())
  updatedAt                  DateTime             @updatedAt
  release                    Release              @relation(fields: [releaseId], references: [id], onDelete: Cascade)

  @@index([platform, channel, runtimeVersion, publishedAt])
}

model ReleaseArtifact {
  id                String               @id @default(uuid())
  releaseId         String
  channel           ReleaseChannel
  platform          MobileUpdatePlatform
  kind              ReleaseArtifactKind
  versionCode       Int
  url               String
  sizeBytes         BigInt
  sha256            String
  signingCertSha256 String?
  publishedAt       DateTime?
  createdAt         DateTime             @default(now())
  updatedAt         DateTime             @updatedAt
  release           Release              @relation(fields: [releaseId], references: [id], onDelete: Cascade)

  @@unique([platform, kind, channel, versionCode])
  @@index([releaseId])
  @@index([platform, kind, channel, versionCode, publishedAt])
}
```

Add `otaBundles`, `artifacts`, and optional `minSupportedVersionCode` to `Release`. Encode CHECK constraints for rollout `0..100`, positive artifact size/versionCode, and lowercase SHA-256 formats in SQL.

**Step 4: Validate and generate**

Run:

```powershell
pnpm.cmd --filter @wizards/db exec prisma validate
pnpm.cmd --filter @wizards/db exec prisma generate
```

Then rerun the focused test.

---

### Task 3: Configure UAT OTA signing and Play Store-safe permissions

**Files:**

- Modify: `apps/mobile/app.config.js`
- Modify: `apps/mobile/eas.json`
- Modify: `apps/mobile/src/release/mobile-store-contract-data.json`
- Modify: `apps/mobile/src/release/mobile-store-contract.ts`
- Modify: `apps/mobile/scripts/mobile-app-config-contract.test.ts`
- Modify: `apps/mobile/scripts/mobile-store-contract.test.ts`
- Modify: `apps/mobile/package.json`
- Modify: `pnpm-lock.yaml`
- Create: `apps/mobile/certs/ota/uat/certificate.pem`
- Create: `apps/mobile/certs/ota/README.md`

**Step 1: Write failing config/store tests**

Prove:

- UAT has `updates.url`, fingerprint `runtimeVersion`, `codeSigningCertificate`, and `codeSigningMetadata.keyid = "whispr-mobile-ota-uat-2026-01"`;
- missing certificate fails when OTA is explicitly enabled;
- development and unsigned canary/production profiles keep OTA disabled rather than silently sharing UAT trust;
- UAT/canary internal APK configs include `android.permission.REQUEST_INSTALL_PACKAGES`;
- production store config excludes it and reports no store blocker.

**Step 2: Run RED**

Run:

```powershell
pnpm.cmd --filter @wizards/mobile test -- mobile-app-config-contract mobile-store-contract
```

Expected: FAIL on absent signing/update/permission behavior.

**Step 3: Generate the UAT certificate safely**

Resolve and inspect these exact paths first:

- private key: `C:\Users\doguk\.secrets\whispr-mobile-ota\uat\private-key.pem`
- public certificate: `C:\Users\doguk\Desktop\Wizards\apps\mobile\certs\ota\uat\certificate.pem`

Generate a one-year certificate with Expo’s code-signing CLI. Never print, copy into the repo, or upload the private key. Record only the public certificate fingerprint and key id in repo documentation.

**Step 4: Implement config**

- `WHISPR_MOBILE_OTA_ENABLED=true` opts a build into signed OTA.
- UAT EAS sets it true; other profiles stay false until their own key/certificate exists.
- `updates.requestHeaders` carries the build environment.
- `runtimeVersion.policy = "fingerprint"`.
- permission selection is profile-aware.
- add `expo-intent-launcher` and `js-sha256`; use `expo-file-system/legacy` for resumable file APIs.

**Step 5: Run GREEN**

Run focused config/store tests and `pnpm.cmd --filter @wizards/mobile typecheck`.

---

### Task 4: Implement signed Expo manifest decision and public route

**Files:**

- Create: `apps/web/src/lib/app/ota-manifest-service.ts`
- Create: `apps/web/src/lib/app/ota-manifest-service.test.ts`
- Create: `apps/web/src/app/api/v1/app/updates/manifest/route.ts`
- Create: `apps/web/src/app/api/v1/app/updates/manifest/route-logic.ts`
- Create: `apps/web/src/app/api/v1/app/updates/manifest/route-logic.test.ts`
- Modify: `apps/web/src/lib/api-rate-limit.ts`
- Modify: `apps/web/src/lib/api-route-contracts.ts`

**Step 1: Write failing decision tests**

Use literal database fixtures. Prove:

- headers are validated: platform, runtime version, channel, current update id;
- channel maps `uat → UAT`, `canary → BETA`, `production → STABLE`;
- the newest compatible published row is selected before `enabled` is interpreted;
- disabled newest row returns signed rollback;
- same current update returns signed no-update;
- rollout is stable for the same installation id and rejects percentages outside `0..100`;
- malformed stored JSON/hash/signature metadata fails closed;
- no compatible row returns 204 only when no signing metadata exists;
- endpoint is anonymous but IP rate-limited and never leaks a database error.

**Step 2: Run RED**

Run:

```powershell
pnpm.cmd --filter @wizards/web test -- ota-manifest-service route-logic
```

Expected: FAIL because service/route do not exist.

**Step 3: Implement service**

- query immutable, published records;
- verify `sha256(manifestBody) === manifestSha256`;
- build Expo protocol multipart responses for update, `noUpdateAvailable`, and `rollBackToEmbedded`;
- attach `expo-signature: sig="<base64>", keyid="<id>"` from stored pre-computed signatures;
- use deterministic SHA-256 bucketing from installation id for rollout;
- never import a private key.

**Step 4: Implement route**

- use `cf-connecting-ip`, then first `x-forwarded-for`, then a stable unknown bucket;
- add `app:updates:manifest` rate policy;
- add the public route to the explicit route contract allowlist;
- set `expo-protocol-version`, `expo-sfv-version`, and no-store headers.

**Step 5: Run GREEN**

Run focused web tests and web typecheck.

---

### Task 5: Add OTA admin publication API and offline signing script

**Files:**

- Create: `apps/web/src/lib/releases/admin-ota-service.ts`
- Create: `apps/web/src/lib/releases/admin-ota-service.test.ts`
- Create: `apps/web/src/app/api/v1/admin/releases/[releaseId]/ota/route.ts`
- Create: `apps/web/src/app/api/v1/admin/releases/[releaseId]/ota/route-logic.ts`
- Create: `apps/web/src/app/api/v1/admin/releases/[releaseId]/ota/route-logic.test.ts`
- Create: `apps/mobile/scripts/mobile-ota-publish-plan.mjs`
- Create: `apps/mobile/scripts/mobile-ota-publish-plan.test.mjs`

**Step 1: Write failing API/script tests**

Prove:

- only `release.write` can register or disable a bundle;
- rate-limit and audit actions are emitted;
- publication requires an already-published release, immutable R2 HTTPS URLs, hashes, signatures, key id, and rollout `0..100`;
- duplicate bundle keys are rejected;
- the script outputs a redacted upload/register plan, rejects a key inside the workspace, and contains no PEM/private material.

**Step 2: Run RED**

Run focused route/service/script tests.

**Step 3: Implement minimal publication**

The local script:

1. runs Expo export/update artifact generation;
2. builds the exact manifest and directives;
3. signs them using only the externally supplied private-key path;
4. writes immutable upload artifacts and a redacted registration payload.

The admin API stores only hashes/signatures/public metadata and writes an audit event.

**Step 4: Run GREEN**

Rerun focused tests; run the script in dry-run mode with fixture files only.

---

### Task 6: Make About 1A “Denetle” always visible and support OTA rollback

**Files:**

- Modify: `apps/mobile/src/about/MobileAboutSettingsScreen.tsx`
- Modify: `apps/mobile/src/about/AboutIdentityCard.tsx`
- Modify: `apps/mobile/src/about/mobile-update-controller.ts`
- Modify: `apps/mobile/scripts/mobile-update-controller.test.ts`
- Modify: `apps/mobile/src/about/__tests__/MobileAboutSettingsScreen.test.tsx`
- Modify: `apps/mobile/src/about/AboutUpdateSheet.tsx`
- Modify: relevant Turkish/English About localization resources

**Step 1: Write failing UI/controller tests**

Prove:

- the identity-card action is present with accessibility label “Güncellemeleri denetle” even when Expo Updates is disabled;
- tapping it refreshes the version decision rather than hiding the action;
- OTA `isRollBackToEmbedded` becomes an install/reload state with explicit rollback copy;
- current checking, available, downloading, and error behavior remains intact.

**Step 2: Run RED**

Run:

```powershell
pnpm.cmd --filter @wizards/mobile test -- mobile-update-controller
pnpm.cmd --filter @wizards/mobile test:components -- MobileAboutSettingsScreen
```

Expected: FAIL because visibility is capability-gated and rollback is unhandled.

**Step 3: Implement minimal behavior**

- visibility depends on the About design, not the currently selected adapter capability;
- disabled adapter reports a safe “bu dağıtım güncellemeyi mağaza üzerinden alır” state;
- Expo controller understands rollback and calls `reloadAsync()` only after confirmation/install action;
- do not invent progress or restart behavior.

**Step 4: Run GREEN**

Rerun both focused tests.

---

### Task 7: Implement internal Android APK controller

**Files:**

- Create: `apps/mobile/src/about/android-apk-update-controller.ts`
- Create: `apps/mobile/scripts/android-apk-update-controller.test.ts`
- Create: `apps/mobile/src/about/mobile-update-controller-factory.ts`
- Create: `apps/mobile/scripts/mobile-update-controller-factory.test.ts`
- Modify: `apps/mobile/src/about/MobileAboutSettingsScreen.tsx`
- Modify: `apps/mobile/src/about/AboutUpdateSheet.tsx`

**Step 1: Write failing controller tests**

With injected filesystem/intent/hash dependencies, prove:

- production and iOS never select APK;
- UAT/canary Android selects APK only for a newer `versionCode`;
- download is resumable and exposes real byte progress;
- insufficient free space fails before network I/O;
- size or SHA-256 mismatch deletes the temporary file and blocks install;
- pause/resume uses the resumable download state;
- install uses a content URI and Android package-installer intent;
- denial/cancel is a recoverable state, not reported as installed.

**Step 2: Run RED**

Run:

```powershell
pnpm.cmd --filter @wizards/mobile test -- android-apk-update-controller mobile-update-controller-factory
```

Expected: FAIL because files/factories are absent.

**Step 3: Implement minimal controller**

- download to cache via `expo-file-system/legacy.createDownloadResumable`;
- require free space of at least artifact bytes plus a bounded safety margin;
- hash in bounded base64 chunks through `js-sha256`, never loading the full APK;
- delete mismatches;
- install with `expo-intent-launcher` and `FileSystem.getContentUriAsync`;
- Android remains the final signing-certificate authority.

**Step 4: Wire the factory and sheet**

Select:

- OTA for `updateKind: "ota"`;
- APK only for internal Android builds;
- store guidance for `updateKind: "store"`;
- disabled/no-op for `none`.

Render permission and verification stages in 1D without fake percentages.

**Step 5: Run GREEN**

Rerun focused controller/factory tests and About component tests.

---

### Task 8: Implement APK artifact registration and version decision

**Files:**

- Create: `apps/web/src/lib/releases/admin-release-artifact-service.ts`
- Create: `apps/web/src/lib/releases/admin-release-artifact-service.test.ts`
- Create: `apps/web/src/app/api/v1/admin/releases/[releaseId]/artifact/route.ts`
- Create: `apps/web/src/app/api/v1/admin/releases/[releaseId]/artifact/route-logic.ts`
- Create: `apps/web/src/app/api/v1/admin/releases/[releaseId]/artifact/route-logic.test.ts`
- Create: `apps/web/src/lib/app/mobile-update-decision-service.ts`
- Create: `apps/web/src/lib/app/mobile-update-decision-service.test.ts`
- Modify: `apps/web/src/app/api/v1/mobile/app/update/route-logic.ts`
- Modify: `apps/web/src/app/api/v1/mobile/app/update/route-logic.test.ts`
- Modify: `apps/web/src/lib/api-rate-limit.ts`

**Step 1: Write failing decision/admin tests**

Prove:

- artifact registration requires `release.write`, rate-limit, audit log, published release, HTTPS URL, valid hash, positive size/versionCode;
- lower/equal versionCode never yields APK;
- internal Android with a newer artifact yields APK;
- production yields `store`, never an APK URL;
- compatible enabled OTA takes precedence over APK;
- incompatible runtime/native minimum yields APK/store as appropriate;
- database failures are safe API errors.

**Step 2: Run RED**

Run focused web tests. Expected FAIL because services/routes are absent.

**Step 3: Implement services and routes**

- query only published release/artifact/bundle rows;
- apply `OTA → APK/store → none` precedence;
- never trust a client-supplied environment to broaden access: APK URLs require both an internal release channel and an internal request environment;
- add `admin:release:artifact` rate policy and audit action.

**Step 4: Run GREEN**

Rerun focused web tests and web typecheck.

---

### Task 9: Add mobile release workflow without publishing

**Files:**

- Create: `.github/workflows/mobile-release.yml`
- Create: `apps/mobile/scripts/mobile-release-workflow.mjs`
- Create: `apps/mobile/scripts/mobile-release-workflow.test.mjs`
- Modify: root/package release scripts only if an existing convention requires it

**Step 1: Write failing workflow contract tests**

Parse the workflow and prove:

- `workflow_dispatch` requires environment, release id, and rollout;
- OTA jobs require environment-specific signing secret and fail closed;
- APK runs only for UAT/canary and uses EAS-managed Android credentials;
- `apksigner verify --print-certs` runs before upload;
- SHA-256 and byte size are computed before registration;
- uploads use immutable R2 keys and the same endpoint/secrets pattern as desktop;
- production never registers an APK;
- no raw secret is echoed or persisted as an artifact.

**Step 2: Run RED**

Run:

```powershell
node --test apps/mobile/scripts/mobile-release-workflow.test.mjs
```

Expected: FAIL because workflow/script are absent.

**Step 3: Implement workflow**

Use EAS non-interactively, existing Android application signing credentials, separate environment-scoped OTA signing keys, R2 S3 upload, and admin registration calls. Keep all jobs manual and non-deploying in this task.

**Step 4: Run GREEN**

Rerun workflow tests and YAML validation.

---

### Task 10: Cross-package verification and graph refresh

**Files:**

- Modify generated `graphify-out/` files through `graphify update .`
- Review all scoped diffs

**Step 1: Focused regression suite**

Run:

```powershell
pnpm.cmd --filter @wizards/types test -- mobile
pnpm.cmd --filter @wizards/db exec prisma validate
pnpm.cmd --filter @wizards/mobile test -- mobile-app-config-contract mobile-store-contract mobile-update-controller android-apk-update-controller mobile-update-controller-factory
pnpm.cmd --filter @wizards/mobile test:components -- MobileAboutSettingsScreen AboutUpdateSheet
pnpm.cmd --filter @wizards/web test -- ota-manifest-service mobile-update-decision-service
```

**Step 2: Static checks**

Run:

```powershell
pnpm.cmd --filter @wizards/types typecheck
pnpm.cmd --filter @wizards/mobile typecheck
pnpm.cmd --filter @wizards/web typecheck
pnpm.cmd prettier --check apps/mobile apps/web packages/types packages/db .github/workflows/mobile-release.yml
git diff --check
```

**Step 3: Security scans**

Run narrow searches proving:

- no private PEM/key material exists under the workspace;
- no OTA private-key value appears in generated plans/log fixtures;
- production app config/workflow cannot request package install permission or expose APK URLs.

**Step 4: Refresh architecture graph**

Run:

```powershell
graphify update .
```

**Step 5: Final evidence**

Report separately:

- local tests/typechecks/format;
- private key creation path and public certificate fingerprint without exposing secret data;
- CI, EAS build/update, R2 upload, Railway/database migration, APK install, native device, and visual acceptance as `NOT RUN` unless independently observed;
- no commit/push/deploy.
