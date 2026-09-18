# Release Center Implementation Plan

> Execute sequentially with superpowers:executing-plans. No subagents, commits, deployment, or live migrations.

**Goal:** One admin center for desktop/mobile packages and release notes, populated automatically after verified R2 publication.

**Architecture:** Extend Release with product identity and immutable publication metadata. Keep DownloadArtifact and mobile ReleaseArtifact as transactional projections for existing consumers. GitHub OIDC authenticates a final publication request; the database serializes publication per product/channel and rejects version regression. Existing notes editors remain reusable.

**Tech Stack:** Prisma/PostgreSQL, Next.js, Zod, jose, Node.js scripts, GitHub Actions, Cloudflare R2.

**Spec:** User-approved design in this task: download page and in-app updates/notes only; automatic PR/commit notes; independent desktop/mobile versions; Beta/Stable isolation; Android internal APK remains UAT-only.

## Global constraints

- Preserve existing overlay WIP and signing/runtime trust boundaries.
- No new service or dependency. No executable uploads from admin UI.
- Remote immutable bytes must match declared hash/size before publication.
- Replays preserve administrator-edited notes; conflicting artifact identity fails.
- Withdrawn publications cannot be revived by a workflow retry.

## Execution

- [x] Add failing publication contract tests: platform/channel isolation, immutable URL, digest, version order, OIDC claim binding.
- [x] Extend `packages/db/prisma/schema.prisma` and add an additive rebaseline migration; preserve legacy mobile rows and retain manual downloads until verified publication replaces their pointer.
- [x] Implement `apps/web/src/lib/releases/publication-*.ts`: bounded validation, OIDC, atomic idempotent publication, withdrawal, latest feed and baseline.
- [x] Scope release consumers by product/channel; preserve mobile public contracts and OTA compatibility.
- [x] Implement `scripts/releases/publish-release.mjs`: published baseline, relevant PR/commit notes, remote verification, OIDC, retryable manifest publication.
- [x] Wire desktop and APK workflow finalization after successful upload/verification; remove manual APK release-id dependency. Keep OTA existing signed flow.
- [x] Unify `/admin/releases` and `/admin/downloads`, package detail/notes/history/withdrawal and filters; guard managed projections from independent edits.
- [x] Run focused service/script/schema/workflow tests, type checks and lint; document rollout/configuration and legacy feed routing; update Graphify.

## Verification

Run focused Node tests under `scripts/releases`, web tests under `src/lib/releases`, existing release/mobile/download route tests, Prisma validation/generation, web typecheck, ESLint, Prettier and actionlint. Test database transactions against an isolated database if available; never use the configured live DATABASE_URL. Report unavailable native/CI/deployment checks explicitly.

Completed locally: 8 real PostgreSQL transaction/consumer tests; migration from previous schema produced no Prisma diff; 100 focused web checks; 7 admin detail/publish route checks; 2 publication proxy checks; 6 browser component checks; 123 desktop script checks; 9 mobile/shared publisher checks; TypeScript, ESLint, Prisma validation and actionlint passed. Native signed builds, live GitHub OIDC/R2, deployment and production migration remain operational rollout checks.
