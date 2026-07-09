# Whispr Mobile Phase 0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Whispr Mobile's manual navigation, server-state, realtime refresh, and unvirtualized rendering foundation while preserving all existing behavior and test contracts.

**Architecture:** Introduce an in-memory TanStack Query layer, focused non-persisted Zustand stores, typed React Navigation stacks/tabs, and a single realtime-to-query bridge. Migrate each screen behind focused hooks/providers, then remove the root prop bundle and manual refresh chains once all consumers use the new boundaries.

**Tech Stack:** Expo SDK 56, React Native 0.85.3, React 19.2.3, TypeScript 6 strict mode, React Navigation 7, TanStack Query 5, Zustand, FlashList 2, Expo Image 56, Reanimated 4, Gesture Handler 2, Node test runner, Jest Expo, Testing Library React Native.

## Global Constraints

- Preserve the five `MobileTabId` values, `mobile-navigation.ts` pure API, auth/deep-link contracts, locale behavior, `MobileErrorBoundary`, and every existing Maestro test ID.
- Do not edit `src/auth`, `src/voice`, contract files, `apps/web`, `apps/desktop`, or `packages/*`, except unavoidable type-only imports.
- Do not upgrade Expo SDK and do not introduce later-phase product features or visual redesign.
- React Query and Zustand remain memory-only: no persister, AsyncStorage cache, SecureStore query cache, offline mutation queue, or offline message cache.
- Query keys and logs contain no token, email address, message body, raw search text, or sensitive URL query.
- Keep the user's existing uncommitted Jest/Maestro/package/lock/quality changes intact and stage only files or hunks introduced by this plan.
- After every task run `corepack pnpm --filter @wizards/mobile typecheck` and `corepack pnpm --filter @wizards/mobile test`; both must pass before committing.
- At completion also run `corepack pnpm --filter @wizards/mobile test:components`, `corepack pnpm --filter @wizards/mobile quality:check`, and `npx expo install --check` from `apps/mobile`.
- Task 7 is blocked from completion until channel, DM, invite, settings, and Android hardware-back navigation pass through Maestro on a connected Android device/emulator with command output and artifacts retained.
- Do not add a manual Reanimated/Worklets Babel plugin under Expo SDK 56.
- Verify `super.onCreate(null)` behavior before any fragment-factory decision. If insufficient, stop and request approval before a native activity or config-plugin patch.
- Temporarily set predictive back to false and record the exact post-Phase-0 re-enable instruction in `apps/mobile/MIGRATION_PHASE_0.md`.

---

### Task 1: Install and Verify the SDK 56 Foundation

**Files:**

- Create: `apps/mobile/scripts/mobile-phase-zero-native-config.test.ts`
- Modify: `apps/mobile/package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `apps/mobile/app.config.js`
- Modify: `apps/mobile/App.tsx`
- Preserve: `apps/mobile/babel.config.js`
- Verify: `apps/mobile/android/app/src/main/java/team/whispr/mobile/MainActivity.kt`

**Interfaces:**

- Consumes: Existing Expo 56 app config, `MobileErrorBoundary`, `MobileAuthProvider`, and `SafeAreaProvider`.
- Produces: Installed navigation/query/state/performance packages, `GestureHandlerRootView` at the native root, predictive back disabled, and a native-configuration contract test.

- [ ] **Step 1: Write the failing native/config contract test**

```ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
  dependencies: Record<string, string>;
};

