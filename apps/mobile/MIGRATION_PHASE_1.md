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

- `mobile-theme-compat.ts` is a bounded transition layer. Phase 2 must remove compatible legacy accesses from every file it touches instead of extending the layer.
- Maestro UAT authentication now reads ignored local `.env.maestro` values through `.maestro/helpers/login-uat.yml`. The helper performs exactly one login attempt and never retries a rejected credential.

## Verification evidence

Final package and static gates:

| Gate                                                             | Result                                |
| ---------------------------------------------------------------- | ------------------------------------- |
| `pnpm --filter @wizards/mobile typecheck`                        | PASS                                  |
| `pnpm --filter @wizards/mobile test`                             | PASS - 291/291                        |
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

- Authenticated Phase 0 navigation: PASS, `artifacts/mobile/phase1/closure/phase0-navigation.xml` (1 test, 0 failures, 50 seconds). The flow covers channel and DM push/back plus channel, DM, invite, and settings deep links.
- Phase 1 light/dark mode: PASS, `artifacts/mobile/phase1/closure/phase1-dark-mode.xml` (1 test, 0 failures, 57 seconds). The flow proves dark-mode persistence across all primary tabs and restoration to light mode.
- Focused predictive-back/deep-link flow: PASS, `artifacts/mobile/phase1/predictive-back/focused-maestro-final/report.xml` (1 test, 0 failures, 16 seconds).
- Dark overview: `artifacts/mobile/phase1/closure/dark-overview.png`, SHA-256 `4B3A830DA908F04606FE910B54276238194035175B11D37470060697153DCEB8`.
- Dark settings: `artifacts/mobile/phase1/closure/dark-settings.png`, SHA-256 `E9241BD0960C5D5DAD42202D50E066AA506BAA5AAB3B358F9CEE8454FB0B236A`.
- Light settings: `artifacts/mobile/phase1/closure/light-settings.png`, SHA-256 `C23BC3C1188CC8612F6E14EC49C1A56591BAAA1B049947A8A3004B021889A21A`.
- Credentials are read only from ignored `.env.maestro`; reports, screenshots, committed flows, and Git history contain no credential values.

The Codex execution sandbox blocked direct emulator outbound TCP during closure. The device therefore reached the real UAT upstream through an ignored localhost-only HTTP relay bound to `127.0.0.1` and exposed with `adb reverse`; login, bootstrap, server, channel-message, and DM-message UAT requests returned HTTP 200. No relay, API override, application change, native change, or credential was committed.

## UAT integration closure

- `codex/mobile-phase1-design-system` was merged from the unchanged `origin/uat` base with non-fast-forward merge commit `8cc8899e`.
- The isolated `C:\W1P1` worktree was used for merge and verification. The main checkout's pre-existing Graphify, `tsbuildinfo`, lockfile, and root artifact changes were not modified.
- Final promotion requires the verification table above to remain green and the resulting closure commit to match remote `refs/heads/uat`.
