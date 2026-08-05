# Web Dependency Modernization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update all compatible direct web dependencies on `uat`, including approved major upgrades and a bcrypt-safe 72 UTF-8 byte creation boundary.

**Architecture:** Apply one final dependency target through ordered cohorts. Keep password creation validation in shared schemas, preserve unrestricted legacy-password verification paths, align Prisma and bcrypt across web/DB manifests, and change source only when focused checks prove compatibility work is needed.

**Tech Stack:** pnpm 11.20.0, Node 24.18.0, Next.js 16, React 19, Prisma 7, Zod 4, bcryptjs 3, ioredis 6, TypeScript 6/7 project runners, Node test runner, Playwright.

## Global Constraints

- Work directly in the existing `uat` checkout; `uat` and `origin/uat` begin at divergence `0 0`.
- Preserve all unrelated dirty and untracked files.
- No reset, clean, stash, revert, broad staging, commit, push, deployment, migration, or production mutation.
- Runtime remains Node `>=24.18.0 <25`; keep `@types/node` on Node 24.
- Keep workspace dependencies as `workspace:*`.
- Update Prisma packages together to `7.9.1`.
- Remove `@types/bcryptjs`; bcryptjs 3 provides types.
- New passwords: maximum 72 UTF-8 bytes. Login/current-password verification: legacy inputs remain accepted up to existing limits.
- Report checks as PASS, FAIL, NOT RUN, or ENV BLOCKED.

---

### Task 1: Establish dependency and WIP baseline

**Files:**

- Read: `apps/web/package.json`
- Read: `packages/db/package.json`
- Read: `pnpm-workspace.yaml`
- Read: `pnpm-lock.yaml`

**Interfaces:**

- Consumes: approved design and current `uat` checkout.
- Produces: exact pre-change status, package list, and protected-WIP inventory.

- [ ] **Step 1: Record branch, parity, and protected files**

Run:

```powershell
git branch --show-current
git rev-list --left-right --count origin/uat...uat
git status --short
```

Expected: branch `uat`, divergence `0 0`; existing WIP remains visible.

- [ ] **Step 2: Capture direct web outdated inventory**

Run:

```powershell
corepack pnpm --filter @wizards/web outdated --format json
```

Expected: non-zero outdated status; 28 web-owned entries before changes. Exclude GitHub Actions and `@types/node@26` from the implementation target.

- [ ] **Step 3: Confirm manifest targets are not pre-modified**

Run:

```powershell
git status --short -- apps/web/package.json packages/db/package.json pnpm-workspace.yaml pnpm-lock.yaml
```

Expected: no pre-existing modifications. Stop if any target became dirty outside this task.

### Task 2: Add bcrypt-safe new-password schemas using TDD

**Files:**

- Create: `packages/types/src/password.ts`
- Modify: `packages/types/src/auth.test.ts`
- Modify: `packages/types/src/auth.ts`
- Modify: `packages/types/src/mobile.test.ts`
- Modify: `packages/types/src/mobile.ts`
- Modify: `packages/types/src/mobile-social.test.ts`
- Modify: `packages/types/src/mobile-social.ts`
- Modify: `apps/web/src/lib/locale/messages/en.ts`
- Modify: `apps/web/src/lib/locale/messages/tr.ts`

**Interfaces:**

- Produces: `BCRYPT_PASSWORD_MAX_BYTES = 72` and `isBcryptPasswordWithinLimit(value: string): boolean` for internal shared-schema use.
- Preserves: `LoginCredentialsSchema` and `MobileAuthPasswordLoginRequestSchema` legacy verification limits.

- [ ] **Step 1: Add failing web registration/reset tests**

Add assertions proving 72 ASCII bytes and 36 two-byte characters are accepted; 73 ASCII bytes and 37 two-byte characters are rejected by `RegisterSchema` and `ResetPasswordSchema`. Add a `LoginCredentialsSchema` assertion proving a 100-character legacy password remains accepted.

```typescript
const asciiBoundary = "p".repeat(72);
const multibyteBoundary = "ş".repeat(36);

assertAccepts(RegisterSchema, { ...base, password: asciiBoundary, confirmPassword: asciiBoundary });
assertRejects(
  RegisterSchema,
  { ...base, password: "p".repeat(73), confirmPassword: "p".repeat(73) },
  ["password"],
);
assertAccepts(LoginCredentialsSchema, {
  email: "ada@example.com",
  password: "p".repeat(100),
});
```

- [ ] **Step 2: Add failing mobile registration/change tests**

