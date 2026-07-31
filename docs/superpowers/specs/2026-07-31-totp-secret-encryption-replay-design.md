# TOTP Secret Encryption and Replay Prevention Design

## Goal

Remove plaintext-only TOTP secret storage and prevent reuse of an accepted TOTP
time-step. Deliver additive, rollback-safe artifacts only. Do not run a live
migration, backfill, deployment, commit, or push.

## Current Lifecycle

1. `createTotpSetup()` generates a Base32 secret and returns the manual key and
   `otpauth://` URI.
2. `startTwoFactorSetup()` persists that secret in `User.twoFactorSecret`.
3. `confirmTwoFactorSetup()` reads the same plaintext, verifies a code, enables
   two-factor authentication, and creates hashed recovery-code rows.
4. Web credentials login selects `twoFactorSecret` in `apps/web/src/auth.ts`.
5. Mobile password login selects `twoFactorSecret` in
   `apps/web/src/lib/mobile/auth.ts`.
6. Both login paths call `verifyTwoFactorCredential()`.
7. `verifyTotpCode()` accepts counters in offsets `[-1, 0, 1]` but returns only a
   boolean. No accepted counter is persisted.
8. Recovery codes are SHA-256 hashed and atomically consumed with
   `updateMany({ where: { id, usedAt: null } })`.

## Phase A: Envelope Encryption

### Data Model

Add nullable fields to `User`:

```prisma
twoFactorSecretCiphertext String? @db.Text
twoFactorSecretKeyVersion String? @db.VarChar(64)
```

Keep `twoFactorSecret` during the transition. Do not null or drop it in this
change.

`twoFactorSecretCiphertext` contains a JSON envelope:

```ts
type TotpSecretEnvelope = {
  ciphertext: string;
  nonce: string;
  tag: string;
  v: 1;
};
```

The database key-version column is separate so operators can query migration
and rotation state without inspecting ciphertext.

### Cryptography

- Algorithm: AES-256-GCM.
- Key: exactly 32 random bytes, supplied as Base64URL through a controlled
  secret-manager environment variable.
- Nonce: 12 random bytes generated for every encryption operation.
- AAD: canonical JSON containing `userId`, `purpose: "totp-secret"`, and
  `keyVersion`.
- Encoding: Base64URL for nonce, ciphertext, and tag.
- Authentication failure: throw one bounded generic error. Never include the
  secret, ciphertext, tag, nonce, key, AAD, or crypto-library detail.

### Keyring

Use:

```text
TOTP_SECRET_ENCRYPTION_KEYS={"v1":"<32-byte-base64url-key>"}
TOTP_SECRET_ENCRYPTION_ACTIVE_KEY_VERSION=v1
```

`TOTP_SECRET_ENCRYPTION_KEYS` is a version-to-key map. The active version must
exist in the map. Every key must decode to exactly 32 bytes. Key versions use
`[A-Za-z0-9._-]{1,64}`.

Web startup validates both variables in every runtime. Missing or invalid
configuration fails before serving requests. Validation errors expose variable
names only.

### Dual Read

For every secret read:

1. If ciphertext exists, require key version and decrypt ciphertext.
2. If ciphertext decryption fails, fail closed. Never fall back to plaintext.
3. If ciphertext does not exist, use legacy plaintext during migration.
4. If neither exists, treat setup as missing.

### Dual Write

- New setup writes plaintext, ciphertext, and key version in one Prisma update.
- Setup confirmation re-encrypts with a fresh nonce and writes both forms while
  enabling two-factor authentication.
- Disable clears plaintext, ciphertext, and key version.
- Recovery-code creation, hashing, and consumption remain unchanged.

### Backfill and Rotation

Create one batch tool with modes:

```text
backfill  Encrypt rows with plaintext present and ciphertext absent.
rotate    Decrypt rows using their stored version and re-encrypt with active key.
verify    Decrypt eligible ciphertext rows without changing data.
```

