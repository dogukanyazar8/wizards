# Mobile Phase 4 M3 Management and Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete contextual mobile server administration, channel/category management, cursor-paginated members, existing-role assignment/removal, kick, channel-history clearing, realtime cache scoping, Phase 4 migration notes, and redacted UAT evidence without widening web authorization.

**Architecture:** Typed protected stack screens call focused React Query hooks over the M1 `/api/v1/mobile` adapters and the M2 authenticated client. Server capability fields are presentation hints only; every mutation remains subject to the unchanged shared service authorization and role hierarchy. Destructive actions share one reduced-motion-aware confirmation boundary, while realtime events update the exact affected server scope and only the active member-list scope.

**Tech Stack:** TypeScript, Expo SDK 56, React Native 0.85, React 19, React Navigation 7, TanStack Query 5, FlashList 2, Zod contracts from `@wizards/types`, Jest/RNTL, Node test runner, Maestro 2.6.1, pnpm.

## Global Constraints

- Work directly on `uat`; create no branch and no worktree.
- M3 produces exactly one commit: `feat(mobile): complete phase 4 server management parity`. Do not make task-level commits.
- Before editing mobile code, read the exact Expo SDK 56 documentation at `https://docs.expo.dev/versions/v56.0.0/` as required by `apps/mobile/AGENTS.md`.
- Do not add a native module, run prebuild, or rebuild the Phase 3 development client. Discovery of a required native dependency is a stop condition.
- Do not add server administration to `apps/mobile/src/app/screens/settings-screen.tsx`; it is contextual to the selected server.
- Do not add M3 state or callbacks to `apps/mobile/src/app/mobile-product-app.tsx`; it is already near the `<410` architecture limit.
- Capability flags control action visibility but never authorize a mutation. Never derive authorization from role names, role positions, `isAdmin`, or cached UI state.
- Mobile exposes assignment/removal of existing roles and kick only. It does not expose role create/update/delete, role reorder, permission-matrix editing, or hierarchy editing.
- `PATCH .../members/[memberId]/roles` has full-replacement semantics. Always preserve the member's complete current non-default role-id set when toggling one assignable role.
- Use one root FlashList for members. Do not wrap it in a ScrollView and do not fetch all member pages eagerly.
- No token, invite code/URL, local media URI, upload claim, storage key, or upstream error body may enter logs, persisted state, query keys, or screenshots.
- Keep `graphify-out`, `artifacts`, `.env.maestro`, and `*.tsbuildinfo` out of the M3 stage.

---

### Task 0: Confirm M1/M2 prerequisites and protect direct-`uat` delivery

**Files:**

- Read: `apps/mobile/AGENTS.md`
- Read: `docs/superpowers/specs/2026-07-13-mobile-phase4-server-management-media-upload-design.md`
- Read: `docs/superpowers/plans/2026-07-13-mobile-phase4-m1-api-upload.md`
- Read: `apps/mobile/src/workspace/mobile-server-management-client.ts`
- Read: `apps/mobile/src/query/use-mobile-server-management-mutations.ts`

**Interfaces:**

- M1 provides strict server/category/channel/member/role/history schemas and server-side capability flags.
- M2 provides the authenticated management client, create/join mutations, upload claim hook, bootstrap selection reconciliation, and payload-validated realtime handling.

- [ ] **Step 1: Verify branch and remote ancestry**

Run from the repository root:

```powershell
if ((git branch --show-current) -ne "uat") { throw "M3 must run directly on uat" }
git fetch origin
$originUat = git rev-parse origin/uat
$mergeBase = git merge-base HEAD origin/uat
if ($mergeBase -ne $originUat) { throw "origin/uat advanced or local history diverged; reconcile before M3" }
git status --short
git log origin/uat..HEAD --format="%h %s"
```

Expected: branch is `uat`, `origin/uat` is an ancestor, unrelated local changes are identified and preserved, and the Phase 4 history before M3 contains the M1/M2 milestone commits only.

- [ ] **Step 2: Verify the required M1 public surface exists**

Confirm `@wizards/types` exports:

```ts
MobileServerUpdateRequestSchema;
MobileServerDeleteRequestSchema;
MobileCategoryCreateRequestSchema;
MobileCategoryUpdateRequestSchema;
MobileChannelCreateRequestSchema;
MobileChannelUpdateRequestSchema;
MobileServerMembersResponseSchema;
MobileAssignableRolesResponseSchema;
MobileMemberRolesUpdateRequestSchema;
MobileMutationSuccessResponseSchema;
MobileChannelHistoryClearResponseSchema;
```

Confirm server capabilities are exactly:

```ts
type MobileServerCapabilities = {
  canClearHistory: boolean;
  canDeleteServer: boolean;
  canKickMembers: boolean;
  canManageChannels: boolean;
  canManageInvites: boolean;
  canManageRoles: boolean;
  canManageServer: boolean;
  canUploadServerIcon: boolean;
};
```

