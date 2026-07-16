# Mobile Profile & Settings 1F Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a high-fidelity authenticated Profile tab matching handoff 1F with only real profile, presence, session, theme, locale, and release data.

**Architecture:** Keep ProfileSettingsScreen as the sole Profile route. Make the existing presence mutation optimistic through a small reversible cache helper, and make the existing hub render explicit ready/loading/error states using product-provider props. Reuse the existing theme, locale, navigation, BottomSheet, Avatar, and DestructiveConfirmationSheet primitives.

**Tech Stack:** React Native, TypeScript, React Navigation, TanStack Query, Jest/React Native Testing Library, Node test runner, Expo Android UAT scripts.

## Global Constraints

- Work on uat; preserve all currently modified or untracked files outside deliberate 1F edits.
- Treat graphify-out/GRAPH_REPORT.md, design_handoff_whispr_mobile/README.md, and the HTML id="1f" section as authoritative.
- Keep testID="mobile-settings-screen"; only ready bootstrap data may render an account identity.
- Do not render fabricated identity, presence, session, locale, theme, or release data.
- Presence accepts only MobileFriendPresenceStatus and calls the existing authenticated endpoint.
- Never render credentials, tokens, or raw mutation errors.
- Use theme tokens, keep controls at least theme.sizing.minTouchTarget, preserve existing detail routes and persisted theme/workspace-layout controls.
- The sign-out callback is only called from a confirmed DestructiveConfirmationSheet action.
- Run graphify update . after code changes; never adopt a device capture as a visual baseline.

---

## File Structure

- Modify apps/mobile/src/query/mobile-profile-cache.ts: patch and restore the matching user's bootstrap, profile, friend, and workspace presence caches.
- Modify apps/mobile/src/social/mobile-social-query.ts: run the existing presence request with optimistic patch, rollback, and authoritative query invalidation.
- Modify apps/mobile/src/app/mobile-product-app.tsx: pass the actual updatePresence callback and session diagnostics to settings props.
- Modify apps/mobile/src/app/screens/settings-screen.tsx: add ready/loading/error profile states, status selector, real security status, and confirmation-gated sign out.
- Modify apps/mobile/src/app/screens/settings-screen.styles.ts: encode 1F geometry through existing tokens and clear the floating tab bar.
- Modify apps/mobile/component-tests/profile-settings-screen.test.tsx: test 1F data, state, interactions, navigation, and confirmation.
- Modify apps/mobile/component-tests/settings-appearance.test.tsx: retain persisted theme behavior.
- Modify apps/mobile/scripts/mobile-profile-cache.test.ts: test current-user-only presence cache patch and restore.
- Modify apps/mobile/scripts/mobile-design-contract.test.ts: test 1F semantic/style/no-dummy/logout contracts.

## Task 1: Reversible presence cache update

**Files:**
- Modify: apps/mobile/src/query/mobile-profile-cache.ts:1-140
- Test: apps/mobile/scripts/mobile-profile-cache.test.ts:1-201

**Interfaces:**
- Consumes: QueryClient, MobileFriendPresenceStatus, mobileQueryKeys.
- Produces: patchMobileProfilePresenceCaches(input) and restoreMobileProfilePresenceCaches(snapshot).

- [ ] **Step 1: Write the failing cache contract test**

Add an authenticated current-user fixture. Verify the helper changes the bootstrap user status, profile user status, matching friend status/presence, and matching workspace-member status while preserving unrelated object references. Restore the snapshot and verify the prior caches return.

~~~typescript
const snapshot = patchMobileProfilePresenceCaches({
  queryClient,
  status: "DND",
  userId: "user-1",
});

assert.equal(queryClient.getQueryData<MobileBootstrapPayload>(mobileQueryKeys.bootstrap())!.user.status, "DND");
assert.equal(queryClient.getQueryData<MobileFriendsOverviewResponse>(mobileQueryKeys.friends())!.friends[0]!.presence.status, "DND");
assert.equal(queryClient.getQueryData<MobileFriendsOverviewResponse>(mobileQueryKeys.friends())!.friends[1], friends.friends[1]);

