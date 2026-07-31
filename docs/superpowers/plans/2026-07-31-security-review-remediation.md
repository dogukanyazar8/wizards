# Security Review Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` task-by-task. Steps use checkbox syntax.

**Goal:** Eliminate unbounded mobile refresh Redis growth, stop TOTP plaintext writes, repair Playwright test configuration, redact credential-bearing URIs, and preserve the unverified Railway client-IP boundary as an explicit acceptance item.

**Architecture:** A versioned AEAD refresh token authenticates its routing claims before one family-state Redis lookup. One Lua transition advances current/previous generation state or returns an authenticated retry receipt. TOTP remains ciphertext-preferred dual-read during the controlled rollout, while every new write and verified backfill update removes plaintext atomically.

**Tech Stack:** TypeScript, Node.js crypto, Redis Lua, Prisma optimistic updates, GitHub Actions, Node test runner.

## Global Constraints

- Preserve pre-existing `graphify-out` WIP; do not stage, commit, push, deploy, or mutate Railway/DB.
- Never log or store plaintext refresh tokens, TOTP secrets, keys, URI credentials, or raw IP addresses.
- Run each added regression test RED before production code, then GREEN.
- Refresh state is strictly O(1) per family: one family state key plus the existing session marker; legacy keys expire naturally.
- Do not remove TOTP plaintext read fallback or drop its column before approved, verified UAT backfill.

---

### Task 1: AEAD refresh family state

**Files:**

- Modify: `apps/web/src/lib/mobile/refresh-token-family.ts`
- Modify: `apps/web/src/lib/mobile/auth.ts`
- Test: `apps/web/src/lib/mobile/auth.test.ts`

- [ ] **Step 1: Write failing contracts**

Add literal tests for a token that decodes only after AEAD authentication, one Redis family state after 100 rotations, a single concurrent successor, same-token grace receipt, expired/older replay revocation, TTL expiry, legacy adoption, and session revocation.

- [ ] **Step 2: Run RED**

```powershell
pnpm.cmd --filter @wizards/web exec node --import tsx --test src/lib/mobile/auth.test.ts
```

Expected: old per-token records leave more than one family-state key and opaque tokens lack authenticated claims.

- [ ] **Step 3: Implement transition**

Use `HKDF-SHA256(AUTH_SECRET, "mobile-refresh-token-aead-v1")`, AES-256-GCM, and token claims `{ v, sid, fid, gen, jti, exp }`. Lua accepts only pre-authenticated claims, changes current to previous exactly once, stores encrypted receipt for grace only, and deletes family/session state on replay.

- [ ] **Step 4: Run GREEN**

```powershell
pnpm.cmd --filter @wizards/web exec node --import tsx --test src/lib/mobile/auth.test.ts
```

### Task 2: Ciphertext-only TOTP writes and safe maintenance

**Files:**

- Modify: `apps/web/src/lib/auth/two-factor.ts`
- Modify: `apps/web/src/lib/auth/totp-secret-backfill.ts`
- Modify: `apps/web/scripts/backfill-totp-secrets.ts`
- Test: `apps/web/src/lib/auth/two-factor.test.ts`
- Test: `apps/web/src/lib/auth/totp-secret-backfill.test.ts`

- [ ] **Step 1: Write failing contracts**

Assert enrollment and confirmation persist `twoFactorSecret: null`; assert a successful backfill conditionally writes ciphertext/key version and clears matching plaintext in one update; assert failed encryption or conditional update leaves plaintext unchanged; assert verify reports plaintext remaining, ciphertext missing, decrypt failures, and unknown key versions.

- [ ] **Step 2: Run RED**

```powershell
pnpm.cmd --filter @wizards/web exec node --import tsx --test src/lib/auth/two-factor.test.ts src/lib/auth/totp-secret-backfill.test.ts
```

- [ ] **Step 3: Implement minimal writes**

Remove plaintext from `TwoFactorSecretWrite`; retain ciphertext-preferred fallback reads. Require the maintenance repository update predicate to match `id`, plaintext, ciphertext, and key version before setting ciphertext/version and `twoFactorSecret: null`. Keep cursor batches, dry-run, explicit confirmation, counts-only output, and no ciphertext-to-plaintext fallback.

- [ ] **Step 4: Run GREEN**

```powershell
pnpm.cmd --filter @wizards/web exec node --import tsx --test src/lib/auth/two-factor.test.ts src/lib/auth/totp-secret-backfill.test.ts src/lib/auth/totp-secret-encryption.test.ts
```

### Task 3: CI and logger redaction

**Files:**

- Modify: `.github/workflows/ci.yml`
- Modify: `apps/web/src/lib/logger.ts`
- Test: `apps/web/src/lib/logger.test.ts`
- Test: relevant CI/workflow contract test if present

- [ ] **Step 1: Write failing logger tests**

Assert literal `postgresql://secret@db/whispr` and user/password Redis, HTTP(S), percent-encoded credential examples are fully redacted in text, nested objects, error message, stack, and cause; credential-free URLs stay unchanged.

- [ ] **Step 2: Run RED**

```powershell
pnpm.cmd --filter @wizards/web exec node --import tsx --test src/lib/logger.test.ts
```

- [ ] **Step 3: Implement scoped environment/redaction**

Add the fixed test-only `v1` TOTP keyring to each of the four Playwright job environments only. Apply one precompiled URI-userinfo pattern before email/JWT processing and recursively redact Error `stack` and supported `cause` values.

- [ ] **Step 4: Run GREEN**

```powershell
pnpm.cmd --filter @wizards/web exec node --import tsx --test src/lib/logger.test.ts
```

### Task 4: Client-IP evidence boundary and verification

**Files:**

- Verify: `apps/web/src/lib/security/client-ip.ts`
- Verify: `apps/web/src/lib/security/client-ip.test.ts`
- Verify: `apps/web/src/lib/auth/request-rate-limits.test.ts`

- [ ] **Step 1: Re-run local parser/layer tests**

```powershell
pnpm.cmd --filter @wizards/web exec node --import tsx --test src/lib/security/client-ip.test.ts src/lib/auth/request-rate-limits.test.ts
```

- [ ] **Step 2: Record acceptance boundary**

Keep only `X-Real-IP`; add no proxy header or User-Agent fallback, raw-IP logging, debug endpoint, or environment toggle. Mark spoof-overwrite behavior `NOT RUN` until authorized external UAT probe checks that a forged request cannot change the internally observed rate-limit identity.

### Task 5: Local validation

- [ ] Run focused auth, TOTP, logger, client-IP and relevant route tests; confirm clean runner exit.
- [ ] Run web typecheck, changed-file ESLint/Prettier, Prisma validation/DB tests, workflow syntax/actionlint if installed, and `git diff --check`.
- [ ] Run `graphify update .` and preserve every generated change.
- [ ] Re-inspect diff/status. Report local checks, remote CI, deployment, DB backfill, `/ready`, Redis config, and IP acceptance separately.
