# Whispr Mobile Auth Welcome Root Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make canonical 2a Karşılama the navigation-free first mobile screen whenever no Whispr session exists, while preserving the signed-in four-tab app.

**Architecture:** `MobileNavigator` branches on the real session status before it constructs bottom tabs. `AuthWelcomeScreen` stays presentation-only, uses the existing locale and persisted-theme providers, and gains safe-area layout plus a native SVG text gradient for the second hero line.

**Tech Stack:** Expo 56, React Native 0.85, React Navigation, React Native SVG, Expo Linear Gradient, Jest, React Native Testing Library.

## Global Constraints

- Canonical visual source: `design_handoff_whispr_mobile/Whispr Mobile Redesign.dc.html`, anchor `#2a`, 390x844pt.
- `checking` shows only session checking; `signed-out` starts `Welcome`; `signed-in` starts the existing four tabs.
- Bottom navigation and floating navigation chrome must not mount before a session exists.
- No dummy data, duplicate locale/theme state, system-status claim, or new dependency.
- The second hero line uses the exact `#7C6CF6` to `#4F9CF6` gradient.
- Preserve unrelated working-tree changes.

---

### Task 1: Move the auth boundary above bottom tabs

**Files:**

- Modify: `apps/mobile/src/navigation/mobile-navigator.tsx`
- Modify: `apps/mobile/component-tests/mobile-navigation.test.tsx`

**Interfaces:**

- Consumes: `useMobileAuth().status` and `MobileAuthNavigator({ reason })`.
- Produces: exactly one root navigator: auth before a session, root stack after a session.

- [ ] **Step 1: Write the failing behavior tests**

Replace the signed-out and checking expectations with:

```tsx
it("starts a signed-out user on Welcome without mounting tab navigation", async () => {
  mockAuthStatus = "signed-out";
  const view = await render(<MobileNavigator />);

  expect(view.getByTestId("mobile-auth-navigator").props.accessibilityLabel).toBe("auth-required");
  expect(view.queryByTestId("mobile-settings-tab-screen")).toBeNull();
  expect(view.queryByTestId("mobile-bottom-tab-overview")).toBeNull();
  expect(view.queryByTestId("mobile-bottom-tab-messages")).toBeNull();
  expect(view.queryByTestId("mobile-bottom-tab-notifications")).toBeNull();
  expect(view.queryByTestId("mobile-bottom-tab-settings")).toBeNull();
});

it("keeps tab navigation unmounted while secure storage is checking", async () => {
  mockAuthStatus = "checking";
  const view = await render(<MobileNavigator />);

  expect(view.getByTestId("mobile-auth-navigator").props.accessibilityLabel).toBe("checking");
  expect(view.queryByTestId("mobile-settings-tab-screen")).toBeNull();
  expect(view.queryByTestId("mobile-bottom-tab-overview")).toBeNull();
});
```

- [ ] **Step 2: Verify red**

```powershell
corepack pnpm --filter @wizards/mobile exec jest component-tests/mobile-navigation.test.tsx --runInBand
```

Expected: the tests fail because signed-out currently mounts `MobileBottomTabs` at `settings`.

- [ ] **Step 3: Implement the top-level branch**

Read `status` in `MobileNavigator`; replace the unconditional root stack with:

```tsx
const { status } = useMobileAuth();
const authReason = status === "checking" ? "checking" : "auth-required";

<NavigationContainer /* existing props */>
  {status === "signed-in" ? (
    <RootStack.Navigator screenOptions={rootStackOptions}>
      {/* retain every current RootStack.Screen */}
    </RootStack.Navigator>
  ) : (
    <MobileAuthNavigator reason={authReason} />
  )}
</NavigationContainer>;
```

Remove `ProtectedTab`, `ProtectedStackRoute`, their imports, and the signed-out `initialRouteName` branch from `MobileBottomTabs`; use `initialRouteName="overview"` there.

- [ ] **Step 4: Verify green and commit**

```powershell
corepack pnpm --filter @wizards/mobile exec jest component-tests/mobile-navigation.test.tsx --runInBand
git add apps/mobile/src/navigation/mobile-navigator.tsx apps/mobile/component-tests/mobile-navigation.test.tsx
git commit -m "fix(mobile): open welcome before unauthenticated tabs"
```

Expected: every mobile navigation test passes; unauthenticated states have no tab IDs.

### Task 2: Close the remaining 2a fidelity gaps

**Files:**

