# Whispr V6 Follow-up Remediation Report

> Archived from `.audit/v6-followup/` during repository cleanup on 2026-08-18.

## Header

- Platform: Whispr
- Branch: `uat`
- Date: 2026-05-16
- Commit before: `e4edc35556c054ba258869e946acf086de8e3338`
- Commit after: `e4edc35556c054ba258869e946acf086de8e3338` plus uncommitted working-tree remediation changes
- Graph after remediation: `3679 nodes`, `11204 edges`, `140 communities`

## Files Changed

- `apps/web/src/lib/auth/actions.ts`
- `apps/web/src/lib/auth/registration-compensation.ts`
- `apps/web/src/lib/auth/registration-compensation.test.ts`
- `apps/web/src/lib/auth/reauth-cleanup.ts`
- `apps/web/src/lib/auth/reauth-cleanup.test.ts`
- `apps/web/scripts/cleanup-account-reauth-challenges.ts`
- `apps/web/src/lib/outbox/worker.ts`
- `apps/web/package.json`
- `package.json`
- `apps/web/e2e/README.md`
- `docs/operations/coverage-ratchet.md`
- `apps/web/src/lib/voice/participant-view-model.ts`
- `apps/web/src/lib/voice/participant-view-model.test.ts`
- `apps/web/src/components/providers/live-voice-provider.tsx`
- `apps/web/src/components/providers/voice-context.tsx`
- `graphify-out/GRAPH_REPORT.md`
- `graphify-out/graph.html`
- `graphify-out/graph.json`
- `graphify-out/manifest.json`
- `.audit/v6-followup/graph-report-current.md`
- `.audit/v6-followup/remediation-report.md`

Generated working-tree noise not intended for commit:

- `apps/web/tsconfig.tsbuildinfo`

## Finding Decisions

| ID                           | Original concern                                                      | Decision                                                   | Evidence                                                                                                                                                                                                                | Fix applied?              | Tests added?                                                                  | Residual risk                                                                                                                      |
| ---------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| SEC-H-9                      | Registration compensation could silently swallow rollback failure.    | NEEDS_FIX -> FIXED                                         | `apps/web/src/lib/auth/actions.ts:350`, `apps/web/src/lib/auth/registration-compensation.ts:15`                                                                                                                         | Yes                       | `apps/web/src/lib/auth/registration-compensation.test.ts:7`, `:30`            | Rollback is still best-effort, but failures are no longer silent and return `{ ok: false }`.                                       |
| PERF-H-7                     | `getWorkspaceServerDetail` might fetch presence per member.           | RESOLVED_ALREADY                                           | `apps/web/src/lib/workspace/workspace-constants.ts:1`, `apps/web/src/lib/workspace/server-service.ts:312`, `:392`, `apps/web/src/lib/workspace/server-query-helpers.ts:113`, `apps/web/src/lib/presence.ts:134`, `:186` | No                        | Not applicable; existing implementation is bounded and batched.               | 100-member preview remains intentional UI/product bound.                                                                           |
| PERF-H-9                     | Voice heartbeat might do avoidable Redis debounce work per heartbeat. | RESOLVED_ALREADY                                           | `apps/web/src/lib/voice/service.ts:440`, `:455`, `:475`, `:980`, `:1000`                                                                                                                                                | No                        | Existing voice service tests cover debounce and bounded cleanup.              | Heartbeat still writes DB state for correctness.                                                                                   |
| V6-OPS AccountReauth cleanup | `AccountReauthChallenge` rows can grow.                               | NEEDS_FIX -> FIXED                                         | `apps/web/src/lib/auth/reauth-cleanup.ts:30`, `:53`, `apps/web/src/lib/outbox/worker.ts:47`                                                                                                                             | Yes                       | `apps/web/src/lib/auth/reauth-cleanup.test.ts:15`, `:28`, `:41`, `:54`, `:79` | Cleanup runs hourly with outbox worker; manual script exists if worker is disabled.                                                |
| V6 Dependabot GitHub Actions | SHA-pinned GitHub Actions need refresh automation.                    | RESOLVED_ALREADY                                           | `.github/dependabot.yml:21`, `:23`, `:31`                                                                                                                                                                               | No                        | Not applicable; config already exists.                                        | Dependabot PR noise capped at 5 open action PRs.                                                                                   |
| TEST-H-3 ratchet policy      | Coverage thresholds could stagnate at baseline.                       | NEEDS_FIX -> FIXED                                         | `docs/operations/coverage-ratchet.md:6`, `:15`, `apps/web/e2e/README.md:22`                                                                                                                                             | Yes                       | Documentation-only.                                                           | Requires team discipline to ratchet each sprint.                                                                                   |
| ARCH-H-1                     | `LiveVoiceProvider` remains a god component.                          | IN_PROGRESS                                                | `apps/web/src/lib/voice/participant-view-model.ts:23`, `apps/web/src/components/providers/live-voice-provider.tsx:299`                                                                                                  | Yes, one small extraction | `apps/web/src/lib/voice/participant-view-model.test.ts:52`                    | `VoiceProvider()` remains a top-5 graph god node with 88 edges; continue sprint-by-sprint.                                         |
| ARCH-H-2                     | `workspace/service.ts` god file.                                      | RESOLVED_ALREADY / IN_PROGRESS COMPLETE FOR THIS FOLLOW-UP | `apps/web/src/lib/workspace/service.ts` no longer exists; domain services are split.                                                                                                                                    | No new Phase 5 change     | Existing workspace characterization tests pass.                               | Further domain polishing can continue, but blocker is gone.                                                                        |
| ARCH-H-3                     | Module-level mutable state can break horizontal deployment.           | ACCEPTED_RISK for remaining state                          | `apps/web/src/lib/workspace/performance-metrics.ts:95`, `:159`, `:165`, `apps/web/src/lib/outbox/worker.ts:9`                                                                                                           | No broad fix              | Not applicable.                                                               | Remaining state is telemetry, singleton clients, local worker/timer state, or test hooks; not cross-instance correctness-critical. |

