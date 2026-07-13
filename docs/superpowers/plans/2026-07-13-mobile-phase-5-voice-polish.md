# Whispr Mobile Phase 5 Voice and Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete Whispr mobile camera/video, audio device, noise, haptic, offline, privacy, performance, accessibility, Maestro, and migration closure.

**Architecture:** Keep the existing LiveKit Room inside `useMobileVoiceRoom`, add small pure contracts for preferences/device/network/privacy behavior, and expose those through focused providers and sheets. Add `expo-haptics` and NetInfo before the single M1 native build; all later work remains JS-only.

**Tech Stack:** Expo SDK 56, React Native 0.85, React 19, LiveKit RN 2.11, livekit-client 2.19, TanStack Query 5, Reanimated 4, Jest/RNTL, Node test runner, Maestro.

## Global Constraints

- Work directly on `uat`; no branch or worktree.
- Exactly three milestone commits with full green gates.
- Add only `expo-haptics` and `@react-native-community/netinfo` as new native dependencies.
- Run exactly one native Android build after M1 code is complete; no native build in M2/M3.
- Never log or persist device labels, enumeration payloads, tokens, URLs, SSID, IP, BSSID, or camera frames.
- No offline queue/persist/replay, DB migration, role CRUD, permission matrix, or group video layout.
- Never capture Maestro evidence while camera/video or sensitive DM content is visible.

---

### Task 1: Lock M1 voice contracts and preferences

**Files:**
- Create: `apps/mobile/src/voice/mobile-voice-device-contract.ts`
- Create: `apps/mobile/scripts/mobile-voice-device-contract.test.ts`
- Create: `apps/mobile/src/voice/mobile-camera-contract.ts`
- Create: `apps/mobile/scripts/mobile-camera-contract.test.ts`
- Modify: `apps/mobile/src/voice/mobile-voice-noise-contract.ts`
- Modify: `apps/mobile/scripts/mobile-voice-noise-contract.test.ts`
- Modify: `apps/mobile/src/voice/mobile-voice-ptt-contract.ts`
- Modify: `apps/mobile/src/voice/expo-mobile-voice-preferences.ts`

**Interfaces:**
- Produces `MobileVoiceDevicePreference`, `sanitizeMobileVoiceDeviceId`, `toMobileVoiceDeviceOptions`, `MobileCameraFacingMode`, `getNextMobileCameraFacingMode`, and persisted noise/device methods.
- Device options expose only `{ id, kind, label }` to UI; persistence stores only bounded IDs and booleans.

- [ ] **Step 1: Write failing contract tests**

```ts
assert.equal(sanitizeMobileVoiceDeviceId("  mic-1  "), "mic-1");
assert.equal(sanitizeMobileVoiceDeviceId("x".repeat(257)), null);
assert.deepEqual(toMobileVoiceOutputOptions(["speaker", "bluetooth", "speaker"]), [
  { id: "speaker", kind: "audiooutput", labelKey: "speaker" },
  { id: "bluetooth", kind: "audiooutput", labelKey: "bluetooth" },
]);
assert.equal(getNextMobileCameraFacingMode("user"), "environment");
assert.equal(getMobileMicrophoneCaptureOptions(false).noiseSuppression, false);
```

- [ ] **Step 2: Verify RED**

Run: `corepack pnpm --filter @wizards/mobile exec node --test --import tsx scripts/mobile-voice-device-contract.test.ts scripts/mobile-camera-contract.test.ts scripts/mobile-voice-noise-contract.test.ts`

Expected: FAIL because the new contracts and boolean noise option do not exist.

- [ ] **Step 3: Implement pure contracts and preference storage**

Implement strict 256-character ID bounds, stable dedupe, known output label keys, `user|environment` camera facing, and AsyncStorage keys under `whispr.mobile.voice.*.v1`. Corrupt values fall back to default input/output and noise enabled.

- [ ] **Step 4: Verify GREEN**

Run the Step 2 command and `corepack pnpm --filter @wizards/mobile typecheck`.

Expected: all focused tests pass and TypeScript exits 0.

### Task 2: Complete camera tracks, flip, background stop, and permission path