restoreMobileProfilePresenceCaches(snapshot);
assert.equal(queryClient.getQueryData<MobileBootstrapPayload>(mobileQueryKeys.bootstrap()), bootstrap);
~~~

- [ ] **Step 2: Run the test to verify it fails**

Run: corepack pnpm --filter @wizards/mobile exec node --import tsx --test scripts/mobile-profile-cache.test.ts

Expected: FAIL because the two presence-cache helpers are not exported.

- [ ] **Step 3: Write minimal cache implementation**

Capture the exact values of bootstrap, profile, friends, and workspace-root query entries before writing. Patch only matching identities, do not create missing records, and restore exactly those captured values.

~~~typescript
export function patchMobileProfilePresenceCaches(input: {
  queryClient: QueryClient;
  status: MobileFriendPresenceStatus;
  userId: string;
}): MobileProfilePresenceCacheSnapshot {
  // Capture before mutation and patch only identity matches.
}

export function restoreMobileProfilePresenceCaches(
  snapshot: MobileProfilePresenceCacheSnapshot,
): void {
  // Restore captured query values without synthesizing data.
}
~~~

- [ ] **Step 4: Run the test to verify it passes**

Run: corepack pnpm --filter @wizards/mobile exec node --import tsx --test scripts/mobile-profile-cache.test.ts

Expected: PASS with both the existing avatar-cache coverage and the new presence test.

- [ ] **Step 5: Commit the isolated task**

~~~powershell
git add -- apps/mobile/src/query/mobile-profile-cache.ts apps/mobile/scripts/mobile-profile-cache.test.ts
git commit -m "feat(mobile): patch profile presence caches"
~~~

## Task 2: Optimistic authenticated presence mutation

**Files:**
- Modify: apps/mobile/src/social/mobile-social-query.ts:31-64
- Test: apps/mobile/component-tests/profile-settings-screen.test.tsx:35-277

**Interfaces:**
- Consumes: Task 1 helpers, updateMobilePresence(client, status), mobileQueryKeys.bootstrap().
- Produces: useMobileSocialMutations(client).updatePresence with optimistic update, rollback, and refetch.

- [ ] **Step 1: Write the failing Profile interaction test**

Render a ready Profile hub with an unresolved onUpdatePresence promise. Open the status selector, choose DND, assert that the label changes before resolution, reject with a secret-like message, then assert that Online returns and the raw message is absent.

~~~tsx
await fireEvent.press(view.getByTestId("mobile-profile-presence-open"));
await fireEvent.press(view.getByTestId("mobile-profile-presence-dnd"));
expect(view.getByText(copy.presenceDoNotDisturb)).toBeTruthy();

deferred.reject(new Error("Bearer secret-value"));
await waitFor(() => expect(view.getByText(copy.presenceOnline)).toBeTruthy());
expect(view.queryByText("Bearer secret-value")).toBeNull();
~~~

- [ ] **Step 2: Run the test to verify it fails**

Run: corepack pnpm --filter @wizards/mobile test:components -- --runInBand profile-settings-screen.test.tsx

Expected: FAIL because the current hub has neither the presence selector nor the callback prop.

- [ ] **Step 3: Add optimistic mutation lifecycle**

Use the bootstrap cache's actual user id in onMutate. Cancel bootstrap queries, create Task 1's snapshot, restore it in onError, and invalidate bootstrap/friends in onSettled. Retain updateMobilePresence as the only request.

~~~typescript
updatePresence: useMutation({
  mutationFn: (status: MobileFriendPresenceStatus) => updateMobilePresence(client, status),
  onMutate: async (status) => {
    await queryClient.cancelQueries({ queryKey: mobileQueryKeys.bootstrap() });
    const userId = queryClient.getQueryData<MobileBootstrapPayload>(mobileQueryKeys.bootstrap())?.user.id;
    return userId ? patchMobileProfilePresenceCaches({ queryClient, status, userId }) : null;
  },
  onError: (_error, _status, snapshot) => snapshot && restoreMobileProfilePresenceCaches(snapshot),
  onSettled: async () => Promise.all([
    queryClient.invalidateQueries({ queryKey: mobileQueryKeys.bootstrap() }),
    queryClient.invalidateQueries({ queryKey: mobileQueryKeys.friends() }),
  ]),
})
~~~