Confirm member rows contain server-computed `{ canKick, canManageRoles }`, and the roles endpoint exposes only `{ id, name, color, position }`.

- [ ] **Step 3: Run the pre-M3 baseline**

```powershell
corepack pnpm --filter @wizards/types typecheck
corepack pnpm --filter @wizards/mobile typecheck
corepack pnpm --filter @wizards/mobile test
corepack pnpm --filter @wizards/mobile exec jest --runInBand
```

Expected: all commands exit 0. Stop and fix the owning milestone if an M1/M2 prerequisite is missing; do not hide a pre-existing failure inside M3.

### Task 1: Extend the management client, query keys, and member model

**Files:**

- Modify: `apps/mobile/src/workspace/mobile-server-management-client.ts`
- Modify: `apps/mobile/src/query/use-mobile-server-management-mutations.ts`
- Modify: `apps/mobile/src/query/mobile-query-keys.ts`
- Create: `apps/mobile/src/workspace/mobile-server-management-query.ts`
- Create: `apps/mobile/src/workspace/mobile-server-member-model.ts`
- Create: `apps/mobile/scripts/mobile-phase4-server-management.test.ts`

**Interfaces:**

```ts
export const MOBILE_SERVER_MEMBERS_LIMIT = 50;

export function updateMobileServer(
  client: MobileApiClient,
  input: {
    serverId: string;
    name: string;
  },
): Promise<MobileManagedWorkspaceServerDetailResponse>;
export function deleteMobileServer(
  client: MobileApiClient,
  input: {
    name: string;
    serverId: string;
  },
): Promise<MobileMutationSuccessResponse>;
export function createMobileCategory(
  client: MobileApiClient,
  input: {
    name: string;
    serverId: string;
  },
): Promise<MobileCategoryCreateResponse>;
export function updateMobileCategory(
  client: MobileApiClient,
  input: {
    categoryId: string;
    name: string;
    serverId: string;
  },
): Promise<MobileCategoryCreateResponse>;
export function deleteMobileCategory(
  client: MobileApiClient,
  input: {
    categoryId: string;
    serverId: string;
  },
): Promise<MobileMutationSuccessResponse>;
export function createMobileChannel(
  client: MobileApiClient,
  input: {
    categoryId?: string | null;
    name: string;
    serverId: string;
    topic?: string | null;
    type: "TEXT" | "VOICE";
  },
): Promise<MobileChannelCreateResponse>;
export function updateMobileChannel(
  client: MobileApiClient,
  input: {
    categoryId?: string | null;
    channelId: string;
    name?: string;
    serverId: string;
    topic?: string | null;
  },
): Promise<MobileChannelCreateResponse>;
export function deleteMobileChannel(
  client: MobileApiClient,
  input: {
    channelId: string;
    serverId: string;
  },
): Promise<MobileMutationSuccessResponse>;
export function fetchMobileServerMembers(
  client: MobileApiClient,
  input: {
    cursor?: string | null;
    serverId: string;
  },
): Promise<MobileServerMembersResponse>;
export function fetchMobileAssignableRoles(
  client: MobileApiClient,
  input: {
    serverId: string;
  },
): Promise<MobileAssignableRolesResponse>;
export function updateMobileMemberRoles(
  client: MobileApiClient,
  input: {
    memberId: string;
    roleIds: readonly string[];
    serverId: string;
  },
): Promise<MobileMutationSuccessResponse>;
export function kickMobileMember(
  client: MobileApiClient,
  input: {
    memberId: string;
    serverId: string;
  },
): Promise<MobileMutationSuccessResponse>;
export function clearMobileChannelHistory(
  client: MobileApiClient,
  input: {
    channelId: string;
  },
): Promise<MobileChannelHistoryClearResponse>;
```

Query additions are fixed:

```ts
workspaceMembers: (serverId: string) =>
  [...all, "workspace", serverId, "members"] as const,
workspaceRoles: (serverId: string) =>
  [...all, "workspace", serverId, "roles"] as const,
```

- [ ] **Step 1: Write RED client and pure-model tests**

Cover all HTTP methods and encoded path segments, response-schema rejection, `limit=50`, cursor omission/presence, and bounded mobile error propagation. Assert these paths exactly:

```text
PATCH|DELETE /api/v1/mobile/servers/[serverId]
POST /api/v1/mobile/servers/[serverId]/categories
PATCH|DELETE /api/v1/mobile/servers/[serverId]/categories/[categoryId]
POST /api/v1/mobile/servers/[serverId]/channels
PATCH|DELETE /api/v1/mobile/servers/[serverId]/channels/[channelId]
GET /api/v1/mobile/servers/[serverId]/members?limit=50&cursor=[cursor]
GET /api/v1/mobile/servers/[serverId]/roles
PATCH /api/v1/mobile/servers/[serverId]/members/[memberId]/roles
DELETE /api/v1/mobile/servers/[serverId]/members/[memberId]
DELETE /api/v1/mobile/channels/[channelId]/history
```

