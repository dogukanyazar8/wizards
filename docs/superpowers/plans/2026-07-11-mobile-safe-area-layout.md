# Mobile Safe-Area Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore full-height mobile screens by eliminating the duplicate signed-in bottom reservation while keeping the custom tab bar clear of the system gesture area.

**Architecture:** `MobileAppShell` owns only the shared top safe area and must not shrink the signed-in navigation tree. `MobileBottomTabBar` remains the only owner of the bottom gesture inset for tabbed routes; React Navigation measures that bar and reserves its exact height for tab content. Stack routes continue to use their existing screen-level layouts without a global artificial inset.

**Tech Stack:** Expo 56, React Native 0.85, React Navigation 7, react-native-safe-area-context 5, Jest and React Native Testing Library.

## Global Constraints

- Work directly on `uat`; do not create a branch or worktree.
- Do not change application data, authentication, native configuration, or persistence behavior.
- The bottom gesture inset is applied exactly once, in `MobileBottomTabBar`.
- Every behavioral change is introduced with a failing test, then verified green.

---

### Task 1: Remove the global signed-in bottom reservation

**Files:**
- Modify: `apps/mobile/src/app/mobile-app-shell.tsx`
- Create: `apps/mobile/component-tests/mobile-app-shell.test.tsx`

**Consumes:** `MobileAppShell` and the semantic light theme.

**Produces:** A shell whose signed-in navigation child receives the full available content height.

- [x] **Step 1: Write the failing test**

```tsx
it("does not reserve a fixed bottom gap for signed-in navigation", () => {
  const styles = createMobileAppShellStyles(lightTheme);

  expect(styles.contentSignedIn).toBeUndefined();
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `corepack pnpm --filter @wizards/mobile test:components -- mobile-app-shell.test.tsx`

Expected: FAIL because `contentSignedIn` currently exists with `paddingBottom: 106`.

- [x] **Step 3: Write minimal implementation**

Remove `contentSignedIn` and its use from `MobileAppShell`; preserve the signed-out bottom inset because signed-out screens do not render the bottom tab navigator.

- [x] **Step 4: Run test to verify it passes**

Run: `corepack pnpm --filter @wizards/mobile test:components -- mobile-app-shell.test.tsx`

Expected: PASS.

### Task 2: Lock the single-owner bottom inset contract

**Files:**
- Modify: `apps/mobile/component-tests/mobile-app-shell.test.tsx`
- Modify: `apps/mobile/src/navigation/mobile-bottom-tab-bar.tsx` only if the regression test exposes duplicate inset ownership.

**Consumes:** `MobileBottomTabBar` continues to render `paddingBottom: Math.max(insets.bottom, 12)`.

**Produces:** A documented test boundary: the app shell does not reserve tab-bar space; the tab bar alone reserves the device gesture inset.

- [x] **Step 1: Write the failing contract test**

```tsx
expect(source).not.toContain("paddingBottom: 106");
expect(tabBarSource).toContain("paddingBottom: Math.max(insets.bottom, 12)");
```

- [x] **Step 2: Run the targeted test**

Run: `corepack pnpm --filter @wizards/mobile test:components -- mobile-app-shell.test.tsx`

Expected: FAIL until Task 1 removes the global reservation.

- [x] **Step 3: Keep the tab bar implementation unchanged unless evidence requires a change**

The existing custom tab bar already handles the system bottom inset. Do not add `safeAreaInsets` overrides or fixed heights that could create another platform-specific reservation.

- [x] **Step 4: Run the targeted test again**

Run: `corepack pnpm --filter @wizards/mobile test:components -- mobile-app-shell.test.tsx`

Expected: PASS.

### Task 3: Verify and ship

**Files:**
- Modify: `docs/superpowers/plans/2026-07-11-mobile-safe-area-layout.md` checkboxes only.

- [x] **Step 1: Run focused and full mobile gates**

Run:

```powershell
corepack pnpm --filter @wizards/mobile typecheck
corepack pnpm --filter @wizards/mobile test
corepack pnpm --filter @wizards/mobile test:components
corepack pnpm --filter @wizards/mobile quality:check
```

Expected: all commands exit 0.

- [x] **Step 2: Verify the emulator through the existing UAT dev client**

Run `corepack pnpm --filter @wizards/mobile android:uat:local`, open Messages, Overview, Notifications, Voice, and Profile, and confirm the bar is adjacent to the gesture safe area with no blank band beneath it.

- [x] **Step 3: Update graph and inspect the final diff**

Run `graphify update .`, then inspect `git diff --check`, `git status --short`, and the scoped diff before staging.

- [x] **Step 4: Commit and push the verified fix to `uat`**

```powershell
git add apps/mobile/src/app/mobile-app-shell.tsx apps/mobile/component-tests/mobile-app-shell.test.tsx docs/superpowers/plans/2026-07-11-mobile-safe-area-layout.md graphify-out
git commit -m "fix(mobile): restore bottom navigation layout"
git push origin uat
```