- [ ] **Step 4: Run the test to verify it passes**

Run: corepack pnpm --filter @wizards/mobile test:components -- --runInBand profile-settings-screen.test.tsx

Expected: PASS; the status responds immediately, safely rolls back, and exposes no raw error.

- [ ] **Step 5: Commit the isolated task**

~~~powershell
git add -- apps/mobile/src/social/mobile-social-query.ts apps/mobile/component-tests/profile-settings-screen.test.tsx
git commit -m "feat(mobile): make profile presence updates optimistic"
~~~

## Task 3: 1F profile state machine and interactions

**Files:**
- Modify: apps/mobile/src/app/mobile-product-app.tsx:47-340
- Modify: apps/mobile/src/app/screens/settings-screen.tsx:1-315,1752-1970
- Modify: apps/mobile/component-tests/profile-settings-screen.test.tsx:35-277
- Modify: apps/mobile/component-tests/settings-appearance.test.tsx:34-78

**Interfaces:**
- Consumes: bootstrapState, MobileSessionDiagnostics, MobileFriendPresenceStatus, Task 2 mutation, BottomSheet, DestructiveConfirmationSheet, mobileNavigationRef.
- Produces: ProfileSettingsScreen props onUpdatePresence(status): Promise<void> and sessionDiagnostics plus stable 1F test IDs.

- [ ] **Step 1: Write failing ready/loading/error/navigation/logout tests**

Use a ready bootstrap payload with actual id, displayName, username, avatarUrl, and status. Assert real identity, version, selected presence, and secure-session result. Assert loading renders mobile-settings-profile-loading without Whispr or @whispr; error renders an error/retry surface without identity. Mock mobileNavigationRef and assert Profile edit plus account/security/appearance/notifications/language/about routes. Open logout and prove onSignOut is untouched until confirmation.

~~~tsx
expect(loadingView.getByTestId("mobile-settings-profile-loading")).toBeTruthy();
expect(loadingView.queryByText("Whispr")).toBeNull();

await fireEvent.press(readyView.getByLabelText(copy.signOutAction));
expect(onSignOut).not.toHaveBeenCalled();
await fireEvent.press(readyView.getByTestId("mobile-profile-sign-out-confirmation-confirm"));
expect(onSignOut).toHaveBeenCalledTimes(1);
~~~

- [ ] **Step 2: Run the focused test set and verify it fails**

Run: corepack pnpm --filter @wizards/mobile test:components -- --runInBand profile-settings-screen.test.tsx settings-appearance.test.tsx

Expected: FAIL because the hub currently uses fixed presence/fallback values and direct sign out.

- [ ] **Step 3: Wire real product state**

Call useMobileSocialMutations(apiClient) once in MobileProductApp and pass updatePresence.mutateAsync into settingsScreenProps. Pass non-sensitive existing session diagnostics through the same provider props. Do not add a second API request or store.

~~~typescript
const socialMutations = useMobileSocialMutations(apiClient);

const settingsScreenProps: MobileSettingsScreenProps = {
  // existing properties
  onUpdatePresence: socialMutations.updatePresence.mutateAsync,
  sessionDiagnostics,
};
~~~

- [ ] **Step 4: Implement the hub state machine and status sheet**

Return a profile-shaped skeleton for loading and a localized retry surface for error. In ready state consume bootstrapState.payload.user only; use its status to initialize the label. Make the status row an accessible Pressable with testID mobile-profile-presence-open. Render four enum choices in BottomSheet with IDs mobile-profile-presence-online, mobile-profile-presence-idle, mobile-profile-presence-dnd, and mobile-profile-presence-offline. Update local status before awaiting the callback, roll it back after rejection, and show only localized generic failure text.

