# Mobile Auth Welcome Root Design

## Goal

When Whispr Mobile has no authenticated session, its first visible application screen is the canonical `#2a` welcome screen from `design_handoff_whispr_mobile/Whispr Mobile Redesign.dc.html`. The screen must be rendered without the floating bottom navigation or any application tab content.

## Decision

The top-level mobile navigator will branch on the real session status before creating the tab navigator:

- `checking` renders the existing session-checking surface only, preventing a welcome-screen flash while secure storage is read.
- `signed-out` and auth errors render `MobileAuthNavigator`, whose initial route is `Welcome` (2a).
- `signed-in` renders the existing root stack and its four tab screens.

This deliberately makes signed-out deep links to tab or settings routes land in the welcome flow. Keeping tabs mounted and merely hiding their chrome was rejected because it violates the navigation-free requirement and retains stale tab state behind the auth flow.

## Welcome-screen contract

`AuthWelcomeScreen` remains presentation-only and uses the existing real theme preference, locale runtime, auth stack navigation callbacks, tokenized typography, and vendored Plus Jakarta Sans fonts.

- Match the canonical 390x844 layout: layered auth background, right-aligned theme and locale pills, vertically centered hero, five static product-feature chips, two 56pt CTAs, and the copyright footer.
- Respect safe-area insets and smaller viewports without clipping. The mock phone frame and simulated status bar are reference decoration, not app content.
- Render the second hero line with the canonical `#7C6CF6` to `#4F9CF6` gradient rather than the current single-color approximation.
- Preserve the existing rule that the green "all systems active" claim is absent until a real status endpoint exists; only the copyright is rendered today.
- The theme pill persists its choice through the established preference provider, and the locale pill opens the existing locale selector. No dummy data or duplicate preference state is introduced.

## Tests and verification

Start with a focused navigator test that fails under the current behavior: signed-out startup renders 2a and no bottom-tab or floating-navigation test ID; checking renders only the checking surface; signed-in retains the four-tab application. Component tests will retain the 2a interaction and token assertions, and will add the gradient-title contract.

After the tests are green, run the mobile component suite and typecheck. The 390x844 visual check compares the implemented 2a hierarchy, geometry, colors, and assets with the canonical HTML and `screenshots/2a-karsilama.png`; the runtime screenshot must contain no bottom navigation and no clipped content.

## Scope boundaries

This change does not alter authentication APIs, session storage, login/register forms, tab count, system-status data, or introduce an external image or font dependency. It changes only unauthenticated entry routing and the 2a welcome screen's remaining visual fidelity gap.
