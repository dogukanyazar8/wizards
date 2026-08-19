# Web Socket Session Revocation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give web Socket.IO authentication the same durable AuthSession and global-revocation guarantees as HTTP Auth.js, including prompt cross-instance disconnection.

**Architecture:** A transport-independent validator returns `active`, `revoked`, or `unavailable` from signed-token identity, durable AuthSession state, and `sessionsRevokedAfter`. Sockets join per-user and hashed per-session rooms; revocation services disconnect those rooms through the configured Redis adapter. A single instance-level bounded reconciliation loop validates deduplicated local sessions from one durable batch read, providing a fail-closed fallback when notification delivery is lost.

**Tech Stack:** TypeScript, Auth.js JWT, Prisma/PostgreSQL, Socket.IO 4.8, `@socket.io/redis-adapter`, Node test runner.

**Spec:** User request and approved design in this Codex task, approved 2026-08-18.

## Global Constraints

- Preserve all unrelated dirty WIP; no reset, clean, stash, revert, broad staging, commit, push, PR, deploy, DB mutation, or persistent environment mutation.
- Mobile bearer verification remains `verifyMobileAccessToken` plus `isMobileAccessSessionActive`.
- No per-event DB lookup and no per-socket polling timer.
- Redis or DB validation failure never returns an authorized web handshake.
- Run focused tests first, then web typecheck, web lint, and `graphify update .`.

---

### Task 1: Shared durable session validator

**Files:**

- Modify: `apps/web/src/lib/auth/session-revocation.ts`
- Modify: `apps/web/src/lib/auth/session-revocation.test.ts`
- Modify: `apps/web/src/auth.ts`

**Interfaces:**

- Produces: `parseAuthSessionIdentity(token)`, `validateAuthSessionIdentity(identity, options)`, `validateAuthSessionToken(token, options)`.
- Result: `{ status: "active" | "revoked" | "unavailable", identity?: { authSessionId; sessionStartedAtSeconds; userId } }`.

- [x] Write tests proving active, `token.revoked`, missing `authSessionId`, revoked/expired/wrong-owner AuthSession, pre-`sessionsRevokedAfter`, and Redis/DB failure behavior.
- [x] Run focused validator tests; confirm RED because module/API is absent.
- [x] Implement parser plus validator. Execute durable AuthSession and global-revocation checks concurrently. Treat only explicit `true` AuthSession activity plus explicit `false` global revocation as active.
- [x] Replace Auth.js callback’s duplicated checks with validator. On `unavailable`, throw without mutating/rewriting JWT; on `revoked`, preserve existing banned/deleted handling.
- [x] Run validator and existing session-revocation tests; confirm GREEN.
- [x] Commit: NOT RUN; explicit user prohibition.

### Task 2: Web/mobile handshake identity and revocation rooms

**Files:**

- Create: `apps/web/src/lib/socket/authentication.ts`
- Create: `apps/web/src/lib/socket/authentication.test.ts`
- Modify: `apps/web/src/lib/socket/events.ts`
- Modify: `apps/web/src/lib/socket/rooms.ts`
- Modify: `apps/web/src/lib/socket/rooms.test.ts`
- Modify: `apps/web/src/lib/socket/runtime.ts`
- Modify: `apps/web/src/lib/socket/server.ts`

**Interfaces:**

- Produces: `getAuthSessionSocketRoomName(sessionId)`, `disconnectAuthSessionSockets(sessionId)`, `disconnectUserSockets(userId)`.
- Socket data gains `authSessionId`, `authSessionClientType`, and `authSessionStartedAtSeconds`.
- Web handshake uses shared validator. Mobile handshake keeps current verification and maps `claims.sessionId` to socket identity.

- [x] Write handshake regression tests for active web, revoked durable session, old global session, `token.revoked`, unavailable controls, and unchanged mobile bearer success.
- [x] Write room tests proving fixed-length hashed session rooms and exact user/session targeting.
- [x] Run focused tests; confirm RED because identity/room behavior is absent.
- [x] Implement web/mobile authentication result assignment. Join user plus session rooms synchronously at connection start.
- [x] Run focused tests; confirm GREEN.
- [x] Commit: NOT RUN; explicit user prohibition.

### Task 3: Revocation notifications and bounded durable reconciliation

**Files:**

- Modify: `apps/web/src/lib/auth/session-revocation.ts`
- Modify: `apps/web/src/lib/auth/session-revocation.test.ts`
- Modify: `apps/web/src/lib/auth/auth-session-service.ts`
- Modify: `apps/web/src/lib/auth/auth-session-service.test.ts`
- Create: `apps/web/src/lib/socket/session-revalidation.ts`
- Create: `apps/web/src/lib/socket/session-revalidation.test.ts`
- Modify: `apps/web/src/lib/socket/server.ts`
- Modify: `apps/web/src/lib/socket/worker-runtime.test.ts`

**Interfaces:**

- Global revocation calls `disconnectUserSockets(userId)` even when Redis marker persistence fails.
- Single-session revocation calls `disconnectAuthSessionSockets(sessionId)` only after owned durable row revocation.
- `installSocketSessionRevalidation(io)` owns one non-overlapping timer per server; each tick deduplicates local session IDs, performs one Prisma batch lookup including user state, disconnects invalid rows, and disconnects the snapshot on lookup failure.

- [x] Write tests proving single-session targeting; global/password/ban/delete-compatible user targeting; Redis write failure notification; and DB batch failure fail-closed behavior.
- [x] Extend two-instance Redis adapter test: target session disconnects remotely; sibling session remains connected.
- [x] Run focused tests; confirm RED.
- [x] Implement notification hooks and bounded reconciliation. Timer uses `unref`, skips overlapping ticks, and stops with server close.
- [x] Run focused tests; confirm GREEN.
- [x] Commit: NOT RUN; explicit user prohibition.

### Task 4: Final verification and generated graph refresh

**Files:**

- Modify generated Graphify files only through `graphify update .`.

**Interfaces:**

- Verification evidence reports exact commands, exit codes, test counts, and dirty-file ownership separation.

- [x] Run all changed auth/socket focused tests.
- [x] Run full `@wizards/web` typecheck.
- [x] Run full `@wizards/web` lint.
- [x] Run `graphify update .`; preserve pre-existing Graphify WIP and identify task-created deltas.
- [x] Run `git diff --check` only on task files; inspect final diff for secret, authorization, race, cleanup, and mobile regressions.
- [x] Report `PASS / FAIL / NOT RUN / ENV BLOCKED`; commit/push/PR/deploy remain `NOT RUN`.
