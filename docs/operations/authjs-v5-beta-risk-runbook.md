# Auth.js v5 Beta Risk Runbook

Last verified: 2026-07-09.

## Current Decision

Whispr stays on `next-auth@5.0.0-beta.31` for now. The version is pinned exactly in `apps/web/package.json` and must not be changed to a range such as `^5.0.0-beta.31` or `~5.0.0-beta.31`.

Registry evidence from 2026-07-09:

```bash
npm view next-auth dist-tags
```

Observed:

```text
beta: 5.0.0-beta.31
latest: 4.24.14
```

```bash
npm view next-auth versions
```

Observed latest v5 entry:

```text
5.0.0-beta.31
```

There is no stable 5.0.0 release in the registry at this verification point, so there is no stable v5 upgrade target.

## Why We Are Not Downgrading To v4

Decision label: v4 downgrade rejected.

`next-auth@4.24.14` is stable, but moving back to it would be a rewrite rather than a safe downgrade. Whispr's auth stack depends on the v5/Auth.js shape:

- `apps/web/src/auth.ts` exports the v5 universal helpers used by app routes, middleware-adjacent code, and server components.
- Credentials login uses a hardened `authorize()` path with login proofs and CR-07 two-factor verification.
- Desktop OAuth handoff depends on the current credentials provider integration.
- Session JWT callbacks include durable session revocation checks and profile hydration.
- OAuth sign-in callbacks enforce verified Google and GitHub email behavior.

The v4 handler-based API can be reconsidered only if v5 becomes unmaintained and a separate migration project is approved.

## Why We Are Not Replacing Auth.js

Decision label: alternative auth library rejected.

An alternative auth library or custom auth implementation was considered and rejected for this task. It would require replacing credentials login, OAuth account linking, session cookies, JWT callbacks, desktop OAuth handoff, mobile handoff expectations, and two-factor integration. That is higher risk than staying pinned on the current beta with a regression safety net.

## Stable v5.0.0 Migration Checklist

When a stable 5.0.0 or newer v5 release appears:

1. Re-run the registry checks:

```bash
npm view next-auth dist-tags
npm view next-auth versions
```

2. Read the Auth.js release notes and changelog for:

- provider callback signature changes
- JWT encode/decode changes
- cookie naming or security default changes
- credentials provider behavior changes
- Prisma adapter compatibility notes
- OAuth account linking defaults

3. Update only the exact `next-auth` pin. Do not use a semver range.

4. Check whether `@auth/prisma-adapter` must also move, and keep that change in the same PR only if the release notes require it.

5. Re-run the auth regression safety net before broad UI testing:

```bash
pnpm --filter @wizards/web test:coverage
pnpm --filter @wizards/web typecheck
pnpm --filter @wizards/web lint
pnpm --filter @wizards/web e2e:api
```

6. In the E2E/API output, verify these scenarios still execute:

- credentials login uses the real Auth.js callback
- two-factor credentials login requires a valid second factor
- session revocation invalidates an already issued Auth.js session
- registration remains covered by the auth upgrade safety net
- desktop OAuth handoff creates a one-time desktop claim URL when Redis is configured
- Google OAuth remains tied to verified provider email

7. Manually smoke the browser UI for:

- `/login`
- `/register`
- Google OAuth start from web runtime
- desktop OAuth start and complete from desktop runtime
- settings security panel two-factor enable and disable

8. Confirm `apps/web/src/auth.ts` still protects:

- login proof requirement before credentials authorization
- generic credential failure response for wrong password and missing or wrong 2FA
- verified Google email requirement
- desktop OAuth handoff token one-time consumption
- JWT session revocation

## Monitoring Reminder

Set a recurring reminder outside the repo to check `nextauthjs/next-auth` releases and changelog for a stable v5 release. Suggested cadence: weekly until stable 5.0.0 exists, then immediately run this checklist.

Suggested reminder text:

```text
Check nextauthjs/next-auth releases and npm dist-tags for stable Auth.js v5. If stable 5.0.0 exists, run docs/operations/authjs-v5-beta-risk-runbook.md.
```
