# Web and desktop OAuth two-factor step-up implementation plan

**Goal:** Let an existing two-factor-protected account complete Google OAuth, or an already-linked GitHub OAuth sign-in, without weakening its TOTP/recovery-code requirement. Unlinked GitHub email matches retain Auth.js `OAuthAccountNotLinked` behavior because dangerous GitHub email linking remains disabled.

**Auth.js boundary:** In the pinned Auth.js core, `callbacks.signIn` runs before `handleLoginOrRegister`. A string return redirects before adapter account linking and session creation. The implementation relies on this pinned contract and adds a regression test for it.

## Protocol

1. OAuth provider verifies its identity and Auth.js enters `callbacks.signIn`.
2. Whispr resolves the existing local user and applies provider-email and account-status policy.
3. For a 2FA user without a valid grant, Whispr creates a five-minute, hashed, one-time challenge bound to `userId + provider + providerAccountId` and redirects to `/oauth-two-factor`.
4. The challenge page submits TOTP or a recovery code to an unauthenticated, rate-limited Route Handler.
5. The handler verifies the code, atomically consumes the challenge, creates a five-minute one-time grant with the same binding, and writes only the raw grant token to an HttpOnly, SameSite=Lax, Secure-in-production cookie.
6. The page restarts the same OAuth provider with Auth.js's sanitized callback path.
7. The second `callbacks.signIn` atomically consumes the bound grant, then allows Auth.js to link the account and mint the session.

## Security properties

- No session or provider account link exists before both factors pass.
- Challenge/grant tokens are random; only SHA-256 hashes are stored.
- Challenge URL token is not an authentication grant and is useless without TOTP/recovery code.
- The grant is HttpOnly and one-time; it is bound to the exact provider identity and local user.
- Invalid, expired, used, mismatched, unavailable, or raced records fail closed.
- The original web/mobile/desktop callback path is recovered from Auth.js's HttpOnly callback cookie, converted to a local path, and passed through the existing redirect sanitizer.
- Existing Google/GitHub profile verification and banned/deleted account checks remain mandatory.

## TDD order

1. Pure token/purpose/callback-cookie tests.
2. Challenge verification and atomic grant tests with injected storage boundaries.
3. Route parsing, rate limit, error mapping, and cookie tests.
4. OAuth policy tests: missing grant redirects; valid grant continues; mismatched grant does not continue.
5. Step-up page interaction tests where practical; typecheck/lint and focused auth regressions.