~~~tsx
if (bootstrapState.status === "loading") {
  return <ProfileSettingsLoadingState testID="mobile-settings-profile-loading" />;
}
if (bootstrapState.status === "error") {
  return <ProfileSettingsErrorState error={bootstrapState.error} onRetry={onRefreshBootstrap} />;
}
return <MobileProfileSettingsHub bootstrap={bootstrapState.payload} />;
~~~

- [ ] **Step 5: Keep existing destinations and confirmation boundary**

Use mobileNavigationRef.navigate("ProfileEdit") for edit and navigateToMobileSettingsDetail("account" | "security" | "appearance" | "notifications" | "language" | "about") for setting rows. Derive the secure-session value from session diagnostics without displaying details. Keep the existing theme, workspace-layout, and locale selectors in their detail routes. Replace direct logout onPress with opening DestructiveConfirmationSheet; its confirm handler alone invokes onSignOut.

- [ ] **Step 6: Run focused tests to verify they pass**

Run: corepack pnpm --filter @wizards/mobile test:components -- --runInBand profile-settings-screen.test.tsx settings-appearance.test.tsx

Expected: PASS for real data, loading/error states, optimistic rollback, route actions, persistent appearance, real version, and confirmation-gated logout.

- [ ] **Step 7: Commit the isolated task**

~~~powershell
git add -- apps/mobile/src/app/mobile-product-app.tsx apps/mobile/src/app/screens/settings-screen.tsx apps/mobile/component-tests/profile-settings-screen.test.tsx apps/mobile/component-tests/settings-appearance.test.tsx
git commit -m "feat(mobile): complete real-data profile settings hub"
~~~

## Task 4: Tokenized 1F visual contract

**Files:**
- Modify: apps/mobile/src/app/screens/settings-screen.styles.ts:260-421
- Modify: apps/mobile/scripts/mobile-design-contract.test.ts:293-360
- Test: apps/mobile/component-tests/profile-settings-screen.test.tsx:35-277

**Interfaces:**
- Consumes: MobileTheme, existing Avatar/Ionicons, floating tab-bar layout.
- Produces: tokenized 1F style keys and source-level design guards.

- [ ] **Step 1: Write failing design contract assertions**

Assert the Profile root test ID, real bootstrap-user source, absence of account fallback literals, presence selector, DestructiveConfirmationSheet, 72px banner, 24px card radius, and at least 100px content bottom padding.

