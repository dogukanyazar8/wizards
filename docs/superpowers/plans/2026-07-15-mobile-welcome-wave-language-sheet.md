# Mobile Welcome Wave Logo and Language Sheet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the signed-out 2a screen use the canonical animated Whispr wave mark and present the exact 3a locale-selection bottom sheet backed by real i18n and device preferences.

**Architecture:** The logo remains an isolated native-SVG component driven by Reanimated. The 3a UI is a dedicated auth sheet that reuses the existing accessible swipe/dismiss mechanics through presentation overrides, while locale state remains centralized in `MobileLocaleProvider` and is migrated safely from the existing `tr`/`en` storage values.

**Tech Stack:** Expo 56, React Native 0.85, TypeScript, React Native Reanimated, Expo Localization, Expo Blur, Expo Haptics, React Native Testing Library, Node test runner.

## Global Constraints

- Design source: `design_handoff_whispr_mobile/Whispr Mobile Redesign.dc.html` for 2a and the attached auth-flow instruction for 3a.
- No dummy language records: render only genuine `MOBILE_LOCALE_OPTIONS` catalogs; the current TR/EN list hides search because it has no more than six rows.
- Keep 2a's root-auth route, 56 px brand card, content geometry, safe areas, and absence of bottom navigation unchanged.
- Preserve legacy secure-storage values `tr` and `en`; never log locale storage failures or user data.
- Use semantic theme and layout tokens rather than raw component-level design colors or measurements.
- Reduced Motion stops the decorative wave loop; all locale selection and dismissal behavior remains functional.

---

## File Structure

- `apps/mobile/src/locale/mobile-locale-preferences.ts` — locale metadata, explicit/device preference serialization, pure device-locale resolution.
- `apps/mobile/src/app/providers/mobile-locale-provider.tsx` — persisted preference hydration, foreground device-locale refresh, runtime commands.
- `apps/mobile/src/design/palette.ts`, `tokens.ts`, `themes.ts` — exact 3a semantic color and geometry roles.
- `apps/mobile/src/app/components/kit/bottom-sheet.tsx` — opt-in backdrop blur and style overrides that do not alter existing callers.
- `apps/mobile/src/app/screens/auth/auth-welcome-brand-mark.tsx` — five-bar Reanimated SVG logo.
- `apps/mobile/src/app/screens/auth/auth-language-picker-sheet.tsx` and `.styles.ts` — dedicated 3a sheet composition and styling.
- `apps/mobile/src/app/screens/auth/mobile-auth-screen-containers.tsx` — stateful 3a wiring for the 2a language pill.
- `apps/mobile/component-tests/auth-welcome-screen.test.tsx` — exact five-bar geometry and reduced-motion behavior.
- `apps/mobile/component-tests/auth-language-picker-sheet.test.tsx` — 3a visual-state and interaction coverage.
- `apps/mobile/component-tests/mobile-auth-navigation.test.tsx` — welcome-container opening and locale-wiring coverage.
- `apps/mobile/scripts/mobile-locale-preferences.test.ts` — migration, sorting, and device-locale fallback coverage.
- `apps/mobile/component-tests/jest.setup.ts`, `apps/mobile/package.json`, `pnpm-lock.yaml` — native Expo mocks and SDK-matched module dependencies.

### Task 1: Establish the real locale/device-preference contract

