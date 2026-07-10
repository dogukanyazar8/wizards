# Whispr Mobile Phase 1 Migration

## Scope and architecture

Phase 1 adds an independently designed light/dark semantic theme, a runtime appearance preference, a reusable native component kit, and permanent presentation-quality contracts. Product navigation, API/query ownership, realtime ownership, route types, and web/desktop behavior remain unchanged.

- `src/design/palette.ts` is the only raw hex/rgba authority.
- `src/design/themes.ts` exposes recursively frozen `lightTheme` and `darkTheme` objects with identical semantic keys.
- Semantic roles cover accent, border, elevation, gradients, interaction, media, status, surfaces, system bars, text, typography, radii, sizing, and spacing.
- Dark elevation uses layered surfaces and zero-opacity shadows rather than inverted light-theme shadows.
- `src/design/tokens.ts` now contains layout/typography foundations only. It no longer exports legacy colors, color-derived elevation, or gradients.
- Presentation contracts recursively reject raw colors, `mobileColors`, React Native JS-thread `Animated`, and pseudo-icons.

## Runtime and style cache

`MobileThemeProvider` is mounted immediately inside `MobileQueryProvider` and outside the themed error boundary and remaining product providers. It resolves the system scheme immediately, hydrates the preference fail-closed, and updates contexts without remounting the application tree. The inner crash fallback consumes the same semantic theme context, so a persisted manual selection remains active during render recovery. A bootstrap-safe outer boundary protects query/theme bootstrap before context exists and renders from the system semantic theme; system-bar synchronization remains inside both recovery boundaries.

`useThemedStyles(factory)` uses a module-level two-level `WeakMap`: stable module-scope factory reference -> stable frozen theme reference -> registered style result. A factory produces at most one light and one dark result during normal runtime. Component and render-counter tests prove same-theme style reuse, no application-tree remount on theme change, and no unchanged hot-message-row rerender after unrelated parent state changes.

## Appearance persistence and system surfaces

- Preference values are normalized to `system`, `light`, or `dark`.
- The only new persisted presentation value is AsyncStorage key `whispr.mobile.theme-preference`.
- Explicit user selection wins a late hydration race; failed reads/writes are contained without logging payloads.
- `expo-navigation-bar@~56.0.3` and `expo-system-ui@~56.0.5` synchronize Android navigation color and root system background.
- Expo `StatusBar` follows the semantic system-bar mode.
- Settings exposes an accessible radio group with testID `mobile-settings-appearance-control`.
- The settings surface owns a bounded `ScrollView`, so appearance controls remain reachable on compact devices and while signed out.

## Component kit

`src/app/components/kit/` now provides:

- Core: `Icon`, `Button`, `IconButton`, `Card`, `ListRow`, `Badge`, `Avatar`, `Divider`, `EmptyState`.
- Feedback: `Skeleton` and the bounded accessible `ToastProvider` queue.
- Overlays: in-house `BottomSheet` and accessible `ContextMenu` foundations.

Interactive components expose explicit roles, labels, disabled/busy/selected state, and minimum native touch targets. Toasts use live-region announcements. BottomSheet uses `Modal`, Gesture Handler, UI-thread Reanimated transforms, backdrop dismissal, pan-down close, Android back close, cleanup on unmount, and a reduced-motion path. No haptics were added.

The in-house BottomSheet is intentional. The reviewed official `@gorhom/bottom-sheet` v5 compatibility statement covered Reanimated 1-3 while this app uses Reanimated 4.3.1. Phase 1 therefore avoids adding an unsupported native dependency and implements only the approved bounded interaction contract.

## Predictive back and native boundary

- Generated Android configuration sets `android:enableOnBackInvokedCallback="true"`.
- The packaged merged manifest confirms the enabled value.
- Existing `MainActivity` already calls `super.onCreate(null)`.
- No Fragment factory patch, config-plugin patch, or handwritten native source patch was added.
- Focused Android Maestro evidence covers channel push/back, DM push/back, channel deep link, DM deep link, invite deep link, and settings deep link.

Faz 0 sonrası yeniden aç ve doğrula: predictive back artık yeniden açıktır; Android/React Navigation upgrades after Phase 0 must rerun hardware-back and deep-link device verification before promotion.

## Locale and performance

