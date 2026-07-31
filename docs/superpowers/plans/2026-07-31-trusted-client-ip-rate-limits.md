# Trusted Client IP and Sensitive Rate Limits Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace spoofable auth/update network identities with Railway `X-Real-IP`, canonical IP parsing, deterministic subject fallback, and independent subject limits.

**Architecture:** A pure security module validates and hashes trusted IP and subject identities. Mobile auth, web auth, OTA, and analytics consume it; sensitive unauthenticated routes apply independent network and subject buckets. Existing account, email, user, Turnstile, and two-factor defenses remain.

**Tech Stack:** TypeScript 7 CLI, Node 24 `node:test`, Next.js 16 server actions/routes, Redis sliding-window limiter.

## Global Constraints

- Work directly on `uat`; user explicitly authorized this branch.
- Preserve unrelated WIP. Inspect scoped diffs before every edit.
- Do not commit, stage, push, deploy, or mutate Railway.
- Use only Railway `X-Real-IP` for security client IP.
- Ignore `X-Forwarded-For`, `Forwarded`, and `CF-Connecting-IP`.
- Never use `User-Agent` as security identity.
- Never log raw proxy headers, email, token, installation, or user identity.
- Add no dependency.
- Write each production behavior only after its focused test fails for the expected reason.

---

### Task 1: Central trusted client-IP identity

**Files:**

- Create: `apps/web/src/lib/security/client-ip.ts`
- Create: `apps/web/src/lib/security/client-ip.test.ts`

**Interfaces:**

- Produces: `normalizeIpAddress(value): string | null`
- Produces: `getTrustedClientIp(headers): string | null`
- Produces: `createClientRateLimitIdentity({ fallbackNamespace, fallbackValue, headers }): string`
- Produces: `createSubjectRateLimitIdentity(namespace, value): string`

- [ ] **Step 1: Write failing parsing and identity tests**

Test literal cases:

```ts
assert.equal(normalizeIpAddress("192.0.2.1"), "192.0.2.1");
assert.equal(normalizeIpAddress("2001:0db8:0:0:0:0:0:1"), "2001:db8::1");
assert.equal(normalizeIpAddress("::ffff:192.0.2.1"), "192.0.2.1");
assert.equal(normalizeIpAddress("::ffff:c000:201"), "192.0.2.1");
assert.equal(normalizeIpAddress("198.51.100.7, 203.0.113.4"), null);
```

Build two header sets with equal `X-Real-IP`, different `X-Forwarded-For`,
`CF-Connecting-IP`, and `User-Agent`; assert identical identities. Build invalid
and missing `X-Real-IP` sets; assert deterministic subject fallback. Assert raw
input values are absent from returned identities.

- [ ] **Step 2: Verify RED**

Run:

```powershell
corepack.cmd pnpm --filter @wizards/web exec node --import tsx --test src/lib/security/client-ip.test.ts
```

Expected: fail because `client-ip.ts` does not exist.

- [ ] **Step 3: Implement minimal parser and hash builders**

Use `node:net` `isIP`. Canonicalize IPv6 through Node URL parsing. Detect
normalized `::ffff:hhhh:hhhh`, convert its two words to dotted IPv4. Reject any
comma, invalid IP, port, or zone suffix. Hash namespaced material with SHA-256
base64url.

- [ ] **Step 4: Verify GREEN**

Run Task 1 command. Expected: all tests pass.

- [ ] **Step 5: Inspect scoped diff**

Run:

```powershell
git diff --check -- apps/web/src/lib/security/client-ip.ts apps/web/src/lib/security/client-ip.test.ts
```

### Task 2: Mobile auth network and subject layers

**Files:**

