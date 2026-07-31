# TOTP Secret Encryption and Replay Prevention Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Subagents are not authorized for this task.

**Goal:** Add rollback-safe TOTP envelope encryption and atomic Redis replay prevention without running live operations.

**Architecture:** Store a versioned AES-256-GCM envelope beside transitional plaintext, read ciphertext first, and migrate with an idempotent batch tool. Return the matched TOTP counter and claim `userId + counter` once through Redis `SET NX`.

**Tech Stack:** Node.js 24, TypeScript, Prisma 7, PostgreSQL, ioredis, Node test runner, AES-256-GCM.

## Global Constraints

- Work only on `uat`.
- Preserve unrelated mobile refresh-token and Graphify WIP.
- Do not commit, push, deploy, or run a live migration/backfill.
- Do not null or drop `twoFactorSecret`.
- Do not weaken recovery-code hashing or atomic consumption.
- Do not log keys, plaintext secrets, ciphertext, tags, nonces, AAD, or decryption details.
- Keep TOTP acceptance offsets `[-1, 0, 1]`.
- Redis replay protection fails closed.

---

### Task 1: Additive Prisma Model and Migration

**Files:**

- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/db/prisma/rebaseline-migrations/20260731120000_encrypt_totp_secrets/migration.sql`
- Modify: `packages/db/src/prisma.test.ts`

**Interfaces:**

- Produces nullable `User.twoFactorSecretCiphertext` and `User.twoFactorSecretKeyVersion`.
- Preserves `User.twoFactorSecret`.

- [ ] **Step 1: Add failing schema assertions**

Add behavioral schema assertions requiring both nullable encrypted fields and
the historical plaintext field.

- [ ] **Step 2: Run RED**

```powershell
pnpm.cmd --filter @wizards/db exec tsx --test src/prisma.test.ts
```

Expected: FAIL because encrypted fields and migration are absent.

- [ ] **Step 3: Add schema and SQL**

```prisma
twoFactorSecret            String?
twoFactorSecretCiphertext  String? @db.Text
twoFactorSecretKeyVersion  String? @db.VarChar(64)
```

```sql
ALTER TABLE "User"
  ADD COLUMN "twoFactorSecretCiphertext" TEXT,
  ADD COLUMN "twoFactorSecretKeyVersion" VARCHAR(64);