**Files:**
- Modify: `apps/mobile/package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `apps/mobile/src/locale/mobile-locale-preferences.ts`
- Modify: `apps/mobile/src/locale/expo-mobile-locale-preferences.ts`
- Modify: `apps/mobile/src/app/providers/mobile-locale-provider.tsx`
- Modify: `apps/mobile/scripts/mobile-locale-preferences.test.ts`

**Interfaces:**
- Consumes: legacy storage values `"tr" | "en"`, `expo-localization.getLocales()`, and `MobileLocaleProvider`.
- Produces: `MobileLocalePreference`, `resolveMobileLocaleFromDeviceLocales()`, `setUseDeviceLocale(enabled)`, and rich `MOBILE_LOCALE_OPTIONS` metadata for the 3a UI.

- [ ] **Step 1: Write the failing preference and fallback tests**

  Add the exact new contract before changing production code:

  ```ts
  assert.deepEqual(loadMobileLocalePreference(createMemoryStorage("tr")), {
    mode: "manual", locale: "tr",
  });
  assert.deepEqual(normalizeMobileLocalePreference("device:en"), {
    mode: "device", manualLocale: "en",
  });
  assert.equal(
    resolveMobileLocaleFromDeviceLocales([{ languageCode: "de" }, { languageCode: "en" }]),
    "en",
  );
  assert.equal(resolveMobileLocaleFromDeviceLocales([{ languageCode: "de" }]), "tr");
  ```

- [ ] **Step 2: Run the focused locale contract to verify failure**

  Run:

  ```powershell
  corepack pnpm --filter @wizards/mobile exec node --test --import tsx scripts/mobile-locale-preferences.test.ts
  ```

  Expected: FAIL because the preference type and device-locale resolver do not yet exist.

- [ ] **Step 3: Add Expo SDK-matched locale/blur modules**

  Run:

  ```powershell
  corepack pnpm --filter @wizards/mobile exec expo install expo-localization expo-blur
  ```

  Keep the Expo-selected versions in `apps/mobile/package.json` and `pnpm-lock.yaml`. Do not add an app-config plugin unless the existing native configuration requires it; the module is autolinked for the current Expo runtime.

- [ ] **Step 4: Implement explicit/device preference parsing and metadata**

  Replace the narrow string-only contract with these stable types and preserve existing option fields consumed by settings:

  ```ts
  export interface MobileLocaleOption {
    readonly code: string;
    readonly direction: "ltr" | "rtl";
    readonly id: MobileLocale;
    readonly label: string;
    readonly nativeName: string;
    readonly shortLabel: string;
    readonly turkishName: string;
  }

  export type MobileLocalePreference =
    | { readonly mode: "manual"; readonly locale: MobileLocale }
    | { readonly mode: "device"; readonly manualLocale: MobileLocale };

  export const MOBILE_LOCALE_OPTIONS = [
    { code: "EN", direction: "ltr", id: "en", label: "English", nativeName: "English", shortLabel: "EN", turkishName: "İngilizce" },
    { code: "TR", direction: "ltr", id: "tr", label: "Türkçe", nativeName: "Türkçe", shortLabel: "TR", turkishName: "Türkçe" },
  ] as const satisfies ReadonlyArray<MobileLocaleOption>;

  export function resolveMobileLocaleFromDeviceLocales(
    locales: readonly { readonly languageCode: string | null }[],
  ): MobileLocale {
    return locales
      .map((locale) => normalizeMobileLocale(locale.languageCode))
      .find((locale) => MOBILE_LOCALE_OPTIONS.some((option) => option.id === locale))
      ?? DEFAULT_MOBILE_LOCALE;
  }
  ```

  Parse `tr` and `en` as manual preferences. Serialize device mode as `device:<last-manual-locale>` so turning the switch off restores the last explicit choice. Invalid strings resolve fail-closed to `{ mode: "manual", locale: "tr" }`.

- [ ] **Step 5: Make `MobileLocaleProvider` resolve the real device locale**

  Use `getLocales()` from `expo-localization` and refresh only while device mode is active:

  ```ts
  const resolveRuntimeLocale = (preference: MobileLocalePreference) =>
    preference.mode === "device"
      ? resolveMobileLocaleFromDeviceLocales(getLocales())
      : preference.locale;

  const setUseDeviceLocale = useCallback((enabled: boolean) => {
    const next = enabled
      ? { mode: "device", manualLocale: preference.mode === "manual" ? preference.locale : preference.manualLocale }
      : { mode: "manual", locale: preference.mode === "device" ? preference.manualLocale : preference.locale };
    applyPreference(next);
  }, [applyPreference, preference]);
  ```

  `applyPreference` must set `activeMobileLocale`, React state, and persist the preference with the existing error-swallowing boundary. Subscribe to `AppState` and re-resolve only on active foreground transitions in device mode.

  Expose the following complete provider contract while retaining the existing `locale` and `selectLocale` consumers:

  ```ts
  interface MobileLocaleRuntime {
    readonly locale: MobileLocale;
    readonly selectLocale: (locale: MobileLocale) => void;
    readonly setUseDeviceLocale: (enabled: boolean) => void;
    readonly usingDeviceLocale: boolean;
  }
  ```

- [ ] **Step 6: Re-run the locale contract**

  Run the Step 2 command again.

  Expected: PASS, including legacy `tr`/`en` migration, `device:en` restoration, preferred supported device locales, and Turkish fallback.

- [ ] **Step 7: Commit the isolated locale contract**

  ```powershell
  git add apps/mobile/package.json pnpm-lock.yaml apps/mobile/src/locale/mobile-locale-preferences.ts apps/mobile/src/locale/expo-mobile-locale-preferences.ts apps/mobile/src/app/providers/mobile-locale-provider.tsx apps/mobile/scripts/mobile-locale-preferences.test.ts
  git commit -m "feat(mobile): add device-aware locale preferences"
  ```

### Task 2: Replace the static welcome mark with the canonical animated wave

**Files:**
- Modify: `apps/mobile/src/app/screens/auth/auth-welcome-brand-mark.tsx`
- Modify: `apps/mobile/component-tests/auth-welcome-screen.test.tsx`

**Interfaces:**
- Consumes: `useTheme()`, Reanimated's `useReducedMotion`, and the existing 28 px asset slot.
- Produces: `AuthWelcomeBrandMark` with five canonical bars and no parent-layout changes.

- [ ] **Step 1: Update the welcome test to require five bars**

  Replace the four static-rect assertions with the five scaled canonical dimensions:

  ```ts
  expect(firstBar?.props).toMatchObject({ height: 8.5, width: 2.4, x: 3.6, y: 7.75 });
  expect(secondBar?.props).toMatchObject({ height: 12.5, width: 2.4, x: 6.8, y: 5.75 });
  expect(thirdBar?.props).toMatchObject({ height: 17, width: 2.4, x: 10, y: 3.5 });
  expect(fourthBar?.props).toMatchObject({ height: 12, width: 2.4, x: 13.2, y: 6 });
  expect(fifthBar?.props).toMatchObject({ height: 9, width: 2.4, x: 16.4, y: 7.5 });
  ```

  Mock `useReducedMotion()` to `true` and assert the static branch renders no animated bar wrapper.

- [ ] **Step 2: Run the focused welcome test to verify failure**

  Run:

  ```powershell
  corepack pnpm --filter @wizards/mobile exec jest component-tests/auth-welcome-screen.test.tsx --runInBand
  ```

  Expected: FAIL because the current component still renders four static bars.

- [ ] **Step 3: Implement the five-bar UI-thread animation**

  Convert SVG rectangles into `Animated.createAnimatedComponent(Rect)` bars. Keep their static dimensions in `CANONICAL_WAVEFORM_BARS`; each receives a `scaleY` shared value around its vertical center. Start the wave with the exact 2,100 ms cycle and 130 ms sequence offset, and cancel all animations on cleanup:

  ```ts
  useEffect(() => {
    if (reducedMotion) {
      amplitude.value = 1;
      return;
    }
    amplitude.value = withRepeat(
      withSequence(withTiming(0.62, { duration: 525 }), withTiming(1, { duration: 525 })),
      -1,
      true,
    );
    return () => cancelAnimation(amplitude);
  }, [amplitude, reducedMotion]);
  ```

  Apply the per-bar phase with `withDelay(index * 130, ...)`, preserve white fills and rounded corners, and leave `AuthWelcomeScreen` and its styles untouched.

- [ ] **Step 4: Re-run the welcome test**

  Run the Step 2 command again.

  Expected: PASS, including the exact five-bar geometry, existing 2a controls, and reduced-motion static branch.

- [ ] **Step 5: Commit the isolated logo change**

  ```powershell
  git add apps/mobile/src/app/screens/auth/auth-welcome-brand-mark.tsx apps/mobile/component-tests/auth-welcome-screen.test.tsx
  git commit -m "feat(mobile): animate canonical Whispr welcome logo"
  ```

### Task 3: Add tokenized 3a sheet presentation and component

**Files:**
- Modify: `apps/mobile/src/design/palette.ts`
- Modify: `apps/mobile/src/design/tokens.ts`
- Modify: `apps/mobile/src/design/themes.ts`
- Modify: `apps/mobile/src/app/components/kit/bottom-sheet.tsx`
- Create: `apps/mobile/src/app/screens/auth/auth-language-picker-sheet.styles.ts`
- Create: `apps/mobile/src/app/screens/auth/auth-language-picker-sheet.tsx`
- Modify: `apps/mobile/src/locale/mobile-copy.ts`
- Modify: `apps/mobile/component-tests/jest.setup.ts`
- Create: `apps/mobile/component-tests/auth-language-picker-sheet.test.tsx`
- Modify: `apps/mobile/component-tests/mobile-kit-overlays.test.tsx`
- Modify: `apps/mobile/component-tests/mobile-redesign-semantic-role-gate.test.tsx`

**Interfaces:**
- Consumes: `BottomSheet` presentation props, `MOBILE_LOCALE_OPTIONS`, `useMobileHaptics()`, and the locale runtime commands from Task 1.
- Produces: `AuthLanguagePickerSheet` with `open`, `locale`, `usingDeviceLocale`, `onClose`, `onSelectLocale`, and `onSetUseDeviceLocale` props.

- [ ] **Step 1: Write focused 3a component tests before implementation**

  In the new test, render the sheet open and assert the concrete contract:

  ```tsx
  expect(view.getByTestId("mobile-auth-language-sheet-panel")).toBeTruthy();
  expect(view.getByText("Dil seçin")).toBeTruthy();
  expect(view.queryByTestId("mobile-auth-language-search")).toBeNull();
  expect(view.getByTestId("mobile-auth-language-option-en").props.accessibilityRole).toBe("radio");
  expect(view.getByTestId("mobile-auth-language-device-toggle").props.accessibilityRole).toBe("switch");
  ```

  Use fake timers to verify manual selection calls `onSelectLocale("en")` and haptics immediately, then calls `onClose` exactly once at 250 ms. Verify device mode marks manual rows disabled at 50% opacity and backdrop/close actions only dismiss.

- [ ] **Step 2: Run the new component test to verify failure**

  Run:

  ```powershell
  corepack pnpm --filter @wizards/mobile exec jest component-tests/auth-language-picker-sheet.test.tsx --runInBand
  ```

  Expected: FAIL because `AuthLanguagePickerSheet` does not exist.

- [ ] **Step 3: Add semantic roles for every 3a measurement and color**

  Add `layout.auth.languageSheet` values for the specified 28 px panel corners, 40 by 5 px handle, 36 px close target, 16/18 px field/row radii, 38 px code badge, 44 by 26 px toggle, and all prescribed paddings/gaps. Add `theme.authLanguage` roles for the exact light/dark backdrop, input/device surface, selected surface/border, unselected radio ring, code badge, and disabled opacity. Source the existing palette values where available (`#EEF0FE`, `#4F46E5`, `#2A2D55`, `#3B3F73`, `#C9CDE4`) and add only missing palette entries.

