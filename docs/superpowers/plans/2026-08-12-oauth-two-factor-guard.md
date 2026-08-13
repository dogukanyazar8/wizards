# OAuth Two-Factor Guard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Block every current Google sign-in path for existing 2FA accounts before account linking or session issuance.

**Architecture:** Extend existing OAuth email policy with an optional resolved-user security state. Web resolves and passes that state before accepting OAuth. Native mobile projects the same state, rejects before database mutation, and rechecks before session creation.

**Tech Stack:** TypeScript, Auth.js 5 beta.32, Prisma, Node test runner, native mobile auth API.

## Global Constraints

- Keep `allowDangerousEmailAccountLinking: true` for non-2FA accounts during Phase 1.
- Do not change TOTP encryption, recovery-code, password-login, or session-token formats.
- Do not touch unrelated mobile group-chat WIP.
- No live database mutation or session revocation in this plan.

---

### Task 1: OAuth policy regression

**Files:**

- Modify: `apps/web/src/lib/auth/oauth-email.test.ts`
- Modify: `apps/web/src/lib/auth/oauth-email.ts`

**Interfaces:**

- Produces: `OAuthTwoFactorUser`, `requiresOAuthTwoFactorStepUp(user)`, and optional `existingUser` input on `canOAuthUserSignIn`.

- [ ] **Step 1: Write failing policy test**

Add a verified Google case whose resolved existing user has `twoFactorEnabled: true`; expect `canOAuthUserSignIn` to return `false`. Add non-2FA and no-existing-user controls expecting `true`.

- [ ] **Step 2: Run focused tests; verify RED**

Run:

```powershell
pnpm.cmd --filter @wizards/web exec node --import tsx --test --test-force-exit src/lib/auth/oauth-email.test.ts
```

Expected: 2FA Google assertion fails because current policy returns `true`.

- [ ] **Step 3: Add minimal policy**

Add:

```ts
export type OAuthTwoFactorUser = { twoFactorEnabled: boolean };

export function requiresOAuthTwoFactorStepUp(user: OAuthTwoFactorUser | null | undefined): boolean {
  return user?.twoFactorEnabled === true;
}
```

Accept `existingUser?: OAuthTwoFactorUser | null` in `canOAuthUserSignIn`; return `false` before provider-specific success when step-up is required.

- [ ] **Step 4: Run focused tests; verify GREEN**

Run the Step 2 command. Expected: PASS.

### Task 2: Web Auth.js guard

**Files:**

- Modify: `apps/web/src/auth.ts`
- Test: `apps/web/src/lib/auth/oauth-email.test.ts`

**Interfaces:**

- Consumes: `canOAuthUserSignIn({ existingUser, account, profile, user })`.
- Produces: Auth.js `signIn` rejection for existing 2FA users before automatic email linking.

- [ ] **Step 1: Update existing-user lookup**

Move the policy call after the existing-user lookup. Select `twoFactorEnabled`; pass `existingUser` to `canOAuthUserSignIn`. Preserve behavior when no lookup key exists by calling policy with `existingUser: null`.

- [ ] **Step 2: Run OAuth tests and web typecheck**

```powershell
pnpm.cmd --filter @wizards/web exec node --import tsx --test --test-force-exit src/lib/auth/oauth-email.test.ts
pnpm.cmd --filter @wizards/web typecheck
```

Expected: PASS.

### Task 3: Native mobile guard

**Files:**

- Modify: `apps/web/src/lib/mobile/auth-two-factor.test.ts`
- Modify: `apps/web/src/lib/mobile/google-native-auth.ts`
- Modify: `apps/web/src/lib/mobile/auth.ts`

**Interfaces:**

- Consumes: `requiresOAuthTwoFactorStepUp(user)`.
- Produces: `MobileGoogleLinkedUser.twoFactorEnabled`; `MobileGoogleAuthError` code `TWO_FACTOR_REQUIRED`.

- [ ] **Step 1: Write failing mobile-session test**

Call `createMobileGoogleSession` with verified identity and a `linkAccount` dependency returning an active user with `twoFactorEnabled: true`. Expect `MobileNativeAuthError` with code `TWO_FACTOR_REQUIRED`, status `401`, and zero Redis writes.

- [ ] **Step 2: Run focused test; verify RED**

```powershell
pnpm.cmd --filter @wizards/web exec node --import tsx --test --test-force-exit src/lib/mobile/auth-two-factor.test.ts
```

Expected: operation resolves or touches Redis instead of rejecting.

- [ ] **Step 3: Implement pre-link and pre-session checks**

Project `twoFactorEnabled` through `LINKED_USER_SELECT` and `MobileGoogleLinkedUser`. Reject linked-account, email-match, and race-winner paths before returning or mutating. Add defensive rejection in `createMobileGoogleSession` before refresh-family/session creation.

- [ ] **Step 4: Run focused tests; verify GREEN**

Run the Step 2 command. Expected: PASS.

### Task 4: Regression verification

**Files:**

- Test: `apps/web/src/lib/auth/oauth-email.test.ts`
- Test: `apps/web/src/lib/mobile/auth-two-factor.test.ts`
- Test: `apps/web/src/lib/mobile/google-native-auth.test.ts`
- Test: `apps/web/src/lib/auth/web-login-two-factor.test.ts`

**Interfaces:**

- Produces: verified Phase 1 delivery; no Phase 2 implementation.

- [ ] **Step 1: Run focused regression set**

```powershell
pnpm.cmd --filter @wizards/web exec node --import tsx --test --test-force-exit src/lib/auth/oauth-email.test.ts src/lib/mobile/auth-two-factor.test.ts src/lib/mobile/google-native-auth.test.ts src/lib/auth/web-login-two-factor.test.ts
```

- [ ] **Step 2: Run web typecheck and lint on changed files through project commands**

```powershell
pnpm.cmd --filter @wizards/web typecheck
pnpm.cmd --filter @wizards/web lint
```

- [ ] **Step 3: Inspect final diff and update Graphify**

Confirm only planned files changed. Then run:

```powershell
$pythonPath = (Get-Content -Raw graphify-out/.graphify_python).Trim()
& $pythonPath -m graphify update .
```
