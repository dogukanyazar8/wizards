# Account Data Export and Deletion Phase 5 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship bounded account-data export and secure account deletion on web, Tauri desktop, iOS, and Android.

**Architecture:** Server streams existing schema-version-2 JSON with bounded cursor pages. Shared preflight/reauth contracts drive platform-native web and mobile flows; mobile persists only download lifecycle state and retries interrupted work.

**Tech Stack:** Next.js Route Handlers, Prisma, Zod, React Query, React/React Native, Expo FileSystem, AsyncStorage, Node test runner, Jest.

## Global Constraints

- Preserve existing public API behavior unless this plan explicitly extends it.
- No migration, dependency addition, commit, stage, push, deploy, reset, stash, clean, or unrelated refactor.
- Every production behavior starts with a failing focused test.
- TR/EN, accessibility, loading/error/offline/destructive states required.
- Tauri uses web UI; runtime evidence remains separate.

---

### Task 1: Shared contracts and delete preflight

**Files:**

- Create: `packages/types/src/account-privacy.ts`
- Create: `packages/types/src/account-privacy.test.ts`
- Modify: `packages/types/src/index.ts`
- Create: `apps/web/src/app/api/v1/users/me/deletion/route.ts`
- Create: `apps/web/src/app/api/v1/users/me/deletion/route-logic.ts`
- Create: `apps/web/src/app/api/v1/users/me/deletion/route-logic.test.ts`

**Interfaces:**

- Produces `AccountDeletionPreflightSchema`, `AccountDeletionRequestSchema`, `AccountDeletionReauthMethodSchema`.
- Produces `getAccountDeletionPreflight(userId)` and route GET.

- [ ] Write contract and route-logic tests for strict parsing, password/email selection, owned-server blocker, same-user-only lookup.
- [ ] Run focused tests; verify missing exports/functions fail.
- [ ] Add schemas and preflight query with bounded owned-server fields.
- [ ] Run focused tests; verify pass.

### Task 2: Bounded JSON export stream

**Files:**

- Create: `apps/web/src/lib/account/account-data-export-stream.ts`
- Create: `apps/web/src/lib/account/account-data-export-stream.test.ts`
- Modify: `apps/web/src/app/api/v1/users/me/data-export/route.ts`
- Create: `apps/web/src/app/api/v1/users/me/data-export/route.test.ts`

**Interfaces:**

- Produces `createAccountDataExportStream(userId, options?)` and `ACCOUNT_DATA_EXPORT_PAGE_SIZE`.
- Route consumes stream and emits private no-store attachment.

- [ ] Write tests proving page size bound, stable cursor order, BigInt serialization, schema shape, abort behavior, safe headers and filename.
- [ ] Run focused tests; verify missing stream fails.
- [ ] Implement JSON writer and per-section cursor reads without whole-document buffering.
- [ ] Switch route to stream after preflight user lookup.
- [ ] Run focused tests; verify pass and existing privacy-service tests remain green.

### Task 3: Reauth transport and deletion execution contracts

**Files:**

- Modify: `apps/web/src/app/api/v1/users/me/route.ts`
- Modify: `apps/web/src/lib/auth/reauth-email.ts`
- Modify: `apps/web/src/lib/auth/reauth-email.test.ts`
- Modify: `apps/mobile/src/deep-link/mobile-deep-links.ts`
- Modify: `apps/mobile/scripts/mobile-deep-link-contract.test.ts`

**Interfaces:**

- Email challenge accepts platform `WEB | MOBILE`.
- Produces mobile intent `{ type: "account-delete-reauth", token }`.

- [ ] Write failing tests for shared strict deletion schema, mobile reauth URL, parser token validation, sensitive query rejection.
- [ ] Run tests; verify expected failures.
- [ ] Implement platform-bound email URL builder and special mobile auth intent.
- [ ] Run focused auth/deep-link tests; verify pass.

### Task 4: Web and Tauri account privacy UI

**Files:**

