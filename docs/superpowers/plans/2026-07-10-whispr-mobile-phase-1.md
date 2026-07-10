# Whispr Mobile Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a semantic light/dark design system, persisted appearance runtime, accessible component kit, and complete theme-aware mobile UI migration without changing Phase 0 product behavior.

**Architecture:** Add one raw palette and two frozen semantic themes, then resolve them through a provider directly below the query provider. Cache `StyleSheet.create` output by stable style-factory and theme references, migrate presentation modules in bounded batches, and enforce the finished boundary through contract tests and Android Maestro evidence.

**Tech Stack:** Expo SDK 56, React Native 0.85.3, React 19.2.3, TypeScript 6 strict mode, AsyncStorage 2.2, Expo System UI/Navigation Bar, Ionicons, Reanimated 4.3.1, Gesture Handler 2.31.2, React Navigation 7, FlashList 2, Node test runner, Jest Expo, Testing Library React Native, Maestro.

## Global Constraints

- Work only in `C:\W1P1` on `codex/mobile-phase1-design-system`; do not edit, restore, stage, or clean the main checkout.
- Preserve every existing Maestro test ID and Phase 0 navigation/data/realtime/API contract.
- Do not modify `apps/web`, `apps/desktop`, or `packages/*`.
- Do not add `@gorhom/bottom-sheet`; implement the approved narrow in-house sheet with existing Reanimated and Gesture Handler.
- Do not upgrade Expo SDK, React Native, React, Reanimated, Gesture Handler, or New Architecture settings.
- Theme preference is stored only in AsyncStorage; do not write it to SecureStore, React Query, Zustand persistence, or an offline cache.
- Query and Zustand data remain memory-only; do not add a persister, offline queue, or message cache.
- Raw `#RRGGBB` and `rgba(` values may exist only in `apps/mobile/src/design/palette.ts` after migration.
- No `mobileColors` import or reference remains after migration.
- Theme references and themed style objects are stable; hot FlashList render paths receive stable props and no inline style objects.
- All animation uses Reanimated and honors reduced motion; do not import React Native `Animated`.
- Preserve Outfit, `allowFontScaling`, and existing product copy; add only localized appearance labels.
- After every task, run typecheck, all contract tests, and all component tests before committing.
- Before completion, run quality check, Expo install check, `pnpm audit`, Graphify update, Android build, navigation Maestro, dark-mode Maestro, and screenshot evidence.
- Re-enable predictive back only when `.maestro/phase0-navigation.yml` passes; otherwise revert the flag to false and document the evidence.
- Do not merge into `uat`, push, or open a PR without explicit user approval.

---

### Task 0: Establish the Clean Short-Path Baseline

**Files:**

- Modify: `.gitignore`
- Evidence only: `C:\Wizards\artifacts\mobile\uat\Whispr-Mobile-UAT-debug-latest.apk`

**Interfaces:**

- Consumes: `uat` commit `dd207124` and the existing short-path Android build script.
- Produces: Clean `C:\W1P1` worktree, root evidence exclusion, installed dependencies, green baseline, and build proof.

- [x] **Step 1: Create the isolated worktree**

```powershell
git worktree add C:\W1P1 -b codex/mobile-phase1-design-system
```

Result: worktree created at `dd207124`; main checkout remains untouched.

- [x] **Step 2: Add the root-only evidence ignore and commit it first**

```gitignore
# Local cross-platform verification evidence
/artifacts/
```

Result: commit `d25fcc54 chore: ignore root verification artifacts`.

- [x] **Step 3: Install exactly the locked workspace**

Run: `corepack pnpm install --frozen-lockfile`

Result: PASS with pnpm 10.33.2 and no lockfile changes.

- [x] **Step 4: Generate ignored Android native files and build through the short path**

```powershell
corepack pnpm --filter @wizards/mobile exec expo prebuild --platform android --no-install
corepack pnpm --filter @wizards/mobile android:uat:local:apk
```

Result: PASS; latest APK is 107,582,766 bytes.

- [x] **Step 5: Run baseline gates**

```powershell
corepack pnpm --filter @wizards/mobile typecheck
corepack pnpm --filter @wizards/mobile test
corepack pnpm --filter @wizards/mobile test:components
corepack pnpm --filter @wizards/mobile quality:check
```

Result: typecheck PASS, 279/279 contract tests, 19/19 component tests, zero quality blockers.

### Task 1: Re-enable and Prove Predictive Back

**Files:**

- Modify: `apps/mobile/app.config.js`
- Modify: `apps/mobile/scripts/mobile-phase-zero-native-config.test.ts`
- Modify at final documentation task: `apps/mobile/MIGRATION_PHASE_1.md`
- Device test: `.maestro/phase0-navigation.yml`

**Interfaces:**

- Consumes: Existing React Navigation root stack, `MainActivity.super.onCreate(null)`, and Phase 0 Maestro IDs.
- Produces: A tested `predictiveBackGestureEnabled: true` decision or a documented evidence-based fallback to false.

- [ ] **Step 1: Change the contract expectation first**

Replace the existing assertion with:

```ts
assert.match(appConfig, /predictiveBackGestureEnabled:\s*true/);
```

- [ ] **Step 2: Run the targeted contract and verify RED**

Run:

```powershell
corepack pnpm --filter @wizards/mobile exec node --test --import tsx scripts/mobile-phase-zero-native-config.test.ts
```

Expected: FAIL because `app.config.js` still contains `predictiveBackGestureEnabled: false`.

- [ ] **Step 3: Enable predictive back without a native patch**

Set this exact app config value:

```js
predictiveBackGestureEnabled: true,
```

Do not add a config plugin, fragment factory, or `MainActivity` edit.

- [ ] **Step 4: Run the complete per-batch gate**

```powershell
corepack pnpm --filter @wizards/mobile typecheck
corepack pnpm --filter @wizards/mobile test
corepack pnpm --filter @wizards/mobile test:components
```

Expected: all commands PASS.