test("phase zero dependencies and SDK 56 native configuration stay aligned", () => {
  for (const dependency of [
    "@react-navigation/native",
    "@react-navigation/native-stack",
    "@react-navigation/bottom-tabs",
    "@tanstack/react-query",
    "zustand",
    "react-native-screens",
    "react-native-gesture-handler",
    "react-native-reanimated",
    "react-native-worklets",
    "@shopify/flash-list",
    "expo-image",
  ]) {
    assert.ok(packageJson.dependencies[dependency], `Missing ${dependency}`);
  }

  const appConfig = readFileSync(join(root, "app.config.js"), "utf8");
  const appSource = readFileSync(join(root, "App.tsx"), "utf8");
  const babelSource = readFileSync(join(root, "babel.config.js"), "utf8");
  const activitySource = readFileSync(
    join(
      root,
      "android",
      "app",
      "src",
      "main",
      "java",
      "team",
      "whispr",
      "mobile",
      "MainActivity.kt",
    ),
    "utf8",
  );

  assert.match(appConfig, /predictiveBackGestureEnabled:\s*false/);
  assert.match(appSource, /GestureHandlerRootView/);
  assert.doesNotMatch(babelSource, /react-native-(reanimated|worklets)\/plugin/);
  assert.match(activitySource, /super\.onCreate\(null\)/);
  assert.doesNotMatch(activitySource, /RNScreensFragmentFactory/);
});
```

- [ ] **Step 2: Run the contract test and verify dependency/config failure**

Run: `corepack pnpm --filter @wizards/mobile exec node --test --import tsx scripts/mobile-phase-zero-native-config.test.ts`

Expected: FAIL because Phase 0 dependencies, `GestureHandlerRootView`, and predictive-back configuration are absent.

- [ ] **Step 3: Install JavaScript-only dependencies**

Run from repository root:

```powershell
corepack pnpm --filter @wizards/mobile add @react-navigation/native @react-navigation/native-stack @react-navigation/bottom-tabs @tanstack/react-query zustand
```

Expected: `apps/mobile/package.json` and `pnpm-lock.yaml` contain the five packages without changing Expo SDK.

- [ ] **Step 4: Install Expo-managed dependencies**

Run from `apps/mobile`:

```powershell
npx expo install --pnpm react-native-screens react-native-gesture-handler react-native-reanimated react-native-worklets @shopify/flash-list expo-image
```

Expected: Expo selects SDK 56-compatible versions and does not request a manual Babel plugin.

- [ ] **Step 5: Apply the minimal root and predictive-back configuration**

Use this provider order in `App.tsx`:

```tsx
import { GestureHandlerRootView } from "react-native-gesture-handler";

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <MobileErrorBoundary>
          <MobileAuthProvider>
            <WhisprMobileRoot />
            <StatusBar style="auto" />
          </MobileAuthProvider>
        </MobileErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
```

Set `predictiveBackGestureEnabled: false` in `app.config.js`. Do not edit `MainActivity.kt`, create a fragment config plugin, or add a Babel plugin because the current activity already uses `super.onCreate(null)` and the contract test preserves that decision.

- [ ] **Step 6: Verify Expo dependency alignment**

Run from `apps/mobile`: `npx expo install --check`

Expected: exit code 0 and a clean dependency-alignment message. Save the exact final output for the migration report.

- [ ] **Step 7: Run milestone verification**

Run:

```powershell
corepack pnpm --filter @wizards/mobile typecheck
corepack pnpm --filter @wizards/mobile test
```

Expected: both commands PASS, including the new native/config contract.

- [ ] **Step 8: Commit only Phase 0 dependency/config changes**

Stage only newly introduced hunks in shared dirty files and the new test/App/config changes. Do not stage pre-existing Jest/Maestro/quality work.

```powershell
git commit -m "chore: add mobile phase zero foundation"
```

### Task 2: Add the In-Memory Query Foundation

**Files:**

- Create: `apps/mobile/src/query/mobile-query-client.ts`
- Create: `apps/mobile/src/query/mobile-query-keys.ts`
- Create: `apps/mobile/src/query/mobile-query-pages.ts`
- Create: `apps/mobile/src/app/providers/mobile-query-provider.tsx`
- Create: `apps/mobile/scripts/mobile-query-foundation.test.ts`
- Modify: `apps/mobile/App.tsx`

**Interfaces:**

- Consumes: `QueryClient`, React Native `AppState`, opaque server/channel/conversation IDs.
- Produces: `createMobileQueryClient(): QueryClient`, `MobileSearchKeyRegistry`, singleton `mobileSearchKeyRegistry`, singleton `mobileQueryKeys`, `flattenMobileInfinitePages()`, `MobileQueryProvider`, and `useMobileQueryClient()`.

- [ ] **Step 1: Write failing tests for redacted keys, page flattening, and cache policy**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { createMobileQueryClient } from "../src/query/mobile-query-client";
import { createMobileQueryKeys, MobileSearchKeyRegistry } from "../src/query/mobile-query-keys";
import { flattenMobileInfinitePages } from "../src/query/mobile-query-pages";

test("mobile query keys exclude raw search text and PII", () => {
  const registry = new MobileSearchKeyRegistry();
  const keys = createMobileQueryKeys(registry);
  const key = keys.messageSearch({
    conversationId: "conversation-1",
    query: "person@example.com secret phrase",
    scope: "dm",
  });
  const serialized = JSON.stringify(key);
  assert.doesNotMatch(serialized, /person@example\.com|secret phrase/);
  assert.match(serialized, /search-1/);
});

test("mobile query client is memory-only", () => {
  const client = createMobileQueryClient();
  assert.equal(client.getDefaultOptions().queries?.retry, 2);
  assert.equal("persister" in client, false);
});

test("infinite pages flatten chronologically and deduplicate ids", () => {
  const messages = flattenMobileInfinitePages([
    { messages: [{ id: "2" }, { id: "3" }] },
    { messages: [{ id: "1" }, { id: "2" }] },
  ]);
  assert.deepEqual(
    messages.map((message) => message.id),
    ["1", "2", "3"],
  );
});
```

