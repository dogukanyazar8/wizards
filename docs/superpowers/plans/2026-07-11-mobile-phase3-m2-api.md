# Mobile Phase 3 M2 API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add bearer-authenticated mobile social and account endpoints by wrapping existing server services without changing web behavior.

**Architecture:** Shared zod contracts live in `@wizards/types`; each domain has dependency-injected route logic and thin Next.js routes. Business logic and authorization stay in existing friend, account, 2FA, Giphy, and DM services.

**Tech Stack:** TypeScript, Next.js App Router, zod, Prisma services, Redis rate limits, Node test runner, pnpm.

## Global Constraints

- Work directly on `uat`; create no branch, worktree, or extra milestone commit.
- M2 is JavaScript-only: no native dependency and no Android build.
- Do not modify mobile auth lockout or web-visible behavior.
- Never log Giphy keys, 2FA setup secrets, recovery codes, passwords, or bearer tokens.
- Keep `graphify-out`, `artifacts`, `.env.maestro`, and tsbuildinfo outside the M2 stage.
- Preserve `docs/superpowers/plans/2026-07-11-observability-stack.md` unchanged.

---

### Task 1: Shared mobile social/account schemas

**Files:**
- Create: `packages/types/src/mobile-social.ts`
- Create: `packages/types/src/mobile-social.test.ts`
- Modify: `packages/types/src/index.ts`

**Interfaces:**
- Produces strict request/response schemas for friends, presence, profile, 2FA, Giphy, and DM details.

- [x] Write schema tests that accept bounded valid fixtures and reject unknown keys, invalid enums,
  oversized identifiers, email/password fields in profile patches, malformed recovery codes, and
  non-HTTPS Giphy URLs.
- [x] Run `corepack pnpm --filter @wizards/types test -- mobile-social.test.ts` and verify RED because
  `mobile-social` exports do not exist.
- [x] Add the strict schemas and inferred TypeScript types, then export them from `index.ts`.
- [x] Re-run the focused types test and `corepack pnpm --filter @wizards/types typecheck`; expect PASS.

### Task 2: Friends mobile routes

**Files:**
- Create: `apps/web/src/app/api/v1/mobile/friends/route-logic.ts`
- Create: `apps/web/src/app/api/v1/mobile/friends/route-logic.test.ts`
- Create thin routes under `apps/web/src/app/api/v1/mobile/friends/**/route.ts`
- Modify: `apps/web/src/lib/api-rate-limit.ts`
- Modify: `apps/web/src/app/api/v1/route-contract.test.ts`

**Interfaces:**
- Consumes existing `listFriends`, `listPendingFriendRequests`, `listBlockedUsers`,
  `sendFriendRequest`, `actOnFriendRequest`, `removeFriend`, `blockUser`, and `unblockUser`.
- Produces list/request/accept/reject/remove/block/unblock mobile handlers.

- [x] Write dependency-injected route tests covering authentication, named rate limits, strict body
  and params parsing, each service call, output parsing, and bounded error mapping.
- [x] Run the focused route test and verify RED because handlers are missing.
- [x] Implement minimal route logic and thin route exports; accept maps to `ACCEPTED`, reject maps to
  `DECLINED`, and GET composes friends/pending/blocked concurrently.
- [x] Add explicit API rate-limit actions and route-contract expectations.
- [x] Run focused route, friends-service, and route-contract tests; expect PASS.

### Task 3: Profile and presence services/routes

**Files:**
- Create: `apps/web/src/lib/account/service.ts`
- Create: `apps/web/src/lib/account/service.test.ts`
- Modify: `apps/web/src/lib/account/actions.ts`
- Create: `apps/web/src/app/api/v1/mobile/account/profile/route-logic.ts`
- Create: `apps/web/src/app/api/v1/mobile/account/profile/route-logic.test.ts`
- Create: `apps/web/src/app/api/v1/mobile/account/profile/route.ts`
- Create: `apps/web/src/app/api/v1/mobile/account/presence/route-logic.ts`
- Create: `apps/web/src/app/api/v1/mobile/account/presence/route-logic.test.ts`
- Create: `apps/web/src/app/api/v1/mobile/account/presence/route.ts`

**Interfaces:**
- Produces `updateAccountProfile(userId, input)` and `updateAccountPresence(userId, status)` shared
  services used by both web actions and mobile routes.

