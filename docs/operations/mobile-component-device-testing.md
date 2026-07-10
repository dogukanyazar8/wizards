# Mobile Component and Device Testing

Last reviewed: 2026-07-09

## Component test stack

Whispr mobile keeps the existing fast contract suite unchanged:

```bash
pnpm --filter @wizards/mobile test
```

React Native component rendering now runs through a separate Jest path:

```bash
pnpm --filter @wizards/mobile test:components
```

Registry and compatibility evidence checked on 2026-07-09:

- `npm view jest-expo dist-tags version versions --json` shows `latest` as `57.0.1` and the SDK 56 line as `56.0.5`; there is no `jest-expo@56.0.12`.
- `npm view jest-expo@56.0.5 peerDependencies dependencies --json` shows React Native `*`, Expo `*`, `@react-native/jest-preset@^0.85.0`, and bundled `react-test-renderer@19.2.3`.
- `npm view @testing-library/react-native version peerDependencies --json` shows `14.0.1` with `react >=19.0.0`, `react-native >=0.78`, `jest >=29.0.0`, and `test-renderer ^1.0.0`.
- Expo's unit testing guide recommends `jest-expo`, `jest`, `@types/jest`, the `jest-expo` preset, and React Native Testing Library for Expo projects.

Chosen versions:

- `jest-expo@56.0.5`: official SDK 56 dist-tag line, compatible with Expo SDK 56 / RN 0.85.x.
- `jest@29.7.0` and `@types/jest@29.5.14`: aligned with the Jest 29 stack used by `jest-expo@56.0.5`.
- `@testing-library/react-native@14.0.1` and `test-renderer@1.2.0`: React 19-compatible RNTL stack. RNTL 14 exposes async `render()` and async `fireEvent`, so component tests must `await` both.
- `@react-native/jest-preset@0.85.3`: explicit peer for RN 0.85.3.

The Jest path intentionally lives beside, not inside, `scripts/*.test.ts`. It renders components under `apps/mobile/component-tests` and uses small native-edge mocks only for `Ionicons` and LiveKit `VideoTrack`; business state, props, copy, styles, and React Native primitives remain real.

Known install note: `pnpm peers check --filter @wizards/mobile` still reports a pre-existing Expo subgraph peer on `react-dom@19.2.5` wanting `react ^19.2.5` while the mobile app pins `react@19.2.3`. The component test stack does not use React DOM. Forcing a root override would affect web/Expo resolution outside MB-04, so this was left as a documented package-manager warning rather than widened into a React upgrade.

## Device E2E decision

Decision: start mobile device E2E with Maestro, not Detox.

Why Maestro first:

- Expo documents EAS Workflows examples that build an app and run Maestro flows against the built binary.
- Maestro documents full React Native support through the accessibility layer and does not require app-side npm packages, native instrumentation, or Detox-specific build settings.
- Whispr already has EAS/internal build paths. A black-box smoke suite can reuse the signed/internal artifact and prove user-critical flows before investing in gray-box native control.

Why not Detox for the first slice:

- Detox gives deeper native synchronization, but it requires native build configuration, emulator/simulator orchestration, and more CI maintenance.
- The first target is a production-like smoke proof, not low-level native synchronization. Maestro has lower setup cost for login, messaging, and voice channel entry.

Initial Maestro smoke flow target:

1. Launch `team.whispr.mobile` with a clean app state.
2. Sign in with UAT-only credentials injected by environment variables.
3. Open a known workspace text channel.
4. Send a short message and assert it is visible.
5. Open a known voice channel and assert the voice room connected text is visible.

Recommended flow inputs:

```bash
WHISPR_MOBILE_E2E_EMAIL
WHISPR_MOBILE_E2E_PASSWORD
WHISPR_MOBILE_E2E_TEXT_CHANNEL
WHISPR_MOBILE_E2E_VOICE_CHANNEL
```

Recommended EAS build profile to add in MB-05/MB-10 when the first executable flow is committed:

```json
{
  "build": {
    "e2e-test": {
      "withoutCredentials": true,
      "ios": {
        "simulator": true
      },
      "android": {
        "buildType": "apk"
      }
    }
  }
}
```

Initial flow skeleton: `.maestro/whispr-mobile-smoke.yml`.

Recommended EAS workflow skeleton:

```yaml
name: mobile-e2e-android
on:
  workflow_dispatch: {}
jobs:
  build_android_for_e2e:
    type: build
    params:
      platform: android
      profile: e2e-test
  maestro_smoke:
    needs: [build_android_for_e2e]
    type: maestro
    params:
      build_id: ${{ needs.build_android_for_e2e.outputs.build_id }}
      flow_path: [".maestro/whispr-mobile-smoke.yml"]
```

Before making the Maestro flow required in CI, add stable `testID` values for the auth email/password fields, workspace channel rows, composer input/send button, and voice channel rows. Maestro can target visible text, but stable IDs are less brittle across Turkish/English locale changes.