- [ ] **Step 4: Extend `BottomSheet` without changing existing callers**

  Add one optional `presentation` object rather than a global visual change:

  ```ts
  export interface BottomSheetPresentation {
    readonly backdropBlurIntensity?: number;
    readonly backdropStyle?: StyleProp<ViewStyle>;
    readonly contentStyle?: StyleProp<ViewStyle>;
    readonly handleStyle?: StyleProp<ViewStyle>;
    readonly panelStyle?: StyleProp<ViewStyle>;
  }
  ```

  When `backdropBlurIntensity` is present, render an `expo-blur` `BlurView` inside the existing backdrop press target with `pointerEvents="none"`. Merge each optional style after the default tokenized style. Preserve all existing back-handler, gesture, dialog, and reduced-motion behavior. Add an `expo-blur` Jest mock that renders a view and exposes its intensity.

- [ ] **Step 5: Implement the dedicated `AuthLanguagePickerSheet`**

  Keep 3a-only markup and styles out of `settings-screen.tsx`. Use this component boundary:

  ```ts
  export interface AuthLanguagePickerSheetProps {
    readonly locale: MobileLocale;
    readonly onClose: () => void;
    readonly onSelectLocale: (locale: MobileLocale) => void;
    readonly onSetUseDeviceLocale: (enabled: boolean) => void;
    readonly open: boolean;
    readonly usingDeviceLocale: boolean;
  }
  ```

  Render title/subtitle/close control from new parity-checked `mobileCopy` keys. Sort `MOBILE_LOCALE_OPTIONS` by `nativeName`, render ISO-code badges and selected radio checks, and filter both `nativeName` and `turkishName` only when the options length exceeds six. Use a custom `Pressable` switch for exact 44 by 26 geometry, `accessibilityRole="switch"`, and the 20 px white thumb. Get selection feedback from `useMobileHaptics().selection()`; do not import Expo Haptics directly. Clear the 250 ms timeout on unmount and whenever the sheet closes.

