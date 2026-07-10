# Mobile Device Integrity Advisory

Last reviewed: 2026-07-10

## Decision and compatibility evidence

Whispr uses `expo-device@~56.0.4` instead of `jail-monkey` for the mobile
root/jailbreak advisory.

- The published `expo-device@56.0.4` package exports both `isDevice` and
  `isRootedExperimentalAsync()` and is the SDK-aligned version selected by
  `expo install` for Expo SDK 56.
- Expo documents `isDevice === false` for Android emulators and iOS simulators.
- Expo documents `isRootedExperimentalAsync()` for Android root and iOS
  jailbreak detection, including its false-positive and bypass limitations.
- Expo documents that every Expo SDK package supports React Native's New
  Architecture as of SDK 53. Whispr uses Expo SDK 56 and React Native 0.85.
- `expo-device` is an Expo Module discovered by native autolinking. It does not
  require an entry in `app.config.js`'s plugin list.

Primary sources:

- https://docs.expo.dev/versions/latest/sdk/device/
- https://docs.expo.dev/guides/new-architecture/
- https://www.npmjs.com/package/expo-device/v/56.0.4

`jail-monkey@3.0.0` was also checked. Its release and Codegen metadata confirm
New Architecture support, but adding it would introduce a second third-party
native detection surface without changing Whispr's advisory-only policy.

## Security boundary

This signal is advisory-grade. Root and jailbreak detection can be bypassed,
and a clean result does not prove that a device is trustworthy. The result must
never be used to authorize, reject, revoke, or restrict a Whispr session.

At application startup:

1. Auth storage bootstrap and device integrity assessment start independently.
2. Emulators and simulators stop at `isDevice`; root/jailbreak detection is not
   called and no warning or security signal is emitted.
3. A compromised physical-device result shows a dismissible warning and emits
   `mobile_device_integrity_compromised`.
4. A detector error fails open, shows no warning, and emits
   `mobile_device_integrity_check_failed`.
5. Signals contain only `advisory`, `event`, and `platform`. They contain no
   user, device, session, token, or native error details.
6. Dismissal lasts for the current application process. A later cold start
   evaluates the device again.

## Automated evidence

Run:

```bash
pnpm --filter @wizards/mobile test
pnpm --filter @wizards/mobile test:components
```

The contract and component suites inject detectors for clean physical devices,
compromised physical devices, emulators, pending native checks, and native
errors. The pending-check test proves auth bootstrap completes before the
integrity promise resolves. The emulator test proves the root/jailbreak method
is never called.

## UAT device matrix

Run this matrix before promoting a native build. Do not use a real malicious
payload or include device identifiers in evidence.

| Platform | Target                 | Expected result                                                  |
| -------- | ---------------------- | ---------------------------------------------------------------- |
| Android  | Standard emulator      | No warning; login and Maestro navigation remain usable           |
| Android  | Stock physical device  | No warning; login remains usable                                 |
| Android  | Rooted test device     | Warning appears; dismiss works; login remains usable             |
| iOS      | Simulator              | No warning; login and navigation remain usable                   |
| iOS      | Stock physical device  | No warning; login remains usable                                 |
| iOS      | Jailbroken test device | Warning appears; dismiss works; login remains usable             |
| Both     | Detector unavailable   | No warning; login remains usable; bounded failure signal emitted |

The automated emulator test is the CI guard against blocking simulator-based
component or future Maestro flows. Physical iOS and jailbroken-device evidence
must be collected on Apple hardware; it cannot be produced by Windows CI.