```

- [ ] **Step 4: Run GREEN**

Run the focused DB test again. Require exit code 0.

### Task 2: Keyring Validation and AES-256-GCM Envelope

**Files:**

- Create: `apps/web/src/lib/auth/totp-secret-encryption.ts`
- Create: `apps/web/src/lib/auth/totp-secret-encryption.test.ts`
- Modify: `apps/web/src/lib/env.ts`
- Modify: `apps/web/src/lib/env.test.ts`

**Interfaces:**

- Produces `parseTotpSecretKeyring(env): TotpSecretKeyring`.
- Produces `encryptTotpSecret({ keyring, plaintext, userId }): EncryptedTotpSecret`.
- Produces `decryptTotpSecret({ ciphertext, keyVersion, keyring, userId }): string`.
- Produces `resolveTotpSecret(record, userId, keyring?): string | null`.

- [ ] **Step 1: Write failing crypto tests**

Tests cover round-trip, unique nonce, wrong key, changed ciphertext, changed
tag, changed AAD (`userId`/key version), malformed envelope, legacy
fallback, encrypted preference, and no fallback after encrypted failure.

- [ ] **Step 2: Run RED**

```powershell
pnpm.cmd --filter @wizards/web exec tsx --test src/lib/auth/totp-secret-encryption.test.ts
```

Expected: FAIL because module does not exist.

- [ ] **Step 3: Implement envelope**

Use:

```ts
createCipheriv("aes-256-gcm", key, randomBytes(12));
JSON.stringify({ keyVersion, purpose: "totp-secret", userId });
```

Store `{ ciphertext, nonce, tag, v: 1 }` as JSON. Decode Base64URL keys to
exactly 32 bytes. Throw bounded messages only.

- [ ] **Step 4: Run crypto GREEN**

Run focused crypto test. Require exit code 0.

- [ ] **Step 5: Write failing environment tests**

Require both variables in every web runtime. Reject malformed JSON, invalid
version names, non-32-byte keys, missing active version, and unknown active
version.

- [ ] **Step 6: Run environment RED**

```powershell
pnpm.cmd --filter @wizards/web exec tsx --test src/lib/env.test.ts
```

- [ ] **Step 7: Wire startup validation**

Call keyring parsing from `validateWebEnvironment()`. Return variable names in
`missing`/`invalid`; never return values.

- [ ] **Step 8: Run environment GREEN**

Run crypto and environment tests together. Require exit code 0.

### Task 3: Dual Read and Dual Write

**Files:**

- Modify: `apps/web/src/lib/auth/two-factor.ts`
- Modify: `apps/web/src/lib/auth/two-factor.test.ts`

**Interfaces:**

- `TwoFactorUserRecord` gains encrypted fields.
- `TwoFactorServiceDependencies` gains optional `keyring`.
- Repository writes both forms and clears both forms.
- Recovery-code interfaces stay unchanged.

- [ ] **Step 1: Write failing lifecycle tests**

Cover encrypted setup confirmation, legacy confirmation, encrypted preference,
corrupt encrypted failure without plaintext fallback, dual-write setup/enable,
disable clearing all secret fields, and unchanged recovery hashes.

- [ ] **Step 2: Run RED**

```powershell
pnpm.cmd --filter @wizards/web exec tsx --test src/lib/auth/two-factor.test.ts
```

- [ ] **Step 3: Implement secret resolution**

Select both encrypted columns in the default repository. Encrypt with active
version in `savePendingSecret()` and `enableTwoFactor()`. Clear all secret
columns in `disableTwoFactor()`.

- [ ] **Step 4: Run GREEN**

Run two-factor and encryption tests. Require exit code 0.

### Task 4: Idempotent Backfill and Rotation Tool

**Files:**

- Create: `apps/web/src/lib/auth/totp-secret-backfill.ts`
- Create: `apps/web/src/lib/auth/totp-secret-backfill.test.ts`
- Create: `apps/web/scripts/backfill-totp-secrets.ts`
- Modify: `apps/web/package.json`

**Interfaces:**

- Produces `runTotpSecretMaintenance(options): Promise<MaintenanceSummary>`.
- Modes: `backfill`, `rotate`, `verify`.
- CLI script: `maintenance:totp-secrets`.

- [ ] **Step 1: Write failing maintenance tests**

Use an in-memory repository. Cover batch cursor order, dry-run, encrypt/decrypt
self-check, conditional update loss, second-run zero updates, verify mode, and
rotation from `v1` to `v2`.

- [ ] **Step 2: Run RED**

```powershell
pnpm.cmd --filter @wizards/web exec tsx --test src/lib/auth/totp-secret-backfill.test.ts
```

- [ ] **Step 3: Implement batch service**

Repository reads bounded candidate pages ordered by `id`. Updates use expected
ciphertext/key-version predicates. Output contains scanned, updated, skipped,
and failed counts only.

- [ ] **Step 4: Implement CLI wrapper**

Support:

```powershell
pnpm.cmd --filter @wizards/web maintenance:totp-secrets -- --mode backfill --batch-size 100 --dry-run
pnpm.cmd --filter @wizards/web maintenance:totp-secrets -- --mode backfill --batch-size 100 --confirm write-totp-secrets
pnpm.cmd --filter @wizards/web maintenance:totp-secrets -- --mode verify --batch-size 100
pnpm.cmd --filter @wizards/web maintenance:totp-secrets -- --mode rotate --batch-size 100 --dry-run
pnpm.cmd --filter @wizards/web maintenance:totp-secrets -- --mode rotate --batch-size 100 --confirm write-totp-secrets
```

Reject unknown flags, invalid modes, and batch sizes outside `1..1000`.

- [ ] **Step 5: Run GREEN**

Run maintenance and encryption tests. Require exit code 0. Do not invoke CLI
against a live `DATABASE_URL`.

### Task 5: Return Matched TOTP Counter

**Files:**

- Modify: `apps/web/src/lib/auth/totp.ts`
- Modify: `apps/web/src/lib/auth/totp.test.ts`

**Interfaces:**

- Produces `TotpMatch = { counter: number }`.
- `verifyTotpCode(...): TotpMatch | null`.
- `verifyTwoFactorLoginCode()` remains boolean externally.

- [ ] **Step 1: Write failing counter tests**

Assert literal counters for current, previous, and next accepted steps. Assert
null outside the existing window and for invalid code shape.

- [ ] **Step 2: Run RED**

```powershell
pnpm.cmd --filter @wizards/web exec tsx --test src/lib/auth/totp.test.ts
```

- [ ] **Step 3: Return exact matched counter**

Calculate current counter once. Generate each candidate from the exact counter.
Return `{ counter }` on constant-time match. Keep offsets unchanged.

- [ ] **Step 4: Run GREEN**

Run TOTP tests. Require exit code 0.

### Task 6: Atomic Redis Replay Claim

**Files:**

- Create: `apps/web/src/lib/auth/totp-replay.ts`
- Create: `apps/web/src/lib/auth/totp-replay.test.ts`
- Modify: `apps/web/src/lib/auth/two-factor.ts`
- Modify: `apps/web/src/lib/auth/two-factor.test.ts`

**Interfaces:**

- Produces `TotpReplayStore.consume({ counter, userId }): Promise<boolean>`.
- Default store calls Redis `SET key 1 EX 120 NX`.
- Adds `verification_unavailable` failure.

- [ ] **Step 1: Write failing store tests**

Assert key isolation, TTL `120`, first/second use, concurrent one-winner, and
Redis error propagation.

- [ ] **Step 2: Run store RED**

```powershell
pnpm.cmd --filter @wizards/web exec tsx --test src/lib/auth/totp-replay.test.ts
```

- [ ] **Step 3: Implement Redis store**

Treat only `"OK"` as consumed. Treat `null` as replay. Propagate Redis errors.
Never store the code or secret.

- [ ] **Step 4: Write failing service tests**

Cover first success, second invalid, concurrent one success, adjacent step,
same counter for another user, Redis unavailable, setup confirmation replay,
and unchanged recovery-code consumption.

- [ ] **Step 5: Run service RED**

Run two-factor tests. Expected failure: verifier does not claim replay keys.

- [ ] **Step 6: Integrate replay store**

Claim only after TOTP match. Do not fall back to recovery codes after a matched
but replayed TOTP. Map Redis errors to `verification_unavailable`.

- [ ] **Step 7: Run GREEN**

Run TOTP, replay, and two-factor tests. Require exit code 0.

### Task 7: Web and Mobile Login Integration

**Files:**

- Create: `apps/web/src/lib/auth/web-login-two-factor.ts`
- Create: `apps/web/src/lib/auth/web-login-two-factor.test.ts`
- Modify: `apps/web/src/auth.ts`
- Modify: `apps/web/src/lib/mobile/auth.ts`
- Modify: `apps/web/src/lib/mobile/auth-two-factor.test.ts`

**Interfaces:**

- Web gate passes plaintext plus encrypted fields to common verifier.
- Mobile verifier receives same complete record.
- Mobile maps `verification_unavailable` to generic 503.

- [ ] **Step 1: Write failing web regression tests**

Cover disabled bypass, enabled encrypted success, replay rejection, and
verification-unavailable denial.

- [ ] **Step 2: Run web RED**

```powershell
pnpm.cmd --filter @wizards/web exec tsx --test src/lib/auth/web-login-two-factor.test.ts
```

- [ ] **Step 3: Wire web login**

Select encrypted columns. Use tested web gate before returning credentials
user. Return authentication failure for every unsuccessful second factor.

- [ ] **Step 4: Write failing mobile regressions**

Cover encrypted success, replay invalid response, Redis-unavailable 503,
password-only behavior, and invalid-password short circuit.

- [ ] **Step 5: Run mobile RED**

```powershell
pnpm.cmd --filter @wizards/web exec tsx --test src/lib/mobile/auth-two-factor.test.ts
```

- [ ] **Step 6: Wire mobile login**

Change only TOTP-related type/select/call/error hunks. Preserve unrelated
refresh-token-family WIP byte-for-byte.

- [ ] **Step 7: Run login GREEN**

Run web gate, mobile two-factor, and common two-factor tests. Require exit code 0.

### Task 8: Prisma and Quality Verification

**Files:**

- Verify all changed files.
- Update: `graphify-out/` through required Graphify command.

**Interfaces:**

- Produces evidence only. No live operations.

- [ ] **Step 1: Format changed source**

```powershell
pnpm.cmd exec prettier --write <exact changed source and documentation files>
```

- [ ] **Step 2: Prisma format and validate**

```powershell
$env:DATABASE_URL='postgresql://prisma:prisma@127.0.0.1:5432/wizards_validation'
pnpm.cmd --filter @wizards/db exec prisma format --schema prisma/schema.prisma
pnpm.cmd --filter @wizards/db exec prisma validate --schema prisma/schema.prisma
pnpm.cmd --filter @wizards/db db:generate
```

Dummy URL is parsed only. No database server operation is authorized.

- [ ] **Step 3: Run focused tests**

```powershell
pnpm.cmd --filter @wizards/web exec tsx --test src/lib/auth/totp-secret-encryption.test.ts src/lib/auth/totp-secret-backfill.test.ts src/lib/auth/totp.test.ts src/lib/auth/totp-replay.test.ts src/lib/auth/two-factor.test.ts src/lib/auth/web-login-two-factor.test.ts src/lib/mobile/auth-two-factor.test.ts src/lib/env.test.ts
pnpm.cmd --filter @wizards/db exec tsx --test src/prisma.test.ts
```

- [ ] **Step 4: Typecheck and lint**

```powershell
pnpm.cmd --filter @wizards/web typecheck
pnpm.cmd --filter @wizards/db typecheck
pnpm.cmd --filter @wizards/web lint
```

- [ ] **Step 5: Check diff**

```powershell
git diff --check
git status --short --branch
```

- [ ] **Step 6: Update Graphify**

```powershell
graphify update .
```

- [ ] **Step 7: Final audit**

Confirm:

- every requested test behavior has evidence;
- migration and maintenance commands were prepared but not run live;
- plaintext remains;
- no secret material appears in logs, tests, or docs;
- no commit, push, deployment, or live database mutation occurred;
- unrelated WIP remains present and unstaged.
