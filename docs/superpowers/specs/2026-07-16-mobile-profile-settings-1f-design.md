# Mobile Profile & Settings 1F Design

## Goal

Bring the authenticated mobile Profile tab into high-fidelity alignment with the
canonical `#1f` handoff while preserving the existing mobile navigation,
authentication, theme, locale, and settings-detail architecture. All profile,
presence, session, theme, locale, and release data must come from existing
production sources; the surface must never render invented account data.

## Scope

This work changes the Profile hub rendered by
`apps/mobile/src/app/screens/settings-screen.tsx` and its focused support
code/tests. It does not introduce a second profile route, change the server
API contract, alter the four-tab navigation model, or redesign the settings
detail routes.

## User Experience

The Profile tab has a 26px title, a banner identity card, two grouped settings
cards, and enough bottom padding to clear the floating tab bar. The identity
card shows the authenticated bootstrap user's avatar (using the existing
deterministic avatar fallback), display name, username, and actual presence
status. It offers profile edit and a status selector.

The selector offers Online, Idle, Do not disturb, and Invisible using the
existing mobile presence endpoint. A selection is optimistically reflected in
the Profile card. If the mutation fails, the prior status is restored and a
safe localized error is shown; raw server errors and credentials are never
rendered. Successful changes continue to refresh the existing bootstrap and
friends caches so realtime and future renders converge on the server value.

When the authenticated bootstrap profile is loading, the hub renders a
profile-shaped skeleton and no fallback account identity. When it fails, the
hub renders an error/retry state and no fallback account identity. The ready
state alone renders the identity card and setting cards.

## Data and Behavior Boundaries

`MobileProfileSettingsHub` receives real screen state and callbacks through
the existing product-screen provider rather than creating mock state. The
bootstrap payload provides the profile identity, current presence status, and
application version/release channel. The existing theme provider supplies the
persisted appearance mode; the existing locale provider supplies the selected
locale; the existing session diagnostics supply the non-sensitive secure-session
indicator.

The Profile rows retain their existing destination routes: account, security,
appearance, notifications, language, and about. The Appearance detail continues
to own theme and workspace-layout preference controls. Sign out first opens the
shared `DestructiveConfirmationSheet`; only its explicit confirm action calls
the existing sign-out callback.

## Visual System

The hub styles derive exclusively from the existing light/dark theme tokens.
The light layout follows `#1f`: base surface, 24px title inset, 24px card
radii, 72px brand banner, 76px squircle avatar with a 4px surface ring, 38px
row icon containers, 11px vertical row padding, and separate 12px-spaced
settings groups. Pressable controls have a minimum 44px target and accessible
labels. The final content leaves approximately 100px above the floating tab
bar. Dark mode uses the token counterparts and keeps readable text, icon, and
border contrast.

## Security and Reliability

- Presence uses only the authenticated existing API client and validated status
  enum. No credentials, token values, or raw mutation errors enter the UI.
- The secure-session row exposes only an aggregate active/action-required
  result derived from existing diagnostics.
- Sign-out remains confirmation-gated and protects against repeated confirms
  through the shared sheet's existing pending guard.
- Loading and error states contain no fabricated display name, username,
  avatar, presence, session, theme, locale, or version values.

## Verification

Tests will be written first for ready, loading, and error profile states;
real-value rendering; presence mutation success and rollback; detail-route
navigation; persisted appearance selection; locale and version sources; secure
session status; and sign-out confirmation. A source-level contract test will
guard the 1F test ID, token-based visual geometry, absence of dummy account
fallbacks, and confirmation boundary.

After implementation, run the mobile test suite, component suite, typecheck,
quality gate, and `graphify update .`. Build the local Android UAT target,
capture the signed-in 1F light reference, run the 1F visual gate, inspect any
overlay/report before fixing differences, and manually verify persisted dark
mode on the emulator without entering credentials or bypassing authentication.