## Fixed Items

### SEC-H-9 Registration Compensation

What changed:

- Replaced the silent inline rollback catch with `rollbackUnverifiedUser()`.
- Rollback failures now log structured context and return a failure object.

Why it is safe:

- Registration still continues to return the original failure result.
- The rollback remains best-effort, but failure visibility is restored.

Security impact:

- Reduces silent inconsistent-account risk after registration-side effects fail.

Performance impact:

- No meaningful runtime cost beyond one existing delete attempt.

Deployment impact:

- No schema or environment change.

Rollback plan:

- Revert `registration-compensation.ts`, its test, and the `actions.ts` callsite.

### Account Re-auth Challenge Cleanup

What changed:

- Added `cleanupAccountReauthChallenges()` with a 30-day retention cutoff.
- Deletes used challenges older than retention.
- Deletes unused expired challenges older than retention.
- Preserves active and recent challenge rows.
- Wired cleanup into the existing hourly outbox worker maintenance pass.
- Added a manual ops script: `pnpm maintenance:cleanup-reauth`.

Why it is safe:

- Predicate is idempotent and bounded by old `usedAt` or old `expiresAt`.
- Active unexpired challenges are not deleted.

Security impact:

- Reduces retained token-hash metadata without weakening active re-auth.

Performance impact:

- One hourly `deleteMany` maintenance query. Low operational cost.

Deployment impact:

- No migration needed; uses existing `AccountReauthChallenge` model.

Rollback plan:

- Remove `reauth-cleanup.ts`, test, script, and outbox worker import/call.

### Coverage Ratchet Policy

What changed:

- Added `docs/operations/coverage-ratchet.md`.
- Updated E2E README to distinguish E2E scenario coverage from c8 line/branch/function coverage.

Why it is safe:

- Documentation-only runtime impact.

Security impact:

- Improves future regression prevention policy for security and permission code.

Performance impact:

- None.

Deployment impact:

- None.

Rollback plan:

- Revert documentation changes only.