- Create: `apps/web/src/lib/account/privacy-client.ts`
- Create: `apps/web/src/lib/account/privacy-client.test.ts`
- Create: `apps/web/src/components/settings/account-data-controls.tsx`
- Create: `apps/web/src/components/settings/account-data-controls.test.tsx`
- Modify: `apps/web/src/components/settings/settings-panel.tsx`
- Modify: `apps/web/src/components/settings/account-settings-surface.ts`
- Modify: `apps/web/src/lib/locale/messages/en.ts`
- Modify: `apps/web/src/lib/locale/messages/tr.ts`
- Create: `apps/web/src/app/settings/reauth/[token]/reauth-confirmation.tsx`
- Modify: `apps/web/src/app/settings/reauth/[token]/page.tsx`

**Interfaces:**

- Produces `AccountDataControls` with export and deletion flow.
- Client exposes preflight, password/email reauth, export download, delete.

- [ ] Write failing client/component tests for all states, exact phrase, blockers, double submit, token cleanup and signout callback.
- [ ] Run focused tests; verify expected failures.
- [ ] Implement client and focused component; mount from settings panel.
- [ ] Add TR/EN copy and dedicated reauth confirmation page.
- [ ] Run focused tests and web typecheck.

### Task 5: Mobile download lifecycle and API client

**Files:**

- Create: `apps/mobile/src/account/mobile-account-privacy-client.ts`
- Create: `apps/mobile/src/account/mobile-account-export-state.ts`
- Create: `apps/mobile/scripts/mobile-account-privacy-client.test.ts`
- Create: `apps/mobile/scripts/mobile-account-export-state.test.ts`
- Modify: `apps/mobile/src/api/mobile-api-client.ts`
- Modify: `apps/mobile/src/api/mobile-api-client.test.ts`

**Interfaces:**

- Mobile API client adds authenticated `requestFile` without weakening `requestJson`.
- Export state supports `idle | downloading | ready | interrupted | error` and account-scoped persistence.

- [ ] Write failing tests for authenticated file response, timeout/error mapping, state restore and interrupted transition.
- [ ] Run focused tests; verify failures.
- [ ] Implement raw file request and state repository using injected storage/FileSystem boundaries.
- [ ] Run focused tests; verify pass.

### Task 6: Mobile Data and Account screen

**Files:**

- Create: `apps/mobile/src/app/screens/mobile-data-account-settings-screen.tsx`
- Create: `apps/mobile/src/app/screens/mobile-data-account-settings-screen.styles.ts`
- Create: `apps/mobile/component-tests/mobile-data-account-settings-screen.test.tsx`
- Modify: `apps/mobile/src/app/screens/settings-screen.tsx`
- Modify: `apps/mobile/src/navigation/mobile-navigation-types.ts`
- Modify: `apps/mobile/src/navigation/mobile-navigator.tsx`
- Modify: `apps/mobile/src/navigation/mobile-linking.ts`
- Modify: `apps/mobile/src/app/providers/mobile-deep-link-provider.tsx`
- Modify: `apps/mobile/src/locale/mobile-copy.ts`

**Interfaces:**

- Full screen handles export/share, preflight, password/email reauth, exact confirmation, final confirmation and signout.
- Deep-link provider routes confirmed email token to active deletion screen.

- [ ] Write failing component/navigation tests for download/share/reopen, offline/error, blockers, keyboard/safe-area, deep-link reauth and successful signout.
- [ ] Run focused tests; verify failures.
- [ ] Implement screen, styles, navigation and deep-link handoff using existing kit components.
- [ ] Add TR/EN copy.
- [ ] Run mobile script/component tests and typecheck.

### Task 7: Integrated verification

**Files:**

- Modify only failures directly caused by Tasks 1-6.

- [x] Run all focused Phase 5 tests.
- [x] Run package type checks for types, web, mobile.
- [x] Run relevant web and mobile broader suites.
- [x] Run formatting/lint gates appropriate to changed files.
- [x] Run `graphify update .`.
- [x] Report PASS, FAIL, NOT RUN, ENV BLOCKED separately; report Tauri/device/visual/UAT separately.