- Modify: `apps/mobile/src/app/screens/auth/auth-welcome-screen.tsx`
- Modify: `apps/mobile/src/app/screens/auth/auth-welcome-screen.styles.ts`
- Modify: `apps/mobile/component-tests/auth-welcome-screen.test.tsx`

**Interfaces:**

- Consumes: `useSafeAreaInsets()`, `MobileTheme`, `mobileCopy`, persisted theme, and locale runtime.
- Produces: scroll-safe 2a layout with safe insets and the canonical gradient title.

- [ ] **Step 1: Write the failing contract test**

Mock non-zero safe insets and assert:

```tsx
expect(view.getByTestId("mobile-auth-welcome-hero-title-gradient").props).toMatchObject({
  colors: ["#7C6CF6", "#4F9CF6"],
});
expect(
  StyleSheet.flatten(view.getByTestId("mobile-auth-welcome-layout").props.style),
).toMatchObject({
  paddingBottom: 34,
  paddingTop: 47,
});
```

- [ ] **Step 2: Verify red**

```powershell
corepack pnpm --filter @wizards/mobile exec jest component-tests/auth-welcome-screen.test.tsx --runInBand
```

Expected: the test fails because the current accent is a solid `Text` and no safe-area layout test ID exists.

- [ ] **Step 3: Implement native-safe fidelity**

Use `useSafeAreaInsets()` and add `testID="mobile-auth-welcome-layout"` to the full screen view. Apply `paddingTop: Math.max(insets.top, theme.spacing.section)` and `paddingBottom: Math.max(insets.bottom, theme.layout.auth.welcomeCtaBottomPadding)`. Set `AuthScreenBackground` to `scrollable` for the welcome screen.

Replace the accent `Text` with a React Native SVG gradient text surface:

```tsx
<Svg
  height={theme.typography.authHeroTitle.lineHeight}
  testID="mobile-auth-welcome-hero-title-gradient"
  width="100%"
>
  <Defs>
    <SvgLinearGradient id="mobile-auth-welcome-title-gradient" x1="0" x2="1" y1="0" y2="0">
      <Stop offset="0" stopColor="#7C6CF6" />
      <Stop offset="1" stopColor="#4F9CF6" />
    </SvgLinearGradient>
  </Defs>
  <SvgText
    fill="url(#mobile-auth-welcome-title-gradient)"
    fontFamily={theme.typography.authHeroTitle.fontFamily}
    fontSize={theme.typography.authHeroTitle.fontSize}
    fontWeight="800"
    letterSpacing={theme.typography.authHeroTitle.letterSpacing}
    x="0"
    y={theme.typography.authHeroTitle.lineHeight - 8}
  >
    {copy.authWelcomeHeroTitleLine2}
  </SvgText>
</Svg>
```

Keep the existing combined title accessibility label and all five copy-backed feature chips.

- [ ] **Step 4: Verify green and commit**

```powershell
corepack pnpm --filter @wizards/mobile exec jest component-tests/auth-welcome-screen.test.tsx --runInBand
git add apps/mobile/src/app/screens/auth/auth-welcome-screen.tsx apps/mobile/src/app/screens/auth/auth-welcome-screen.styles.ts apps/mobile/component-tests/auth-welcome-screen.test.tsx
git commit -m "feat(mobile): align welcome screen with 2a"
```

Expected: the welcome component tests pass with gradient, safe-area, theme, locale, CTA, chip, waveform, and copyright contracts.

### Task 3: Verify and refresh repository knowledge

**Files:**

- Modify: `graphify-out/GRAPH_REPORT.md`
- Modify: `graphify-out/graph.json`
- Modify: `graphify-out/manifest.json`

**Interfaces:**

- Consumes: completed route and welcome implementation.
- Produces: passing mobile checks and a current code graph.

- [ ] **Step 1: Typecheck and run both affected suites**

```powershell
corepack pnpm --filter @wizards/mobile typecheck
corepack pnpm --filter @wizards/mobile exec jest component-tests/mobile-navigation.test.tsx component-tests/auth-welcome-screen.test.tsx --runInBand
```

Expected: PASS with no TypeScript errors.

- [ ] **Step 2: Refresh the code graph and commit it**

```powershell
graphify update .
git diff --check
git add graphify-out/GRAPH_REPORT.md graphify-out/graph.json graphify-out/manifest.json
git commit -m "chore(graph): refresh mobile auth navigation graph"
```

Expected: Graphify incrementally extracts the changed TypeScript files and the working tree has no whitespace errors.