Tool requirements:

- explicit `--batch-size`;
- cursor pagination by `User.id`;
- `--dry-run` for backfill and rotate;
- an explicit `--confirm write-totp-secrets` acknowledgement for non-dry-run
  backfill and rotate operations;
- encrypt-then-decrypt equality check before update;
- conditional `updateMany` protecting against concurrent changes;
- counts only in output;
- no plaintext removal;
- repeat execution produces zero further updates after completion.

### Migration Order

1. Generate a 32-byte key and store it in the UAT secret manager.
2. Configure keyring and active version.
3. Apply additive Prisma migration.
4. Deploy dual-read/dual-write application code.
5. Run backfill dry-run.
6. Run backfill in bounded batches.
7. Run verify mode and database count queries.
8. Observe application errors and login health.
9. In a later approved change, stop plaintext writes.
10. After rollback retention, null then drop plaintext through separate
    migrations.

This task prepares commands and artifacts only. Steps 3-10 are not executed
against a live database.

### Rollback

During dual-write, the previous application can still read plaintext. Rollback:

1. retain every key version;
2. redeploy the previous application;
3. leave additive columns and ciphertext untouched;
4. investigate without changing plaintext.

After plaintext removal, rollback requires a separately reviewed recovery plan;
therefore plaintext removal is outside this change.

### Key Rotation

1. Add `v2` to the keyring while retaining `v1`.
2. Set active version to `v2`.
3. Restart; startup validates both versions.
4. New writes use `v2`; reads support `v1` and `v2`.
5. Run rotate dry-run, rotate, then verify.
6. Retain `v1` through the rollback period.
7. Remove `v1` only after no row references it and rollback is closed.

## Phase B: TOTP Replay Prevention

Change TOTP verification to:

```ts
type TotpMatch = {
  counter: number;
};

function verifyTotpCode(...): TotpMatch | null;
```

The acceptance offsets remain exactly `[-1, 0, 1]`.

After a TOTP match, atomically claim:

```text
auth:two-factor:replay:<userId>:<counter>
```

with:

```text
SET key 1 EX 120 NX
```

The 120-second TTL exceeds the 90-second three-counter acceptance window.

- `OK`: first use; continue.
- `null`: replay; reject as `invalid_code`.
- Redis error: return `verification_unavailable`; do not authenticate.
- Recovery code: keep existing database-backed atomic consumption.
- Same counter for another user: independent key and independent result.
- Concurrent requests: Redis `NX` permits one success.

Setup confirmation and every credential-based TOTP verification consume the
matched counter. A database failure after the claim may require the next TOTP
step; it must never restore a consumed replay key.

## Login Integration

- Web login selects plaintext plus encrypted fields, then passes the complete
  secret record to the common verifier.
- Mobile password login does the same.
- Web returns authentication failure for replay or unavailable verification.
- Mobile preserves existing required/invalid/rate-limited errors and maps
  `verification_unavailable` to a generic 503 response.
- No secret material reaches client payloads.

## Tests

Phase A:

- encryption/decryption round-trip;
- wrong key;
- changed ciphertext, tag, and AAD;
- legacy and encrypted dual-read;
- ciphertext failure never falls back;
- backfill idempotency and batching;
- key-version rotation;
- startup missing/invalid key validation.

Phase B:

- matched current and adjacent counters;
- unchanged rejection outside adjacent window;
- first use succeeds, second fails;
- concurrent verification yields one success;
- another user remains independent;
- Redis error fails closed;
- recovery-code hashing and atomic use remain unchanged;
- web and mobile login regressions.

## Verification

- Prisma format, validate, and generate with a safe dummy `DATABASE_URL`.
- Focused Node tests first.
- Web typecheck.
- Focused lint for changed files, then package lint if feasible.
- `git diff --check`.
- `graphify update .`.
- No live database connection, migration, backfill, deploy, commit, or push.
