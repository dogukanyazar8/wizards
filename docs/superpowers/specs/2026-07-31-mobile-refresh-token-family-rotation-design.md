# Mobile Refresh Token Family Rotation Design

## Goal

Prevent refresh-token family forks and replay while preserving one safe,
idempotent retry during the 60-second grace window.

## Root Cause

`consumeMobileRefreshToken()` reads and marks the old token in separate Redis
operations. Every caller then creates a new successor independently. Concurrent
requests can therefore consume the same generation and create different
successors. The current test explicitly accepts this behavior.

## Redis Model

- `auth:mobile-session:<sessionId>` stores `familyId`, `currentGeneration`,
  `currentTokenHash`, `createdAt`, `lastRotatedAt`, and `userId`.
- `auth:mobile-refresh:<sha256(token)>` stores token-family identity,
  generation, session/user identity, creation time, and rotation tombstone
  metadata.
- `auth:mobile-refresh-retry:<sha256(oldToken)>` stores only an authenticated
  encryption envelope for the successor token. Its TTL is the grace interval
  plus one second to preserve the inclusive 60-second boundary.

The old token tombstone remains long enough to attribute a later replay to its
family. The retry receipt remains only for the grace interval.

## Atomic Rotation

The application pre-generates a candidate successor and its encrypted retry
receipt. One Lua script then:

1. Reads and validates the old token and session.
2. Confirms family identity, current token hash, and monotonic generation.
3. Creates the candidate successor with `SET ... NX`.
4. Advances the session generation exactly once.
5. Marks the old token as consumed.
6. Stores the encrypted retry receipt with its short TTL.

If the old token was already consumed, the script returns the existing receipt
only when the request remains inside grace and the session still points to that
successor. A generation mismatch or grace-expired use revokes the session
marker atomically and returns replay. Session absence makes every family token
invalid.

## Retry Receipt Encryption

The receipt uses AES-256-GCM with a fresh 96-bit IV. A dedicated key is derived
from `AUTH_SECRET` or `NEXTAUTH_SECRET` using HKDF-SHA256 and a
mobile-refresh-retry domain label. Associated data binds the receipt to the old
token hash. Redis stores IV, ciphertext, and authentication tag; never the raw
successor.

Threat boundary:

- Redis read access alone cannot recover the successor token.
- Application signing-secret compromise can decrypt receipts; that compromise
  already permits access-token signing and is outside Redis-only containment.
- Secret rotation invalidates at most 61 seconds of pending retry receipts.
- Raw refresh tokens are never logged.

## Replay and Revocation

- Valid grace retry returns the identical successor refresh token.
- Old generation outside grace revokes the family/session.
- Use of an older generation after its successor has already rotated also
  revokes the family.
- Logout or explicit session revoke deletes the session marker. Old and current
  refresh tokens, plus access tokens checked against the session, are rejected.
- Unknown or malformed token hashes return invalid without affecting another
  family.
- Redis errors propagate; no refresh response is issued.

## Legacy Tokens

An unconsumed legacy token lacking family/generation fields is adopted by the
first successful atomic rotation. Its family identity becomes its existing
session identity and its starting generation is zero. A consumed legacy token
cannot provide an idempotent successor receipt and therefore revokes the
session. Competing legacy branches can have only one winner; any later branch
causes family revocation.

## Verification

Focused tests cover normal rotation, identical grace retry, concurrent
single-successor behavior, replay revocation, invalid tokens, Redis failure,
family-wide logout/revoke, encrypted receipt storage, and clean test-runner
exit. Web typecheck, focused lint, `git diff --check`, and
`graphify update .` follow implementation.
