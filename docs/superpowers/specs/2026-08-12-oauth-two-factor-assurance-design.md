# OAuth Two-Factor Assurance Design

## Goal

Prevent Google sign-in from bypassing account-level TOTP on web, desktop handoff, and native mobile while preserving Google sign-in for accounts without two-factor authentication.

## Current State

- Password sign-in already enforces TOTP and recovery-code verification on web and native mobile.
- Google web sign-in permits verified-email account linking through `allowDangerousEmailAccountLinking`.
- Native mobile Google sign-in independently links by verified email and creates a mobile session.
- Neither Google path currently proves the account's local second factor.

## Phase 1: Immediate Guard

Use one account-level policy: an existing user with `twoFactorEnabled: true` cannot complete Google sign-in until OAuth step-up exists.

- Web callback loads the existing user before returning its decision. Verified provider email checks and banned/deleted/email-verification checks remain unchanged.
- Native mobile carries `twoFactorEnabled` in its linked-user projection. It rejects linked and email-matched users before account mutation, then repeats the check immediately before session creation as defense in depth.
- New and existing non-2FA users keep current Google behavior.
- Rejection uses `TWO_FACTOR_REQUIRED` on native mobile. Web keeps Auth.js `AccessDenied` behavior until the step-up flow replaces it.

## Phase 2: Google TOTP Step-Up

Replace rejection with a short-lived, one-time pending OAuth challenge.

1. Verify Google identity.
2. Resolve existing account without linking or issuing a session.
3. If 2FA is disabled, continue current flow.
4. If 2FA is enabled, create an opaque pending challenge bound to user, provider, provider account ID, purpose, expiry, and single-use state.
5. Ask for TOTP or recovery code.
6. Reuse `verifyTwoFactorCredential` for rate limits, replay protection, encrypted-secret resolution, and recovery-code consumption.
7. Consume challenge atomically; only then link account and issue web/mobile session.

Web and mobile may use different transport adapters, but both must call the same challenge service and verification policy.

## Security Constraints

- No `Account`, `User`, refresh-family, access-token, or Auth.js session mutation before required step-up succeeds.
- Fail closed when challenge storage, TOTP replay storage, or verification is unavailable.
- Challenge values are random, hashed at rest, short-lived, single-use, purpose-bound, and rate-limited.
- Do not log Google tokens, TOTP values, recovery codes, or challenge tokens.
- Preserve current TOTP encryption keyring. Do not rotate `AUTH_SECRET` or TOTP keys as part of this work.
- Existing sessions require a separate, approved revocation operation after deployment assessment.

## Acceptance Criteria

- Existing 2FA user cannot obtain a Google web, desktop, or native mobile session without local TOTP or recovery-code verification.
- Phase 1 creates no account link or session on rejection.
- Non-2FA Google flows remain unchanged.
- Password+TOTP flows remain unchanged.
- Phase 2 challenge replay, expiry, wrong user/provider, invalid TOTP, unavailable verification, and consumed recovery code fail safely.
