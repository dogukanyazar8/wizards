# Channel Advanced Settings Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Follow strict red-green-refactor TDD. Preserve unrelated dirty WIP. Do not commit or push without explicit authorization.

**Goal:** Make text slow mode and voice bitrate, capacity, RTC region, and video quality real create/edit features while removing NSFW from the current application.

**Architecture:** Shared strict Zod contracts define valid channel-type settings. Workspace services persist and project them. Socket/Redis owns slow-mode decisions; voice capacity and LiveKit server own admission. Token media policy configures web/mobile clients. Web create/edit uses a shared form model and a collapsed advanced section.

**Tech Stack:** TypeScript, Zod, Prisma/PostgreSQL, Redis, Socket.IO, LiveKit server/client SDKs, React, React Query, Vitest, Playwright.

---

## Task 1: Contract and migration safety

- [ ] Add failing contract tests for defaults, preset boundaries, strict unknown-field rejection, and text/voice cross-field rejection.
- [ ] Add failing DB migration/schema tests for removal of `Channel.isNsfw`, `Server.isNsfw`, and `UserSettings.nsfwAllowed`.
- [ ] Extend `WorkspaceChannelSchema`, create/update schemas, web/mobile request contracts, and exported types.
- [ ] Remove current Prisma NSFW fields and add a forward-only migration that drops the three columns safely.
- [ ] Persist new fields in channel create/update and include them in web/mobile server-detail projections.
- [ ] Run focused types/DB/service tests, Prisma generate, then types/DB typechecks.

Primary files:

- `packages/types/src/workspace.ts`
- `packages/types/src/mobile-workspace-management.ts`
- `packages/types/src/*.test.ts`
- `packages/db/prisma/schema.prisma`
- `packages/db/prisma/rebaseline-migrations/20260813120000_remove_nsfw_state/migration.sql`
- `packages/db/prisma/*.test.mjs`
- `apps/web/src/lib/workspace/channel-service.ts`
- `apps/web/src/lib/workspace/server-service.ts`

## Task 2: Runtime behavior

- [ ] Add failing Socket/Redis tests for channel+user slow mode, moderator bypass, global limiter preservation, `retryAfterSeconds`, and Redis failure behavior.
- [ ] Implement server-authoritative slow mode after channel permission resolution.
- [ ] Add failing capacity tests for `0`, `1..10`, over-limit values, concurrency, and limit-lowering behavior.
- [ ] Apply effective channel capacity in join lock and LiveKit `maxParticipants`.
- [ ] Add failing RTC allowlist and token media-policy tests, including unknown region rejection and automatic fallback.
- [ ] Resolve RTC endpoints only from trusted server configuration; return bitrate/video media policy.
- [ ] Add failing web/mobile LiveKit client tests for audio bitrate and `AUTO | FULL` visible-video behavior.
- [ ] Apply policy on new web/mobile connections without disconnecting active sessions.
- [ ] Run focused Socket, Redis, capacity, LiveKit server, web client, and mobile client tests.

Primary files:

- `apps/web/src/lib/socket/rate-limits.ts`
- `apps/web/src/lib/socket/handlers/message.ts`
- `apps/web/src/lib/voice/capacity.ts`
- `apps/web/src/lib/livekit/server.ts`
- `apps/web/src/lib/livekit/types.ts`
- `apps/web/src/components/providers/live-voice-provider.tsx`
- `apps/mobile/src/voice/use-mobile-voice-room.ts`

## Task 3: Web UX and acceptance

- [ ] Add failing component/form-model tests for type-dependent controls, defaults, accessibility, validation, and edit hydration.
- [ ] Extract a small shared channel form model and advanced-settings component; keep the surrounding modal intact.
- [ ] Wire create/edit payloads and optimistic React Query patches to every new field.
- [ ] Add TR/EN copy; remove current NSFW UI/DTO text references.
- [ ] Add focused Playwright coverage for create, edit, refresh, real slow-mode block, full voice-channel rejection, and invalid RTC API rejection.
- [ ] Run package tests/typechecks, targeted Playwright, Prisma migration dry-run, and `graphify update .`.
- [ ] Record real LiveKit UAT as `NOT RUN` unless credentials and two clients are available; never infer it from mocks.

Primary files:

- `apps/web/src/components/shell/workspace-modals.tsx`
- `apps/web/src/components/shell/channel-form-model.ts`
- `apps/web/src/components/shell/channel-advanced-settings.tsx`
- web locale resources and focused component/E2E tests

## Verification commands

```powershell
pnpm.cmd --filter @wizards/types test
pnpm.cmd --filter @wizards/db test
pnpm.cmd --filter @wizards/web test
pnpm.cmd --filter @wizards/web typecheck
pnpm.cmd --filter @wizards/mobile test
pnpm.cmd --filter @wizards/mobile typecheck
```

Then run targeted Playwright, Prisma generate/migration deploy dry-run, and:

```powershell
$pythonPath=(Get-Content -Raw 'graphify-out\.graphify_python').Trim()
& $pythonPath -m graphify update .
```
