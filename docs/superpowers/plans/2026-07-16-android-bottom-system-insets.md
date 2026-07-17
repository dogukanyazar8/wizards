# Android Bottom System Insets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep every interactive Whispr mobile surface above Android system navigation while preserving edge-to-edge visuals.

**Architecture:** `react-native-safe-area-context` remains the single source of runtime system-window data. A pure spacing resolver and a narrow hook give each bottom-surface owner the same policy without detecting or changing Android navigation mode. Decorative full-bleed layers remain edge-to-edge; only interactive controls and content padding consume the inset.

**Tech Stack:** Expo 56, React Native 0.85, React Navigation 7, `react-native-safe-area-context` 5, Jest, Node test runner.

## Global Constraints

- Do not read, infer, alter, hide, or telemetry-report the user's Android navigation mode.
- Preserve Android edge-to-edge and the existing theme-owned system-icon contrast behavior.
- Keep `FloatingNavigationChrome` as the only safe-area owner for the tab chrome; `MobileBottomTabBar` must not call `useSafeAreaInsets`.
- Zero bottom inset preserves the existing 18dp floating-navigation visual baseline.
- Modal panel backgrounds remain full-bleed; only their interactive content gains safe-area padding.
- Do not add permissions, polling, dimensions listeners, or a new native module.

---

### Task 1: Add the shared bottom-spacing policy

**Files:**

- Create: `apps/mobile/src/app/mobile-bottom-system-inset.ts`
- Test: `apps/mobile/scripts/mobile-bottom-system-inset.test.ts`

**Interfaces:**

- Produces: `resolveMobileBottomSystemSpacing(systemInset: number, minimumSpacing: number): number`
- Produces: `useMobileBottomSystemSpacing(minimumSpacing: number): number`

- [ ] **Step 1: Write the failing test**

```ts
assert.equal(resolveMobileBottomSystemSpacing(0, 18), 18);
assert.equal(resolveMobileBottomSystemSpacing(24, 18), 24);
assert.equal(resolveMobileBottomSystemSpacing(48, 18), 48);
assert.equal(resolveMobileBottomSystemSpacing(Number.NaN, 18), 18);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `corepack pnpm --filter @wizards/mobile exec node --test --import tsx scripts/mobile-bottom-system-inset.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the pure resolver and hook**

```ts
export function resolveMobileBottomSystemSpacing(systemInset: number, minimumSpacing: number) {
  const safeInset = Number.isFinite(systemInset) ? Math.max(0, systemInset) : 0;
  const safeMinimum = Number.isFinite(minimumSpacing) ? Math.max(0, minimumSpacing) : 0;
  return Math.max(safeInset, safeMinimum);
}

export function useMobileBottomSystemSpacing(minimumSpacing: number) {
  return resolveMobileBottomSystemSpacing(useSafeAreaInsets().bottom, minimumSpacing);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `corepack pnpm --filter @wizards/mobile exec node --test --import tsx scripts/mobile-bottom-system-inset.test.ts`

Expected: PASS with four assertions.

### Task 2: Make the tab chrome consume its supplied system inset

**Files:**

- Modify: `apps/mobile/src/navigation/floating-navigation-chrome.tsx`
- Modify: `apps/mobile/component-tests/floating-navigation-chrome.test.tsx`
- Modify: `apps/mobile/scripts/mobile-navigation-contract.test.ts`

**Interfaces:**

- Consumes: `BottomTabBarProps.insets.bottom`
- Consumes: `resolveMobileBottomSystemSpacing(insets.bottom, 18)`
- Produces: measured tab-chrome height that includes the actual Android bottom safe area.

- [ ] **Step 1: Write the failing component expectation**

```tsx
expect(chrome.props.style).toEqual(
  expect.arrayContaining([expect.objectContaining({ paddingBottom: 24 })]),
);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `corepack pnpm --filter @wizards/mobile test:components -- floating-navigation-chrome.test.tsx --runInBand`

Expected: FAIL because the chrome currently renders `paddingBottom: 18` for an input inset of 24.

- [ ] **Step 3: Implement one ownership boundary**

```tsx
const bottomSpacing = resolveMobileBottomSystemSpacing(insets.bottom, 18);
// chrome style uses paddingBottom: bottomSpacing
// MobileBottomTabBar continues to receive bottomSafeAreaInset={0}
```

- [ ] **Step 4: Verify component and contract tests**

Run: `corepack pnpm --filter @wizards/mobile test:components -- floating-navigation-chrome.test.tsx --runInBand`

Run: `corepack pnpm --filter @wizards/mobile exec node --test --import tsx scripts/mobile-navigation-contract.test.ts`