In `mobile.test.ts`, assert mobile login accepts 100 legacy characters while registration rejects 73 UTF-8 bytes. In `mobile-social.test.ts`, assert `MobilePasswordChangeRequestSchema` rejects a 73-byte `newPassword` but accepts a long `currentPassword`.

- [ ] **Step 3: Run RED tests**

Run:

```powershell
corepack pnpm --filter @wizards/types test
```

Expected: FAIL because 73-byte new passwords still pass.

- [ ] **Step 4: Implement portable UTF-8 byte counting**

Create `password.ts`:

```typescript
export const BCRYPT_PASSWORD_MAX_BYTES = 72;

export function getUtf8ByteLength(value: string): number {
  let bytes = 0;
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint === undefined) continue;
    bytes += codePoint <= 0x7f ? 1 : codePoint <= 0x7ff ? 2 : codePoint <= 0xffff ? 3 : 4;
  }
  return bytes;
}

export function isBcryptPasswordWithinLimit(value: string): boolean {
  return getUtf8ByteLength(value) <= BCRYPT_PASSWORD_MAX_BYTES;
}
```

Apply `.refine(isBcryptPasswordWithinLimit, "validation.password.bcryptMax")` only to registration, reset, and new-password schemas. Do not apply it to login or current-password fields.

- [ ] **Step 5: Add localized validation copy**

Add:

```typescript
"validation.password.bcryptMax": "Password must be 72 bytes or fewer when UTF-8 encoded.",
```

and Turkish equivalent:

```typescript
"validation.password.bcryptMax": "Şifre UTF-8 olarak kodlandığında en fazla 72 bayt olabilir.",
```

Patch only these keys; preserve existing badge-related locale WIP.

- [ ] **Step 6: Run GREEN tests**

Run:

```powershell
corepack pnpm --filter @wizards/types test
```

Expected: PASS.

### Task 3: Protect seed password creation paths using TDD

**Files:**

- Modify: `packages/db/src/seed-options.test.ts`
- Modify: `packages/db/src/seed-options.ts`
- Modify: `packages/db/src/seed-uat-test-users.test.ts`
- Modify: `packages/db/src/seed-uat-test-users.ts`

**Interfaces:**

- Consumes: Node's UTF-8-aware `Buffer.byteLength(value, "utf8")` in DB-only configuration code.
- Produces: seed configuration rejection before hashing passwords exceeding bcrypt capacity.

- [ ] **Step 1: Add failing seed option tests**

Add assertions that both demo and UAT seed option readers reject `"p".repeat(73)` with an error mentioning `72 UTF-8 bytes`, while accepting their existing valid passwords.

- [ ] **Step 2: Run RED seed tests**

Run:

```powershell
corepack pnpm --filter @wizards/db exec tsx --test src/seed-options.test.ts src/seed-uat-test-users.test.ts
```

Expected: FAIL because oversized seed passwords are accepted.

- [ ] **Step 3: Implement seed boundary**

Use `Buffer.byteLength(password, "utf8") > 72` in both option readers and throw a safe configuration error before any hash or DB write. Keep the validation in Node-only DB code; do not add browser or mobile dependencies.

- [ ] **Step 4: Run GREEN seed tests**

Run the same two-test command. Expected: PASS.

### Task 4: Apply compatible and coordinated dependency cohorts

**Files:**

- Modify: `apps/web/package.json`
- Modify: `packages/db/package.json`
- Modify: `pnpm-workspace.yaml`
- Modify: `pnpm-lock.yaml`
- Modify: `apps/web/src/lib/prisma-test-environment.test.ts`

**Interfaces:**

- Produces: aligned final dependency graph.
- Preserves: Node 24 types, workspace protocol, existing overrides except PostCSS version alignment.

- [ ] **Step 1: Update Cohort 1 versions**

Patch web manifest to current releases observed on 2026-08-05:

```text
@hookform/resolvers 5.7.1
@playwright/test 1.61.1 (1.62.1 deferred until it clears minimumReleaseAge)
@prisma/adapter-pg 7.9.1
@prisma/client 7.9.1
@prisma/instrumentation 7.9.1
@sentry/nextjs 10.69.0
@types/react 19.2.18
@types/react-dom 19.2.4
date-fns 4.4.0
eslint 10.8.0
framer-motion 12.43.0
jose 6.2.8
livekit-client 2.21.0
postcss 8.5.25
react-hook-form 7.84.0
resend 6.18.1
tailwind-merge 3.6.0
tsx 4.23.5
typescript-eslint 8.66.0
```

Patch DB Prisma packages and `prisma` to `7.9.1`. Update the root PostCSS override to `8.5.25`. Update Prisma version assertions to `7.9.1`.