**Files:**
- Modify: `apps/mobile/src/voice/mobile-voice-room-contract.ts`
- Modify: `apps/mobile/src/voice/use-mobile-voice-room.ts`
- Modify: `apps/mobile/src/app/providers/mobile-voice-provider.tsx`
- Modify: `apps/mobile/src/app/mobile-product-app.tsx`
- Modify: `apps/mobile/scripts/mobile-voice-room-contract.test.ts`
- Modify: `apps/mobile/scripts/mobile-voice-lifecycle-contract.test.ts`
- Modify: `apps/mobile/scripts/mobile-screen-share-contract.test.ts`

**Interfaces:**
- Produces `cameraTrackRef`, `cameraFacingMode`, `flipCamera()`, persisted device/noise runtime, and camera permission gating.
- Consumes the contracts from Task 1 and existing media permission provider.

- [ ] **Step 1: Write failing lifecycle tests**

```ts
assert.match(voiceHook, /getTrackPublication\(Track\.Source\.Camera\)/);
assert.match(voiceHook, /restartTrack\(\{\s*facingMode:/s);
assert.match(voiceHook, /setCameraEnabled\(false\)/);
assert.match(voiceHook, /sendMobileVoiceHeartbeat[\s\S]*selfVideo:\s*false/);
assert.match(productApp, /requestCameraPermission[\s\S]*toggleCamera/);
```

- [ ] **Step 2: Verify RED**

Run: `corepack pnpm --filter @wizards/mobile exec node --test --import tsx scripts/mobile-voice-room-contract.test.ts scripts/mobile-voice-lifecycle-contract.test.ts scripts/mobile-screen-share-contract.test.ts`

Expected: FAIL on missing camera track/flip/background contracts.

- [ ] **Step 3: Implement the minimal runtime behavior**

Map local/remote camera publications into a typed track reference. Before enabling camera, require the user-triggered camera permission result. Flip only an enabled local camera track. On non-active AppState, stop camera and screen share and send false heartbeat payloads without leaking native errors.

- [ ] **Step 4: Verify GREEN**

Run the Step 2 command and mobile typecheck.

Expected: pass.

### Task 3: Add device enumeration, selection, and voice settings sheet

**Files:**
- Create: `apps/mobile/src/voice/mobile-voice-settings-sheet.tsx`
- Modify: `apps/mobile/src/app/screens/voice-screen.tsx`
- Modify: `apps/mobile/src/app/screens/voice-screen.styles.ts`
- Modify: `apps/mobile/src/voice/use-mobile-voice-room.ts`
- Modify: `apps/mobile/src/app/providers/mobile-voice-provider.tsx`
- Modify: `apps/mobile/component-tests/voice-screen-components.test.tsx`
- Modify: `apps/mobile/scripts/mobile-voice-lifecycle-contract.test.ts`

**Interfaces:**
- Produces `refreshVoiceDevices`, `selectAudioInput`, `selectAudioOutput`, `selectNoiseSuppression`, and `MobileVoiceSettingsSheet`.
- UI consumes bounded options; raw enumeration objects never leave runtime mapping.

- [ ] **Step 1: Write failing UI and architecture tests**

```tsx
expect(source).toMatch(/Room\.getLocalDevices\("audioinput"\)/);
expect(source).toMatch(/AudioSession\.getAudioOutputs\(\)/);
expect(source).toMatch(/switchActiveDevice\("audioinput"/);
expect(screen.getByTestId("mobile-voice-device-sheet-panel")).toBeTruthy();
expect(screen.getByTestId("mobile-voice-noise-toggle")).toBeTruthy();
```

- [ ] **Step 2: Verify RED**

Run focused Node voice tests and `corepack pnpm --filter @wizards/mobile exec jest component-tests/voice-screen-components.test.tsx --runInBand`.

Expected: FAIL because the settings sheet and device runtime do not exist.

- [ ] **Step 3: Implement sheet and runtime**

Use `Room.getLocalDevices("audioinput")`, `room.switchActiveDevice("audioinput", id)`, `AudioSession.getAudioOutputs()`, and `AudioSession.selectAudioOutput(id)`. Apply a saved input only if currently enumerated. Render accessible 44pt rows and a persisted noise toggle.

- [ ] **Step 4: Verify GREEN**

Run the Step 2 commands and mobile typecheck.

Expected: pass.

### Task 4: Render local/remote video and install native dependencies

