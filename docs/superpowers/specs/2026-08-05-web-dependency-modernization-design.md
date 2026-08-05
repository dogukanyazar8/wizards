# Web Dependency Modernization Design

**Date:** 2026-08-05

**Branch:** `uat`

**Status:** Approved for planning

**Publication:** No commit or push

## Goal

Update every compatible direct dependency used by the web application to the latest observed release while preserving the Node 24 runtime contract, existing public behavior, authentication security, and unrelated working-tree changes.

## Scope

- Update all actionable entries reported for `@wizards/web` by `pnpm outdated`.
- Update shared `@wizards/db` dependencies when web correctness requires version alignment, especially Prisma and bcryptjs.
- Remove deprecated `@types/bcryptjs`; bcryptjs 3 supplies its own types.
- Keep `@types/node` on the latest Node 24 line. Do not install Node 26 types while root engines require `>=24.18.0 <25`.
- Exclude GitHub Actions, mobile Expo packages, desktop Rust crates, deployment state, database migrations, and production.
- Preserve all pre-existing source, test, documentation, and Graphify WIP.

## Delivery Strategy

One final dependency target, applied in four ordered cohorts. Each cohort receives focused verification before the next begins. Failures are diagnosed within the active cohort; unrelated refactoring is excluded.

### Cohort 1: Compatible framework-independent updates

Update Prisma `7.9.0` to `7.9.1` across web and DB packages, plus current same-major releases for Sentry, Jose, PostCSS, Resend, React types, form libraries, animation libraries, LiveKit, Tailwind Merge, TSX, TypeScript ESLint, ESLint, Playwright, and related web tooling.

Prisma packages must remain aligned:

- `@prisma/adapter-pg`
- `@prisma/client`
- `@prisma/instrumentation`
- `prisma`

### Cohort 2: Next.js family

Update these together to `16.3.0`:

- `next`
- `@next/bundle-analyzer`
- `@next/eslint-plugin-next`

Do not mix Next.js framework versions within the web package.

### Cohort 3: Behavioral and major updates

Update:

- `bcryptjs` 2 to 3 in web and DB packages
- `ioredis` 5 to 6
- `lucide-react` 0.x to 1.x
- `@livekit/krisp-noise-filter` 0.3 to 0.4

Make source changes only when release contracts, type checking, focused tests, or builds prove they are required.

### Cohort 4: Remaining tooling and lockfile convergence

Apply remaining compatible web dev-tool updates. Reconcile `pnpm-lock.yaml` once. Confirm no actionable `@wizards/web` outdated entry remains except the deliberate Node 26 type exclusion.

## Password Security Contract

bcrypt processes at most 72 UTF-8 bytes. The upgrade must remove silent acceptance of newly created passwords beyond this boundary without locking out existing users.

- Registration, password reset, password change, reauthentication setup, mobile password creation, seeds, and test factories must reject newly created passwords whose UTF-8 representation exceeds 72 bytes.
- Login and verification paths must continue comparing existing hashes, including hashes created from legacy passwords longer than 72 bytes.
- Do not silently rehash on login.
- Preserve generic authentication errors; do not reveal account existence or truncation details through login responses.
- Preserve existing rate limits, two-factor checks, reset-token invalidation, and session revocation behavior.
- Character limits may remain for product ergonomics, but byte validation is authoritative for bcrypt safety.

The byte count must use UTF-8 semantics, not JavaScript string length. Multibyte passwords receive explicit boundary coverage.

## Compatibility Rules

- Runtime remains Node `>=24.18.0 <25` and pnpm `11.20.0`.
- `@types/node` remains on Node 24.
- Workspace dependencies remain `workspace:*`.
- No runtime, package-manager, database-schema, migration, or deployment changes.
- No dependency override weakening.
- No security check suppression or test deletion.
- Public APIs remain compatible unless a dependency forces a documented change verified by tests.

## Verification

### Per cohort

- Install/update only cohort packages.
- Inspect manifest and lockfile diff.
- Run package-specific type checking and focused tests.
- Stop on failure; diagnose root cause before compatibility edits.

### Security cohort

- Prove 72-byte acceptance and 73-byte rejection for ASCII.
- Prove equivalent UTF-8 byte boundaries with multibyte input.
- Prove legacy hash verification remains functional.
- Run register, login, reset, reauthentication, two-factor, mobile authentication, session, seed, and DB tests affected by bcrypt.
- Run Redis rate-limit, outbox, and socket tests affected by ioredis 6.

### Final gates

- `corepack pnpm install --frozen-lockfile`
- `corepack pnpm --filter @wizards/db test`
- `corepack pnpm --filter @wizards/types test`
- `corepack pnpm --filter @wizards/web test`
- `corepack pnpm --filter @wizards/web lint`
- `corepack pnpm --filter @wizards/web typecheck`
- `corepack pnpm --filter @wizards/web build`
- `corepack pnpm audit --audit-level moderate`
- Relevant Playwright API, authentication, realtime, and visual checks when their environment is available
- `graphify update .` after code changes
- Final `pnpm outdated` inventory filtered to actual `@wizards/web` ownership

Report every gate as PASS, FAIL, NOT RUN, or ENV BLOCKED. Do not present local checks as CI, deployment, device, or production evidence.

## Working-Tree Safety

- Modify only dependency manifests, `pnpm-lock.yaml`, explicit bcrypt contract/tests, and compatibility edits proven necessary by failed checks.
- Inspect overlap before editing any already-modified file.
- Never reset, clean, stash, revert, broadly stage, commit, or push.
- Keep unrelated WIP intact and list any overlap or blocker before proceeding.

## Success Criteria

- Every compatible direct web dependency reaches the latest observed release.
- Node 24 types remain aligned with the runtime.
- Prisma and bcrypt versions stay aligned across web and DB packages.
- Deprecated bcrypt type stub is absent.
- New passwords beyond 72 UTF-8 bytes are rejected; legacy verification still works.
- Required focused and final gates pass or receive an explicit environment blocker.
- No unrelated user changes are overwritten.
