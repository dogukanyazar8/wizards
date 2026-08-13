# Profile and Presence Visibility Phase 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce profile and presence visibility centrally and expose the same real controls in web/Tauri and mobile settings.

**Architecture:** A single batch-aware visibility policy service resolves settings plus viewer/subject relationships. All profile and presence serializers consume its decisions; clients only edit server-backed preferences.

**Tech Stack:** TypeScript, Next.js route handlers, Prisma, Socket.IO, Redis, React Query, React Native, Node test runner.

## Global Constraints

- Preserve unrelated dirty WIP; no reset, stash, cleanup, broad stage, commit, push, migration apply, or deploy.
- `EVERYONE | FRIENDS | NOBODY` values and Faz 1 API contracts remain unchanged.
- Block and `INVISIBLE` outrank visibility preferences.
- No row-by-row DB reads in list/search/socket hot paths.
- Web change is also Tauri desktop UI; mobile uses native `OptionSheet`.
- Every production behavior starts with a failing test and observed RED result.

---

### Task 1: Central visibility policy

**Files:**

- Create: `apps/web/src/lib/privacy/visibility-policy.ts`
- Test: `apps/web/src/lib/privacy/visibility-policy.test.ts`

**Interfaces:**

- Produces: `evaluateVisibilityPolicy(input): VisibilityDecision`.
- Produces: `resolveVisibilityDecisions(viewerId, subjectIds): Promise<Map<string, VisibilityDecision>>`.
- Produces: `profileVisibilityWhereForViewer(viewerId): Prisma.UserWhereInput`.
- Produces: `redactPresenceForViewer(input): RedactedPresence`.

- [ ] **Step 1: Write failing policy tests** covering self, default/everyone, accepted friend, nobody, two-way block, invisible and denied redaction.
- [ ] **Step 2: Run `pnpm.cmd --filter @wizards/web exec tsx --test src/lib/privacy/visibility-policy.test.ts` and observe expected missing-module/API failure.**
- [ ] **Step 3: Implement pure predicates, batch DB resolver, DB where builder and redactor.**
- [ ] **Step 4: Re-run focused policy tests and observe PASS.**

### Task 2: Profile, search and suggestion enforcement

**Files:**

- Modify: `apps/web/src/app/api/v1/users/[userId]/profile/route.ts`
- Modify: `apps/web/src/lib/social/mobile-user-profile-service.ts`
- Modify: `apps/web/src/lib/friends/service.ts`
- Modify: `apps/web/src/lib/mobile/social-enrichment.ts`
- Test: focused route/service/search/suggestion tests beside existing modules.

**Interfaces:**

- Consumes: `VisibilityDecision`, `profileVisibilityWhereForViewer`.
- Produces: no response schema widening; hidden profiles return/filter as defined by design.

- [ ] **Step 1: Add failing tests proving hidden/block profiles return no rich payload and hidden candidates never enter search/suggestions.**
- [ ] **Step 2: Run focused tests and observe policy leaks as RED.**
- [ ] **Step 3: Apply central decision to both profile routes/services and DB where to search/suggestions.**
- [ ] **Step 4: Re-run focused tests and observe PASS.**

### Task 3: Presence read and realtime enforcement

**Files:**

- Modify: `apps/web/src/lib/friends/service.ts`
- Modify: `apps/web/src/lib/friends/queries.ts`
- Modify: `apps/web/src/lib/dm/service.ts`
- Modify: `apps/web/src/lib/workspace/server-query-helpers.ts`
- Modify: `apps/web/src/lib/workspace/server-service.ts`
- Modify: `apps/web/src/lib/mobile/social-enrichment.ts`
- Modify: `apps/web/src/lib/social/mobile-user-profile-service.ts`
- Modify: `apps/web/src/app/api/v1/users/me/settings/route-logic.ts`
- Test: focused friends, DM, server, profile, socket and settings tests.

**Interfaces:**

- Consumes: batch visibility decisions and `redactPresenceForViewer`.
- Produces: unauthorized presence always serializes as `OFFLINE`, `customStatus=null`, `lastSeenAt=null`; activity metadata is null.

- [ ] **Step 1: Add failing serializer/fan-out tests for nobody, friends, everyone, block and invisible.**
- [ ] **Step 2: Run focused tests and observe leaked presence/audience as RED.**
- [ ] **Step 3: Batch-redact friends, DM and server member payloads; filter mobile activity/profile presence.**
- [ ] **Step 4: Make socket fan-out preference-aware, exclude blocked user rooms and rebroadcast after preference change.**
- [ ] **Step 5: Re-run focused tests and observe PASS.**

### Task 4: Web/Tauri settings controls

**Files:**

- Modify: `apps/web/src/components/settings/account-settings-surface.ts`
- Modify: `apps/web/src/components/settings/account-settings-surface.test.ts`
- Modify: `apps/web/src/components/settings/settings-panel.tsx`
- Modify: `apps/web/src/lib/locale/messages/en.ts`
- Modify: `apps/web/src/lib/locale/messages/tr.ts`

**Interfaces:**

- Consumes: existing `UserLayoutSettings` and PATCH mutation.
- Produces: two production select rows and accessible mutation error feedback.

- [ ] **Step 1: Change surface/component tests to require profile and presence controls; run and observe RED.**
- [ ] **Step 2: Add the controls, localized descriptions, pending state and rollback error feedback.**
- [ ] **Step 3: Run focused web settings tests and observe PASS.**

### Task 5: Mobile settings controls and legacy cleanup

**Files:**

- Create: `apps/mobile/src/account/mobile-account-preferences-query.ts`
- Modify: `apps/mobile/src/account/mobile-account-preferences-client.ts`
- Modify: `apps/mobile/src/account/mobile-account-settings-client.ts`
- Modify: `apps/mobile/src/app/screens/mobile-account-settings-screen.tsx`
- Modify: `apps/mobile/src/locale/mobile-copy.ts`
- Modify: mobile client/component tests.

**Interfaces:**

- Consumes: `/api/v1/mobile/account/preferences` GET/PATCH.
- Produces: `useMobileAccountPreferencesQuery`, `useMobileAccountPreferencesMutation`, successful-read legacy cleanup.

- [ ] **Step 1: Add failing client tests for remove-on-success/no-remove-on-failure and component tests for both server-backed sheets.**
- [ ] **Step 2: Run focused mobile tests and observe RED.**
- [ ] **Step 3: Implement query/mutation hooks, cleanup and OptionSheet rows.**
- [ ] **Step 4: Re-run focused mobile tests and observe PASS.**

### Task 6: Verification and graph refresh

**Files:**

- Update generated graph artifacts through `graphify update .` only after source edits.

- [ ] **Step 1: Run all focused Phase 3 tests.**
- [ ] **Step 2: Run web and mobile typechecks.**
- [ ] **Step 3: Run Phase 1–2 adjacent contract tests to detect regressions.**
- [ ] **Step 4: Run direct Graphify interpreter `-m graphify update .`.**
- [ ] **Step 5: Report PASS/FAIL/NOT RUN/ENV BLOCKED separately; do not claim runtime/device/deploy evidence not observed.**
