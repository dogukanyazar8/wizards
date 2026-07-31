# Mobile Refresh Token Family Rotation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans
> to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for
> tracking.

**Goal:** Make mobile refresh rotation atomic, idempotent during grace, and
family-revoking on replay.

**Architecture:** A focused refresh-token-family module owns Redis records,
HKDF/AES-GCM retry receipts, and Lua transitions. `auth.ts` keeps user/session
response orchestration and delegates token-family state changes.

**Tech Stack:** TypeScript, Node.js crypto, ioredis Lua `EVAL`, Node test runner.

## Global Constraints

- Work on existing `uat`; preserve unrelated WIP.
- Do not stash, reset, checkout, clean, commit, push, deploy, or mutate live
  Redis.
- Never store or log raw refresh tokens in Redis.
- Redis failure must issue no refresh response.
- Run `graphify update .` after code changes.

---

### Task 1: Regression Contract

**Files:**

- Modify: `apps/web/src/lib/mobile/auth.test.ts`

**Interfaces:**

- Consumes: `refreshMobileSession()`, `revokeMobileSession()`,
  `isMobileAccessSessionActive()`.
- Produces: observable security contract for later implementation.

- [ ] Replace the accepted different-successor assertion with literal equality:
      `assert.equal(replayedRefreshToken, firstRefreshToken)`.
- [ ] Add `Promise.all` rotation using one old token; assert every returned
      refresh token equals the first result.
- [ ] After grace replay, assert the successor refresh and access session are
      both rejected.
- [ ] Add well-formed unknown-token/hash rejection without revoking the valid
      family.
- [ ] Make Redis `eval` fail after setup; assert refresh rejects and returns no
      token.
- [ ] Revoke after rotation; assert original and successor refresh tokens plus
      access-session activity are rejected.
- [ ] Inspect fake Redis receipt state; assert no stored value contains the raw
      successor and receipt TTL is at most 61 seconds.
- [ ] Run:
      `node --import tsx --test --test-force-exit src/lib/mobile/auth.test.ts`
      from `apps/web` with safe dummy `DATABASE_URL`.
- [ ] Confirm failure is specifically successor inequality/fork behavior.

### Task 2: Atomic Token-Family State

**Files:**

- Create: `apps/web/src/lib/mobile/refresh-token-family.ts`
- Modify: `apps/web/src/lib/mobile/auth.ts`

**Interfaces:**

- Produces:
  `createMobileRefreshFamily()`,
  `rotateMobileRefreshFamily()`,
  `revokeMobileRefreshFamily()`,
  `isMobileRefreshFamilyActive()`.
- `rotateMobileRefreshFamily()` returns
  `{ refreshToken: string; sessionId: string; userId: string } | null`.

- [ ] Define validated session/token payloads with `familyId`,
      `currentGeneration`/`generation`, and `currentTokenHash`.
- [ ] Derive an AES-256-GCM key using HKDF-SHA256 from the mobile auth secret;
      encrypt/decrypt retry receipts with old-token-hash associated data.
- [ ] Implement initial family creation with generation zero and hashed token
      Redis keys.
- [ ] Implement one Lua rotation transition for owner, retry, collision,
      invalid, and replay outcomes.
- [ ] Keep tombstones for replay attribution; keep encrypted successor receipts
      for at most 61 seconds.
- [ ] Adopt unconsumed legacy records at generation zero; revoke consumed or
      competing legacy branches.
- [ ] Refactor `auth.ts` response creation to accept the successor returned by
      the family module instead of creating a second token.
- [ ] Delegate access-session validation and revoke to the family module.
- [ ] Run the focused auth test; confirm all assertions pass and process exits
      zero.

### Task 3: Verification

**Files:**

- Verify all files changed by Tasks 1-2.

**Interfaces:**

- Consumes repository scripts only.
- Produces local evidence; no remote mutation.

- [ ] Run focused mobile auth tests.
- [ ] Run web typecheck.
- [ ] Run ESLint only for changed TypeScript files.
- [ ] Run `git diff --check`.
- [ ] Read Graphify update instructions; run `graphify update .`.
- [ ] Re-run focused tests after Graphify update only if source files changed.
- [ ] Report local PASS/FAIL separately from CI, deploy, live Redis, and device
      validation.
