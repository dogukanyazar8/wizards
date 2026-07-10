# Whispr Mobile Phase 1 Design System and Dark Mode Design

**Status:** Approved on 2026-07-10 with a clean short-path worktree and an in-house BottomSheet.

## Objective

Replace the Whispr Mobile presentation layer with a typed semantic theme system, system/light/dark appearance selection, a production-grade component kit, and theme-aware screen styles. Preserve Phase 0 navigation, data flow, realtime behavior, APIs, test IDs, and in-memory query policy.

## Verified Baseline

- Worktree: `C:\W1P1` on `codex/mobile-phase1-design-system`, based on `uat` commit `dd207124`.
- Phase 0 is committed and the isolated worktree is clean.
- Root `/artifacts/` is ignored by first commit `d25fcc54`; evidence remains untracked.
- `corepack pnpm install --frozen-lockfile` passes without lockfile changes.
- A clean Expo Android prebuild plus the short-path `android:uat:local:apk` flow produces a 107,582,766-byte UAT debug APK.
- Baseline verification passes: typecheck, 279 contract tests, 19 component tests, and quality check with zero blockers.
- The main checkout retains its pre-existing Graphify, `tsbuildinfo`, and root `artifacts/` changes and is outside this branch's mutation scope.
- `src/design/tokens.ts` contains the only current theme and mixes semantic colors with raw palette values.
- `mobileColors` is imported by 26 app/navigation/voice files. Twelve `*.styles.ts` files plus shared/root/navigation styles require migration.
- `App.tsx` owns the fixed `StatusBar style="auto"`; no theme provider exists.
- `@react-native-async-storage/async-storage`, Reanimated 4.3.1, Gesture Handler 2.31.2, and Ionicons are already installed.

## Binding Constraints

- Do not change product behavior, Phase 0 navigation structure, query ownership, realtime ownership, API contracts, or web/desktop code.
- Preserve every existing Maestro test ID. Add `mobile-settings-appearance-control` without renaming existing IDs.
- Theme preference is the only new persisted presentation value. Store it in AsyncStorage under a single namespaced key; never use SecureStore or the query cache.
- Do not add query persistence, an offline cache, an offline mutation queue, or message-content persistence.
- Raw hex and `rgba(...)` color literals may exist only in `src/design/palette.ts` after migration.
- No direct `mobileColors` imports remain after migration.
- Theme objects are frozen, stable references. StyleSheet results are cached by style factory and theme reference, with at most light and dark entries per factory.
- Theme changes update context values without remounting the application tree.
- Hot FlashList rows keep stable props and memoization; no render-time inline object allocation is introduced in `renderItem` paths.
- All animations use Reanimated and respect reduced motion. Do not introduce React Native's JS-thread `Animated` API.
- Keep Outfit and text scaling. Bound heading scaling with `maxFontSizeMultiplier` rather than disabling scaling.
- No Expo SDK, React Native, React, Reanimated, or architecture upgrade.
- Each implementation batch ends with typecheck, contract tests, and component tests before its commit.
- Final verification additionally includes quality check, `npx expo install --check`, `pnpm audit`, Graphify update, Android Maestro, and light/dark screenshots under ignored root `artifacts/`.

## Workspace and Merge Strategy

All Phase 1 edits and commits live in `C:\W1P1`. The main checkout at `C:\Users\doguk\Desktop\Wizards` is read-only for this phase.

At completion:

1. Confirm the Phase 1 branch is clean and based on the intended `uat` ancestor.
2. Fetch and inspect any new `uat` commits without modifying the main checkout's worktree.
3. Rebase or merge `uat` into the Phase 1 branch only after a clean conflict review.
4. Re-run the complete final verification on the integrated Phase 1 branch.
5. Present the exact merge command and risk summary. Do not merge into `uat`, push, or open a PR without explicit user approval.

## Theme Architecture

### Palette

`src/design/palette.ts` is the only raw-color authority. It exports frozen brand, neutral-cool, and status scales plus transparent/overlay values. Names describe scale and color identity, not UI usage.

The light and dark themes consume palette values through semantic roles. Dark mode is independently designed from the neutral-cool scale: it does not invert light colors. Dark elevation is expressed primarily through progressively lighter surfaces and subtle borders rather than stronger shadows. The dark accent is lighter than the light accent to preserve accessible contrast.

### Semantic Themes

`src/design/themes.ts` exports:

- `MobileThemeMode = "system" | "light" | "dark"`
- `MobileResolvedTheme = "light" | "dark"`
- `MobileTheme`
- `lightTheme`
- `darkTheme`