- Date separators read the active mobile locale and use stable `tr-TR` / `en-US` Intl mappings.
- Invalid timestamps fail closed.
- Attachment and clear pseudo-glyphs were replaced with typed Ionicons.
- FlashList and Expo Image memory/disk caching remain intact.
- Memoized message rows retain stable props and do not rerender for unrelated parent state.
- Animations remain on Reanimated and honor reduced-motion settings.

## Persistence and security boundary

Theme preference persistence does not use SecureStore, TanStack Query, or product stores. Phase 1 adds no query persistence, offline cache, offline mutation queue, message-content persistence, user-content logging, or credential logging. Secure session handling and in-memory query/cache policies remain unchanged.

A future authenticated server preference can connect at the `setMode` repository boundary. It should preserve the normalized local fallback and must not turn theme preference into query-cache persistence.

## Phase 2 handoff

The accessible ContextMenu/overlay foundation is ready for Phase 2 product actions. Phase 2 may add anchored positioning, richer action groups, and a separately approved haptics policy; it should retain semantic tokens, menu/menuitem roles, Android back cleanup, reduced motion, and the current overlay ownership boundary.

## Verification evidence

Final package and static gates:

| Gate                                                             | Result                                |
| ---------------------------------------------------------------- | ------------------------------------- |
| `pnpm --filter @wizards/mobile typecheck`                        | PASS                                  |
| `pnpm --filter @wizards/mobile test`                             | PASS - 290/290                        |
| `pnpm --filter @wizards/mobile test:components --runInBand`      | PASS - 51/51                          |
| `pnpm --filter @wizards/mobile quality:check`                    | PASS - 0 blockers                     |
| `pnpm --filter @wizards/mobile exec expo install --check`        | PASS - Dependencies are up to date    |
| `pnpm audit`                                                     | PASS - No known vulnerabilities found |
| Raw color / `mobileColors` / JS Animated / pseudo-icon contracts | PASS                                  |

Android build evidence:

- APK: `C:\Wizards\artifacts\mobile\uat\Whispr-Mobile-UAT-debug-latest.apk`
- Size: 107,599,658 bytes
- SHA-256: `3FEEF3046AFD659F29211A5FED5ECAB087C93860CC7BBE43B344518606DE9797`
- Version: `0.8.15` (`versionCode=1`), x86_64 debug
- Evidence metadata: `artifacts/mobile/phase1/android-build/evidence.json`

Maestro evidence:

- The initial Phase 1 theme run reached settings and produced `artifacts/mobile/phase1/maestro/dark-mode/report.xml`, but review showed that it did not prove protected product destinations. Its screenshots are retained only as shell/settings visual evidence and are not a promotion gate.
- The hardened flow now requires a checked theme radio, verifies persistence after navigation, and asserts unique overview, DM, notifications, voice, and settings screen IDs. Its final rerun correctly failed at the protected overview while the device was signed out: `artifacts/mobile/phase1/maestro/dark-mode-final/report.xml`.
- Focused predictive-back/deep-link flow: PASS, `artifacts/mobile/phase1/predictive-back/focused-maestro-final/report.xml`.
- The final full Phase 0 flow rerun reached the authenticated-data gate but UAT mobile login rejected the supplied account state. Its failed report is retained at `artifacts/mobile/phase1/maestro/navigation/report.xml`; no credential is stored in committed source or evidence metadata. Re-run this full suite after UAT account access is restored.

## UAT integration plan

No merge into `uat` is executed by this phase task. The main checkout's pre-existing Graphify, `tsbuildinfo`, and root artifact changes remain untouched.

Before integration:

1. Restore/confirm the UAT mobile test account and rerun `.maestro/phase0-navigation.yml` plus `.maestro/phase1-dark-mode.yml` on the final branch.
2. Confirm the feature worktree is clean and all final gates above remain green.
3. Update the feature branch from current `uat`, resolve only Phase 1-owned conflicts, and rerun typecheck, contract, component, quality, Expo install check, and both Maestro suites.
4. Merge `codex/mobile-phase1-design-system` into `uat` with a non-fast-forward integration commit or an equivalent reviewed PR.
5. Perform a post-merge Android UAT smoke on system/light/dark, hardware back, channel, DM, invite, and settings deep links before promotion.