- [ ] **Step 6: Cover the generic variant and semantic-role contracts**

  Extend `mobile-kit-overlays.test.tsx` to assert that default `BottomSheet` remains unchanged and an opt-in presentation applies the supplied panel/backdrop styles and blur intensity. Register the new auth style factory in `mobile-redesign-semantic-role-gate.test.tsx` so component colors and measures remain token-backed.

- [ ] **Step 7: Re-run focused 3a and overlay tests**

  Run:

  ```powershell
  corepack pnpm --filter @wizards/mobile exec jest component-tests/auth-language-picker-sheet.test.tsx component-tests/mobile-kit-overlays.test.tsx component-tests/mobile-redesign-semantic-role-gate.test.tsx --runInBand
  ```

  Expected: PASS in both theme variants, with no search for the real two-language catalog and all dismissal routes preserved.

- [ ] **Step 8: Commit the reusable sheet and 3a component**

  ```powershell
  git add apps/mobile/src/design/palette.ts apps/mobile/src/design/tokens.ts apps/mobile/src/design/themes.ts apps/mobile/src/app/components/kit/bottom-sheet.tsx apps/mobile/src/app/screens/auth/auth-language-picker-sheet.tsx apps/mobile/src/app/screens/auth/auth-language-picker-sheet.styles.ts apps/mobile/src/locale/mobile-copy.ts apps/mobile/component-tests/jest.setup.ts apps/mobile/component-tests/auth-language-picker-sheet.test.tsx apps/mobile/component-tests/mobile-kit-overlays.test.tsx apps/mobile/component-tests/mobile-redesign-semantic-role-gate.test.tsx
  git commit -m "feat(mobile): add auth language selection sheet"
  ```