Test the pure member helpers:

```ts
export type MobileServerMemberListRow =
  | { id: "present" | "offline"; kind: "header" }
  | { id: string; kind: "member"; member: MobileServerMember };

export function buildMobileServerMemberRows(
  pages: readonly MobileServerMembersResponse[],
): readonly MobileServerMemberListRow[];

export function buildNextMobileMemberRoleIds(input: {
  assigned: boolean;
  currentRoleIds: readonly string[];
  roleId: string;
}): readonly string[];
```

Assertions must prove duplicate member ids are removed, first-seen page order is retained inside each presence group, every non-`OFFLINE` status belongs to `present`, `nextCursor` remains controlled by the last page, and toggling one role preserves every other current role id.

- [ ] **Step 2: Run focused tests and verify RED**

```powershell
corepack pnpm --filter @wizards/mobile exec node --test --import tsx scripts/mobile-phase4-server-management.test.ts
```

Expected: FAIL because the M3 client/query/model surface is absent.

- [ ] **Step 3: Implement schema-validated client calls and query hooks**

Implement:

```ts
useMobileServerMembersInfiniteQuery(client, serverId);
useMobileAssignableRolesQuery(client, serverId, enabled);
useMobileServerManagementMutations(client);
```

`useMobileServerMembersInfiniteQuery` uses `initialPageParam: null` and:

```ts
getNextPageParam: (lastPage) => lastPage.memberPage.nextCursor ?? undefined;
```

Mutation cache effects are bounded:

- server update/icon: invalidate exact bootstrap and workspace keys;
- server delete: invalidate bootstrap and remove that server's workspace/member/role keys;
- category/channel mutation: invalidate only the exact workspace key;
- member role/kick: invalidate only the exact member key, plus exact workspace when the response changes visible membership metadata;
- history clear: invalidate only the exact channel-message key.

- [ ] **Step 4: Run focused tests GREEN**

Run the Step 2 command and expect exit 0.

### Task 2: Add one reusable destructive-confirmation boundary

**Files:**

- Create: `apps/mobile/src/app/components/kit/destructive-confirmation-sheet.tsx`
- Modify: `apps/mobile/src/app/components/kit/index.ts`
- Create: `apps/mobile/component-tests/mobile-destructive-confirmation.test.tsx`

**Interface:**

```ts
export interface DestructiveConfirmationSheetProps {
  body: string;
  busy: boolean;
  confirmLabel: string;
  open: boolean;
  requiredText?: string;
  testID: string;
  title: string;
  onCancel(): void;
  onConfirm(): void | Promise<void>;
}
```

Derived test ids are `${testID}-input`, `${testID}-cancel`, `${testID}-confirm`, and `${testID}-error`.

- [ ] **Step 1: Write RED component tests**

Test normal confirmation, exact case-sensitive typed confirmation, disabled confirm for mismatched text, cancel, backdrop, Android request-close, accessibility escape, reset after close/reopen, busy state, and a deferred promise proving two rapid confirm presses call `onConfirm` once.

- [ ] **Step 2: Verify RED**

```powershell
corepack pnpm --filter @wizards/mobile exec jest component-tests/mobile-destructive-confirmation.test.tsx --runInBand
```

Expected: FAIL because the component and export do not exist.

- [ ] **Step 3: Implement with the existing BottomSheet**

Use `BottomSheet`; do not create a second modal/gesture implementation. Keep typed text internal and guard submission independently of render timing:

```ts
const pendingRef = useRef(false);

const handleConfirm = async () => {
  if (pendingRef.current || busy || (requiredText !== undefined && value !== requiredText)) {
    return;
  }
  pendingRef.current = true;
  try {
    await onConfirm();
  } finally {
    pendingRef.current = false;
  }
};
```

Use theme tokens only, preserve reduced-motion behavior through `BottomSheet`, and expose accessible labels/roles and a live-region busy/error status.

- [ ] **Step 4: Run the focused test GREEN**

Run the Step 2 command and expect exit 0.

### Task 3: Add typed protected contextual navigation

**Files:**

- Modify: `apps/mobile/src/navigation/mobile-navigation-types.ts`
- Modify: `apps/mobile/src/navigation/mobile-navigator.tsx`
- Modify: `apps/mobile/src/app/screens/mobile-screen-containers.tsx`
- Modify: `apps/mobile/component-tests/mobile-navigation.test.tsx`
- Modify: `apps/mobile/component-tests/mobile-screen-containers.test.tsx`
- Modify: `apps/mobile/scripts/mobile-navigation-contract.test.ts`

**Interface:**

```ts
export type MobileRootStackParamList = {
  // existing routes remain unchanged
  ServerSettings: { readonly serverId: string };
  ServerMembers: { readonly serverId: string };
  ChannelSettings: { readonly channelId: string; readonly serverId: string };
};
```

- [ ] **Step 1: Write navigation RED tests**