- Modify: `apps/web/src/app/api/v1/mobile/auth/rate-limit.ts`
- Modify: `apps/web/src/app/api/v1/mobile/auth/rate-limit.test.ts`
- Modify: `apps/web/src/app/api/v1/mobile/auth/login/route-logic.ts`
- Modify: `apps/web/src/app/api/v1/mobile/auth/login/route-logic.test.ts`
- Modify: `apps/web/src/app/api/v1/mobile/auth/register/route-logic.ts`
- Modify: `apps/web/src/app/api/v1/mobile/auth/register/route-logic.test.ts`
- Modify: `apps/web/src/app/api/v1/mobile/auth/google/route-logic.ts`
- Modify: `apps/web/src/app/api/v1/mobile/auth/google/route-logic.test.ts`
- Modify: `apps/web/src/app/api/v1/mobile/auth/forgot-password/route.ts`
- Modify: `apps/web/src/app/api/v1/mobile/auth/verification-email/route.ts`
- Modify: `apps/web/src/app/api/v1/mobile/auth/exchange/route.ts`
- Modify: `apps/web/src/app/api/v1/mobile/auth/refresh/route.ts`
- Modify: `apps/web/src/app/api/v1/mobile/auth/revoke/route.ts`

**Interfaces:**

- Consumes: Task 1 identity functions.
- Produces: `enforceMobileAuthRateLimit(request, action, subject)` where subject is `{ namespace: string; value: string }`.

- [ ] **Step 1: Write failing mobile limiter tests**

Inject a fake `checkRateLimit` dependency recording real generated keys. Assert:

- spoofed `X-Forwarded-For` cannot alter network key;
- different `User-Agent` cannot alter either key;
- same IP/different email shares network key, differs subject key;
- different IP/same email differs network key, shares subject key;
- invalid/missing `X-Real-IP` uses deterministic email fallback;
- generated keys contain no raw IP or email.

- [ ] **Step 2: Verify RED**

Run:

```powershell
corepack.cmd pnpm --filter @wizards/web exec node --import tsx --test src/app/api/v1/mobile/auth/rate-limit.test.ts
```

Expected: assertions fail because current code trusts first `X-Forwarded-For`
and includes `User-Agent`.

- [ ] **Step 3: Implement combined mobile limiter**

Add dependency injection for `checkRateLimit` and Redis. Generate one network
key plus one subject key. Deduplicate equal keys. Use existing action limit and
safe `ApiError` responses.

- [ ] **Step 4: Verify GREEN**

Run Task 2 limiter command. Expected: all tests pass.

- [ ] **Step 5: Write failing route-order tests**

Update login/register/Google route-logic tests so parsed normalized subject is
passed to limiter. Failure caught: a route calling limiter before parsing or
without subject.

- [ ] **Step 6: Verify route tests RED**

Run:

```powershell
corepack.cmd pnpm --filter @wizards/web exec node --import tsx --test src/app/api/v1/mobile/auth/login/route-logic.test.ts src/app/api/v1/mobile/auth/register/route-logic.test.ts src/app/api/v1/mobile/auth/google/route-logic.test.ts
```

- [ ] **Step 7: Update every mobile auth caller**

Parse validated bodies, then pass:

- login/register/forgot/verification: normalized email;
- Google: SHA-256 fingerprint input under `google-credential`;
- exchange: handoff token;
- refresh/revoke: refresh token, falling back to access-token/session material
  for revoke without refresh token.

Keep existing mobile email login-attempt and two-factor user limits unchanged.

- [ ] **Step 8: Verify mobile auth GREEN**

Run limiter, route-logic, mobile auth, and mobile two-factor tests.

### Task 3: Web auth independent network and subject limits

**Files:**

- Create: `apps/web/src/lib/auth/request-rate-limits.ts`
- Create: `apps/web/src/lib/auth/request-rate-limits.test.ts`
- Modify: `apps/web/src/lib/auth/actions.ts`

**Interfaces:**

- Consumes: Task 1 identities and existing `checkRateLimit`.
- Produces: focused functions for registration, login, password-reset request,
  verification resend/send, and reset-token consumption.

- [ ] **Step 1: Write failing layer tests**

Use a fake limiter recording keys. Assert:

- same IP/different accounts share network key and differ account key;
- different IP/same account differs network key and shares account key;
- login limits are network `30/900` and email `5/900`;
- registration limits are network `10/3600` and email `5/3600`;
- reset consumption is network `10/3600` and token `5/3600`;
- no raw identity appears in keys.

- [ ] **Step 2: Verify RED**

Run:

```powershell
corepack.cmd pnpm --filter @wizards/web exec node --import tsx --test src/lib/auth/request-rate-limits.test.ts
```

Expected: module missing.

- [ ] **Step 3: Implement focused auth limiter module**

Use injected `checkRateLimit` and Redis. Retain existing cooldown and subject
limits. Fail closed. Log action label only, never identity material.

- [ ] **Step 4: Verify GREEN**

Run Task 3 command. Expected: all tests pass.

- [ ] **Step 5: Integrate server actions**

Replace `getRequestIpAddress`. Read headers once. Use central trusted IP for
Turnstile optional `remoteip`. Call focused independent limiter functions from
register, login, forgot-password, reset-password, verification resend/send.

- [ ] **Step 6: Run web auth regressions**

Run password-reset, email-verification, Turnstile, login-proof, two-factor, and
new request-rate-limit tests.

### Task 4: OTA and analytics consumers

**Files:**

- Modify: `apps/web/src/app/api/v1/app/updates/manifest/route-logic.ts`
- Modify: `apps/web/src/app/api/v1/app/updates/manifest/route-logic.test.ts`
- Modify: `apps/web/src/lib/analytics/client-info.ts`
- Modify: `apps/web/src/lib/analytics/client-info.test.ts`

**Interfaces:**

- Consumes: Task 1 identity functions.
- OTA produces independent network and installation/recipient limiter calls.
- Analytics hashes only trusted normalized IP.

- [ ] **Step 1: Write failing OTA tests**

Assert:

- spoofed `X-Forwarded-For` and `CF-Connecting-IP` do not alter keys;
- different `User-Agent` values produce identical keys;
- same IP/different installation shares network key, differs recipient key;
- different IP/same installation differs network key, shares recipient key;
- successful signed manifest and `204` flows remain.

- [ ] **Step 2: Verify OTA RED**

Run:

```powershell
corepack.cmd pnpm --filter @wizards/web exec node --import tsx --test src/app/api/v1/app/updates/manifest/route-logic.test.ts
```

- [ ] **Step 3: Implement OTA layered keys**

Parse validated Expo headers before limiting. Choose subject in order:
installation ID, current update ID, channel/platform/runtime tuple. Apply both
keys with existing action configuration. Remove local hashing and all
`User-Agent`/spoofable-header use.

- [ ] **Step 4: Verify OTA GREEN**

Run Task 4 OTA command.

- [ ] **Step 5: Write failing analytics trusted-IP test**

Provide conflicting headers. Assert `ipHash` derives from canonical
`X-Real-IP`, not Cloudflare or forwarded headers.

- [ ] **Step 6: Verify analytics RED**

Run:

```powershell
corepack.cmd pnpm --filter @wizards/web exec node --import tsx --test src/lib/analytics/client-info.test.ts
```

- [ ] **Step 7: Implement analytics consumer and verify GREEN**

Replace local forwarded-IP extraction with `getTrustedClientIp`. Keep
`User-Agent` strictly for analytics fields.

### Task 5: Full verification and graph refresh

**Files:**

- All task files.
- Generated Graphify files changed by `graphify update .`.

**Interfaces:**

- Verifies complete implementation; produces no new runtime interface.

- [ ] **Step 1: Run focused route/unit suite**

Run all changed tests plus relevant existing mobile auth, two-factor,
password-reset, email-verification, and Turnstile tests. Record exact counts.

- [ ] **Step 2: Run web typecheck**

```powershell
corepack.cmd pnpm --filter @wizards/web typecheck
```

- [ ] **Step 3: Run web lint**

```powershell
corepack.cmd pnpm --filter @wizards/web lint
```

- [ ] **Step 4: Run whitespace validation**

```powershell
git diff --check
```

- [ ] **Step 5: Refresh Graphify**

```powershell
graphify update .
```

- [ ] **Step 6: Re-run scoped tests and diff check after graph refresh**

Confirm generated graph update did not change runtime results.

- [ ] **Step 7: Audit final scope**

Run `git status --short`, scoped `git diff --stat`, and scoped diffs. Separate
pre-existing WIP, task changes, Graphify output, local checks, live Railway
validation, deployment, and remote CI.
