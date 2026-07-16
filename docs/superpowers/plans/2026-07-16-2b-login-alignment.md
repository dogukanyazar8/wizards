# 2b Login Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align the native 2b login screen's vertical rhythm with the 390x844 reference while preserving every login behavior and contract.

**Architecture:** Keep the reusable auth kit unchanged. The login screen will own a viewport-height composition with a scrollable main content area and a separate footer region, while its screen stylesheet is the sole source of spacing and flex rules. `AuthScreenBackground` remains responsible for safe keyboard avoidance and scrolling semantics.

**Tech Stack:** React Native, TypeScript, Jest with React Native Testing Library, Expo/Android, Maestro.

## Global Constraints

- Work on branch `uat`; preserve all pre-existing dirty-worktree changes.
- Do not change copy, i18n keys, profile/social provider configuration, auth/2FA/remember-me behavior, testIDs, accessibility labels, themes, tokens, or shared auth-kit components.
- Use flex layout and gaps; do not solve viewport positioning with arbitrary fixed vertical offsets.
- Preserve safe-area, short-screen scrolling, and keyboard accessibility.
- Verify light and dark geometry, use an observation-only signed-out Maestro run, and leave evidence under `artifacts/redesign/2b-login-alignment/`.

---

### Task 1: Lock the login layout contract

**Files:**
- Modify: `apps/mobile/component-tests/auth-login-screen.test.tsx`
- Modify: `apps/mobile/src/app/screens/auth/auth-login-screen.tsx`
- Modify: `apps/mobile/src/app/screens/auth/auth-login-screen.styles.ts`

**Interfaces:**
- Consumes: `AuthLoginScreen`, its stable test IDs, and `StyleSheet.flatten` test helper.
- Produces: `mobile-auth-login-main-content` and `mobile-auth-login-footer` layout test IDs without altering existing test IDs.

- [ ] **Step 1: Write the failing test**

```tsx
it("keeps the login footer independent from the scrollable form layout", async () => {
  const view = await renderLogin();
  expect(view.getByTestId("mobile-auth-login-main-content").props.style).toEqual(
    expect.objectContaining({ flexGrow: 1 }),
  );
  expect(view.getByTestId("mobile-auth-login-footer").props.style).toEqual(
    expect.objectContaining({ paddingTop: 14 }),
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `corepack pnpm --filter @wizards/mobile test:components -- auth-login-screen.test.tsx --runInBand`

Expected: FAIL because the named layout regions do not exist.

- [ ] **Step 3: Write minimal implementation**

```tsx
<View style={styles.screen}>
  <ScrollView contentContainerStyle={styles.mainContent} ...>
    <View style={styles.topSection}>...</View>
    <View style={styles.form}>...</View>
    <View style={styles.socialGroup}>...</View>
  </ScrollView>
  <View style={styles.footer} testID="mobile-auth-login-footer">...</View>
</View>
```

```ts
mainContent: { flexGrow: 1, gap: 14, paddingTop: 18 },
footer: { paddingBottom: 26, paddingHorizontal: 24, paddingTop: 14 },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `corepack pnpm --filter @wizards/mobile test:components -- auth-login-screen.test.tsx --runInBand`

Expected: PASS with the existing login behavior tests still green.

### Task 2: Validate real-device layout evidence

**Files:**
- Create: `artifacts/redesign/2b-login-alignment/<capture>.png`
- Create: `artifacts/redesign/2b-login-alignment/reference-2b.png`
- Create: `artifacts/redesign/2b-login-alignment/comparison.png`
- Create: `artifacts/redesign/2b-login-alignment/comparison.md`

**Interfaces:**
- Consumes: the Android UAT app, reference `design_handoff_whispr_mobile/screenshots/2b-giris.png`, and captured signed-out screen.
- Produces: reproducible layout comparison evidence including viewport, theme, commit, inspected regions, and result.

- [ ] **Step 1: Run focused behavior and type verification**

```powershell
corepack pnpm --filter @wizards/mobile test:components -- auth-login-screen.test.tsx --runInBand
corepack pnpm --filter @wizards/mobile typecheck
corepack pnpm --filter @wizards/mobile test
maestro test .maestro/phase2-auth-navigation.yml
```

- [ ] **Step 2: Capture and compare the light 390x844 login screen**

```powershell
adb exec-out screencap -p > artifacts/redesign/2b-login-alignment/2b-login-light.png
Copy-Item design_handoff_whispr_mobile/screenshots/2b-giris.png artifacts/redesign/2b-login-alignment/reference-2b.png
```

- [ ] **Step 3: Record evidence**

```md
# 2b Login Alignment Comparison

- Viewport: 390x844 logical points
- Theme: light; dark geometry also checked
- Compared: top bar, heading/profile block, form gaps, social controls, footer safe-area placement
- Result: record actual evidence only
```

### Task 3: Final repository verification

**Files:**
- Modify: `graphify-out/GRAPH_REPORT.md` and `graphify-out/graph.json` only through `graphify update .` if the graph tool updates them.

- [ ] **Step 1: Run whitespace and scope checks**

```powershell
git diff --check
git diff -- apps/mobile/src/app/screens/auth/auth-login-screen.tsx apps/mobile/src/app/screens/auth/auth-login-screen.styles.ts apps/mobile/component-tests/auth-login-screen.test.tsx artifacts/redesign/2b-login-alignment
git status --short
```

- [ ] **Step 2: Refresh the code graph**

```powershell
graphify update .
```

- [ ] **Step 3: Report actual validation outcomes and explicitly separate preserved pre-existing changes from this task's changes**