Assert exact parameter shapes, all three screens wrapped by `ProtectedStackRoute`, server/channel ids forwarded unchanged, back navigation, settings-to-members navigation, and channel-settings navigation retaining `serverId` to prevent cross-server confusion.

- [ ] **Step 2: Verify RED**

```powershell
corepack pnpm --filter @wizards/mobile exec node --test --import tsx scripts/mobile-navigation-contract.test.ts
corepack pnpm --filter @wizards/mobile exec jest component-tests/mobile-navigation.test.tsx component-tests/mobile-screen-containers.test.tsx --runInBand
```

Expected: FAIL because the three routes/containers are absent.

- [ ] **Step 3: Implement route containers without growing the product root**

Add:

```ts
ServerSettingsStackScreenContainer;
ServerMembersStackScreenContainer;
ChannelSettingsStackScreenContainer;
```

Containers pass route ids and `navigation.goBack`; screens obtain `apiClient` through `useMobileAuth()` and use focused query/mutation hooks directly. Do not thread new state through `mobile-product-app.tsx`.

- [ ] **Step 4: Run navigation tests GREEN**

Run the Step 2 commands and expect exit 0.

### Task 4: Build contextual server settings and wire its entry point

**Files:**

- Create: `apps/mobile/src/workspace/mobile-server-management.styles.ts`
- Create: `apps/mobile/src/workspace/mobile-server-settings-screen.tsx`
- Modify: `apps/mobile/src/app/screens/workspace-browser.tsx`
- Modify: `apps/mobile/src/app/screens/home-screen.styles.ts`
- Modify: `apps/mobile/src/locale/mobile-copy.ts`
- Create: `apps/mobile/component-tests/mobile-server-management.test.tsx`

**Interface:**

```ts
export interface MobileServerSettingsScreenProps {
  serverId: string;
  onBack(): void;
  onOpenChannelSettings(channelId: string): void;
  onOpenMembers(): void;
}
```

Stable ids:

```text
mobile-server-settings-open-[serverId]
mobile-server-settings-screen
mobile-server-settings-name
mobile-server-settings-save
mobile-server-settings-error
mobile-server-icon-picker
mobile-server-members-open-[serverId]
mobile-server-delete-open
mobile-server-delete-confirm-input
mobile-server-delete-confirm-confirm
```

- [ ] **Step 1: Add RED component cases**

Test loading/error/success, capability gating, unchanged-name no-op, trimmed name save, duplicate-save prevention, icon picker only when `canUploadServerIcon`, optimistic icon state delegated to the M2 upload/claim hook, failed icon rollback, typed-name delete, delete failure retaining the screen, and successful delete returning to the reconciled workspace shell.

- [ ] **Step 2: Verify RED**

```powershell
corepack pnpm --filter @wizards/mobile exec jest component-tests/mobile-server-management.test.tsx --runInBand
```

Expected: FAIL because the screen and entry action are absent.

- [ ] **Step 3: Implement contextual server management**

Use `useMobileWorkspaceQuery(apiClient, serverId)` as the canonical detail source. Show edit actions only from server-computed capability fields. Server icon updates call the M2 upload hook with:

```ts
{ purpose: "server-icon", targetServerId: serverId }
```

Delete sends the exact current server name in `MobileServerDeleteRequestSchema`; never accept an id-only delete from the UI. The active-server header action in `workspace-browser.tsx` navigates to `ServerSettings` and uses the database-id test id.

- [ ] **Step 4: Run server-management tests GREEN**

Run the Step 2 command and expect exit 0.

### Task 5: Add category/channel CRUD and channel-history clearing

**Files:**

- Create: `apps/mobile/src/workspace/mobile-workspace-editor-sheets.tsx`
- Create: `apps/mobile/src/workspace/mobile-channel-settings-screen.tsx`
- Modify: `apps/mobile/src/workspace/mobile-server-settings-screen.tsx`
- Modify: `apps/mobile/src/app/screens/workspace-channel-section-list.tsx`
- Modify: `apps/mobile/src/locale/mobile-copy.ts`
- Modify: `apps/mobile/component-tests/mobile-server-management.test.tsx`
- Modify: `apps/mobile/scripts/mobile-phase4-server-management.test.ts`

**Interfaces:**

```ts
export interface MobileChannelSettingsScreenProps {
  channelId: string;
  serverId: string;
  onBack(): void;
}

export type MobileWorkspaceEditorState =
  | { kind: "category-create" }
  | { categoryId: string; initialName: string; kind: "category-edit" }
  | { kind: "channel-create" }
  | { channelId: string; kind: "channel-edit" }
  | null;
```

Stable ids:

```text
mobile-category-create-open
mobile-category-[categoryId]-edit
mobile-category-[categoryId]-delete
mobile-category-editor-sheet
mobile-category-name
mobile-category-save
mobile-category-delete-confirm-confirm
mobile-channel-create-open
mobile-channel-settings-open-[channelId]
mobile-channel-editor-sheet
mobile-channel-name
mobile-channel-topic
mobile-channel-type-text
mobile-channel-type-voice
mobile-channel-category
mobile-channel-save
mobile-channel-settings-screen
mobile-channel-settings-save
mobile-channel-delete-open-[channelId]
mobile-channel-delete-confirm-confirm
mobile-channel-history-clear-open-[channelId]
mobile-channel-history-clear-confirm-confirm
```