- [ ] **Step 2: Run the focused test and confirm missing modules**

Run: `corepack pnpm --filter @wizards/mobile exec node --test --import tsx scripts/mobile-query-foundation.test.ts`

Expected: FAIL with module-not-found errors for `src/query/mobile-query-*`.

- [ ] **Step 3: Implement the query client and opaque search-key registry**

`createMobileQueryClient()` must configure `retry: 2`, `staleTime: 15_000`, `gcTime: 5 * 60_000`, and `refetchOnReconnect: true`. `MobileSearchKeyRegistry` keeps raw normalized filters only inside a private in-memory `Map`, returns sequential `search-N` identifiers, and exposes `clear()` for sign-out. `createMobileQueryKeys()` returns readonly arrays prefixed with `"mobile"`; the module exports `mobileSearchKeyRegistry` and `mobileQueryKeys` as the only application singletons. Sign-out clears both the query client and `mobileSearchKeyRegistry`.

- [ ] **Step 4: Implement stable infinite-page flattening**

`flattenMobileInfinitePages<T extends { id: string }>(pages)` traverses fetched pages from oldest page to newest page, inserts each ID once, and replaces an earlier duplicate with the newest object while preserving chronological slot order.

- [ ] **Step 5: Add `MobileQueryProvider` and AppState focus integration**

Create the client once with `useState(createMobileQueryClient)`. Subscribe to `AppState` and call `focusManager.setFocused(status === "active")`; remove the subscription on unmount. Export `useMobileQueryClient()` as a typed wrapper over `useQueryClient()`.

- [ ] **Step 6: Mount the provider inside auth and outside mobile navigation**

Wrap `WhisprMobileRoot` with `MobileQueryProvider` inside `MobileAuthProvider`. Do not add persistence or devtools.

- [ ] **Step 7: Verify and commit**

Run typecheck, focused test, and full mobile tests. Expected: PASS.

```powershell
git commit -m "feat: add mobile query foundation"
```

### Task 3: Add Focused Non-Persisted Zustand Stores

**Files:**

- Create: `apps/mobile/src/state/mobile-active-target-store.ts`
- Create: `apps/mobile/src/state/mobile-composer-draft-store.ts`
- Create: `apps/mobile/src/state/mobile-overlay-store.ts`
- Create: `apps/mobile/src/state/reset-mobile-session-state.ts`
- Create: `apps/mobile/scripts/mobile-ui-stores.test.ts`

**Interfaces:**

- Produces: `useMobileActiveTargetStore`, `useMobileComposerDraftStore`, `useMobileOverlayStore`, and `resetMobileSessionState()`.
- Store IDs are opaque strings; none of the stores use Zustand persistence middleware.

- [ ] **Step 1: Write failing store behavior tests**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { useMobileActiveTargetStore } from "../src/state/mobile-active-target-store";
import { useMobileComposerDraftStore } from "../src/state/mobile-composer-draft-store";
import { useMobileOverlayStore } from "../src/state/mobile-overlay-store";
import { resetMobileSessionState } from "../src/state/reset-mobile-session-state";

