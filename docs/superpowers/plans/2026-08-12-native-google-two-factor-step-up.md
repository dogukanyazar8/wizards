# Native Google two-factor step-up implementation plan

**Goal:** Let native mobile users protected by TOTP finish Google sign-in without allowing OAuth to bypass the second factor.

**Security invariant:** For an existing user, Google identity verification and TOTP/recovery-code verification must both complete before a Google `Account` row is created or a Whispr session is minted.

## 1. Request contract

- Extend `MobileAuthGoogleLoginRequestSchema` with an optional, trimmed `twoFactorCode` bounded to 64 characters.
- Forward that field through the route and mobile API client.
- Cover accepted, blank, and oversized values with contract tests.

## 2. Server authorization boundary

- Extend the native Google linked-user projection with the encrypted/legacy TOTP secret fields.
- Add an `authorizeExistingUser` callback to `linkMobileGoogleAccount`.
- Invoke it for an already-linked account, an email-matched account before the transaction, and a unique-constraint race winner.
- In `createMobileGoogleSession`, use that callback to reject unavailable accounts and verify TOTP/recovery codes.
- Preserve the existing post-link active/2FA checks as defense in depth for injected/custom linkers.
- Map missing, invalid, rate-limited, and unavailable verification results to stable API errors.

## 3. Mobile interaction

- Allow `startSocialSignIn` to receive an optional `twoFactorCode`.
- Return a typed recoverable two-factor result from native Google failures.
- Reuse the existing login-screen TOTP/recovery input; the first Google response reveals it, and the next Google attempt sends the trimmed code.
- Do not persist the Google ID token or the two-factor code.

## 4. Verification

- Run focused type/schema, route, server two-factor, API-client, and login-screen tests.
- Run web and mobile typecheck/lint gates affected by the shared contract.
- Run Graphify update after the final code change.