- [ ] **Step 1: Extend RED tests for the approved CRUD subset**

Cover category create/rename/delete; channel create with `name`, `TEXT|VOICE`, optional `topic/categoryId`; channel update of `name/topic/categoryId`; channel delete; required/trimmed/bounded fields; mutation errors; duplicate submission; and cache scope. Assert channel-history clear is visible only for `TEXT`, requires confirmation, reports `deletedCount`, and never appears for `VOICE`.

- [ ] **Step 2: Verify RED**

```powershell
corepack pnpm --filter @wizards/mobile exec node --test --import tsx scripts/mobile-phase4-server-management.test.ts
corepack pnpm --filter @wizards/mobile exec jest component-tests/mobile-server-management.test.tsx --runInBand
```

Expected: FAIL on missing editors/settings behavior.

- [ ] **Step 3: Implement editor sheets and channel settings**

Use the shared confirmation component for category delete, channel delete, and history clear. Every category/channel mutation includes route-context `serverId`; never infer server ownership from only a cached channel row. Do not add channel permission-matrix, role override, or reorder UI.

- [ ] **Step 4: Run focused tests GREEN**

Run the Step 2 commands and expect exit 0.

### Task 6: Add cursor-paginated members, existing-role toggles, and kick

**Files:**

- Create: `apps/mobile/src/workspace/mobile-server-members-screen.tsx`
- Modify: `apps/mobile/src/workspace/mobile-server-management.styles.ts`
- Modify: `apps/mobile/src/locale/mobile-copy.ts`
- Modify: `apps/mobile/component-tests/mobile-server-management.test.tsx`
- Modify: `apps/mobile/scripts/mobile-phase4-server-management.test.ts`

**Interface:**

```ts
export interface MobileServerMembersScreenProps {
  serverId: string;
  onBack(): void;
}
```

Stable ids:

```text
mobile-server-members-screen
mobile-server-members-list
mobile-server-members-load-more-error
mobile-server-member-[memberId]
mobile-member-[memberId]-role-[roleId]
mobile-member-[memberId]-kick
mobile-member-role-remove-confirm-confirm
mobile-member-kick-confirm-confirm
```

- [ ] **Step 1: Add RED member behavior tests**

Test initial loading, empty/error/retry, `onEndReached` cursor fetch, no fetch without `nextCursor`, duplicate-page member dedupe, present/offline headers, presence display, roles query only when a manageable member is expanded, and server-provided `canManageRoles/canKick` gating.

Test role assignment sends the complete intended role-id set. Test removal requires confirmation and retains every unrelated role. Test kick requires confirmation. Test 403/409 responses show bounded messages and refetch the exact member scope; they must not be treated as success because the UI previously displayed a capability.

- [ ] **Step 2: Verify RED**

```powershell
corepack pnpm --filter @wizards/mobile exec node --test --import tsx scripts/mobile-phase4-server-management.test.ts
corepack pnpm --filter @wizards/mobile exec jest component-tests/mobile-server-management.test.tsx --runInBand
```

Expected: FAIL because the members screen is absent.

- [ ] **Step 3: Implement one root FlashList**

Render `MobileServerMemberListRow` items in one FlashList with stable keys. `onEndReached` calls `fetchNextPage()` only when `hasNextPage && !isFetchingNextPage`. Do not rearrange pages or construct a synthetic cursor from presence groups.

Role toggle code must be equivalent to:

```ts
const roleIds = buildNextMobileMemberRoleIds({
  assigned: !checked,
  currentRoleIds: member.roleIds,
  roleId: role.id,
});
await updateRoles({ memberId: member.id, roleIds, serverId });
```

The roles returned by `/roles` are the only roles offered. The client does not calculate hierarchy or broaden eligibility.

- [ ] **Step 4: Run focused tests GREEN**

Run the Step 2 commands and expect exit 0.

### Task 7: Narrow realtime invalidation to active workspace/member scopes

**Files:**

- Modify: `apps/mobile/src/realtime/realtime-query-bridge.ts`
- Modify: `apps/mobile/scripts/mobile-realtime-query-bridge.test.ts`

**Interfaces:**

- Preserve `MOBILE_REALTIME_REFRESH_DEBOUNCE_MS === 350`.
- Preserve the existing five timer-source buckets.
- A timer callback may invalidate a bounded list of exact query keys, not one global prefix.

- [ ] **Step 1: Write RED cache-scope tests**

Assert:

- a validated settings or membership event schedules one timer and preserves M2's exact `workspace(event.serverId)` invalidation/patch even when that server is inactive;
- when the validated event server is active, the same timer may also invalidate exact `workspaceMembers(activeServerId)`;
- an inactive event server never refreshes an inactive member list and never invalidates the different active workspace;
- presence schedules one timer then invalidates exact friends and active members keys;
- no active server means presence invalidates friends only;
- duplicate events in 350 ms reuse the timer;
- cancel/dispose clears the timer and performs no later invalidation;
- no unrelated workspace, unrelated members, channel, or DM query is invalidated, while M2's validated membership/bootstrap patch remains intact.

- [ ] **Step 2: Verify RED**

```powershell
corepack pnpm --filter @wizards/mobile exec node --test --import tsx scripts/mobile-realtime-query-bridge.test.ts
```

Expected: FAIL because one timer currently owns only one query key.

- [ ] **Step 3: Generalize the timer callback to bounded keys**

Use an exact-key list:

```ts
const scheduleInvalidations = (
  source: MobileRealtimeRefreshSource,
  queryKeys: readonly QueryKey[],
) => {
  // retain one timer per getMobileRealtimeRefreshTimerSource(source)
  // callback invalidates each key with { exact: true, queryKey }
};
```

For a validated settings or membership event, preserve M2's exact event-server behavior: choose `event.serverId` when present and invalidate or patch `workspace(event.serverId)` even if that server is inactive. Add `workspaceMembers(activeServerId)` only when `event.serverId === activeServerId`; presence similarly receives `[friends(), workspaceMembers(activeServerId)]` only when an active server exists. M3 generalizes the existing timer to bounded exact-key lists; it must not suppress M2's valid inactive exact-server refreshes, duplicate membership/bootstrap patches, refresh inactive member lists, or invent granular socket events.

- [ ] **Step 4: Run realtime tests GREEN**

Run the Step 2 command and expect exit 0.

### Task 8: Lock accessibility, theme, architecture, and test-id contracts

**Files:**

- Modify: `apps/mobile/src/quality/mobile-quality-gate.ts`
- Modify: `apps/mobile/scripts/mobile-quality-gate.test.ts`
- Modify: `apps/mobile/scripts/mobile-maestro-testid-contract.test.ts`
- Modify: `apps/mobile/scripts/mobile-root-boundary.test.ts`
- Verify: `apps/mobile/scripts/mobile-design-contract.test.ts`
- Verify: `apps/mobile/scripts/mobile-phase-two-architecture.test.ts`

- [ ] **Step 1: Add RED Phase 4 quality assertions**

Require the Phase 4 flow, migration/handoff documents, protected routes, confirmation primitive, member FlashList, resource-specific ids, no secret-bearing screenshot names, and both light/dark evidence paths.

Add automated gate:

```ts
{
  command: "maestro test ../../.maestro/phase4-server-management.yml",
  id: "mobile-maestro-phase4-server-management",
  purpose: "Android UAT proof for server, channel, member, media, destructive confirmation, cleanup, and both themes.",
  required: true,
}
```

Add manual checks for capability/authz denial, role full-replacement preservation, kick/owner/self denial, cursor pagination, history clear, destructive duplicate-submit prevention, and light/dark management surfaces.

- [ ] **Step 2: Verify RED**

```powershell
corepack pnpm --filter @wizards/mobile exec node --test --import tsx scripts/mobile-quality-gate.test.ts scripts/mobile-maestro-testid-contract.test.ts scripts/mobile-root-boundary.test.ts
```

Expected: FAIL until the Phase 4 quality contract is complete.

- [ ] **Step 3: Complete production ids and quality records**

Test ids must be present in production source and use stable database ids for dynamic resources. Ensure all new press targets have accessible roles/labels, busy state is announced, touch targets are at least 44 px, reduced motion follows the existing theme/BottomSheet harness, and styles use theme tokens rather than raw colors.

- [ ] **Step 4: Run quality, design, and architecture tests GREEN**

```powershell
corepack pnpm --filter @wizards/mobile exec node --test --import tsx `
  scripts/mobile-quality-gate.test.ts `
  scripts/mobile-maestro-testid-contract.test.ts `
  scripts/mobile-root-boundary.test.ts `
  scripts/mobile-design-contract.test.ts `
  scripts/mobile-phase-two-architecture.test.ts
```

Expected: all tests exit 0 and `mobile-product-app.tsx` remains below the locked limit.

### Task 9: Write the Phase 4 migration and Phase 5 handoff records

**Files:**

- Create: `apps/mobile/MIGRATION_PHASE_4.md`
- Create: `apps/mobile/PHASE_5_HANDOFF.md`
- Modify: `apps/mobile/scripts/mobile-quality-gate.test.ts`

- [ ] **Step 1: Extend the RED file-contract test**

Assert both documents contain the API inventory, screen/hook/query-cache map, additive database migration and rollback procedure, UAT/Maestro status, media/avatar closure, intentional exclusions, and the exact three statements below.

- [ ] **Step 2: Verify RED**

```powershell
corepack pnpm --filter @wizards/mobile exec node --test --import tsx scripts/mobile-quality-gate.test.ts
```

Expected: FAIL because both records are absent.

- [ ] **Step 3: Create both documents with identical mandatory wording**

The following wording must appear verbatim in **both** `MIGRATION_PHASE_4.md` and `PHASE_5_HANDOFF.md`:

```text
Bu çalışma, web'in tam rol CRUD'una (create/update/delete + izin matrisi) göre bilinçli bir daralmadır; tam web rol CRUD paritesi değildir.

