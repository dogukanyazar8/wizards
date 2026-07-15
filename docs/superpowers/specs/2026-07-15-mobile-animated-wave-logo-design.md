# Mobile Welcome Animated Logo and Language Sheet Design

**Date:** 2026-07-15  
**Status:** Approved interaction design; awaiting written-spec review

## Goal

Deliver the two visuals a signed-out user reaches from the `2a Karşılama`
screen without changing the existing welcome layout or its root-auth routing:

1. Replace the four-bar welcome mark with Whispr's canonical animated
   five-bar wave logo.
2. Open the `3a Dil Seçimi` design as a faithful modal bottom sheet when the
   upper-right language pill is tapped.

The source of visual truth is
`design_handoff_whispr_mobile/Whispr Mobile Redesign.dc.html` for 2a and the
attached mobile auth-flow instruction for the 3a sheet.

## Canonical Animated Brand Mark

The web/desktop source of truth is
`apps/web/src/components/brand/brand-logo.tsx` plus its `auth-equalizer`
animation in `apps/web/src/app/globals.css`.

- It has five rounded white bars with relative heights `[17, 25, 34, 24, 18]`.
- Each bar enters the 2.1-second repeating equalizer rhythm 130 ms after the
  preceding bar.
- The 24 by 24 mobile SVG canvas uses the exact scaled silhouette
  `[8.5, 12.5, 17, 12, 9]`, vertically centered inside the existing 56 px
  gradient brand card.
- Reanimated owns the native UI-thread animation. With the OS
  reduced-motion preference enabled, the same five bars render statically and
  no repeating animation is scheduled.

The welcome card's 56 px size, gradient, shadow, bar colour, typography,
safe-area behavior, controls, and content positions are out of scope for
change.

## Language Preference Model

The list derives exclusively from the real `MOBILE_LOCALE_OPTIONS` i18n
configuration. The current application has complete Turkish and English
catalogs only, so the sheet will show exactly those two languages; it will not
invent the five illustrative languages from the handoff.

Locale configuration gains genuine presentation metadata for each supported
catalog: ISO 639-1 code, native name, Turkish name, and writing direction.
Rows always sort alphabetically by native name. With two configured languages,
the search field is hidden, as required for lists of six or fewer entries.

The persisted preference becomes either a manual supported locale or
`device`. Existing stored `tr` and `en` values remain valid manual
preferences, so no user setting is lost. A small platform-locale adapter,
backed by the Expo SDK-compatible localization module, resolves the device
language to a configured catalog and safely falls back to Turkish. When device
mode is selected, foregrounding the app refreshes that resolution. The current
catalogs are both LTR; metadata preserves a clear direction boundary for a
future genuine RTL catalog without adding fabricated RTL content today.

## 3a Bottom-Sheet UI and Behavior

`AuthLanguagePickerSheet` is a dedicated auth component hosted by
`MobileAuthWelcomeScreenContainer`. It reuses the existing accessible,
swipe-to-dismiss `BottomSheet` mechanics while adding an auth-language
presentation variant; generic application sheets retain their current design.

- The 2a screen stays visible beneath a `rgba(20,22,42,.38)` backdrop with a
  light 2 px blur in light theme; dark theme uses `rgba(0,0,0,.5)`.
- The panel has a white (or dark-theme `#1C1F3A`) surface, 28 px top corners,
  40 by 5 px centered handle, and a bottom-safe-area-aware layout. Its content
  area scrolls independently, preventing overflow on small viewports or with
  a future longer locale list.
- The header exactly contains the title, subtitle, and 36 px close target.
  The search field follows the six-language visibility rule.
- Language rows use an ISO-code badge rather than flag emoji, native and
  Turkish names, radio semantics, and the specified selected/unselected light
  and dark theme tokens.
- The footer contains the 44 by 26 device-language switch. Device mode dims
  and disables manual rows; turning it off restores the persisted manual
  locale selection.
- Tapping a manual language immediately persists and applies it, emits the
  existing native selection haptic, then closes the sheet after 250 ms.
  Backdrop tap, close action, Android back, accessibility escape, and
  downward drag close without changing the active preference.

The implementation may add Expo SDK-matched localization and blur modules
only if the installed Expo runtime does not already provide the required native
APIs. No external image asset, fake locale, auth API change, or authenticated
screen change is included.

## Accessibility and Failure Behavior

- The sheet is an accessible modal dialog with a labelled backdrop, close
  action, radiogroup rows, checked state, and accessible device-mode switch.
- Motion-reduction disables only the decorative logo loop and existing sheet
  transitions; selection and persistence still occur.
- A failed preference write does not expose an error or secret and does not
  corrupt the in-memory locale. The in-memory choice remains applied for the
  running session, matching the current provider's resilient behavior.

## Verification

- Replace the four-bar welcome assertions with exact five-bar geometry and
  reduced-motion loop coverage.
- Add component coverage for opening/closing 3a, light/dark tokens, no search
  with the two real locales, radio selection, device-mode disabling, haptic
  call, delayed close, persistence compatibility, and backdrop dismissal.
- Add unit coverage for legacy locale preference migration and device-locale
  fallback.
- Run focused component and locale tests, mobile typecheck, and a 390 by 844
  Android visual inspection in both themes. Verify no clipped sheet content,
  no navigation bar, and unchanged 2a geometry behind the sheet.
- Run `graphify update .` after implementation changes.

## Acceptance Criteria

1. Signed-out startup still opens the navigation-free 2a screen, now with the
   canonical animated five-bar Whispr mark.
2. Reduced-motion users see the same five-bar silhouette without animation.
3. The language pill opens the 3a modal sheet with the specified light/dark
   dimensions, tokens, layout, dismissal routes, and safe-area handling.
4. Only real configured languages appear; the current two-language list hides
   search and switches locale without restart.
5. Device-language mode follows a supported OS locale when the app returns to
   foreground and falls back safely when unsupported.
