# Account Preferences Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add server-backed account preference contracts and APIs, then deliver production web/mobile settings shells without exposing behavior that Phase 1 does not enforce.

**Architecture:** Extend the existing one-to-one `UserSettings` aggregate with additive typed fields. Put cross-platform wire contracts in `@wizards/types`; keep web and mobile authentication adapters separate. Web extends its existing settings endpoint, mobile gets a narrow endpoint to preserve the shipped strict account-settings response. Existing functional settings remain visible; preview/local-only rows are removed until their behavior phases.

**Tech Stack:** Prisma 7.9.1, PostgreSQL, Zod 4.4.3, Next.js 16 route handlers, React 19, React Native/Expo 57, TanStack Query 5, Node test runner, Jest.

## Global Constraints

- Preserve all unrelated dirty WIP; no reset, clean, stash, broad staging, commit, push, deployment, or live migration.
- Migration lives in `packages/db/prisma/rebaseline-migrations`; implementation timestamp must sort after `20260812203000_denetim_indeksleri`.
- No new dependency, table, index, cache, or generic repository layer.
- DB `timeZone = null`; API `timeZone = "AUTO"`.
- Existing `/api/v1/mobile/account/settings` request/response shape remains byte-contract compatible for strict old clients.
- Phase 1 does not enforce profile/presence visibility or apply timezone/date/time/density behavior.
- Preview/local-only rows for these future behaviors are not shown.
- Web/mobile functional, visual, accessibility, and UAT evidence remain separate.
- Desktop inherits the web surface; native Tauri runtime is a separate acceptance boundary.

---

### Task 1: Shared preference contracts

**Files:**

- Create: `packages/types/src/account-preferences.ts`
- Create: `packages/types/src/account-preferences.test.ts`
- Modify: `packages/types/src/index.ts`

**Interfaces:**

- Produces: `ProfileVisibilitySchema`, `PresenceVisibilitySchema`, `TimeZonePreferenceSchema`, `UserDateFormatSchema`, `UserTimeFormatSchema`, `InterfaceDensitySchema`, `AccountPreferencesSchema`, `AccountPreferencesPatchSchema`, `ACCOUNT_PREFERENCES_DEFAULT`, and inferred types.
- `AccountPreferencesPatchSchema` is strict and rejects an empty object. Web reuses its field schemas without adopting that endpoint-specific refinement.

- [ ] **Step 1: Write failing contract tests**

Cover defaults, all enum members, `AUTO`, IANA candidates, unknown fields, empty patch, and 65-character timezone rejection.

```ts
assert.deepEqual(AccountPreferencesSchema.parse({}), ACCOUNT_PREFERENCES_DEFAULT);
assert.equal(AccountPreferencesPatchSchema.safeParse({}).success, false);
assert.equal(
  AccountPreferencesPatchSchema.safeParse({ profileVisibility: "FRIENDS" }).success,
  true,
);
assert.equal(AccountPreferencesPatchSchema.safeParse({ unknown: true }).success, false);
```

- [ ] **Step 2: Run test; verify RED**

Run: `pnpm.cmd --filter @wizards/types exec node --import tsx --test src/account-preferences.test.ts`

Expected: FAIL because `account-preferences.ts` does not exist.

- [ ] **Step 3: Implement minimal schemas and exports**

Use exact values from the approved spec. `TimeZonePreferenceSchema` accepts `AUTO` or trimmed 1–64 character strings; semantic IANA validation stays server-side.

- [ ] **Step 4: Run test; verify GREEN**

Run the Step 2 command. Expected: PASS.

### Task 2: Prisma schema and additive migration

**Files:**

- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/db/prisma/rebaseline-migrations/20260813100000_user_account_preferences/migration.sql`
- Create: `packages/db/prisma/schema-user-account-preferences.test.mjs`

**Interfaces:**

- Produces Prisma enums: `ProfileVisibility`, `PresenceVisibility`, `UserDateFormat`, `UserTimeFormat`, `InterfaceDensity`.
- Extends `UserSettings` with the six approved fields.

- [ ] **Step 1: Write failing schema/migration test**

Test exact enum members, field types/defaults/nullability, absence of new `@@index`, migration location, enum SQL, and six `ADD COLUMN` clauses.

```js
assert.match(userSettings, /profileVisibility\s+ProfileVisibility\s+@default\(EVERYONE\)/);
assert.match(userSettings, /timeZone\s+String\?/);
assert.match(sql, /ADD COLUMN "timeZone" TEXT/);
```

- [ ] **Step 2: Run test; verify RED**

Run: `node --test packages/db/prisma/schema-user-account-preferences.test.mjs`

Expected: FAIL because enum/fields/migration are absent.

- [ ] **Step 3: Add schema and migration**

SQL creates five enums, then adds five `NOT NULL DEFAULT` columns and nullable `timeZone`. No data update and no index.

- [ ] **Step 4: Generate Prisma client and run tests**

Run:

```powershell
pnpm.cmd --filter @wizards/db db:generate
node --test packages/db/prisma/schema-user-account-preferences.test.mjs
```

Expected: generate PASS; test PASS.

### Task 3: Web settings GET/PATCH

**Files:**

- Create: `apps/web/src/app/api/v1/users/me/settings/route-logic.ts`
- Create: `apps/web/src/app/api/v1/users/me/settings/route-logic.test.ts`
- Modify: `apps/web/src/app/api/v1/users/me/settings/route.ts`
- Modify: `apps/web/src/lib/settings/client.ts`

**Interfaces:**

- Produces: `UserSettingsResponse = ExistingSettingsFields & AccountPreferences`.
- Keeps compatibility alias: `export type UserLayoutSettings = UserSettingsResponse`.
- Produces: `normalizeTimeZonePreference(value): string | null` and `serializeTimeZonePreference(value): "AUTO" | string`.
- Route-logic dependencies isolate authentication, rate limiting, reads, and transactional writes; route file supplies production Prisma adapters.

- [ ] **Step 1: Write failing route-logic tests**

Cover GET mapping, DB null to `AUTO`, each preference patch, omitted-field preservation, canonical `Europe/Istanbul`, `AUTO` to null, invalid IANA 400, existing settings fields, auth failure, and rate-limit failure.

```ts
const response = await settingsPatchRoute(request({ timeZone: "AUTO" }), dependencies);
assert.equal(response.status, 200);
assert.deepEqual(writes[0], { timeZone: null });
```

- [ ] **Step 2: Run test; verify RED**

Run: `pnpm.cmd --filter @wizards/web exec tsx --test src/app/api/v1/users/me/settings/route-logic.test.ts`

Expected: FAIL because route logic exports are absent.

- [ ] **Step 3: Extract route logic and add preferences**

Preserve existing response names, clamping, notification upsert, transaction behavior, `settings:update`, and unknown/empty body behavior. Validate IANA only when `timeZone` is present. Do not call `Intl.DateTimeFormat` on GET hot path.

- [ ] **Step 4: Update web client types**

`fetchLayoutSettings` and `patchLayoutSettings` use `UserSettingsResponse`; keep query keys unchanged. Route keeps `UserLayoutSettings` alias so the Phase 1 UI edit does not require an unrelated type migration.

- [ ] **Step 5: Run targeted tests and typecheck**

```powershell
pnpm.cmd --filter @wizards/web exec tsx --test src/app/api/v1/users/me/settings/route-logic.test.ts
pnpm.cmd --filter @wizards/web typecheck
```

Expected: PASS.

### Task 4: Mobile preferences API and dormant client

**Files:**

- Create: `apps/web/src/app/api/v1/mobile/account/preferences/route.ts`
- Create: `apps/web/src/app/api/v1/mobile/account/preferences/route-logic.ts`
- Create: `apps/web/src/app/api/v1/mobile/account/preferences/route-logic.test.ts`
- Create: `apps/mobile/src/account/mobile-account-preferences-client.ts`
- Create: `apps/mobile/scripts/mobile-account-preferences-client.test.ts`

**Interfaces:**

- GET returns `AccountPreferences` with no-store headers.
- PATCH accepts `AccountPreferencesPatch`, returns full `AccountPreferences`.
- Uses `requireMobileApiUserId` and existing `mobile:account:settings` rate-limit action.
- Mobile client exports `fetchMobileAccountPreferences` and `updateMobileAccountPreferences` only; Phase 1 UI does not call them.

- [ ] **Step 1: Write failing mobile route tests**

Cover auth/rate limit, GET mapping, PATCH full response, `AUTO` mapping, invalid input 400, and no-store on success/error.

- [ ] **Step 2: Write failing mobile client tests**

Assert exact URL, method/body, response schema parsing, empty patch rejection, and server error propagation.

- [ ] **Step 3: Run tests; verify RED**

```powershell
pnpm.cmd --filter @wizards/web exec tsx --test src/app/api/v1/mobile/account/preferences/route-logic.test.ts
pnpm.cmd --filter @wizards/mobile exec node --import tsx --test scripts/mobile-account-preferences-client.test.ts
```

- [ ] **Step 4: Implement route adapter and client**

Follow existing mobile account settings route's dependency-injected handler and `withNoStore` pattern. Reuse the web timezone normalizer from a framework-neutral settings module; do not import a Next route module from mobile route logic.

- [ ] **Step 5: Run tests; verify GREEN**

Run Step 3 commands. Expected: PASS.

### Task 5: Export schema evolution

**Files:**

- Modify: `apps/web/src/lib/account/privacy-service.ts`
- Modify: `apps/web/src/lib/account/privacy-service.test.ts`

**Interfaces:**

- Produces: account export `schemaVersion: 2`.
- `preferences.settings` already contains the complete Prisma `UserSettings` row.

- [ ] **Step 1: Write failing export test**

Serialize a version-2 payload containing all six preference values and assert exact JSON fields.

- [ ] **Step 2: Run test; verify RED**

Run: `pnpm.cmd --filter @wizards/web exec tsx --test src/lib/account/privacy-service.test.ts`

Expected: FAIL while service still emits schema version 1 or the fixture lacks the new contract.

- [ ] **Step 3: Bump schema version and preserve deletion behavior**

Change only export version/characterization. Keep `userSettings.deleteMany` unchanged.

- [ ] **Step 4: Run test; verify GREEN**

Run Step 2 command. Expected: PASS.

### Task 6: Production web/mobile settings shells

**Files:**

- Create: `apps/web/src/components/settings/settings-preview-contract.test.ts`
- Modify: `apps/web/src/components/settings/settings-panel.tsx`
- Modify: `apps/mobile/src/app/screens/mobile-account-settings-screen.tsx`
- Modify: `apps/mobile/component-tests/mobile-account-settings-redesign.test.tsx`
- Modify: `apps/mobile/component-tests/mobile-account-settings-screen-integration.test.tsx`

**Interfaces:**

- Web retains functional email/2FA/recovery, DM/friend-request, language, profile, appearance, notification, voice, desktop and about controls.
- Web removes preview-only sessions, export, profile visibility, online visibility, timezone, date-format, and density rows.
- Mobile retains server-backed DM/friend/group privacy controls and account editing.
- Mobile removes local-only profile/presence visibility rows, sheets, AsyncStorage reads/writes, and related view props. Legacy key cleanup waits for Phase 3.

- [ ] **Step 1: Write failing web preview contract test**

Read `settings-panel.tsx`; assert preview-only translation keys and `preview` prop uses are absent while real account controls remain.

- [ ] **Step 2: Update mobile component tests first**

Assert profile/presence rows and policy options are absent; keep Prisma privacy policy coverage, loading/error, account editing, clipboard and mutation rollback coverage.

- [ ] **Step 3: Run tests; verify RED**

```powershell
pnpm.cmd --filter @wizards/web exec tsx --test src/components/settings/settings-preview-contract.test.ts
pnpm.cmd --filter @wizards/mobile exec jest component-tests/mobile-account-settings-redesign.test.tsx component-tests/mobile-account-settings-screen-integration.test.tsx --runInBand
```

- [ ] **Step 4: Remove web preview rows and dead helpers/imports**

Keep card hierarchy and responsive sidebar. `AccountPreferencesCard` contains only real language navigation. `SecurityCenterCard` contains only real security state/actions.

- [ ] **Step 5: Remove mobile local-only visibility UI and effects**

Remove `AsyncStorage`, local visibility types/state/effect/update function, profile/presence policy branches, two rows, and obsolete props. Do not delete legacy storage helpers from the client in Phase 1; Phase 3 owns explicit cleanup.

- [ ] **Step 6: Run tests; verify GREEN**

Run Step 3 commands. Expected: PASS.

### Task 7: Integrated verification and graph refresh

**Files:**

- Update generated graph artifacts via `graphify update .`

- [ ] **Step 1: Run focused suites**

```powershell
pnpm.cmd --filter @wizards/types test
node --test packages/db/prisma/schema-user-account-preferences.test.mjs
pnpm.cmd --filter @wizards/web exec tsx --test src/app/api/v1/users/me/settings/route-logic.test.ts src/app/api/v1/mobile/account/preferences/route-logic.test.ts src/lib/account/privacy-service.test.ts src/components/settings/settings-preview-contract.test.ts
pnpm.cmd --filter @wizards/mobile exec node --import tsx --test scripts/mobile-account-preferences-client.test.ts
pnpm.cmd --filter @wizards/mobile exec jest component-tests/mobile-account-settings-redesign.test.tsx component-tests/mobile-account-settings-screen-integration.test.tsx --runInBand
```

- [ ] **Step 2: Run type/lint gates**

```powershell
pnpm.cmd --filter @wizards/types typecheck
pnpm.cmd --filter @wizards/db typecheck
pnpm.cmd --filter @wizards/web typecheck
pnpm.cmd --filter @wizards/mobile typecheck
```

Run focused format/lint only after functional tests are green. Do not run destructive DB migration commands.

- [ ] **Step 3: Refresh Graphify**

Run the configured interpreter: `& $pythonPath -m graphify update .`.

- [ ] **Step 4: Report evidence boundaries**

Report `PASS / FAIL / NOT RUN / ENV BLOCKED` separately for source, tests, typecheck, web visual, mobile emulator/device, Tauri runtime, UAT, migration deploy, and remote CI.

No commit step: current worktree contains unrelated user WIP and no commit/push authority was given.