~~~typescript
assert.match(profileSettingsSource, /testID="mobile-settings-screen"/);
assert.match(profileSettingsSource, /bootstrapState.payload.user/);
assert.doesNotMatch(profileSettingsSource, /??s*["']Whispr["']|@whispr/);
assert.match(profileSettingsSource, /<DestructiveConfirmationSheet/);
assert.match(stylesSource, /height:s*72/);
assert.match(stylesSource, /borderRadius:s*24/);
assert.match(stylesSource, /paddingBottom:s*1(?:0[0-9]|[1-9][0-9])/);
~~~

- [ ] **Step 2: Run the design contract test and verify it fails**

Run: corepack pnpm --filter @wizards/mobile exec node --import tsx --test scripts/mobile-design-contract.test.ts

Expected: FAIL until the hub has the real-data/confirmation semantics and the required layout contract.

- [ ] **Step 3: Apply 1F geometry using tokens**

Use only theme.surface, theme.border, theme.accent, theme.status, theme.text, theme.sizing, and theme.typography. Set title horizontal inset 24px, identity/grouped-card radius 24px, banner height 72px, avatar ring 76px with 26px radius and 4px card ring, row icons 38px with 13px radius, row vertical padding 11px, group gap 12px, and content bottom padding 108px. Ensure every Pressable is at least theme.sizing.minTouchTarget tall.

~~~typescript
mobileProfileHubContent: {
  gap: 12,
  paddingBottom: 108,
  paddingHorizontal: 20,
  paddingTop: 16,
},
mobileProfileIdentityBanner: { backgroundColor: theme.accent.default, height: 72 },
mobileProfileSettingsCard: {
  backgroundColor: theme.surface.card,
  borderColor: theme.border.subtle,
  borderRadius: 24,
  borderWidth: 1,
},
~~~

- [ ] **Step 4: Run visual-contract and component tests to verify they pass**

Run: corepack pnpm --filter @wizards/mobile exec node --import tsx --test scripts/mobile-design-contract.test.ts

Run: corepack pnpm --filter @wizards/mobile test:components -- --runInBand profile-settings-screen.test.tsx

Expected: PASS with semantic/style guards and rendered interactions green.

- [ ] **Step 5: Commit the isolated task**

~~~powershell
git add -- apps/mobile/src/app/screens/settings-screen.styles.ts apps/mobile/scripts/mobile-design-contract.test.ts apps/mobile/component-tests/profile-settings-screen.test.tsx
git commit -m "style(mobile): align profile settings with 1f"
~~~

## Task 5: Full verification and signed-in Android comparison

**Files:**
- Modify: graphify-out/GRAPH_REPORT.md
- Modify: graphify-out/graph.json
- Modify: graphify-out/manifest.json
- Evidence: artifacts/redesign/1f-light/

**Interfaces:**
- Consumes: Tasks 1-4, Android UAT build/capture/gate scripts, an already-authenticated UAT emulator session.
- Produces: updated graph artifacts, command results, visual capture/manifest/overlay/report paths, and explicit dark-mode observation.

- [ ] **Step 1: Run complete automated verification**

~~~powershell
corepack pnpm --filter @wizards/mobile test
corepack pnpm --filter @wizards/mobile test:components -- --runInBand
corepack pnpm --filter @wizards/mobile typecheck
corepack pnpm --filter @wizards/mobile quality:check
graphify update .
~~~

Expected: every command exits 0. For a failure, inspect the result, add a focused regression test if behavior is wrong, fix the root cause, and rerun the failed command plus its focused test.

- [ ] **Step 2: Build and install local Android UAT**

Run: corepack pnpm --filter @wizards/mobile android:uat:local

Expected: build and installation succeed without entering credentials, bypassing login, or changing auth state.

- [ ] **Step 3: Capture and gate signed-in light 1F**

With an existing UAT session only, compare Profile against the HTML 1F section and screenshots/1f-profil.png. Correct banner/avatar overlap, cards, row heights, colors, typography, chevrons, tab-bar clearance, and active Profile pill before capture.

~~~powershell
corepack pnpm --filter @wizards/mobile visual:capture:android -- --anchor 1f
$env:WHISPR_DEVICE_CAPTURE_DIRECTORY='artifacts/redesign'; corepack pnpm --filter @wizards/mobile visual:gate -- --target 1f-light
~~~

Expected: capture/manifest under artifacts/redesign/1f-light and visual gate exits 0. If the gate fails, inspect report/overlay, fix application source, rebuild, recapture, and rerun; do not alter the reference baseline.

- [ ] **Step 4: Manually verify persisted dark mode**

Select dark in the existing Appearance detail route, return to Profile, close/reopen the app, and verify persistence plus token-correct profile card, borders, status dots, icon tones, and tab bar. If no authenticated UAT session exists, report it as the remaining blocker without entering credentials.

- [ ] **Step 5: Report scoped evidence and final state**

Report every command result, capture/manifest/overlay/report path, dark-mode outcome, and git status --short. Do not report completion when any required automated check, visual gate, signed-in capture, or dark-mode check is unavailable or failing.

## Plan Self-Review

- Spec coverage: Tasks 1-4 cover real profile/presence/session/theme/locale/version data, error recovery, navigation, accessibility, logout confirmation, visual geometry, dark-token behavior, and dummy-data prevention. Task 5 covers required automation and device validation.
- Placeholder scan: every task contains exact files, interfaces, test IDs, command lines, expected results, and staged commit scope.
- Type consistency: presence is MobileFriendPresenceStatus throughout; cache helpers use QueryClient, userId, and status; ProfileSettingsScreen receives onUpdatePresence(status): Promise<void> and session diagnostics.