Rol CRUD + izin hiyerarşisi mobilde ertelendi.

Mobil yalnızca mevcut rollerin atama/kaldırma yetkisini ve yetkili üyeyi sunucudan atma (kick) işlemini sunar; sunucunun rol hiyerarşisini veya yetki sınırlarını genişletmez. Rol atama/kaldırma ve kick uçlarında web'in “kim kimi atayabilir veya sunucudan atabilir?” authz kontrolü servis katmanında birebir korunur.
```

`MIGRATION_PHASE_4.md` records delivered M1/M2/M3 contracts, additive `MobileMediaUpload` migration/deploy/rollback, exact verification commands, UAT evidence paths, and no-secret rules. `PHASE_5_HANDOFF.md` records the role CRUD/permission-hierarchy deferral, other intentional exclusions, remaining non-Phase-4 debt, and the authoritative Phase 4 cache/navigation/test contracts that Phase 5 must preserve.

- [ ] **Step 4: Run the file-contract test GREEN**

Run the Step 2 command and expect exit 0.

### Task 10: Add and execute the deterministic Phase 4 Maestro UAT flow

**Files:**

- Create: `.maestro/phase4-server-management.yml`
- Reuse: `.maestro/helpers/login-uat.yml`
- Reuse: `apps/mobile/assets/whispr-icon.png`
- Modify: `apps/mobile/scripts/mobile-maestro-testid-contract.test.ts`

**Evidence destinations:**

```text
artifacts/mobile/phase4/closure/light-server-management
artifacts/mobile/phase4/closure/dark-server-management
```

- [ ] **Step 1: Write the static Maestro/test-id RED contract**

Require the flow to log in, select Light, create `Phase4 Maestro UAT`, create/share an invite, close the native share chooser before evidence, create a category and TEXT channel, open members, upload the pre-seeded image, capture light/dark management screens, and delete the server by typing its exact name. Forbid screenshot steps while invite/share/upload transient UI is visible.

- [ ] **Step 2: Verify RED**

```powershell
corepack pnpm --filter @wizards/mobile exec node --test --import tsx scripts/mobile-maestro-testid-contract.test.ts
```

Expected: FAIL because the Phase 4 flow is absent.

- [ ] **Step 3: Create the deterministic flow**

Use the established launch/login sequence from `.maestro/phase3-social.yml`. The flow order is:

1. Launch and run `helpers/login-uat.yml`.
2. Open Appearance, choose `Acik|Light`, return to Overview.
3. Tap `mobile-server-add-open`, select create, enter `Phase4 Maestro UAT`, submit, and wait for the selected workspace.
4. Open invite/share, press Back to close the native chooser, and take no screenshot of invite content.
5. Open server settings, create a category and a TEXT channel, and open members.
6. Upload `phase4-avatar.png` through the server-icon picker; also exercise the M2 profile-avatar picker if it has not already been captured by the M2 closure flow.
7. Capture `artifacts/mobile/phase4/closure/light-server-management` only after all transient secret-bearing UI is closed.
8. Choose `Koyu|Dark`, return to server settings, and capture `artifacts/mobile/phase4/closure/dark-server-management`.
9. Tap server delete, type `Phase4 Maestro UAT`, confirm, and assert the server is absent from the workspace rail.

Do not assign roles or kick real UAT members in Maestro; deterministic component/API tests cover those destructive authorization paths without altering shared users.

- [ ] **Step 4: Seed the emulator image and run against UAT**

```powershell
adb shell mkdir -p /sdcard/Pictures/WhisprPhase4
adb push apps/mobile/assets/whispr-icon.png /sdcard/Pictures/WhisprPhase4/phase4-avatar.png
adb shell am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d file:///sdcard/Pictures/WhisprPhase4/phase4-avatar.png
maestro test `
  -e MAESTRO_UAT_EMAIL="$env:MAESTRO_UAT_EMAIL" `
  -e MAESTRO_UAT_PASSWORD="$env:MAESTRO_UAT_PASSWORD" `
  .maestro/phase4-server-management.yml
```

Expected: exit 0, both evidence images exist, the share chooser is absent from evidence, and `Phase4 Maestro UAT` is deleted at flow completion. If a failed prior run left that exact server, remove it through the same mobile delete UI before rerunning; do not delete shared UAT data through ad-hoc SQL.

### Task 11: Run full non-device closure, update the graph, and review scope

**Files:**

- Verify: all M1/M2/M3 changes
- Update without staging: `graphify-out/*`

- [ ] **Step 1: Run every required gate from the repository root**