**Files:**
- Create: `apps/mobile/src/voice/mobile-camera-grid.tsx`
- Modify: `apps/mobile/src/app/screens/voice-screen.tsx`
- Modify: `apps/mobile/src/app/screens/voice-screen.styles.ts`
- Modify: `apps/mobile/component-tests/voice-screen-components.test.tsx`
- Modify: `apps/mobile/package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `docs/superpowers/specs/2026-07-13-mobile-phase-5-voice-polish-design.md`
- Modify: `docs/superpowers/plans/2026-07-13-mobile-phase-5-voice-polish.md`

**Interfaces:**
- `MobileVoiceCameraGrid` renders subscribed `Track.Source.Camera` references with `VideoTrack` and placeholders without camera frames.

- [ ] **Step 1: Write failing render tests**

```tsx
expect(source).toMatch(/VideoTrack/);
expect(source).toMatch(/cameraTrackRef/);
expect(screen.getByTestId("mobile-voice-camera-flip")).toBeTruthy();
```

- [ ] **Step 2: Verify RED**

Run the voice component test and camera contract test.

Expected: FAIL.

- [ ] **Step 3: Implement camera grid and install dependencies**

Run: `corepack pnpm --filter @wizards/mobile exec expo install expo-haptics @react-native-community/netinfo`

Render only bounded participant video tiles and add camera flip action. Do not capture screenshots with video enabled.

- [ ] **Step 4: Run M1 full gates**

Run mobile typecheck, all Node tests, all Jest tests, quality, Expo install check, and moderate audit.

Expected: all exit 0.

- [ ] **Step 5: Run the one allowed native build**

Run: `corepack pnpm --filter @wizards/mobile android:uat:local`

Expected: development APK builds, installs, and launches. Do not run another native build in M2/M3.

- [ ] **Step 6: Commit M1**

```powershell
git add apps/mobile docs/superpowers/specs/2026-07-13-mobile-phase-5-voice-polish-design.md docs/superpowers/plans/2026-07-13-mobile-phase-5-voice-polish.md pnpm-lock.yaml
git commit -m "feat(mobile): add camera publishing and audio device controls"
```

### Task 5: Add haptic contract, provider, setting, and kit integration

**Files:**
- Create: `apps/mobile/src/haptics/mobile-haptics-contract.ts`
- Create: `apps/mobile/src/haptics/expo-mobile-haptics.ts`
- Create: `apps/mobile/src/app/providers/mobile-haptics-provider.tsx`
- Create: `apps/mobile/scripts/mobile-haptics-contract.test.ts`
- Modify: `apps/mobile/App.tsx`
- Modify: `apps/mobile/src/app/components/kit/button.tsx`
- Modify: `apps/mobile/src/app/components/kit/context-menu.tsx`
- Modify: `apps/mobile/src/app/screens/settings-screen.tsx`
- Modify: `apps/mobile/component-tests/mobile-kit-core.test.tsx`
- Modify: `apps/mobile/component-tests/settings-appearance.test.tsx`

**Interfaces:**
- Produces `useMobileHaptics()` with `enabled`, `setEnabled`, `selection`, `impact`, and `notification`.
- Provider suppresses effects when preference is off or reduce-motion is enabled.

- [ ] **Step 1: Write failing contract/component tests**

```ts
assert.equal(shouldPerformMobileHaptic({ preferenceEnabled: true, reduceMotion: false }), true);
assert.equal(shouldPerformMobileHaptic({ preferenceEnabled: true, reduceMotion: true }), false);
```

```tsx
fireEvent.press(screen.getByTestId("mobile-haptics-toggle"));
expect(savePreference).toHaveBeenCalledWith(false);
```

- [ ] **Step 2: Verify RED**

Run the new Node test and focused kit/settings Jest tests.

Expected: FAIL.

- [ ] **Step 3: Implement provider and integrations**

Use `expo-haptics` methods behind an injected best-effort adapter. Store only `true|false` in AsyncStorage. Wrap kit press/long-press callbacks without changing disabled/busy behavior.

- [ ] **Step 4: Verify GREEN**

Run focused tests and typecheck.

Expected: pass.

### Task 6: Add NetInfo online manager, banner, and offline mutation toast

**Files:**
- Create: `apps/mobile/src/network/mobile-network-contract.ts`
- Create: `apps/mobile/src/network/mobile-network-events.ts`
- Create: `apps/mobile/src/app/providers/mobile-network-provider.tsx`
- Create: `apps/mobile/src/app/components/mobile-offline-banner.tsx`
- Create: `apps/mobile/scripts/mobile-network-contract.test.ts`
- Modify: `apps/mobile/App.tsx`
- Modify: `apps/mobile/src/api/mobile-api-client.ts`
- Modify: `apps/mobile/src/app/providers/mobile-query-provider.tsx`
- Modify: `apps/mobile/scripts/mobile-api-client.test.ts`
- Modify: `apps/mobile/component-tests/mobile-app-providers.test.tsx`

**Interfaces:**
- Produces `MobileNetworkStatus`, `isMobileMutationMethod`, `MobileOfflineError`, and a bounded offline-attempt event.
- Provider updates TanStack `onlineManager`; API client blocks only non-GET when status is definitely offline.

- [ ] **Step 1: Write failing network/API tests**

```ts
assert.equal(toMobileNetworkStatus({ isConnected: false, isInternetReachable: false }), "offline");
assert.equal(toMobileNetworkStatus({ isConnected: true, isInternetReachable: null }), "online");
await assert.rejects(client.request("/safe", { method: "POST" }), MobileOfflineError);
assert.equal(fetchCalls, 0);
```

- [ ] **Step 2: Verify RED**

Run new network and mobile API client tests.

Expected: FAIL.

- [ ] **Step 3: Implement fail-fast network flow**

Subscribe to NetInfo once, store only the three-state status, set `onlineManager`, show `mobile-offline-banner`, and notify one bounded Toast per offline mutation attempt. Unknown state does not block.

- [ ] **Step 4: Verify GREEN**

Run focused tests, provider Jest, and typecheck.

Expected: pass.

### Task 7: Add reduced-motion transitions and loading/empty polish

**Files:**
- Modify: `apps/mobile/src/navigation/mobile-navigator.tsx`
- Modify: `apps/mobile/src/app/screens/workspace-browser.tsx`
- Modify: `apps/mobile/src/workspace/mobile-server-members-screen.tsx`
- Modify: `apps/mobile/src/app/screens/notifications-screen.tsx`
- Modify: `apps/mobile/component-tests/mobile-navigation.test.tsx`
- Modify: `apps/mobile/component-tests/mobile-message-loading-skeleton.test.tsx`
- Modify: `apps/mobile/scripts/mobile-design-contract.test.ts`

**Interfaces:**
- Navigation selects `slide_from_right` or `none` from the real reduced-motion hook.
- First-load and true-empty states remain distinct and use Kit primitives.

- [ ] **Step 1: Write failing transition/loading tests**

```tsx
expect(stackOptions.animation).toBe("none");
expect(screen.getByTestId("mobile-workspace-loading")).toBeTruthy();
expect(screen.queryByTestId("mobile-workspace-empty")).toBeNull();
```

- [ ] **Step 2: Verify RED**

Run focused navigation/loading Jest tests and design contract.

Expected: FAIL.

- [ ] **Step 3: Implement minimal UI polish**

Use the existing `Skeleton` and `EmptyState`; do not introduce new loading state machines or broad refactors.

- [ ] **Step 4: Run M2 full gates and commit**

Run all mobile gates and audit, then commit:

```powershell
git add apps/mobile pnpm-lock.yaml
git commit -m "feat(mobile): add haptics, transitions and offline awareness"
```

Do not run a native build.

### Task 8: Add app-switcher privacy shield

**Files:**
- Create: `apps/mobile/src/privacy/mobile-privacy-contract.ts`
- Create: `apps/mobile/src/app/components/mobile-privacy-shield.tsx`
- Create: `apps/mobile/scripts/mobile-privacy-contract.test.ts`
- Create: `apps/mobile/component-tests/mobile-privacy-shield.test.tsx`
- Modify: `apps/mobile/App.tsx`
- Modify: `apps/mobile/scripts/mobile-root-boundary.test.ts`

**Interfaces:**
- `shouldShowMobilePrivacyShield(AppStateStatus)` returns true for `inactive|background|unknown` and false only for `active`.
- Shield is an opaque accessibility modal and does not mutate auth/app-lock state.

- [ ] **Step 1: Write failing tests**

```ts
assert.equal(shouldShowMobilePrivacyShield("background"), true);
assert.equal(shouldShowMobilePrivacyShield("active"), false);
```

```tsx
expect(screen.getByTestId("mobile-privacy-shield")).toBeTruthy();
expect(screen.queryByText("sensitive dm body")).toBeTruthy();
```

- [ ] **Step 2: Verify RED**

Run privacy Node/Jest tests.

Expected: FAIL.

- [ ] **Step 3: Implement shield and verify GREEN**

Mount the shield above signed-in content and below bootstrap error boundaries. Use an opaque semantic surface, no snapshot content, and no token/session mutations.

### Task 9: Lock performance, accessibility, quality, and Phase 5 Maestro

**Files:**
- Create: `apps/mobile/src/performance/mobile-performance-metrics.ts`
- Create: `apps/mobile/scripts/mobile-performance-metrics.test.ts`
- Create: `.maestro/phase5-voice-polish.yml`
- Modify: `apps/mobile/component-tests/mobile-performance-surfaces.test.tsx`
- Modify: `apps/mobile/component-tests/voice-screen-components.test.tsx`
- Modify: `apps/mobile/scripts/mobile-maestro-testid-contract.test.ts`
- Modify: `apps/mobile/src/quality/mobile-quality-gate.ts`
- Modify: `apps/mobile/scripts/mobile-quality-gate.test.ts`

**Interfaces:**
- Performance metrics accept bounded startup/resume/blank-area numbers and never content/device labels.
- Maestro uses stable testIDs and never screenshots active camera, video, device labels, DM content, tokens, or URLs.

- [ ] **Step 1: Write failing performance/accessibility/Maestro contracts**

```ts
assert.deepEqual(recordMobileBlankArea({ blankArea: 24, offsetEnd: 0, offsetStart: 0 }), {
  maxBlankArea: 24,
});
assert.match(flow, /mobile-voice-camera-toggle/);
assert.doesNotMatch(flow, /takeScreenshot[\s\S]{0,300}mobile-voice-camera-on/);
```

- [ ] **Step 2: Verify RED**

Run focused performance, design, quality, Maestro contract, and voice component tests.

Expected: FAIL.

- [ ] **Step 3: Implement bounded metrics and accessibility pass**

Keep min 44pt controls, explicit accessibility roles/labels/states, max font multipliers, stable callbacks, and bounded video/list rendering.

- [ ] **Step 4: Verify GREEN**

Run focused tests and typecheck.

### Task 10: Write migration closure, run full gates, and commit M3

**Files:**
- Create: `apps/mobile/MIGRATION_PHASE_5.md`
- Modify: `apps/mobile/PHASE_5_HANDOFF.md`
- Modify: `apps/mobile/src/release/mobile-release-contract.ts`
- Modify: `apps/mobile/src/release/mobile-release-evidence.ts`
- Modify: `apps/mobile/scripts/mobile-release-contract.test.ts`
- Modify: `apps/mobile/scripts/mobile-release-evidence.test.ts`

**Interfaces:**
- Migration doc records Faz 0-5 closure, exact test evidence, one-build rule, security boundaries, and backlog.

- [ ] **Step 1: Write failing release-document contracts**

```ts
assert.match(migration, /Faz 0-5 kapanış özeti/);
assert.match(migration, /rol CRUD.*izin matrisi/i);
assert.match(migration, /offline queue/i);
assert.match(migration, /grup video/i);
```

- [ ] **Step 2: Verify RED, write documentation, verify GREEN**

Run release tests before and after creating the document.

- [ ] **Step 3: Run complete non-device closure**

Run mobile typecheck,  all Node tests, all Jest tests, quality, env/release checks, Expo install check, moderate audit, and `git diff --check`.

Expected: every command exits 0.

- [ ] **Step 4: Run graph update**

Run: `graphify update .`

Expected: AST graph update exits 0; generated graph files are not staged.

- [ ] **Step 5: Run the single Phase 5 Maestro UAT flow**

Seed only non-sensitive UAT prerequisites. Run `.maestro/phase5-voice-polish.yml` once. Ensure camera is off before light/dark screenshots and output only to `artifacts/mobile/phase5/`.

- [ ] **Step 6: Commit M3**

```powershell
git add .maestro/phase5-voice-polish.yml apps/mobile
git commit -m "feat(mobile): complete phase 5 voice and polish"
```

- [ ] **Step 7: Push and restore unrelated WIP**

Push `uat`, verify remote SHA and UAT HTTP health, then restore the named pre-Phase-5 stash. Never stage restored user files.
