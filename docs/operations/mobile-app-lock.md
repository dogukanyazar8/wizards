# Mobile Biometric App Lock (MB-08)

Last reviewed: 2026-07-10

## Decision and compatibility evidence

Whispr uses `expo-local-authentication@~56.0.4` for the opt-in biometric app
lock (Face ID / Touch ID / fingerprint), reusing the MB-07 injectable security
pattern.

- The published `expo-local-authentication@56.0.4` package is the SDK-aligned
  version on the SDK 56 line, matching `expo-device@~56.0.4` and
  `expo-secure-store@~56.0.4`. (Confirmed against the npm registry; `56.0.4`
  exists on the `56.0.x` line, with `57.0.0` as `latest`.)
- API surface used, confirmed from Expo documentation:
  - `hasHardwareAsync(): Promise<boolean>` — biometric sensor present.
  - `isEnrolledAsync(): Promise<boolean>` — at least one biometric enrolled.
  - `authenticateAsync(options): Promise<{ success: true } | { success: false; error; warning? }>`.
    Options used: `promptMessage`, `cancelLabel`, `disableDeviceFallback`
    (kept `false`), and `fallbackLabel` (iOS, forwarded only when non-empty).
- Expo documents that every Expo SDK package supports React Native's New
  Architecture as of SDK 53. Whispr is on Expo SDK 56 and React Native 0.85, so
  no New Arch opt-in or config-plugin entry is required. `expo-local-authentication`
  is an autolinked Expo Module and needs no `app.config.js` plugin entry.

Primary sources:

- https://docs.expo.dev/versions/latest/sdk/local-authentication/
- https://docs.expo.dev/guides/new-architecture/
- https://www.npmjs.com/package/expo-local-authentication

## Security boundary and policy

The app lock is a **UI-level gate only**. It never authorizes, rejects,
encrypts, or deletes a Whispr session; a locked app still holds a valid session
in SecureStore. Removing or reworking token storage is out of scope for MB-08.

Policy, enforced by injected logic (`src/security/mobile-app-lock.ts`) and
proven by the contract and component suites:

1. **Opt-in, default OFF.** No lock screen appears unless the user explicitly
   enables the lock in Settings. The preference persists across app restarts in
   SecureStore (`src/auth/mobile-app-lock-preference-store.ts`,
   key `whispr.mobile.app-lock.enabled.v1`) — unlike the MB-07 device-integrity
   dismissal, which is session-only.
2. **Trigger: cold start + return to foreground.** When a session is active and
   the lock is enabled, biometric verification is requested on cold start (after
   the session resolves to signed-in) and on every `AppState` transition to
   `active` — not on every screen change.
3. **The user is never trapped.** The lock screen always offers (a) a retry that
   runs `authenticateAsync` with the OS device-passcode fallback enabled
   (`disableDeviceFallback: false`), and (b) a sign-out escape hatch. A broken or
   changed sensor can therefore always be worked around.
4. **No hardware / no enrolled biometrics → fail open.** If `hasHardwareAsync()`
   or `isEnrolledAsync()` is false (or the native check throws), the lock is
   skipped and the user is let straight in, even when the preference is on. The
   Settings toggle surfaces an "unavailable" state. Losing biometrics while the
   preference is on can never lock a signed-in user out.
5. **Failed verification → stay locked.** An unsuccessful or thrown
   `authenticateAsync` keeps the lock up and offers retry plus sign-out. Native
   error detail is dropped, never surfaced or logged.
6. **Signed-out means no lock.** The gate only arms for a signed-in session, so
   the auth screen is never locked.

## Automated evidence

Run:

```bash
pnpm --filter @wizards/mobile test
pnpm --filter @wizards/mobile test:components
pnpm --filter @wizards/mobile typecheck
```

- `scripts/mobile-app-lock-contract.test.ts` (node:test) proves the pure gate:
  availability requires hardware **and** enrollment, native failures fail open to
  `unavailable`, arming only happens for a signed-in + enabled + available device,
  authentication failures/throws stay locked without leaking detail, and the
  SecureStore preference persists (enabled and disabled) across reads.
- `component-tests/mobile-app-lock-screen.test.tsx` (RNTL, injected fakes) proves
  the five behaviors end to end through the real `MobileAuthProvider`: lock off →
  straight in; lock on + capable device + success → lock shown then content after
  unlock; lock on + no hardware → fail-open, no lock screen (critical regression
  guard); failed prompt → stays locked with a working sign-out escape; and
  re-lock on a foreground `AppState` transition.
- `component-tests/profile-settings-screen.test.tsx` proves the persistent
  toggle: enabling fires the persist callback, and the toggle is disabled (no-op)
  when biometrics are unavailable.

No test imports `expo-local-authentication`; tests inject a fake authenticator
and preference store, exactly as MB-07 injects the device-integrity detector.

## UAT device matrix

Run this matrix on real hardware before promoting a native build. It exercises
the biometric paths that Windows CI and RNTL cannot. Do not record device
identifiers in evidence.

| Platform | Scenario                                             | Expected result                                                                 |
| -------- | ---------------------------------------------------- | ------------------------------------------------------------------------------- |
| iOS      | Face ID enrolled, lock ON, cold start                | Lock screen appears; Face ID prompt; success reveals content                    |
| iOS      | Face ID enrolled, lock ON, background → foreground   | Re-locks on return; unlock reveals content                                      |
| iOS      | Lock ON, cancel Face ID → device passcode fallback   | Passcode fallback offered; correct passcode unlocks                             |
| iOS      | Lock ON, repeated failed Face ID                     | Stays locked; retry and "Sign out" both work; sign-out returns to auth screen   |
| iOS      | Simulator (no biometrics enrolled), lock ON          | Fail-open: no lock screen; user enters normally; toggle shows "unavailable"     |
| Android  | Fingerprint enrolled, lock ON, cold start            | Lock screen appears; fingerprint prompt; success reveals content                |
| Android  | Fingerprint enrolled, lock ON, background → foreground| Re-locks on return; unlock reveals content                                      |
| Android  | Lock ON, device-credential fallback                  | Device PIN/pattern fallback offered and unlocks                                 |
| Android  | Emulator (no biometrics enrolled), lock ON           | Fail-open: no lock screen; user enters normally; toggle shows "unavailable"     |
| Both     | Enable lock, force-quit, relaunch                    | Preference persists (lock still ON) across the cold start                       |
| Both     | Lock ON, then remove all enrolled biometrics in OS   | Fail-open on next arm: signed-in user is NOT locked out                         |

The fail-open and "never trap the user" rows are the highest-priority checks:
they confirm a signed-in user can never be locked out by missing, broken, or
removed biometrics. Physical iOS and Face-ID/Touch-ID evidence must be collected
on Apple hardware; it cannot be produced by Windows CI.
