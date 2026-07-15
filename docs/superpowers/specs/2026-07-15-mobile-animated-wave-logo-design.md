# Mobile Animated Whispr Wave Logo Design

**Date:** 2026-07-15  
**Status:** Approved interaction direction; awaiting written-spec review

## Goal

Make the signed-out mobile `2a Karşılama` screen use the canonical animated
Whispr wave logo already established by the web and desktop experiences. The
welcome layout, its 56 px gradient brand card, and the surrounding content must
remain visually unchanged.

## Source of Truth

The canonical brand implementation is
`apps/web/src/components/brand/brand-logo.tsx` with the corresponding
`auth-equalizer` animation in `apps/web/src/app/globals.css`:

- Five bars with relative heights `[17, 25, 34, 24, 18]`.
- Rounded white bars, sequenced left-to-right with 130 ms phase offsets.
- A 2.1-second repeating equalizer rhythm.

The mobile mark preserves those proportions in its 24 by 24 SVG canvas as
`[8.5, 12.5, 17, 12, 9]`, centered vertically. This is the same five-bar
silhouette scaled to the welcome-card asset size.

## Scope

- Replace the four static rectangles in
  `apps/mobile/src/app/screens/auth/auth-welcome-brand-mark.tsx` with the
  five-bar canonical mark.
- Animate each native bar on the UI thread using the existing Reanimated
  patterns: a 2.1-second repeating height/vertical-scale wave with 130 ms
  left-to-right phase offsets.
- When the operating-system reduced-motion preference is enabled, render the
  same five bars at their static canonical heights and start no repeating
  animation.
- Preserve the existing welcome-card dimensions, gradient, white bar colour,
  safe-area behavior, and signed-out root-auth navigation.

## Explicit Exclusions

- No new image, bitmap, or SVG asset file.
- No change to authentication behavior, navigation, text, localization,
  controls, spacing, or any authenticated screen.
- No attempt to animate the web or desktop implementation as part of this
  mobile-only change.

## Verification

- Update the welcome component test to assert the five bars and their exact
  canonical order/proportions.
- Add coverage that proves reduced-motion renders a static mark without
  scheduling the animation loop.
- Run the focused welcome tests and the mobile typecheck.
- Visually inspect the Android welcome screen at rest and while animating to
  confirm that the 56 px card and all neighboring layout remain unchanged.
- Refresh the repository knowledge graph after the implementation changes.

## Acceptance Criteria

1. A signed-out user first sees `2a Karşılama` with the canonical five-bar
   Whispr logo, not the previous four-bar mark.
2. With motion enabled, the logo visibly follows the web/desktop equalizer
   rhythm without moving or resizing the brand card or adjacent content.
3. With reduced motion enabled, the logo is a stable five-bar mark.
4. The change introduces no content overflow or navigation bar on the
   signed-out welcome screen.