### Task 4: Wire 3a into the signed-out welcome flow and perform visual verification

**Files:**
- Modify: `apps/mobile/src/app/screens/auth/mobile-auth-screen-containers.tsx`
- Modify: `apps/mobile/component-tests/mobile-auth-navigation.test.tsx`
- Modify: `apps/mobile/component-tests/auth-welcome-screen.test.tsx`
- Modify: `apps/mobile/scripts/mobile-design-contract.test.ts`

**Interfaces:**
- Consumes: `AuthLanguagePickerSheet`, `useMobileLocaleRuntime()` with `setUseDeviceLocale`, and the established `AuthWelcomeScreen` callback.
- Produces: a 2a language pill that opens and controls the 3a sheet without modifying routes or authenticated navigation.

- [ ] **Step 1: Extend the welcome-container navigation test**

  Replace the old generic `SettingsLocaleSelector` expectation with the dedicated sheet boundary:

  ```tsx
  await fireEvent.press(view.getByTestId("mobile-auth-language-picker"));
  expect(view.getByTestId("mobile-auth-language-sheet")).toBeTruthy();
  await fireEvent.press(view.getByTestId("mobile-auth-language-sheet-backdrop"));
  expect(view.queryByTestId("mobile-auth-language-sheet")).toBeNull();
  ```