Expected: PASS; the contract still rejects a second `useSafeAreaInsets` owner inside `MobileBottomTabBar`.

### Task 3: Make shared modal and toast surfaces safe-area aware

**Files:**

- Modify: `apps/mobile/src/app/components/kit/bottom-sheet.tsx`
- Modify: `apps/mobile/src/app/components/kit/toast.tsx`
- Create or modify: focused component tests in `apps/mobile/component-tests/`

**Interfaces:**

- Consumes: `useMobileBottomSystemSpacing(theme.spacing.page)` for sheet content.
- Consumes: `useMobileBottomSystemSpacing(24)` for toast placement.
- Produces: panel padding and toast bottom offset that never fall beneath a system navigation bar.

- [ ] **Step 1: Write failing tests for 48dp bottom inset**

```tsx
expect(sheetPanel.props.style).toEqual(
  expect.arrayContaining([expect.objectContaining({ paddingBottom: theme.spacing.page + 48 })]),
);
expect(toastViewport.props.style).toEqual(expect.objectContaining({ bottom: 48 }));
```

- [ ] **Step 2: Run the focused tests to verify failure**

Run: `corepack pnpm --filter @wizards/mobile test:components -- bottom-sheet toast --runInBand`

Expected: FAIL because both values are static today.

- [ ] **Step 3: Apply the shared hook at each surface owner**

```tsx
const bottomPadding = theme.spacing.page + useMobileBottomSystemSpacing(0);
const toastBottom = useMobileBottomSystemSpacing(24);
```

- [ ] **Step 4: Run focused tests to verify pass**

Run: `corepack pnpm --filter @wizards/mobile test:components -- bottom-sheet toast --runInBand`

Expected: PASS for zero and 48dp inset cases.

### Task 4: Cover custom bottom-anchored product surfaces

**Files:**

- Modify: `apps/mobile/src/app/screens/mobile-workspace-server-switcher-sheet.tsx`
- Modify: `apps/mobile/src/app/overlays/mobile-voice-invite-overlay.tsx` if its interactive controls are bottom anchored.
- Modify: matching tests in `apps/mobile/component-tests/`.

**Interfaces:**

- Consumes: `useMobileBottomSystemSpacing` at each custom interactive owner.
- Produces: a single safe-area calculation per surface; decorative backdrops remain edge-to-edge.

- [ ] **Step 1: Add a failing 48dp-inset test per custom owner**

```tsx
expect(panel.props.style).toEqual(
  expect.arrayContaining([expect.objectContaining({ paddingBottom: expect.any(Number) })]),
);
```

- [ ] **Step 2: Run each focused test and confirm the expected static-offset failure**

Run: `corepack pnpm --filter @wizards/mobile test:components -- mobile-workspace-server-switcher --runInBand`

Expected: FAIL before production edits.

- [ ] **Step 3: Apply the shared policy without changing backdrop bounds**

```tsx
const bottomSpacing = useMobileBottomSystemSpacing(theme.spacing.page);
// apply to panel content, not the full-screen backdrop
```

- [ ] **Step 4: Run focused tests to verify pass**

Run: `corepack pnpm --filter @wizards/mobile test:components -- mobile-workspace-server-switcher --runInBand`

Expected: PASS for zero and 48dp inset cases.

### Task 5: Run integration verification and preserve the visual-baseline contract

**Files:**

- Modify if necessary: `apps/mobile/scripts/mobile-redesign-device-capture.test.ts`
- Do not modify: canonical `DEVICE_CAPTURE_SAFE_AREA_INSETS.bottom = 0` baseline unless the deterministic capture contract itself changes.

- [ ] **Step 1: Verify the existing deterministic zero-inset capture contract**

Run: `corepack pnpm --filter @wizards/mobile exec node --test --import tsx scripts/mobile-redesign-device-capture.test.ts`

Expected: PASS with the canonical zero-bottom-inset capture untouched.

- [ ] **Step 2: Run mobile type and test gates**

Run: `corepack pnpm --filter @wizards/mobile typecheck`

Run: `corepack pnpm --filter @wizards/mobile test`

Run: `corepack pnpm --filter @wizards/mobile test:components -- --runInBand`

Expected: all commands exit 0.

- [ ] **Step 3: Capture real-device UAT evidence**

Run: `corepack pnpm --filter @wizards/mobile android:uat:local:apk:phone`

Check gesture and three-button navigation in light and dark themes for: tab chrome, mini voice bar, channel composer, DM composer, sheet, server switcher, toast, auth CTA, and error fallback.

Expected: every tappable bottom control remains fully visible and reachable; decorative backdrops extend edge-to-edge.