- [ ] **Step 2: Update Next.js family together**

Set `next`, `@next/bundle-analyzer`, and `@next/eslint-plugin-next` to `16.3.0`.

- [ ] **Step 3: Update major/behavioral dependencies**

Set:

```text
@livekit/krisp-noise-filter 0.4.4
bcryptjs 3.0.3 (web and DB)
ioredis 6.0.0
lucide-react 1.28.0
```

Remove `@types/bcryptjs` from web and DB. Keep `@types/node` at `^24.13.3`.

- [ ] **Step 4: Verify inventory coverage**

Compare the patched manifest against the Task 1 inventory. The 26 versioned packages above plus removal of `@types/bcryptjs` must cover every actionable web-owned entry. The excluded web-owned signals are `@types/node@26` (outside the Node 24 runtime contract) and `@playwright/test@1.62.1` while pnpm's release-age policy reports `1.61.1` as the wanted version; GitHub Actions remain outside web ownership.

- [ ] **Step 5: Resolve lockfile**

Run:

```powershell
corepack pnpm install
```

Expected: install succeeds; only intended manifests and `pnpm-lock.yaml` change.

- [ ] **Step 6: Inspect dependency diff**

Run:

```powershell
git diff --check -- apps/web/package.json packages/db/package.json pnpm-workspace.yaml pnpm-lock.yaml
git diff -- apps/web/package.json packages/db/package.json pnpm-workspace.yaml
```

Expected: exact cohort versions, no workspace-protocol or unrelated override drift.

### Task 5: Diagnose and repair proven compatibility failures

**Files:**

- Modify only when a focused command fails: `apps/web/src/lib/redis.ts`, Redis type consumers, Next config/build scripts, Prisma instrumentation, voice Krisp loader, Lucide import sites.
- Test: nearest existing `*.test.ts` or `*.test.tsx` file for each proven failure.

**Interfaces:**

- Consumes: upgraded packages from Task 4.
- Produces: minimal compatibility adaptations backed by regression tests.

- [ ] **Step 1: Run focused contract tests**

```powershell
corepack pnpm --filter @wizards/web exec node --import tsx --test --test-force-exit src/lib/prisma-test-environment.test.ts src/lib/zod-form-resolver.test.ts src/components/providers/voice-provider-bundle.test.ts
corepack pnpm --filter @wizards/web exec node --import tsx --test --test-force-exit src/lib/auth/session-revocation.test.ts src/lib/socket/rate-limit.test.ts src/lib/outbox/worker.test.ts
```

- [ ] **Step 2: Run type checking**

```powershell
corepack pnpm --filter @wizards/web typecheck
```

- [ ] **Step 3: For each real failure, use RED-GREEN**

Add or tighten the nearest test so it fails for the observed incompatibility. Run the test and confirm expected failure. Make the smallest source adaptation. Re-run focused test and typecheck. Do not pre-emptively edit consumers that already pass.

### Task 6: Final verification and Graphify update

**Files:**

- Modify: generated Graphify outputs via required `graphify update .`
- Read: all task-modified files and full status.

**Interfaces:**

- Produces: verified local UAT dependency modernization without publication.

- [ ] **Step 1: Run package gates**

```powershell
corepack pnpm install --frozen-lockfile
corepack pnpm --filter @wizards/db test
corepack pnpm --filter @wizards/types test
corepack pnpm --filter @wizards/web test
corepack pnpm --filter @wizards/web lint
corepack pnpm --filter @wizards/web typecheck
corepack pnpm --filter @wizards/web build
corepack pnpm audit --audit-level moderate
```

- [ ] **Step 2: Run environment-backed checks when available**

Run API authentication/realtime Playwright suites when required E2E variables and services exist. Run visual checks when their baseline/browser environment exists. Otherwise report ENV BLOCKED; do not fabricate a pass.

- [ ] **Step 3: Confirm final outdated inventory**

Run `corepack pnpm --filter @wizards/web outdated --format json`, filter ownership to `@wizards/web`, and confirm only the deliberate `@types/node@26` and release-age-blocked `@playwright/test@1.62.1` signals remain.

- [ ] **Step 4: Refresh Graphify**

Run:

```powershell
graphify update .
```

Inspect Graphify status without overwriting unrelated graph WIP.

- [ ] **Step 5: Final safety audit**

```powershell
git diff --check
git status --short
git rev-list --left-right --count origin/uat...uat
```

Expected: no commit or push, branch still `uat`, parity remains `0 0`, user WIP preserved.
