# Auth.js v5 Beta Risk Runbook

Last verified: 2026-07-23.

## Current Decision

Whispr pins `next-auth@5.0.0-beta.32` and `@auth/prisma-adapter@2.11.3` exactly in `apps/web/package.json`. Do not use semver ranges for either package.

Official release evidence:

- [next-auth@5.0.0-beta.32](https://github.com/nextauthjs/next-auth/releases/tag/next-auth%405.0.0-beta.32) upgrades to `@auth/core@0.41.3` and fixes malformed Bearer handling, provider-bound OAuth check cookies, NFKC email normalization, and fail-open session responses.
- [@auth/prisma-adapter@2.11.3](https://github.com/nextauthjs/next-auth/releases/tag/%40auth%2Fprisma-adapter%402.11.3) lists only its `@auth/core` dependency update to `0.41.3`; no breaking change is announced.
- `@auth/prisma-adapter@2.11.3` supports `@prisma/client` 5, so Whispr's `@prisma/client@5.22.0` remains compatible.

Registry checks from this verification:

```powershell
pnpm.cmd view next-auth@5.0.0-beta.32 dependencies peerDependencies --json
pnpm.cmd view @auth/prisma-adapter@2.11.3 dependencies peerDependencies --json
```

Expected dependency alignment:

```text
next-auth@5.0.0-beta.32        @auth/core@0.41.3
@auth/prisma-adapter@2.11.3    @auth/core@0.41.3
```

There is no stable v5 target at this verification point. Stable v5 migration remains a separate approved change.

## Rejected Alternatives

v4 downgrade rejected: Whispr uses the v5 universal helpers, hardened Credentials flow, JWT revocation, and desktop OAuth handoff. Returning to v4 would be a separate rewrite, not rollback.

Alternative auth library rejected: replacing Auth.js would replace OAuth account linking, session cookies, two-factor integration, and desktop/mobile handoff behavior outside this checkpoint.

## Preserved Security Contracts

- Middleware redirects `/channels` and `/settings` to `/login` when `AUTH_SECRET` and `NEXTAUTH_SECRET` are both absent, or session parsing fails.
- Malformed `Authorization: Bearer ...` input must never produce a 500 response.
- Credentials login retains login-proof, password, account-state, and two-factor checks.
- Google requires `email_verified`; GitHub requires the matching verified primary email from GitHub.
- JWT session revocation removes access after revocation.
- Desktop OAuth handoff stays one-time and callback-path-bound.
- Auth.js has only Credentials, Google, and GitHub providers. There is no Auth.js Email provider or magic-link login feature.

## Required Verification

```powershell
corepack pnpm audit --audit-level moderate --json
pnpm.cmd --filter @wizards/web exec node --import tsx --test src/lib/auth/next-auth-beta-contract.test.ts src/middleware.test.ts
pnpm.cmd --filter @wizards/web e2e:api
pnpm.cmd typecheck
pnpm.cmd --filter @wizards/web build
git diff --check
```

Pass conditions:

- Audit JSON reports `critical`, `high`, and `moderate` as zero.
- Contract and middleware tests pass.
- Auth API E2E executes credentials, two-factor, OAuth, revocation, malformed-Bearer, registration, and desktop-handoff coverage.
- Typecheck, build, and whitespace checks pass.

## Rollback

No Prisma migration, native project, or CI change is part of this checkpoint. If a post-deploy regression is confirmed, revert the single checkpoint commit so `apps/web/package.json` and `pnpm-lock.yaml` roll back together; then re-run the required verification suite before redeploying. Do not manually edit a deployed lockfile or bypass Auth.js checks.

## JWT lifetime patch

`patches/@auth__core@0.41.3.patch` caps JWT session cookies and the public
`session.expires` at the finite `exp` returned by `callbacks.jwt`, without an
additional decryption or database query. The encoder also caps the encrypted
expiry at that claim after asynchronous key derivation. It covers credential, OAuth, email and
WebAuthn callback branches plus session renewal; database sessions are unchanged.

`apps/web/src/lib/auth/session-lifetime.ts` refreshes that claim using the existing
rolling policy (12 hours without remember-me, 30 days otherwise). The patched encoder
preserves the selected second even if the callback crosses a clock boundary.
Keep both sides together: the callback must refresh `exp` on renewal. The upstream
default encoder alone overwrites expiry and would not satisfy this contract.

The safe Auth.js logger omits exception messages, stacks and payloads. Only a real
`JWTExpired` for the `exp` claim inside `JWTSessionError` is suppressed; unexpected
failures retain their Auth.js type and JOSE code. The proxy clears invalid incoming
session cookies from both the response and the downstream rendering request.

Before changing or removing the patch, run `session-expiry.test.ts`,
`session-lifetime.test.ts`, `expired-session-proxy.test.ts`, `auth-logger.test.ts`,
and the auth regression suite. Real OAuth provider/browser acceptance remains a
separate deployment check.

## Stable v5 Migration Checklist

When a stable 5.0.0 or newer v5 release appears:

1. Run `pnpm.cmd view next-auth dist-tags` and `pnpm.cmd view next-auth versions`.
2. Review official Auth.js release notes for provider callbacks, JWT handling, cookies, Credentials behavior, Prisma adapter compatibility, and OAuth account-linking defaults.
3. Keep the next-auth and adapter pins exact, update their lockfile chain together, then re-run this runbook.