- [x] Write service tests for uniqueness conflicts, trimmed nullable display names, persistence,
  presence persistence, and profile/presence broadcasts.
- [x] Verify the tests RED before extracting the shared implementation from server actions.
- [x] Refactor web actions to authenticate/translate field errors while delegating persistence and
  broadcasts to the shared service; keep current action result shapes unchanged.
- [x] Write RED mobile route tests for bearer auth, strict schemas, rate limits, conflicts, and
  response validation; implement the two route-logic modules and thin routes.
- [x] Run account action/service/route tests plus web typecheck; expect PASS.

### Task 4: Two-factor mobile routes

**Files:**
- Create: `apps/web/src/app/api/v1/mobile/account/two-factor/route-logic.ts`
- Create: `apps/web/src/app/api/v1/mobile/account/two-factor/route-logic.test.ts`
- Create thin setup, confirm, and delete route files under that directory.

**Interfaces:**
- Consumes existing `startTwoFactorSetup`, `confirmTwoFactorSetup`, and `disableTwoFactor`.
- Produces setup/confirm/disable handlers with existing reauthentication semantics.

- [x] Write RED tests for auth/rate-limit order, setup output, invalid confirmation, recovery-code
  output, password+code disable input, rate-limited failures, and bounded error codes.
- [x] Implement handlers without logging result bodies; validate every success response through
  shared schemas.
- [x] Run focused route tests and `apps/web/src/lib/auth/two-factor.test.ts`; expect PASS.

### Task 5: Giphy mobile proxy

**Files:**
- Create: `apps/web/src/app/api/v1/mobile/giphy/search/route-logic.ts`
- Create: `apps/web/src/app/api/v1/mobile/giphy/search/route-logic.test.ts`
- Create: `apps/web/src/app/api/v1/mobile/giphy/search/route.ts`

**Interfaces:**
- Consumes `GiphySearchQuerySchema` and `listGiphyGifs`; never receives or returns the API key.

- [x] Write RED tests for auth, route rate limit, bounded query parsing, locale/country forwarding,
  response parsing, rate-limit failure, and upstream failure without body leakage.
- [x] Implement the thin proxy and validate output through the shared mobile Giphy schema.
- [x] Run focused route and Giphy service tests; expect PASS.

### Task 6: Cursor-bounded DM details route

**Files:**
- Create: `apps/web/src/lib/dm/mobile-details-service.ts`
- Create: `apps/web/src/lib/dm/mobile-details-service.test.ts`
- Create: `apps/web/src/app/api/v1/mobile/dm/[conversationId]/details/route-logic.ts`
- Create: `apps/web/src/app/api/v1/mobile/dm/[conversationId]/details/route-logic.test.ts`
- Create: `apps/web/src/app/api/v1/mobile/dm/[conversationId]/details/route.ts`

**Interfaces:**
- Consumes participant authorization, conversation DTO, mutual servers, bounded DM messages, and
  `getDmSharedAttachmentSummary`.
- Produces participant, mutualServers, sharedAttachments, and nextCursor.

- [x] Write RED service tests proving requester membership is required, target participant is
  derived from the authorized conversation, attachments are visibility-filtered/bounded, and the
  cursor is forwarded without N+1 queries.
- [x] Implement the service by composing existing DM functions, not direct unguarded queries.
- [x] Write RED route tests for auth, params/query validation, named rate limit, service call, and
  response validation; implement route logic and thin route.
- [x] Run focused DM detail, DM service, attachment-detail, and route tests; expect PASS.

### Task 7: M2 verification and milestone

**Files:**
- Update: `docs/superpowers/plans/2026-07-11-mobile-phase3-m2-api.md`
- Keep generated/runtime files unstaged.

- [x] Run `corepack pnpm --filter @wizards/types typecheck` and its full tests.
- [x] Run `corepack pnpm --filter @wizards/web typecheck` and the full web test suite.
- [x] Run mobile contract tests, mobile component tests, and `quality:check` to prove shared contracts
  did not regress the client.
- [x] Run `corepack pnpm audit --prod`, `git diff --check`, and staged credential scans.
- [x] Review the exact M2 diff, update every checkbox, stage only M2 sources/docs, commit once as
  `feat(mobile-api): add social and account endpoints`, push `uat`, and verify the remote hash.