### Voice Provider Participant View Model Extraction

What changed:

- Extracted participant view-model creation from `LiveVoiceProvider` into `apps/web/src/lib/voice/participant-view-model.ts`.
- `LiveVoiceProvider` now delegates participant mapping through `collectVoiceParticipants()`.
- `VoiceParticipantViewModel` type now lives in `lib/voice` and is re-exported from voice context.

Why it is safe:

- No shared refs moved.
- No LiveKit event ownership changed.
- No join, leave, heartbeat, screen share, or audio-level behavior changed.
- The extracted function is pure mapping over the current room snapshot.

Security impact:

- None.

Performance impact:

- Neutral. The same participants are mapped; code is more testable.

Deployment impact:

- None.

Rollback plan:

- Inline `collectVoiceParticipants()` back into `LiveVoiceProvider` and remove the helper/test.

## Accepted Risks

### SEC-H-6 Permissions-Policy Site-wide Mic/Cam

- Current evidence: `apps/web/next.config.ts:67` and `:68` set `Permissions-Policy` to `camera=(self), microphone=(self), geolocation=()`.
- Why still accepted: site-wide self-only camera/microphone is defense-in-depth and aligned with the voice product surface.
- Re-evaluation trigger: if error routes, auth routes, embeds, or desktop shell flows show user-visible permission policy regressions.

### FW-H-2 NextAuth/Auth.js Beta

- Current evidence: `apps/web/package.json:60` pins `next-auth` to `5.0.0-beta.31`.
- Why still accepted: Auth.js v5 stable is not adopted here yet; current beta use is a tracked ecosystem dependency risk.
- Re-evaluation trigger: Auth.js v5 stable release or a beta-specific security advisory.

### V6-SEC-LOW-4 Tauri Deep-link Path Allowlist

- Current evidence: `apps/desktop/src-tauri/tauri.conf.json:46`, `apps/desktop/src-tauri/src/lib.rs:229`, `:252`, `:273`.
- Why still accepted: deep links are scheme-limited, converted only to internal app paths, length-limited, reject backslashes and external paths, and allow only `/`, `/channels`, `/settings`, and `/invite` path families.
- Re-evaluation trigger: new Tauri commands, privileged IPC, broader deep-link route families, or any deep link that performs mutation.

## Long-term Backlog

- Observability: Sentry or Datadog for frontend, API, worker, and desktop error visibility.
- Documentation sprint: root `README.md`, `apps/web/README.md`, `CONTRIBUTING.md`, `SECURITY.md`, `CHANGELOG.md`.
- ADRs: outbox pattern, durable revocation, route-contract testing, voice provider extraction policy.
- Continue ARCH-H-1: extract one tested voice helper/hook per sprint.
- Continue ARCH-H-2: keep route imports pointed at domain services; avoid recreating a facade god file.
- Continue ARCH-H-3: keep correctness-critical cross-instance state in Redis/DB; leave telemetry local unless it becomes product logic.

## Validation Summary

Commands run:

- `pnpm --filter @wizards/web typecheck` -> passed.
- `pnpm --filter @wizards/web lint` -> passed.
- `pnpm --filter @wizards/web test` -> passed, `260` tests, `71` suites, `0` failures.
- `pnpm --filter @wizards/web test:coverage` -> passed.
- `graphify update .` -> passed, `3679 nodes`, `11204 edges`, `140 communities`.
- `git diff --check` -> no whitespace errors; CRLF warnings only.
- `prisma validate` -> not run because `packages/db/prisma/schema.prisma` was unchanged.

Coverage summary after remediation:

- Lines: `20.28%` with threshold `20%`.
- Branches: `62.19%` with threshold `61%`.
- Functions: `45.22%` with threshold `44%`.

## Residual Risks

- `VoiceProvider()` remains a god node with `88` graph edges. This is intentionally handled as multi-sprint work.
- `apps/web/tsconfig.tsbuildinfo` is generated by typecheck and should not be staged.
- `.audit/` and `.full-review/` contain audit artifacts; stage only the follow-up report files intended for this remediation.