test("focused mobile stores reset session state without persistence", () => {
  useMobileActiveTargetStore.getState().setTextChannel("server-1", "channel-1");
  useMobileComposerDraftStore.getState().setDraft("channel:channel-1", "draft");
  useMobileOverlayStore.getState().openOverlay("voice-invite");
  resetMobileSessionState();
  assert.equal(useMobileActiveTargetStore.getState().channelId, null);
  assert.deepEqual(useMobileComposerDraftStore.getState().drafts, {});
  assert.equal(useMobileOverlayStore.getState().activeOverlay, null);
});
```

- [ ] **Step 2: Confirm tests fail before store modules exist**

Run the focused Node test; expect module-not-found failure.

- [ ] **Step 3: Implement three small stores**

Active targets expose `setServer`, `setTextChannel`, `setVoiceChannel`, `setConversation`, and `reset`. Composer drafts expose `getDraft`, `setDraft`, `clearDraft`, and `reset`; bound draft length to the existing message-content limit. Overlay state exposes `openOverlay`, `closeOverlay`, and `reset` with a bounded union of current Phase 0 overlays.

- [ ] **Step 4: Implement one sign-out reset coordinator**

`resetMobileSessionState()` invokes the three store `reset` actions and does not touch SecureStore or the auth provider.

- [ ] **Step 5: Verify absence of persistence middleware**

Run: `rg -n "persist\(|createJSONStorage|AsyncStorage" apps/mobile/src/state`

Expected: no matches.

- [ ] **Step 6: Verify and commit**

Run typecheck and full mobile tests; expect PASS.

```powershell
git commit -m "feat: add mobile ui state stores"
```

### Task 4: Add Query Hooks and Optimistic Message Cache Operations

**Files:**

- Create: `apps/mobile/src/query/mobile-bootstrap-query.ts`
- Create: `apps/mobile/src/query/mobile-workspace-query.ts`
- Create: `apps/mobile/src/query/mobile-message-queries.ts`
- Create: `apps/mobile/src/query/mobile-message-search-query.ts`
- Create: `apps/mobile/src/query/mobile-message-cache.ts`
- Create: `apps/mobile/src/query/use-mobile-message-mutations.ts`
- Create: `apps/mobile/scripts/mobile-message-cache.test.ts`

**Interfaces:**

- Consumes: Existing mobile API client functions and schemas, query keys, session user, and infinite data.
- Produces: bootstrap/workspace/channel/DM/search query hooks, DM-conversation selector hook, send mutations, `flattenMobileInfiniteData()`, page update helpers, and exact rollback contexts.

- [ ] **Step 1: Write failing cache-operation tests**

Test these exported pure functions with small typed fixtures:

```ts
const inserted = insertOptimisticMobileMessage(data, optimistic);
assert.equal(flattenMobileInfiniteData(inserted).at(-1)?.id, optimistic.id);

const replaced = replaceMobileMessage(inserted, optimistic.id, serverMessage);
assert.equal(flattenMobileInfiniteData(replaced).at(-1)?.id, serverMessage.id);

const deduped = appendOrReplaceMobileMessage(replaced, serverMessage);
assert.equal(
  flattenMobileInfiniteData(deduped).filter(({ id }) => id === serverMessage.id).length,
  1,
);