`MobileTheme` contains:

- `id`
- `dark`
- `surface.{base,card,elevated,overlay,rail,soft}`
- `text.{primary,secondary,muted,soft,inverse,onPrimary}`
- `border.{default,subtle,focus}`
- `accent.{default,strong,soft}`
- `status.{success,warning,danger,dangerSoft,info}`
- `interactive.{pressed,disabled}`
- `radii`, `spacing`, `sizing`, `typography`, `elevation`, and `gradients`
- `systemBars.{statusBar,androidNavigationBar}`

Both themes have identical recursively checked key sets. `scripts/mobile-theme-contract.test.ts` computes WCAG relative luminance and contrast ratios for every required pair. TypeScript's `satisfies MobileTheme` and the runtime key-parity test prevent partial themes.

### Theme Runtime

`src/design/mobile-theme-runtime.ts` owns the pure preference normalization, storage key, system-resolution function, and cache-aware style factory types.

`src/app/providers/mobile-theme-provider.tsx` owns:

- immediate system-scheme resolution through `useColorScheme()`;
- fail-closed AsyncStorage hydration to `system`;
- stable `setMode` persistence with failed writes contained and not logged with user data;
- a theme-value context containing only the stable theme reference;
- a preference context containing mode and a stable setter;
- `useTheme()`, `useThemePreference()`, and `useThemedStyles(factory)`.

`useThemedStyles` uses a module-level `WeakMap<factory, WeakMap<theme, StyleSheetResult>>`. Factories must be module-level stable functions. Re-renders reuse registered styles; only the first render for light and dark creates entries.

The provider mounts immediately inside `MobileQueryProvider` and wraps every other mobile provider. Theme hydration does not remount children. The initial system theme paints the root immediately; a persisted manual preference may switch the semantic theme after hydration without exposing an unthemed white/black frame.

### System Surfaces

`MobileThemeSystemSurfaces` consumes the theme and owns:

- Expo StatusBar style/background derived from the theme;
- Android navigation bar background/button style through an Expo-managed module;
- the app-root background color through `expo-system-ui` where supported;
- silent platform/API failure containment.

SDK-managed versions of `expo-navigation-bar` and `expo-system-ui` are installed with Expo CLI. Their versions must pass `npx expo install --check`.

## Appearance Settings

The settings Appearance section receives a `SettingsAppearanceSelector` with `system`, `light`, and `dark` radio options. It uses `mobile-settings-appearance-control`, localized labels, selected accessibility state, and the theme preference hook. Selection persists immediately and does not involve product state or query invalidation.

## Component Kit

`src/app/components/kit/` contains focused modules and a public `index.ts`:

- `Icon`: typed Ionicons wrapper with semantic tone and bounded sizes.
- `Button`: primary, secondary, ghost, and danger variants with loading/disabled semantics.
- `IconButton`: icon-only button with a mandatory accessibility label and minimum 44-point target.
- `Card`, `ListRow`, `Badge`, `Avatar`, `Divider`, and `EmptyState`: semantic layout primitives.
- `Skeleton`: Reanimated shimmer; static shape when reduced motion is enabled.
- `Toast`: queue/provider with accessible live-region announcements and bounded dismissal timers.
- `BottomSheet`: in-house Reanimated/Gesture Handler overlay with fixed snap points, backdrop dismissal, pan-down close, Android back close, and reduced-motion behavior.
- `ContextMenu`: accessible long-press menu built on the overlay foundation with `accessibilityRole="menu"`; no haptics.

The official `@gorhom/bottom-sheet` v5 documentation still states Reanimated 1-3 compatibility while this app uses Reanimated 4.3.1. Phase 1 therefore does not add that unsupported native dependency. The in-house sheet intentionally implements only the approved Phase 1 contract.

Core kit tests render each component through both `lightTheme` and `darkTheme`, assert accessibility props, and exercise state transitions. `ui-atoms.tsx` consumers migrate incrementally to the kit; compatible exported wrappers may remain to avoid unrelated screen API churn.

## Style Migration

Each style module exports a stable factory:

```ts
export const createExampleStyles = (theme: MobileTheme) => ({
  root: {
    backgroundColor: theme.surface.base,
    padding: theme.spacing.page,
  },
});
```

Each consuming component calls `useThemedStyles(createExampleStyles)` once at component scope. Direct color imports and raw literals are removed. Migration order is:

1. Kit and shared primitives.
2. App shell, navigation, root/error surfaces, and voice panel.
3. Auth and settings.
4. Home and notifications.
5. DM and channel.
6. Voice.
7. Composer, overlays, media primitives, and message primitives.

The tab bar preserves existing test IDs, roles, icon/badge behavior, and Reanimated animation. Theme colors replace static values; spring behavior remains disabled under reduced motion.

## Locale and Pseudo-Icon Cleanup

`formatMobileDateSeparator` receives the active `MobileLocale`, maps it to a bounded Intl locale, and is covered for Turkish and English. It no longer defaults to `tr-TR` inside the formatter.

Text glyphs used as controls or file icons, including `FILE` and `x`, are replaced with the typed `Icon` wrapper while preserving action labels, touch targets, and test IDs.

## Predictive Back Pre-Task

The first functional batch sets `android.predictiveBackGestureEnabled` to `true`, updates its source contract, rebuilds Android, installs the UAT debug APK, and runs `.maestro/phase0-navigation.yml`.

Pass criteria cover channel and DM stack pop plus channel, DM, invite, and settings deep-link behavior. If a regression occurs, revert only the flag/test expectation to `false`, record the evidence, and continue Phase 1 without a fragment factory, config plugin, or native activity patch.

## Quality Gates

The design contract recursively scans `src/app`, `src/navigation`, and in-scope `src/voice` presentation files. It fails on:

- raw six-digit hex or `rgba(` outside `src/design/palette.ts`;
- a `mobileColors` import or member access;
- new kit interactive components without explicit accessibility roles/labels;
- JS-thread `Animated` imports;
- missing theme-readiness quality items.

The mobile quality gate adds appearance/theme manual checks and a dark-mode Maestro automated gate. The test ID contract verifies both existing Phase 0 IDs and the new appearance control.

## Performance and Security

- Style factory results are cache-stable per theme.
- Theme context changes do not recreate query/auth/navigation providers.
- FlashList rows remain memoized with stable render callbacks; a render-counter component test proves unrelated parent renders do not rerender unchanged rows.
- Toast timers, BottomSheet back handlers, gesture callbacks, and theme async hydration all clean up on unmount.
- Preference values are normalized before use and persisted as only `system`, `light`, or `dark`.
- No user content, path, session value, or theme storage error payload is logged.
- SecureStore and query cache remain untouched by theme persistence.

## Verification and Evidence

Every implementation batch runs:

```powershell
corepack pnpm --filter @wizards/mobile typecheck
corepack pnpm --filter @wizards/mobile test
corepack pnpm --filter @wizards/mobile test:components
```

Final verification runs those commands plus:

```powershell
corepack pnpm --filter @wizards/mobile quality:check
corepack pnpm --filter @wizards/mobile exec expo install --check
corepack pnpm audit
graphify update .
```

Android device evidence uses the short-path build flow and a booted emulator. `.maestro/phase1-dark-mode.yml` selects dark mode, traverses all five tabs, returns to light/system mode, and captures screenshots. Root `artifacts/mobile/phase1/` stores light/dark screenshots, build/test output, and Maestro reports without committing them.

## Migration Note

Create `apps/mobile/MIGRATION_PHASE_1.md` with:

- palette/theme/runtime architecture;
- style-cache behavior;
- appearance persistence and system-bar behavior;
- kit inventory and accessibility contracts;
- in-house BottomSheet decision and official compatibility rationale;
- predictive-back result;
- raw-color/mobileColors contract results;
- no SecureStore/query/offline persistence statement;
- future server-sync connection point for theme preference;
- Phase 2 handoff for ContextMenu/message actions;
- final command and device evidence paths.

## Definition of Done

- Light and dark semantic themes pass key-parity and required contrast tests.
- System/light/dark selection persists through AsyncStorage and drives root/system surfaces without app-tree remount.
- All approved kit components are theme-aware, accessible, reduced-motion-safe where animated, and tested in both themes.
- All app/navigation/voice presentation styles use the themed-style pattern; raw colors and `mobileColors` are contract-blocked.
- Pseudo-icons are removed and date separators follow the active locale.
- Existing Maestro IDs remain stable; the new appearance ID is present.
- Predictive back is re-enabled only if the Phase 0 navigation Maestro flow passes.
- Dark-mode Maestro and light/dark screenshot evidence pass on Android.
- Typecheck, contract tests, component tests, quality check, Expo install check, and audit are green.
- `MIGRATION_PHASE_1.md` is complete and Graphify is updated in the feature branch only.
- Integration with current `uat` is planned, reverified, and executed only after explicit approval.