- [ ] **Step 5: Regenerate, build, install, and run the Phase 0 navigation flow**

```powershell
corepack pnpm --filter @wizards/mobile exec expo prebuild --platform android --no-install
powershell -ExecutionPolicy Bypass -File apps/mobile/scripts/build-android-uat.ps1 -NoStartMetro
maestro test .maestro/phase0-navigation.yml
```

Expected: channel and DM hardware-back pop plus channel, DM, invite, and settings deep links PASS. Keep the report under ignored `artifacts/mobile/phase1/predictive-back/`.

- [ ] **Step 6: Apply the decision gate**

If Maestro passes, keep `true`. If it fails specifically because of predictive back, restore both app config and contract expectation to `false`, rerun the per-batch gate, and record the failure path. Do not apply a native patch.

- [ ] **Step 7: Commit the verified decision**

```powershell
git add -- apps/mobile/app.config.js apps/mobile/scripts/mobile-phase-zero-native-config.test.ts
git commit -m "fix: verify mobile predictive back"
```

### Task 2: Add the Palette, Semantic Themes, and Contrast Contract

**Files:**

- Create: `apps/mobile/src/design/palette.ts`
- Create: `apps/mobile/src/design/themes.ts`
- Create: `apps/mobile/src/design/mobile-theme-runtime.ts`
- Create: `apps/mobile/scripts/mobile-theme-contract.test.ts`
- Modify later in migration: `apps/mobile/src/design/tokens.ts`

**Interfaces:**

- Produces: `MobileThemeMode`, `MobileResolvedTheme`, `MobileTheme`, `lightTheme`, `darkTheme`, `resolveMobileTheme`, `MOBILE_THEME_PREFERENCE_KEY`, and theme-key/contrast contracts.
- Consumes: Existing sizing, spacing, typography, elevation, and gradient values from `tokens.ts`.

- [ ] **Step 1: Write the failing theme contract**

Create tests with these exact public assertions:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { darkTheme, lightTheme } from "../src/design/themes";

function linearize(channel: number): number {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function luminance(color: string): number {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color);
  assert.ok(match, `Expected opaque hex color, received ${color}`);
  const [, red, green, blue] = match;
  return (
    0.2126 * linearize(Number.parseInt(red, 16)) +
    0.7152 * linearize(Number.parseInt(green, 16)) +
    0.0722 * linearize(Number.parseInt(blue, 16))
  );
}

function contrast(foreground: string, background: string): number {
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

function keyShape(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return typeof value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, keyShape(child)]),
  );
}

describe("mobile semantic themes", () => {
  it("keeps light and dark theme keys identical", () => {
    assert.deepEqual(keyShape(darkTheme), keyShape(lightTheme));
  });

  for (const theme of [lightTheme, darkTheme]) {
    it(`${theme.id} meets required contrast ratios`, () => {
      for (const surface of Object.values(theme.surface)) {
        if (/^#[0-9a-f]{6}$/i.test(surface)) {
          assert.ok(contrast(theme.text.primary, surface) >= 4.5);
        }
      }
      assert.ok(contrast(theme.text.muted, theme.surface.base) >= 4.5);
      assert.ok(contrast(theme.text.onPrimary, theme.accent.default) >= 4.5);
      assert.ok(contrast(theme.border.default, theme.surface.card) >= 3);
    });
  }
});
```

- [ ] **Step 2: Run the new test and verify RED**

Run: `corepack pnpm --filter @wizards/mobile exec node --test --import tsx scripts/mobile-theme-contract.test.ts`

Expected: FAIL because `themes.ts` does not exist.

- [ ] **Step 3: Create the raw palette**

Define the only raw color literals in `palette.ts`:

```ts
export const mobilePalette = Object.freeze({
  indigo: {
    50: "#EEF2FF",
    100: "#E0E7FF",
    300: "#A5B4FC",
    400: "#818CF8",
    500: "#6366F1",
    600: "#4F46E5",
    700: "#4338CA",
    900: "#312E81",
  },
  neutral: {
    50: "#F8FAFC",
    100: "#F1F5F9",
    200: "#E2E8F0",
    300: "#CBD5E1",
    400: "#94A3B8",
    500: "#64748B",
    600: "#475569",
    700: "#334155",
    800: "#1E293B",
    850: "#172033",
    900: "#0F172A",
    950: "#080D1A",
    white: "#FFFFFF",
  },
  status: {
    danger: "#DC2626",
    dangerDark: "#F87171",
    dangerSoft: "#FEF2F2",
    dangerSoftDark: "#3F1820",
    info: "#2563EB",
    infoDark: "#60A5FA",
    success: "#15803D",
    successDark: "#4ADE80",
    warning: "#B45309",
    warningDark: "#FBBF24",
  },
  overlay: {
    light: "rgba(255,255,255,0.82)",
    dark: "rgba(15,23,42,0.86)",
    pressedLight: "rgba(15,23,42,0.08)",
    pressedDark: "rgba(248,250,252,0.12)",
    disabledLight: "rgba(100,116,139,0.42)",
    disabledDark: "rgba(148,163,184,0.46)",
  },
} as const);
```

- [ ] **Step 4: Define the complete theme interface and frozen instances**

Use `mobileRadii`, `mobileSpacing`, `mobileSizing`, and `mobileTypography` as stable non-color foundations while the legacy token file is being migrated. Define and instantiate the complete semantic shape:

```ts
import type { TextStyle, ViewStyle } from "react-native";
import { mobileRadii, mobileSizing, mobileSpacing, mobileTypography } from "./tokens";
import { mobilePalette } from "./palette";

type MobileElevation = Pick<
  ViewStyle,
  "elevation" | "shadowColor" | "shadowOffset" | "shadowOpacity" | "shadowRadius"
>;