```powershell
corepack pnpm --filter @wizards/types typecheck
corepack pnpm --filter @wizards/types test
corepack pnpm --filter @wizards/db exec prisma validate
corepack pnpm --filter @wizards/db db:generate
corepack pnpm --filter @wizards/db typecheck
corepack pnpm --filter @wizards/web typecheck
corepack pnpm --filter @wizards/web lint
corepack pnpm --filter @wizards/web test
corepack pnpm --filter @wizards/web build
corepack pnpm --filter @wizards/mobile typecheck
corepack pnpm --filter @wizards/mobile test
corepack pnpm --filter @wizards/mobile exec jest --runInBand
corepack pnpm --filter @wizards/mobile quality:check
corepack pnpm --filter @wizards/mobile exec expo install --check
corepack pnpm audit --audit-level moderate
graphify update .
```

Expected: every command exits 0. Audit findings at moderate-or-higher severity are a hard stop; do not use an ignore flag. `graphify update .` completes, but generated graph changes remain unstaged.

- [ ] **Step 2: Review the final diff for scope and secrets**

```powershell
git status --short
git diff --check
git diff --stat
git diff -- apps/mobile/src apps/mobile/scripts apps/mobile/component-tests .maestro apps/mobile/MIGRATION_PHASE_4.md apps/mobile/PHASE_5_HANDOFF.md docs/superpowers/plans/2026-07-13-mobile-phase4-m3-management-closure.md
rg -n "TODO|FIXME|Bearer |claimId|storageKey|inviteCode|MAESTRO_UAT_PASSWORD" apps/mobile/src apps/mobile/MIGRATION_PHASE_4.md apps/mobile/PHASE_5_HANDOFF.md .maestro/phase4-server-management.yml
```

Expected: no placeholder/TODO, hardcoded credential, secret-bearing evidence, role CRUD UI, permission-matrix UI, unrelated settings IA change, or accidental product-root growth.

### Task 12: Create the single M3 commit, push `uat`, and verify Railway/UAT

**Files:**

- Stage: only the reviewed M3 implementation, tests, docs, flow, and this plan
- Never stage: `graphify-out`, `artifacts`, `.env.maestro`, `*.tsbuildinfo`, or unrelated local work

- [ ] **Step 1: Recheck the remote before staging**

```powershell
git fetch origin
$originUat = git rev-parse origin/uat
$mergeBase = git merge-base HEAD origin/uat
if ($mergeBase -ne $originUat) { throw "origin/uat advanced; stop before commit/push" }
git log origin/uat..HEAD --format="%h %s"
```

Expected: remote is still an ancestor and the only local milestone commits before M3 are the approved M1/M2 commits.

- [ ] **Step 2: Stage only M3 files and inspect the index**

Use explicit `git add` paths for the files listed in Tasks 1–10 plus this plan. Then run:

```powershell
git diff --cached --check
git diff --cached --name-only
git diff --cached --stat
```

Expected: no graph, artifact, environment, build-info, M1/M2 spillover, or unrelated user file is staged.

- [ ] **Step 3: Create exactly one M3 commit**

```powershell
git commit -m "feat(mobile): complete phase 4 server management parity"
git log -3 --format="%h %s"
```

Expected subjects, newest first:

```text
feat(mobile): complete phase 4 server management parity
feat(mobile): add server creation, invites and avatar upload
feat(mobile-api): add server management and upload endpoints
```

- [ ] **Step 4: Fetch once more and push directly to UAT**

```powershell
git fetch origin
$originUat = git rev-parse origin/uat
$mergeBase = git merge-base HEAD origin/uat
if ($mergeBase -ne $originUat) { throw "origin/uat advanced after commit; stop before push" }
git push origin uat
```

Expected: push succeeds without force, merge, or rebase.

- [ ] **Step 5: Verify Railway deployment and protected-route reachability**

In Railway, confirm the pushed commit deploys, `railway.toml` pre-deploy runs `pnpm --filter @wizards/db db:migrate:deploy`, the web build exits 0, the service reaches healthy state, and no migration/upload cleanup secret appears in logs. Then run:

```powershell
$uat = "https://wizardsweb-uat.up.railway.app"
$live = curl.exe -sS -o NUL -w "%{http_code}" "$uat/api/health"
$ready = curl.exe -sS -o NUL -w "%{http_code}" "$uat/api/health?ready=1"
$protected = curl.exe -sS -o NUL -w "%{http_code}" "$uat/api/v1/mobile/servers/not-a-real-server/members"
if ($live -ne "200") { throw "UAT liveness failed: $live" }
if ($ready -ne "200") { throw "UAT readiness failed: $ready" }
if ($protected -ne "401") { throw "Mobile members route must exist and reject anonymous access with 401; received $protected" }
```

Expected: liveness 200, readiness 200, and the new protected endpoint 401 rather than 404. Record the Railway deployment result and redacted Maestro light/dark evidence status in the delivery handoff; do not commit runtime artifacts.