assert.deepEqual(restoreMobileMessageSnapshot(inserted, data), data);
```

- [ ] **Step 2: Confirm the focused test fails before cache helpers exist**

Run the focused Node test; expect module-not-found failure.

- [ ] **Step 3: Implement query option factories and hooks**

- Bootstrap uses `fetchMobileBootstrap` and the bootstrap key.
- Workspace uses `fetchMobileWorkspaceServer` and is enabled only for a non-empty server ID.
- Channel and DM messages use `useInfiniteQuery`, existing cursor clients, and `getNextPageParam: page => page.nextCursor ?? undefined`.
- `useMobileDMConversationsQuery()` selects `home.directMessages` from the bootstrap query; it does not call a new endpoint.
- Search uses the opaque search-key registry, existing validation limits, and infinite cursor pagination.

- [ ] **Step 4: Implement exact optimistic lifecycle**

`onMutate` cancels the target query, captures `previousData`, creates a valid in-memory optimistic message from the signed-in user, and inserts it. `onError` restores `previousData`. `onSuccess` replaces the client ID and deduplicates server/realtime echoes. `onSettled` invalidates bootstrap summary data and only the affected message query.

- [ ] **Step 5: Prove query keys and errors are redacted**

Add assertions that serialized keys exclude the submitted message and search query, and mutation error adapters expose localized bounded codes rather than response bodies.

- [ ] **Step 6: Verify and commit**

Run typecheck and full mobile tests; expect PASS.

```powershell
git commit -m "feat: add mobile data query hooks"
```

### Task 5: Add Typed Linking and Navigation Contracts

**Files:**

- Create: `apps/mobile/src/navigation/mobile-navigation-types.ts`
- Create: `apps/mobile/src/navigation/mobile-linking.ts`
- Create: `apps/mobile/src/navigation/mobile-navigation-ref.ts`
- Create: `apps/mobile/scripts/mobile-linking-config.test.ts`
- Modify: `apps/mobile/src/navigation/mobile-navigation.ts`

**Interfaces:**

- Produces: `MobileRootStackParamList`, `MobileBottomTabParamList`, `MOBILE_LINKING_PREFIXES`, `createMobileLinkingOptions()`, `resolveMobileNavigationIntent()`, and typed navigation ref helpers.
- Preserves: `MobileTabId`, reducer exports, route parsing, and auth resolution.

- [ ] **Step 1: Write failing safe-link resolution tests**

Cover these exact cases:

```ts
assert.deepEqual(resolveMobileNavigationIntent("whispr://channels/server-1/channel-1", options), {
  name: "ChannelChat",
  params: { channelId: "channel-1", serverId: "server-1" },
  type: "route",
});
assert.equal(resolveMobileNavigationIntent("whispr://channels/@me?token=secret", options), null);
assert.deepEqual(resolveMobileNavigationIntent("whispr://settings", options), {
  name: "MainTabs",
  params: { screen: "settings" },
  type: "route",
});
```

Also assert auth-handoff and invite values return typed command intents rather than route state.

- [ ] **Step 2: Run and confirm missing linking module**

Run the focused Node test; expect module-not-found failure.

- [ ] **Step 3: Implement typed route lists and safe intent resolution**

Root routes are `MainTabs`, `ChannelChat`, `DirectMessage`, and `SettingsDetail`. Tab routes use the five stable IDs. Linking calls the existing deep-link parser first; no raw URL reaches React Navigation before validation.

- [ ] **Step 4: Implement cold-start and foreground linking adapters**

`createMobileLinkingOptions()` supplies trusted scheme/web prefixes, `getInitialURL`, and `subscribe`. Route intents call the React Navigation listener; command intents call a provider callback for auth handoff/invite handling.

- [ ] **Step 5: Verify legacy navigation tests remain green**

Run the original `mobile-navigation-contract.test.ts` plus the new linking test.

- [ ] **Step 6: Run milestone verification and commit**

Run typecheck and full mobile tests; expect PASS.

```powershell
git commit -m "feat: add mobile navigation contracts"
```

### Task 6: Extract Root Lifecycles into Providers

**Files:**

- Create: `apps/mobile/src/app/providers/mobile-locale-provider.tsx`
- Create: `apps/mobile/src/app/providers/mobile-media-provider.tsx`
- Create: `apps/mobile/src/app/providers/mobile-notification-provider.tsx`
- Create: `apps/mobile/src/app/providers/mobile-voice-provider.tsx`
- Create: `apps/mobile/src/app/providers/mobile-deep-link-provider.tsx`
- Create: `apps/mobile/src/app/providers/mobile-app-providers.tsx`
- Create: `apps/mobile/component-tests/mobile-app-providers.test.tsx`
- Modify: `apps/mobile/src/app/whispr-mobile-root.tsx`

**Interfaces:**

- Produces one context hook per lifecycle: `useMobileLocaleRuntime`, `useMobileMediaRuntime`, `useMobileNotificationRuntime`, `useMobileVoiceRuntime`, and `useMobileDeepLinkRuntime`.
- Each hook throws a bounded configuration error when used outside its provider.

- [ ] **Step 1: Add provider render tests before provider modules exist**

Render `MobileAppProviders` with mocked auth/API dependencies and assert locale, notification, media, voice, and deep-link consumers receive initial states without triggering native permission prompts.

- [ ] **Step 2: Run component test and confirm module-not-found failure**

Run: `corepack pnpm --filter @wizards/mobile test:components -- mobile-app-providers.test.tsx`

Expected: FAIL because providers do not exist.

- [ ] **Step 3: Move lifecycle ownership without changing contract modules**

Move locale repository load/save, notification request state, media permission/draft state, voice hook orchestration, and deep-link command handling from `WhisprMobileRoot` into focused providers. Import existing `src/auth` and `src/voice` APIs; do not edit those directories.

- [ ] **Step 4: Compose providers in a stable order**

Use: locale → notification → media → voice → deep link. Keep Query and Auth providers outside this composition. Expose only state/actions used by screens.

- [ ] **Step 5: Remove migrated state/effects from the root**

Delete only root state/effects now owned by providers. Keep existing screen rendering and data-fetch paths intact until Tasks 7-8 replace them.

- [ ] **Step 6: Verify no permission prompt occurs on provider mount**

Component mocks must assert camera, microphone, photo, and notification request functions were not called.

- [ ] **Step 7: Run milestone verification and commit**

Run typecheck, full mobile tests, and focused component tests; expect PASS.

```powershell
git commit -m "refactor: extract mobile app providers"
```

### Task 7: Activate React Navigation and Screen-Owned Data

**Files:**

- Create: `apps/mobile/src/navigation/mobile-bottom-tab-bar.tsx`
- Create: `apps/mobile/src/navigation/mobile-navigator.tsx`
- Create: `apps/mobile/src/app/screens/mobile-screen-containers.tsx`
- Create: `apps/mobile/component-tests/mobile-navigation.test.tsx`
- Modify: `apps/mobile/src/app/mobile-app-shell.tsx`
- Modify: `apps/mobile/src/app/screens/home-screen.tsx`
- Modify: `apps/mobile/src/app/screens/dm-screen.tsx`
- Modify: `apps/mobile/src/app/screens/channel-screen.tsx`
- Modify: `apps/mobile/src/app/screens/notifications-screen.tsx`
- Modify: `apps/mobile/src/app/screens/settings-screen.tsx`
- Modify: `apps/mobile/src/app/screens/voice-screen.tsx`
- Modify: `apps/mobile/src/app/whispr-mobile-root.tsx`

**Interfaces:**

- Consumes: Query hooks, provider hooks, Zustand stores, typed navigation/ref/linking.
- Produces: `MobileNavigator`, custom tab bar, tab/stack screen containers, protected-route wrapper, and screen-owned refresh/send/select actions.

- [ ] **Step 1: Add component tests for the five tabs, guards, and stack routes**

Assert all five `mobile-bottom-tab-*` IDs render when signed in; settings renders while signed out; protected tabs render `AuthGate`; selecting a channel pushes `ChannelChat`; selecting a DM pushes `DirectMessage`; hardware-back dispatch pops the stack without an exit dialog component.

- [ ] **Step 2: Run focused component test and confirm navigation module failure**

Run the navigation component test; expect module-not-found failure.

- [ ] **Step 3: Implement custom bottom tabs without visual redesign**

Move the existing floating tab-bar markup/styles into `mobile-bottom-tab-bar.tsx`. Use React Navigation descriptors/state/navigation and preserve icons, labels, unread badge, accessibility state, and test IDs exactly.

- [ ] **Step 4: Implement root stack, bottom tabs, and protected wrappers**

Mount `NavigationContainer` with validated linking. Root stack contains `MainTabs`, `ChannelChat`, `DirectMessage`, and `SettingsDetail`. Use `resolveMobileRoute` for tab guards and explicit signed-in checks for stack routes.

- [ ] **Step 5: Build screen containers that consume hooks directly**

Each container reads its own query/provider/store hooks, creates local view callbacks, and passes props only to its immediate presentational screen. Channel/DM IDs come from typed route params. Focus updates active-target store; blur clears only the matching target.

- [ ] **Step 6: Remove tab reducer runtime and root-to-screen prop bundle**

Replace `ActiveScreen` dispatch from the root with `MobileNavigator`. Keep pure reducer exports/tests. Remove `ActiveScreenProps` usage after no screen depends on it.

- [ ] **Step 7: Verify navigation and auth parity**

Run component tests, navigation/linking Node tests, typecheck, and full mobile tests. Expected: PASS.

- [ ] **Step 8: Run Android Maestro navigation and back evidence**

On a connected Android device/emulator, run the repository's Maestro flows for channel navigation, DM navigation, invite deep links, settings deep links, and hardware back. Update or add only the flow steps required by the new navigation runtime while preserving existing test IDs. Save the exact commands, exit results, and Maestro artifact paths for `apps/mobile/MIGRATION_PHASE_0.md`. Any failed or unexecuted scenario blocks this task.

- [ ] **Step 9: Commit the navigation/screen migration**

```powershell
git commit -m "refactor: migrate mobile screens to navigation"
```

### Task 8: Add the Single Realtime Query Bridge

**Files:**

- Create: `apps/mobile/src/realtime/realtime-query-bridge.ts`
- Create: `apps/mobile/src/app/providers/mobile-realtime-provider.tsx`
- Create: `apps/mobile/scripts/mobile-realtime-query-bridge.test.ts`
- Modify: `apps/mobile/src/app/providers/mobile-app-providers.tsx`
- Modify: `apps/mobile/src/app/whispr-mobile-root.tsx`

**Interfaces:**

- Consumes: `QueryClient`, `MobileRealtimeEventEnvelope`, active-target store, existing realtime contract/state/client functions.
- Produces: `createMobileRealtimeQueryBridge()`, `MobileRealtimeProvider`, `useMobileRealtimeRuntime()`, and foreground `backfill()`.

- [ ] **Step 1: Write fake-timer bridge tests**

Test exact mappings: presence/notification → bootstrap; workspace → active server; channel → active channel; DM → active conversation. Assert repeated sources within 350 ms invalidate once, validated channel payload uses `setQueryData`, DM payload invalidates, and `dispose()` clears timers.

- [ ] **Step 2: Run focused bridge test and confirm missing module**

Expected: module-not-found failure.

- [ ] **Step 3: Implement the pure debounced bridge**

Use existing refresh-source and timer-source helpers. Expose `handleEvent`, `backfill`, and `dispose`. Route validated channel message payloads through the existing channel-message updater adapted to infinite pages; do not store unsafe socket payloads.

- [ ] **Step 4: Implement realtime provider lifecycle**

The provider owns client connection state, typing state, active target subscription, AppState visibility, foreground source calculation, socket connect/disconnect, and bridge cleanup. It imports but does not modify current contract/client files.

- [ ] **Step 5: Remove manual refresh callback chains**

Delete root `refreshMobileRealtimeSources`, `scheduleRealtimeRefresh`, request-ID refresh effects, and corresponding screen refresh props after query invalidation owns the flow.

- [ ] **Step 6: Verify redaction and backfill behavior**

Run realtime contract/state tests plus bridge tests and assert diagnostics contain no message body or token.

- [ ] **Step 7: Run milestone verification and commit**

Run typecheck and full mobile tests; expect PASS.

```powershell
git commit -m "refactor: bridge mobile realtime queries"
```

### Task 9: Migrate Lists, Images, and the Tab Micro-Animation

**Files:**

- Create: `apps/mobile/src/app/components/mobile-cached-image.tsx`
- Create: `apps/mobile/component-tests/mobile-performance-surfaces.test.tsx`
- Modify: `apps/mobile/src/app/components/ui-atoms.tsx`
- Modify: `apps/mobile/src/app/components/message-primitives.tsx`
- Modify: `apps/mobile/src/app/screens/channel-screen.tsx`
- Modify: `apps/mobile/src/app/screens/dm-screen.tsx`
- Modify: `apps/mobile/src/app/screens/home-screen.tsx`
- Modify: `apps/mobile/src/navigation/mobile-bottom-tab-bar.tsx`
- Modify: corresponding `*.styles.ts` files

**Interfaces:**

- Produces: cached avatar/attachment image wrapper, FlashList-backed message/conversation/channel surfaces, and reduced-motion-aware active-tab animation.

- [ ] **Step 1: Add failing performance-surface component tests**

Mock FlashList and Expo Image, render channel/DM/home surfaces, and assert list data reaches FlashList, avatars/attachments reach Expo Image with `cachePolicy="memory-disk"`, and all current test IDs/accessibility labels remain.

- [ ] **Step 2: Confirm the focused test fails against FlatList/View mapping/RN Image**

Expected: FAIL because required FlashList and Expo Image mocks are not called.

- [ ] **Step 3: Replace message and navigation lists with FlashList**

Migrate channel messages, DM message stream, DM conversation list, workspace channel list, and bounded server list. Preserve pull-to-refresh, keyboard behavior, scroll-to-latest, empty/error states, stable keys, and chronological flattening.

- [ ] **Step 4: Remove shell-level scrolling**

`MobileAppShell` becomes a flex layout only. Home, notification, voice, and settings containers own their ScrollView or FlashList. No same-axis virtualized list is nested in a ScrollView.

- [ ] **Step 5: Replace avatar and attachment images**

Use `MobileCachedImage` backed by `expo-image` with `cachePolicy="memory-disk"`, `contentFit="cover"`, bounded dimensions, and unchanged accessibility semantics. Local app logo may remain a bundled static asset.

- [ ] **Step 6: Add one reduced-motion-aware active-tab animation**

Use Reanimated shared value/animated style for active scale/translation. When reduced motion is enabled, render the final active state without spring movement. Do not alter tab layout or labels.

- [ ] **Step 7: Run milestone verification and commit**

Run typecheck, full mobile tests, and focused component tests; expect PASS.

```powershell
git commit -m "perf: virtualize mobile message surfaces"
```

### Task 10: Remove Legacy Orchestration and Close the Migration

**Files:**

- Create: `apps/mobile/MIGRATION_PHASE_0.md`
- Create: `apps/mobile/scripts/mobile-phase-zero-boundary.test.ts`
- Modify: `apps/mobile/src/app/whispr-mobile-root.tsx`
- Modify: `apps/mobile/src/quality/mobile-quality-gate.ts`
- Delete after `rg` proves zero consumers: `apps/mobile/src/app/mobile-screen-state.ts`
- Delete after `rg` proves zero consumers: `apps/mobile/src/app/mobile-screen-sync.ts`
- Delete after `rg` proves zero consumers: `apps/mobile/src/app/mobile-root-screen-types.ts`
- Delete after `rg` proves zero consumers: `apps/mobile/src/app/mobile-root-screen-shared.tsx`
- Delete after `rg` proves zero consumers: `apps/mobile/src/app/mobile-root-screens.tsx`
- Update: `graphify-out/GRAPH_REPORT.md`, `graphify-out/graph.json`, `graphify-out/manifest.json` via `graphify update .`

**Interfaces:**

- Produces: root below 300 lines, no screen prop bundle/manual fetch chain, migration evidence, final quality gates, and current Graphify artifacts.

- [ ] **Step 1: Add failing boundary tests**

Assert `whispr-mobile-root.tsx` has fewer than 300 physical lines, imports `MobileNavigator` and `MobileAppProviders`, does not import manual fetch clients, does not declare screen request-ID refs, and no `ActiveScreenProps` root bundle remains. Scan query/state code for persistence middleware and raw sensitive key material.

- [ ] **Step 2: Run boundary test and confirm it identifies remaining legacy code**

Expected: FAIL with exact root length/import/legacy-state assertions.

- [ ] **Step 3: Delete only proven-dead orchestration**

Use `rg` to prove each compatibility symbol has zero consumers before removing it. Keep contract modules and public pure APIs. Reduce the root to fonts, providers, navigator, status bar-level orchestration, and global overlay composition.

- [ ] **Step 4: Write the migration note**

Document provider hierarchy, navigation route table, screen-to-hook/store mapping, query keys, realtime mappings, sign-out resets, no-persistence decision, exact `npx expo install --check` output, Maestro testID evidence, and next-phase extension points. Include exactly:

> Faz 0 sonrası predictive back'i yeniden aç ve Android cihazlarda stack pop, root back ve deep-link dönüşlerini doğrula.

- [ ] **Step 5: Prove Maestro testID compatibility**

Extract IDs referenced by `.maestro/**/*.yaml`, assert each appears in source or a rendered component-test query, and include the ID-to-file evidence table in the migration note. Do not claim Maestro device execution unless an emulator/device run actually occurs.

- [ ] **Step 6: Run all required final checks**

Run from repository root:

```powershell
corepack pnpm --filter @wizards/mobile typecheck
corepack pnpm --filter @wizards/mobile test
corepack pnpm --filter @wizards/mobile test:components
corepack pnpm --filter @wizards/mobile quality:check
```

Run from `apps/mobile`:

```powershell
npx expo install --check
```

Expected: every command exits 0; report exact test counts and Expo alignment output.

- [ ] **Step 7: Update Graphify after code changes**

Run from repository root: `graphify update .`

Expected: AST graph artifacts update without inventing semantic relationships.

- [ ] **Step 8: Review the complete diff and commit closure**

Confirm unrelated user changes remain unstaged. Review changed mobile files for auth/voice/contract scope violations and sensitive strings.

```powershell
git commit -m "refactor: complete mobile phase zero migration"
```