export interface MobileTheme {
  id: "light" | "dark";
  dark: boolean;
  surface: {
    base: string;
    card: string;
    elevated: string;
    overlay: string;
    rail: string;
    soft: string;
  };
  text: {
    primary: string;
    secondary: string;
    muted: string;
    soft: string;
    inverse: string;
    onPrimary: string;
  };
  border: { default: string; subtle: string; focus: string };
  accent: { default: string; strong: string; soft: string };
  status: { success: string; warning: string; danger: string; dangerSoft: string; info: string };
  interactive: { pressed: string; disabled: string };
  radii: typeof mobileRadii;
  spacing: typeof mobileSpacing;
  sizing: typeof mobileSizing;
  typography: Record<keyof typeof mobileTypography, TextStyle | string>;
  elevation: { card: MobileElevation; floating: MobileElevation; soft: MobileElevation };
  gradients: {
    appBackground: readonly [string, string];
    primaryAction: readonly [string, string];
    softSurface: readonly [string, string];
  };
  systemBars: { statusBar: "light" | "dark"; androidNavigationBar: string };
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

export const lightTheme = deepFreeze({
  id: "light",
  dark: false,
  surface: {
    base: mobilePalette.neutral[50],
    card: mobilePalette.neutral.white,
    elevated: mobilePalette.neutral.white,
    overlay: mobilePalette.neutral[100],
    rail: mobilePalette.indigo[50],
    soft: mobilePalette.neutral[100],
  },
  text: {
    primary: mobilePalette.neutral[900],
    secondary: mobilePalette.neutral[600],
    muted: mobilePalette.neutral[600],
    soft: mobilePalette.neutral[500],
    inverse: mobilePalette.neutral.white,
    onPrimary: mobilePalette.neutral.white,
  },
  border: {
    default: mobilePalette.neutral[500],
    subtle: mobilePalette.neutral[300],
    focus: mobilePalette.indigo[500],
  },
  accent: {
    default: mobilePalette.indigo[600],
    strong: mobilePalette.indigo[700],
    soft: mobilePalette.indigo[50],
  },
  status: {
    success: mobilePalette.status.success,
    warning: mobilePalette.status.warning,
    danger: mobilePalette.status.danger,
    dangerSoft: mobilePalette.status.dangerSoft,
    info: mobilePalette.status.info,
  },
  interactive: {
    pressed: mobilePalette.overlay.pressedLight,
    disabled: mobilePalette.overlay.disabledLight,
  },
  radii: mobileRadii,
  spacing: mobileSpacing,
  sizing: mobileSizing,
  typography: mobileTypography,
  elevation: {
    card: {
      shadowColor: mobilePalette.neutral[900],
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.08,
      shadowRadius: 18,
      elevation: 3,
    },
    floating: {
      shadowColor: mobilePalette.neutral[900],
      shadowOffset: { width: 0, height: 16 },
      shadowOpacity: 0.16,
      shadowRadius: 24,
      elevation: 10,
    },
    soft: {
      shadowColor: mobilePalette.indigo[600],
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.12,
      shadowRadius: 14,
      elevation: 4,
    },
  },
  gradients: {
    appBackground: [mobilePalette.neutral[50], mobilePalette.indigo[50]],
    primaryAction: [mobilePalette.indigo[600], mobilePalette.indigo[500]],
    softSurface: [mobilePalette.neutral.white, mobilePalette.indigo[50]],
  },
  systemBars: { statusBar: "dark", androidNavigationBar: mobilePalette.neutral[50] },
} satisfies MobileTheme);

export const darkTheme = deepFreeze({
  id: "dark",
  dark: true,
  surface: {
    base: mobilePalette.neutral[950],
    card: mobilePalette.neutral[900],
    elevated: mobilePalette.neutral[850],
    overlay: mobilePalette.neutral[800],
    rail: mobilePalette.neutral[900],
    soft: mobilePalette.neutral[800],
  },
  text: {
    primary: mobilePalette.neutral[50],
    secondary: mobilePalette.neutral[200],
    muted: mobilePalette.neutral[300],
    soft: mobilePalette.neutral[400],
    inverse: mobilePalette.neutral[950],
    onPrimary: mobilePalette.neutral[900],
  },
  border: {
    default: mobilePalette.neutral[500],
    subtle: mobilePalette.neutral[700],
    focus: mobilePalette.indigo[400],
  },
  accent: {
    default: mobilePalette.indigo[400],
    strong: mobilePalette.indigo[300],
    soft: mobilePalette.neutral[800],
  },
  status: {
    success: mobilePalette.status.successDark,
    warning: mobilePalette.status.warningDark,
    danger: mobilePalette.status.dangerDark,
    dangerSoft: mobilePalette.status.dangerSoftDark,
    info: mobilePalette.status.infoDark,
  },
  interactive: {
    pressed: mobilePalette.overlay.pressedDark,
    disabled: mobilePalette.overlay.disabledDark,
  },
  radii: mobileRadii,
  spacing: mobileSpacing,
  sizing: mobileSizing,
  typography: mobileTypography,
  elevation: {
    card: {
      shadowColor: mobilePalette.neutral[950],
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0,
      shadowRadius: 0,
      elevation: 0,
    },
    floating: {
      shadowColor: mobilePalette.neutral[950],
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0,
      shadowRadius: 0,
      elevation: 0,
    },
    soft: {
      shadowColor: mobilePalette.neutral[950],
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0,
      shadowRadius: 0,
      elevation: 0,
    },
  },
  gradients: {
    appBackground: [mobilePalette.neutral[950], mobilePalette.neutral[900]],
    primaryAction: [mobilePalette.indigo[400], mobilePalette.indigo[500]],
    softSurface: [mobilePalette.neutral[850], mobilePalette.neutral[800]],
  },
  systemBars: { statusBar: "light", androidNavigationBar: mobilePalette.neutral[950] },
} satisfies MobileTheme);
```

- [ ] **Step 5: Add pure theme runtime helpers**

```ts
export const MOBILE_THEME_PREFERENCE_KEY = "whispr.mobile.theme-preference";
export type MobileThemeMode = "system" | "light" | "dark";
export type MobileResolvedTheme = "light" | "dark";

export function normalizeMobileThemeMode(value: unknown): MobileThemeMode {
  return value === "light" || value === "dark" || value === "system" ? value : "system";
}

export function resolveMobileTheme(
  mode: MobileThemeMode,
  systemScheme: "light" | "dark" | null | undefined,
): MobileResolvedTheme {
  return mode === "system" ? (systemScheme === "dark" ? "dark" : "light") : mode;
}
```

- [ ] **Step 6: Run the complete per-batch gate and commit**

```powershell
corepack pnpm --filter @wizards/mobile typecheck
corepack pnpm --filter @wizards/mobile test
corepack pnpm --filter @wizards/mobile test:components
git add -- apps/mobile/src/design/palette.ts apps/mobile/src/design/themes.ts apps/mobile/src/design/mobile-theme-runtime.ts apps/mobile/scripts/mobile-theme-contract.test.ts
git commit -m "feat: add mobile semantic themes"
```

### Task 3: Add Theme Runtime, System Surfaces, and Appearance Settings

**Files:**

- Create: `apps/mobile/src/app/providers/mobile-theme-provider.tsx`
- Create: `apps/mobile/src/app/providers/mobile-theme-system-surfaces.tsx`
- Create: `apps/mobile/component-tests/mobile-theme-provider.test.tsx`
- Create: `apps/mobile/component-tests/settings-appearance.test.tsx`
- Modify: `apps/mobile/App.tsx`
- Modify: `apps/mobile/package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `apps/mobile/src/app/screens/settings-screen.tsx`
- Modify: `apps/mobile/src/locale/mobile-copy.ts`
- Modify: `apps/mobile/component-tests/jest.setup.ts`

**Interfaces:**

- Consumes: Task 2 themes/runtime and existing AsyncStorage.
- Produces: `MobileThemeProvider`, `useTheme`, `useThemePreference`, `useThemedStyles`, `MobileThemeSystemSurfaces`, and `SettingsAppearanceSelector`.

- [ ] **Step 1: Write provider tests before implementation**

Test these observable contracts:

```tsx
function ThemeConsumer() {
  const theme = useTheme();
  const { mode, setMode } = useThemePreference();
  const styles = useThemedStyles(createProbeStyles);
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => setMode("dark")}
      style={styles.root}
      testID="theme-probe"
    >
      <Text>{`${mode}:${theme.id}`}</Text>
    </Pressable>
  );
}
```

Assert default system resolution, stored dark hydration, corrupt-value fallback, load failure fallback, save failure containment, system-scheme updates, and identical style-object identity across same-theme rerenders.

- [ ] **Step 2: Run provider tests and verify RED**

Run: `corepack pnpm --filter @wizards/mobile exec jest component-tests/mobile-theme-provider.test.tsx --runInBand`

Expected: FAIL because the provider/hooks do not exist.

- [ ] **Step 3: Install only Expo-managed system-surface modules**

Run from `apps/mobile`:

```powershell
corepack pnpm exec expo install expo-navigation-bar expo-system-ui
corepack pnpm exec expo install --check
```

Expected: package and lockfile use SDK 56-compatible versions; install check is clean.

- [ ] **Step 4: Implement the provider and two-level cache**

Use split contexts and a module-level factory cache:

```tsx
const ThemeContext = createContext<MobileTheme | null>(null);
const ThemePreferenceContext = createContext<MobileThemePreferenceRuntime | null>(null);
const styleCache = new WeakMap<Function, WeakMap<MobileTheme, object>>();

export function useThemedStyles<T extends StyleSheet.NamedStyles<T>>(
  factory: (theme: MobileTheme) => T,
): T {
  const theme = useTheme();
  let factoryCache = styleCache.get(factory) as WeakMap<MobileTheme, T> | undefined;
  if (!factoryCache) {
    factoryCache = new WeakMap<MobileTheme, T>();
    styleCache.set(factory, factoryCache);
  }
  let styles = factoryCache.get(theme);
  if (!styles) {
    styles = StyleSheet.create(factory(theme));
    factoryCache.set(theme, styles);
  }
  return styles;
}
```

Initialize mode to `system`, use `useColorScheme`, normalize AsyncStorage reads, guard async completion with an `active` flag, and catch load/save errors without logging payloads.

- [ ] **Step 5: Mount theme directly below Query**

Use this exact ownership order in `App.tsx`:

```tsx
<MobileQueryProvider>
  <MobileThemeProvider>
    <WhisprMobileRoot />
    <MobileThemeSystemSurfaces />
  </MobileThemeProvider>
</MobileQueryProvider>
```

Remove the fixed `StatusBar style="auto"` instance. The system-surface component derives StatusBar, Android navigation bar, and root system background from `useTheme()`.

- [ ] **Step 6: Add localized appearance selection**

Add Turkish/English copy keys for system, light, dark, and the control description. Render a `radiogroup` with testID `mobile-settings-appearance-control`; each option is a `radio` with `accessibilityState={{ checked: selected }}` and calls `setMode`.

- [ ] **Step 7: Add system-module Jest mocks and verify settings/provider behavior**

Mock `expo-navigation-bar` and `expo-system-ui` with resolved async functions. Run:

```powershell
corepack pnpm --filter @wizards/mobile typecheck
corepack pnpm --filter @wizards/mobile test
corepack pnpm --filter @wizards/mobile test:components
corepack pnpm --filter @wizards/mobile exec expo install --check
```

- [ ] **Step 8: Commit the runtime batch**

```powershell
git add -- apps/mobile/App.tsx apps/mobile/package.json pnpm-lock.yaml apps/mobile/src/app/providers/mobile-theme-provider.tsx apps/mobile/src/app/providers/mobile-theme-system-surfaces.tsx apps/mobile/src/app/screens/settings-screen.tsx apps/mobile/src/locale/mobile-copy.ts apps/mobile/component-tests
git commit -m "feat: add mobile theme runtime"
```

### Task 4: Build the Core Theme-Aware Component Kit

**Files:**

- Create: `apps/mobile/src/app/components/kit/icon.tsx`
- Create: `apps/mobile/src/app/components/kit/button.tsx`
- Create: `apps/mobile/src/app/components/kit/icon-button.tsx`
- Create: `apps/mobile/src/app/components/kit/card.tsx`
- Create: `apps/mobile/src/app/components/kit/list-row.tsx`
- Create: `apps/mobile/src/app/components/kit/badge.tsx`
- Create: `apps/mobile/src/app/components/kit/avatar.tsx`
- Create: `apps/mobile/src/app/components/kit/divider.tsx`
- Create: `apps/mobile/src/app/components/kit/empty-state.tsx`
- Create: `apps/mobile/src/app/components/kit/index.ts`
- Create: `apps/mobile/component-tests/mobile-kit-core.test.tsx`
- Modify: `apps/mobile/src/app/components/ui-atoms.tsx`

**Interfaces:**

- Produces: `Icon`, `Button`, `IconButton`, `Card`, `ListRow`, `Badge`, `Avatar`, `Divider`, and `EmptyState`.
- Consumes: `useTheme`, `useThemedStyles`, Task 2 typography/sizing, Expo Image, and Ionicons.

- [ ] **Step 1: Write light/dark accessibility tests for every core component**

Use one helper that renders each component under an explicit theme override supported by the test provider. Assert both theme IDs render, button roles/states, mandatory icon-button labels, 44-point minimum touch size, list-row button role when interactive, badge text, avatar fallback/accessibility label, divider role, and empty-state heading/body.

- [ ] **Step 2: Run core kit tests and verify RED**

Run: `corepack pnpm --filter @wizards/mobile exec jest component-tests/mobile-kit-core.test.tsx --runInBand`

Expected: FAIL because kit modules do not exist.

- [ ] **Step 3: Implement the typed Icon and action primitives**

Use these public types:

```ts
export type IconTone = "accent" | "danger" | "inverse" | "muted" | "primary" | "secondary";
export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export interface IconButtonProps extends Omit<PressableProps, "children"> {
  accessibilityLabel: string;
  icon: ComponentProps<typeof Ionicons>["name"];
  size?: "sm" | "md";
  tone?: IconTone;
}
```

Map icon tones to `MobileTheme` colors. Require `accessibilityLabel` at the type level. Button exposes `accessibilityRole="button"`, disabled/busy state, and an ActivityIndicator while preserving the label for assistive technology.

- [ ] **Step 4: Implement structural primitives with themed style factories**

Each module declares its factory at module scope and calls `useThemedStyles` once. `Avatar` absorbs `AvatarMark` behavior and uses `MobileCachedImage` for remote sources; presence ring color comes from semantic status tokens.

- [ ] **Step 5: Wrap existing ui-atoms without breaking screen APIs**

Keep existing exported component names used by screens. Replace their internal action/card/avatar primitives with kit components where prop parity is exact. Do not change screen call signatures in this task.

- [ ] **Step 6: Run the per-batch gate and commit**

```powershell
corepack pnpm --filter @wizards/mobile typecheck
corepack pnpm --filter @wizards/mobile test
corepack pnpm --filter @wizards/mobile test:components
git add -- apps/mobile/src/app/components/kit apps/mobile/src/app/components/ui-atoms.tsx apps/mobile/component-tests/mobile-kit-core.test.tsx
git commit -m "feat: add mobile core component kit"
```

### Task 5: Build Feedback, BottomSheet, and ContextMenu Primitives

**Files:**

- Create: `apps/mobile/src/app/components/kit/skeleton.tsx`
- Create: `apps/mobile/src/app/components/kit/toast.tsx`
- Create: `apps/mobile/src/app/components/kit/bottom-sheet.tsx`
- Create: `apps/mobile/src/app/components/kit/context-menu.tsx`
- Create: `apps/mobile/component-tests/mobile-kit-feedback.test.tsx`
- Create: `apps/mobile/component-tests/mobile-kit-overlays.test.tsx`
- Modify: `apps/mobile/src/app/components/kit/index.ts`

**Interfaces:**

- Produces: `Skeleton`, `ToastProvider`, `useToast`, `BottomSheet`, and `ContextMenu`.
- Consumes: Existing Reanimated/Gesture Handler only; no new native dependency.

- [ ] **Step 1: Write failing feedback and overlay tests**

Assert:

- Skeleton renders animated shimmer normally and a static surface when `useReducedMotion()` is true.
- Toast queues two announcements, exposes `accessibilityLiveRegion="polite"`, dismisses in order, and clears timers on unmount.
- BottomSheet exposes dialog semantics, respects open/closed state, closes on backdrop, Android back, and pan-down callback, and uses immediate transitions under reduced motion.
- ContextMenu opens from long press, renders `accessibilityRole="menu"`, gives actions `menuitem`, closes after selection/backdrop/back, and never imports haptics.

Run each Skeleton, Toast, BottomSheet, and ContextMenu render assertion once with `lightTheme` and once with `darkTheme`; assert semantic surface/text styles and accessibility props in both runs.

- [ ] **Step 2: Run the new test files and verify RED**

```powershell
corepack pnpm --filter @wizards/mobile exec jest component-tests/mobile-kit-feedback.test.tsx component-tests/mobile-kit-overlays.test.tsx --runInBand
```

- [ ] **Step 3: Implement Skeleton and the bounded Toast queue**

Use `useSharedValue`, `useAnimatedStyle`, `withRepeat`, and `withTiming` for shimmer. Skip repeating animation under reduced motion. Toast queue entries contain only opaque IDs, visible strings supplied by callers, tone, and duration; no payload logging.

- [ ] **Step 4: Implement the approved minimal BottomSheet**

Public API:

```ts
export interface BottomSheetProps {
  accessibilityLabel: string;
  children: ReactNode;
  onClose(): void;
  open: boolean;
  snapPoint?: number;
  testID?: string;
}
```

Render a full-screen `Modal transparent`, Pressable backdrop, and `GestureDetector` pan gesture. Keep translateY on the UI thread, clamp drag to non-negative values, close above a bounded threshold/velocity, and register `BackHandler` only while open. Fixed numeric snap points avoid dynamic-layout coupling.

- [ ] **Step 5: Implement ContextMenu over BottomSheet**

```ts
export interface ContextMenuAction {
  destructive?: boolean;
  disabled?: boolean;
  icon?: ComponentProps<typeof Ionicons>["name"];
  id: string;
  label: string;
  onPress(): void;
}
```

The trigger uses `onLongPress`; action rows expose menuitem roles and disabled state. Keep BottomSheet and ContextMenu visibility local to their owner; do not widen the Phase 0 overlay store. Do not add haptics.

- [ ] **Step 6: Run the per-batch gate and commit**

```powershell
corepack pnpm --filter @wizards/mobile typecheck
corepack pnpm --filter @wizards/mobile test
corepack pnpm --filter @wizards/mobile test:components
git add -- apps/mobile/src/app/components/kit apps/mobile/component-tests/mobile-kit-feedback.test.tsx apps/mobile/component-tests/mobile-kit-overlays.test.tsx
git commit -m "feat: add mobile feedback primitives"
```

### Task 6: Migrate Shell, Navigation, Auth, Settings, Home, and Notifications

**Files:**

- Modify: `apps/mobile/src/app/mobile-app-shell.tsx`
- Modify: `apps/mobile/src/app/mobile-error-boundary.tsx`
- Modify: `apps/mobile/src/app/mobile-root-screen-shared.ts`
- Modify: `apps/mobile/src/app/styles/shared-styles.ts`
- Modify: `apps/mobile/src/navigation/mobile-bottom-tab-bar.tsx`
- Modify: `apps/mobile/src/navigation/mobile-navigator.tsx`
- Modify: `apps/mobile/src/app/screens/auth-gate.tsx`
- Modify: `apps/mobile/src/app/screens/auth-gate.styles.ts`
- Modify: `apps/mobile/src/app/screens/settings-screen.tsx`
- Modify: `apps/mobile/src/app/screens/settings-screen.styles.ts`
- Modify: `apps/mobile/src/app/screens/home-screen.tsx`
- Modify: `apps/mobile/src/app/screens/home-screen.styles.ts`
- Modify: `apps/mobile/src/app/screens/notifications-screen.tsx`
- Modify: `apps/mobile/src/app/screens/notifications-screen.styles.ts`
- Modify: `apps/mobile/component-tests/mobile-navigation.test.tsx`
- Modify: `apps/mobile/component-tests/auth-gate.test.tsx`
- Modify: `apps/mobile/component-tests/mobile-screen-containers.test.tsx`

**Interfaces:**

- Consumes: Tasks 3-5 provider and kit.
- Produces: Fully themed shell/tab bar plus first four themed screens with unchanged navigation/test-ID behavior.

- [ ] **Step 1: Add failing light/dark shell and screen assertions**

Extend navigation/auth/screen component suites to render under both themes and assert semantic background/text colors, stable existing test IDs, unchanged tab roles/selected state, and no remount of a keyed child when mode changes.

- [ ] **Step 2: Convert static style exports to stable factories**

Use this exact pattern in every listed style module:

```ts
import type { MobileTheme } from "../../design/themes";

export const createScreenStyles = (theme: MobileTheme) => ({
  root: {
    backgroundColor: theme.surface.base,
  },
});
```

In each consumer:

```ts
const styles = useThemedStyles(createScreenStyles);
```

Do not define factories inside components.

- [ ] **Step 3: Theme shell, navigator headers, and tab bar**

Preserve `mobile-bottom-tab-*`, roles, badges, icon mapping, and existing spring. Derive all colors/elevation from theme. Keep `useReducedMotion` direct assignment behavior. Move safe-area inline numeric calculations only; do not introduce inline color/style objects in tab item loops.

- [ ] **Step 4: Theme auth and settings with bounded text scaling**

Keep `allowFontScaling` enabled. Add `maxFontSizeMultiplier` to headings and selector labels where truncation is possible. Replace duplicated settings row/action visuals with kit Card/ListRow/Button/IconButton only when existing test IDs and roles remain on the same interactive node.

- [ ] **Step 5: Theme home and notifications**

Preserve FlashList render callback identity and memoized row components. Move any color-dependent row style to cached themed styles supplied through stable props.

- [ ] **Step 6: Run the per-batch gate and commit**

```powershell
corepack pnpm --filter @wizards/mobile typecheck
corepack pnpm --filter @wizards/mobile test
corepack pnpm --filter @wizards/mobile test:components
git add -- apps/mobile/src/app/mobile-app-shell.tsx apps/mobile/src/app/mobile-error-boundary.tsx apps/mobile/src/app/mobile-root-screen-shared.ts apps/mobile/src/app/styles/shared-styles.ts apps/mobile/src/navigation apps/mobile/src/app/screens/auth-gate* apps/mobile/src/app/screens/settings-screen* apps/mobile/src/app/screens/home-screen* apps/mobile/src/app/screens/notifications-screen* apps/mobile/component-tests
git commit -m "feat: theme mobile shell and primary screens"
```

### Task 7: Migrate Messaging, Voice, Composer, Overlays, and Primitives

**Files:**

- Modify: `apps/mobile/src/app/screens/dm-screen.tsx`
- Modify: `apps/mobile/src/app/screens/dm-screen.styles.ts`
- Modify: `apps/mobile/src/app/screens/channel-screen.tsx`
- Modify: `apps/mobile/src/app/screens/channel-screen.styles.ts`
- Modify: `apps/mobile/src/app/screens/voice-screen.tsx`
- Modify: `apps/mobile/src/app/screens/voice-screen.styles.ts`
- Modify: `apps/mobile/src/voice/mobile-voice-room-panel.tsx`
- Modify: `apps/mobile/src/app/composer/mobile-composer.tsx`
- Modify: `apps/mobile/src/app/composer/mobile-composer.styles.ts`
- Modify: `apps/mobile/src/app/overlays/mobile-voice-invite-overlay.tsx`
- Modify: `apps/mobile/src/app/overlays/mobile-voice-invite-overlay.styles.ts`
- Modify: `apps/mobile/src/app/components/ui-atoms.tsx`
- Modify: `apps/mobile/src/app/components/ui-atoms.styles.ts`
- Modify: `apps/mobile/src/app/components/media-primitives.tsx`
- Modify: `apps/mobile/src/app/components/media-primitives.styles.ts`
- Modify: `apps/mobile/src/app/components/message-primitives.tsx`
- Modify: `apps/mobile/src/app/components/message-primitives.styles.ts`
- Modify: `apps/mobile/component-tests/mobile-performance-surfaces.test.tsx`
- Modify: `apps/mobile/component-tests/voice-screen-components.test.tsx`
- Modify: `apps/mobile/component-tests/mobile-screen-containers.test.tsx`

**Interfaces:**

- Consumes: Semantic themes and all kit primitives.
- Produces: Complete presentation-layer style migration with stable FlashList behavior.

- [ ] **Step 1: Add failing dark-render and FlashList stability tests**

Extend performance tests with a memoized probe row whose render counter stays unchanged across a parent rerender with the same theme/props, increments once when the theme reference changes, and remains stable again on a same-dark-theme rerender.

- [ ] **Step 2: Migrate DM and channel styles**

Convert factories and consumers, preserving stack back IDs, message-list IDs, composer IDs, search behavior, and virtualized row memoization. Theme bubble variants through semantic surface/accent roles rather than literal colors.

- [ ] **Step 3: Migrate voice styles and native voice panel**

Preserve LiveKit lifecycle/control props and existing reduced-motion behavior. Theme participant cards, speaking/presence status, destructive leave action, and permission states.

- [ ] **Step 4: Migrate composer and voice-invite overlay**

Use kit IconButton/Button/Card primitives where parity is exact. Keep keyboard/safe-area behavior, attachment state, submit roles, and overlay cleanup unchanged.

- [ ] **Step 5: Migrate UI, media, and message primitives**

Move every remaining style to `useThemedStyles`. Ensure memoized message rows receive a stable style bundle or semantic scalar props so theme changes rerender once and unrelated parents do not.

- [ ] **Step 6: Run the per-batch gate and commit**

```powershell
corepack pnpm --filter @wizards/mobile typecheck
corepack pnpm --filter @wizards/mobile test
corepack pnpm --filter @wizards/mobile test:components
git add -- apps/mobile/src/app/screens/dm-screen* apps/mobile/src/app/screens/channel-screen* apps/mobile/src/app/screens/voice-screen* apps/mobile/src/voice/mobile-voice-room-panel.tsx apps/mobile/src/app/composer apps/mobile/src/app/overlays apps/mobile/src/app/components apps/mobile/component-tests
git commit -m "feat: theme mobile messaging and voice"
```

### Task 8: Remove Legacy Colors, Fix Locale/Pseudo-Icons, and Lock Quality

**Files:**

- Modify: `apps/mobile/src/design/tokens.ts`
- Modify: `apps/mobile/src/app/components/message-primitives.tsx`
- Modify: `apps/mobile/src/app/composer/mobile-composer.tsx`
- Modify: `apps/mobile/src/locale/mobile-locale-preferences.ts`
- Modify: `apps/mobile/scripts/mobile-design-contract.test.ts`
- Modify: `apps/mobile/scripts/mobile-maestro-testid-contract.test.ts`
- Modify: `apps/mobile/src/quality/mobile-quality-gate.ts`
- Modify: `apps/mobile/scripts/mobile-quality-gate.test.ts`
- Create: `apps/mobile/src/locale/mobile-date-separator.ts`
- Create: `apps/mobile/scripts/mobile-date-separator.test.ts`

**Interfaces:**

- Produces: No legacy color API usage, active-locale date formatting, real icons, and permanent theme quality gates.
- Consumes: Completed style migration and typed Icon.

- [ ] **Step 1: Add RED contract scans before cleanup**

Recursively scan `src/app`, `src/navigation`, and `src/voice/mobile-voice-room-panel.tsx`:

```ts
const RAW_COLOR_PATTERN = /#[0-9a-f]{6}|rgba\(/i;
const LEGACY_COLOR_PATTERN = /\bmobileColors\b/;
const JS_ANIMATED_PATTERN = /from ["']react-native["'][^;]*\bAnimated\b/;
```

Fail with relative file paths for every violation. Exempt only `src/design/palette.ts` from the raw-color rule. Add test-ID assertions for `mobile-settings-appearance-control` and the dark-mode Maestro flow.

Add explicit kit-source assertions that Button/IconButton use `accessibilityRole="button"`, ContextMenu uses `accessibilityRole="menu"`, menu actions use `accessibilityRole="menuitem"`, Toast uses `accessibilityLiveRegion`, and icon-only controls require an accessibility label. Also reject `>FILE<`, `>x<`, and string-child equivalents in app TSX sources after icon cleanup.

- [ ] **Step 2: Run targeted contracts and verify RED**

```powershell
corepack pnpm --filter @wizards/mobile exec node --test --import tsx scripts/mobile-design-contract.test.ts scripts/mobile-maestro-testid-contract.test.ts
```

Expected: FAIL until all legacy colors and the new Maestro flow are complete.

- [ ] **Step 3: Remove the legacy color export and finish remaining imports**

Keep `tokens.ts` only as a compatibility re-export for non-color layout types if a non-presentation consumer still needs them. It must not export `mobileColors`, raw colors, or color-derived elevation/gradients.

- [ ] **Step 4: Replace pseudo-icons**

Replace attachment `FILE` with `Icon icon="document-attach-outline"` and clear `x` glyphs with `Icon icon="close"`. Preserve accessibility labels, Pressable roles, touch targets, and existing test IDs.

- [ ] **Step 5: Drive date separators from active locale**

Add:

```ts
export function getMobileIntlLocale(locale: MobileLocale): "en-US" | "tr-TR" {
  return locale === "en" ? "en-US" : "tr-TR";
}
```

Move the formatter into `mobile-date-separator.ts` as an exported pure function `formatMobileDateSeparator(value, locale)`. Make `MessageDateSeparator` read `useMobileLocaleRuntime()` and pass its `locale`. Test Turkish, English, and invalid dates in `mobile-date-separator.test.ts`.

- [ ] **Step 6: Add theme readiness to the quality gate**

Add `theme` to `MobileQualityArea`, a required manual light/dark/system check, and a `mobile-maestro-dark-mode` automated gate pointing to `.maestro/phase1-dark-mode.yml`. Update quality summaries/tests without weakening existing requirements.

- [ ] **Step 7: Run the per-batch gate and commit**

```powershell
corepack pnpm --filter @wizards/mobile typecheck
corepack pnpm --filter @wizards/mobile test
corepack pnpm --filter @wizards/mobile test:components
corepack pnpm --filter @wizards/mobile quality:check
git add -- apps/mobile/src/design/tokens.ts apps/mobile/src/app apps/mobile/src/navigation apps/mobile/src/voice/mobile-voice-room-panel.tsx apps/mobile/src/locale apps/mobile/src/quality apps/mobile/scripts apps/mobile/component-tests
git commit -m "test: enforce mobile theme contracts"
```

### Task 9: Add Maestro Evidence, Migration Notes, and UAT Integration Gate

**Files:**

- Create: `.maestro/phase1-dark-mode.yml`
- Create: `apps/mobile/MIGRATION_PHASE_1.md`
- Modify: `graphify-out/GRAPH_REPORT.md`
- Modify: `graphify-out/graph.json`
- Modify: `graphify-out/manifest.json`
- Evidence only: `artifacts/mobile/phase1/**`

**Interfaces:**

- Consumes: Finished Phase 1 implementation.
- Produces: Device proof, migration handoff, updated graph, and a verified merge-ready branch.

- [ ] **Step 1: Add the dark-mode Maestro flow**

The YAML must:

```yaml
appId: team.whispr.mobile
---
- launchApp
- openLink: "whispr://settings"
- assertVisible:
    id: "mobile-settings-appearance-control"
- tapOn: "Koyu"
- tapOn:
    id: "mobile-bottom-tab-overview"
- takeScreenshot: "artifacts/mobile/phase1/dark-overview"
- tapOn:
    id: "mobile-bottom-tab-messages"
- tapOn:
    id: "mobile-bottom-tab-notifications"
- tapOn:
    id: "mobile-bottom-tab-voice"
- tapOn:
    id: "mobile-bottom-tab-settings"
- takeScreenshot: "artifacts/mobile/phase1/dark-settings"
- tapOn: "Acik"
- takeScreenshot: "artifacts/mobile/phase1/light-settings"
```

Add optional English selectors only through conditional flows; do not duplicate or rename test IDs.

- [ ] **Step 2: Build/install and run both Maestro suites**

```powershell
corepack pnpm --filter @wizards/mobile exec expo prebuild --platform android --no-install
powershell -ExecutionPolicy Bypass -File apps/mobile/scripts/build-android-uat.ps1 -NoStartMetro
maestro test .maestro/phase0-navigation.yml
maestro test .maestro/phase1-dark-mode.yml
```

Expected: both PASS on the booted emulator. Store XML/text output and screenshots under ignored `artifacts/mobile/phase1/`.

- [ ] **Step 3: Write the migration note with exact decisions and evidence**

Document theme architecture, cache behavior, kit inventory, in-house BottomSheet rationale, predictive-back result, AsyncStorage key, system-bar packages, no SecureStore/query/offline cache statement, future server-sync connection point, Phase 2 ContextMenu handoff, all command counts/results, and artifact paths.

- [ ] **Step 4: Run final dependency/security verification**

```powershell
corepack pnpm --filter @wizards/mobile exec expo install --check
corepack pnpm audit
```

Expected: Expo reports dependencies up to date and audit reports no known vulnerabilities. A non-clean result blocks completion.

- [ ] **Step 5: Run the complete final test matrix**

```powershell
corepack pnpm --filter @wizards/mobile typecheck
corepack pnpm --filter @wizards/mobile test
corepack pnpm --filter @wizards/mobile test:components
corepack pnpm --filter @wizards/mobile quality:check
```

Expected: all PASS with updated counts and zero blockers.

- [ ] **Step 6: Update Graphify only in the feature worktree**

Run from `C:\W1P1`:

```powershell
graphify update .
```

Review generated graph changes and confirm the main checkout status is unchanged.

- [ ] **Step 7: Commit final evidence contracts and documentation**

```powershell
git add -- .maestro/phase1-dark-mode.yml apps/mobile/MIGRATION_PHASE_1.md graphify-out/GRAPH_REPORT.md graphify-out/graph.json graphify-out/manifest.json
git commit -m "docs: complete mobile phase one migration"
```

- [ ] **Step 8: Prepare but do not execute the uat integration**

```powershell
git fetch origin uat
git merge-base --is-ancestor origin/uat HEAD
git log --oneline --decorate origin/uat..HEAD
git diff --check origin/uat...HEAD
```

If `origin/uat` advanced, integrate it into the feature branch, resolve conflicts there, and rerun Steps 2-6. Present one of these user-approved follow-ups without executing it:

```powershell
git -C C:\Users\doguk\Desktop\Wizards merge --no-ff codex/mobile-phase1-design-system
```

or publish a PR from `codex/mobile-phase1-design-system` after explicit approval.