- [ ] **Step 2: Run the welcome-container test to verify failure**

  Run:

  ```powershell
  corepack pnpm --filter @wizards/mobile exec jest component-tests/mobile-auth-navigation.test.tsx --runInBand
  ```

  Expected: FAIL until the container mounts the dedicated 3a component.

- [ ] **Step 3: Replace the generic settings selector in the auth container**

  Wire the sheet with the real runtime state and retain current stack navigation:

  ```tsx
  const { locale, selectLocale, setUseDeviceLocale, usingDeviceLocale } = useMobileLocaleRuntime();

  <AuthLanguagePickerSheet
    locale={locale}
    onClose={() => setLanguagePickerOpen(false)}
    onSelectLocale={selectLocale}
    onSetUseDeviceLocale={setUseDeviceLocale}
    open={languagePickerOpen}
    usingDeviceLocale={usingDeviceLocale}
  />
  ```

  Remove only the auth-flow import and usage of `SettingsLocaleSelector`; leave Settings screen behavior intact. Preserve the 2a language-pill callback and all sign-in/register navigation callbacks.

- [ ] **Step 4: Update source-contract coverage**

  In `mobile-design-contract.test.ts`, assert the auth container references `AuthLanguagePickerSheet` and not `SettingsLocaleSelector`; assert the welcome mark source defines five canonical bars and uses `useReducedMotion`. Keep the existing 2a no-bottom-navigation and gradient-title contract assertions.

- [ ] **Step 5: Re-run targeted tests and typecheck**

  Run:

  ```powershell
  corepack pnpm --filter @wizards/mobile exec jest component-tests/auth-welcome-screen.test.tsx component-tests/auth-language-picker-sheet.test.tsx component-tests/mobile-auth-navigation.test.tsx component-tests/mobile-kit-overlays.test.tsx component-tests/mobile-redesign-semantic-role-gate.test.tsx --runInBand
  corepack pnpm --filter @wizards/mobile exec node --test --import tsx scripts/mobile-locale-preferences.test.ts scripts/mobile-design-contract.test.ts
  corepack pnpm --filter @wizards/mobile typecheck
  ```

  Expected: every command exits 0.

- [ ] **Step 6: Capture the reference-sized Android visual verification**

  Use the existing Android capture tooling on a 390 by 844 emulator, then inspect both light and dark screenshots with the language sheet open. Verify: 2a card unchanged, five moving bars, no bottom navigation, 3a’s 28 px top corners/40 by 5 px handle/36 px close action, no search with TR+EN, safe bottom inset, and no clipped content.

  ```powershell
  corepack pnpm --filter @wizards/mobile visual:capture:android
  ```

- [ ] **Step 7: Refresh codebase knowledge and commit the integration**

  Run:

  ```powershell
  graphify update .
  git add apps/mobile/src/app/screens/auth/mobile-auth-screen-containers.tsx apps/mobile/component-tests/mobile-auth-navigation.test.tsx apps/mobile/component-tests/auth-welcome-screen.test.tsx apps/mobile/scripts/mobile-design-contract.test.ts graphify-out
  git commit -m "feat(mobile): wire welcome language selection"
  ```

## Plan Self-Review

- Spec coverage: Tasks 1–4 cover the preference model, device fallback, 2a logo, 3a dimensions and states, accessibility, dark theme, dismissal, haptics, tests, visual inspection, and graph refresh.
- Placeholder scan: no unresolved scope markers or deferred implementation steps remain.
- Type consistency: `MobileLocalePreference`, `setUseDeviceLocale`, `AuthLanguagePickerSheetProps`, and `BottomSheetPresentation` are introduced before their consumers.
