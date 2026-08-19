# Voice Device Lifecycle and Microphone Test Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve selected audio devices, remove cold-start double capture, deduplicate equivalent pseudo-devices, and add a safe microphone level/loopback test.

**Architecture:** Keep preference reconciliation as pure device-list logic, make permission probing read-only, and isolate microphone-test ownership/routing in a small voice library consumed by one settings component. Borrow the active LiveKit track when usable; otherwise own a temporary selected-device stream.

**Tech Stack:** React 19, TypeScript, Zustand 5, LiveKit Client 2.21, Web Audio API, Media Capture and Streams API, Node test runner.

**Spec:** `docs/superpowers/specs/2026-08-18-voice-device-lifecycle-and-microphone-test-design.md`

## Global Constraints

- No new dependency.
- No audio recording, persistence, analytics, or upload.
- Borrowed LiveKit tracks must never be stopped or mutated.
- Self-monitoring remains off until explicit user action.
- Preserve unrelated dirty worktree changes.
- Do not commit, stage, push, or publish without separate user authorization.

---

### Task 1: Enumeration-safe device reconciliation and pseudo-device dedupe

**Files:**

- Modify: `apps/web/src/lib/voice/audio-device-fallback.ts`
- Modify: `apps/web/src/lib/voice/audio-device-fallback.test.ts`
- Modify: `apps/web/src/hooks/use-audio-devices.ts`
- Modify: `apps/web/src/components/voice/audio-device-select.tsx`
- Create: `apps/web/src/lib/voice/audio-device-options.ts`
- Create: `apps/web/src/lib/voice/audio-device-options.test.ts`

**Interfaces:**

- Produces: `resolveAudioDeviceFallback()` preserving unverified selections.
- Produces: `buildAudioDeviceOptions(kind, devices, labels)` returning deduplicated display options.
- Produces: `AudioDeviceEnumerationStatus = "error" | "loading" | "ready" | "unsupported"`.

- [ ] **Step 1: Write failing fallback tests**

Add literal assertions proving empty enumeration preserves `mic-logitech`, removed physical selection prefers `default`, and no usable devices preserve prior selection.

- [ ] **Step 2: Run fallback test; verify expected RED**

Run: `pnpm.cmd --filter @wizards/web exec tsx --test src/lib/voice/audio-device-fallback.test.ts`

Expected: assertions fail because current logic writes `default` for empty lists and prefers `communications` first.

- [ ] **Step 3: Implement minimal fallback ordering**

Change only fallback branches needed by tests. Add an `unverified` reason if required; never infer device disappearance from an empty list.

- [ ] **Step 4: Run fallback test; verify GREEN**

Run the same targeted command. Expected: all fallback tests pass.

- [ ] **Step 5: Write failing option-normalization tests**

Cover same non-empty `groupId`, normalized same-target labels, different target groups, and preservation of physical endpoints.

- [ ] **Step 6: Run option test; verify expected RED**

Expected: module/export missing.

- [ ] **Step 7: Implement option normalization and loading gate**

Move display normalization to `audio-device-options.ts`. Extend `useAudioDevices()` with explicit enumeration status. Run selector fallback only for `ready` non-empty results.

- [ ] **Step 8: Run both targeted tests; verify GREEN**

Run both test files in one `tsx --test` command.

- [ ] **Step 9: Review checkpoint**

Inspect targeted diff and `git diff --check`. Do not commit absent authorization.

### Task 2: Single-owner cold-start microphone capture

**Files:**

- Create: `apps/web/src/lib/voice/microphone-permission.ts`
- Create: `apps/web/src/lib/voice/microphone-permission.test.ts`
- Modify: `apps/web/src/components/providers/live-voice-provider.tsx`

**Interfaces:**

- Produces: `canAttemptMicrophoneCapture(permissionState): boolean` where only `denied` returns false.
- Consumes: existing `getMicrophonePermissionState()`.

- [ ] **Step 1: Write failing permission tests**

Assert literal results for `denied`, `granted`, `prompt`, and `null`/unsupported states.

- [ ] **Step 2: Run permission test; verify expected RED**

Expected: module/export missing.

- [ ] **Step 3: Implement permission decision and remove preflight capture**

Use read-only permission state in provider. Do not call `getUserMedia({ audio: true })`; allow LiveKit’s selected `setMicrophoneEnabled()` call to raise the real prompt.

- [ ] **Step 4: Run permission and existing microphone tests; verify GREEN**

Run permission, media capabilities, and microphone capture retry tests.

- [ ] **Step 5: Review checkpoint**

Confirm no alternate preflight `getUserMedia({ audio: true })` remains in join preparation. Inspect diff; do not commit absent authorization.

### Task 3: Microphone-test source ownership and output routing

**Files:**

- Create: `apps/web/src/lib/voice/microphone-test.ts`
- Create: `apps/web/src/lib/voice/microphone-test.test.ts`

**Interfaces:**

- Produces: `acquireMicrophoneTestSource({ activeTrack, isMuted, preferences, getUserMedia, createMediaStream }): Promise<MicrophoneTestSource>`.
- Produces: `releaseMicrophoneTestSource(source): void`.
- Produces: `routeMicrophoneTestOutput(element, outputDeviceId): Promise<void>`.
- `MicrophoneTestSource` contains `stream`, `track`, and `owned`.

- [ ] **Step 1: Write failing source-ownership tests**

Prove live unmuted room track is borrowed, muted/missing track opens selected temporary capture, borrowed release does not stop, owned release stops exactly once.

- [ ] **Step 2: Run source tests; verify expected RED**

Expected: module/export missing.

- [ ] **Step 3: Implement minimal source acquisition/release**

The UI resolves `getLocalMicrophoneTrack(room)?.mediaStreamTrack`; the library borrows that track when live and allowed. Otherwise call injected/default `getUserMedia` with `buildAudioCaptureOptions(preferences)`.

- [ ] **Step 4: Run source tests; verify GREEN**

Expected: all ownership tests pass.

- [ ] **Step 5: Write failing output-routing tests**

Cover selected sink, default sink, unsupported `setSinkId`, and rejected routing promise.

- [ ] **Step 6: Implement routing and rerun; verify GREEN**

Keep routing error explicit for UI translation; never expose raw error text.

- [ ] **Step 7: Review checkpoint**

Mutation check: reversing `owned`, stopping borrowed track, or dropping selected device constraint must fail a test.

### Task 4: Microphone test user interface and resource cleanup

**Files:**

- Create: `apps/web/src/components/voice/microphone-test-panel.tsx`
- Modify: `apps/web/src/components/voice/voice-preferences-panel.tsx`
- Modify: `apps/web/src/lib/locale/messages/en.ts`
- Modify: `apps/web/src/lib/locale/messages/tr.ts`

**Interfaces:**

- Consumes: `room`, `isMuted`, and `audioPreferences` from `useVoiceState()`.
- Consumes: microphone-test source helpers and `createAudioLevelMonitor()`.
- Produces: accessible idle/starting/active/error UI with explicit loopback control.

- [ ] **Step 1: Add localized copy and panel shell**

Add exact keys for title, description, start, starting, stop, hear-self, headphone warning, idle/active level status, permission denied, unavailable device, output failure, generic failure.

- [ ] **Step 2: Implement explicit test lifecycle**

On start: acquire source, create level monitor, start 33 ms sampling. On stop/unmount/input change/room-source change: clear timer, dispose monitor, detach audio element, release source.

- [ ] **Step 3: Implement self-monitoring**

Attach source stream only after user toggles monitoring. Route through current output preference. On disable, pause and clear `srcObject`. Keep meter active.

- [ ] **Step 4: Integrate below device selectors**

Render once in `VoicePreferencesPanel` audio surface. Preserve existing layout and advanced controls.

- [ ] **Step 5: Run focused tests and typecheck**

Run voice targeted tests, then `pnpm.cmd --filter @wizards/web typecheck`.

- [ ] **Step 6: Review checkpoint**

Inspect cleanup paths, accessible labels, keyboard operation, raw-error exposure, and targeted diff. Do not commit absent authorization.

### Task 5: Repository and live acceptance verification

**Files:**

- Update generated graph only through: `graphify update .`
- No application code expected unless a failing verification exposes a scoped defect.

**Interfaces:**

- Consumes all prior tasks.
- Produces fresh PASS/FAIL/ENV BLOCKED evidence.

- [ ] **Step 1: Run targeted voice tests**

Run all changed/new voice test files plus existing provider lifecycle, media capabilities, capture retry, and voice store tests.

- [ ] **Step 2: Run web lint and typecheck**

Run `pnpm.cmd --filter @wizards/web lint` and `pnpm.cmd --filter @wizards/web typecheck`.

- [ ] **Step 3: Run formatting/diff gates**

Run `pnpm.cmd --filter @wizards/web format`, `git diff --check`, and inspect only task files. Formatting may modify task files; unrelated WIP must remain untouched.

- [ ] **Step 4: Update Graphify**

Run `graphify update .`. Report graph output separately because existing graph files already contain unrelated WIP.

- [ ] **Step 5: Live Chrome acceptance**

Reload Whispr. Verify explicit Logitech input/output persists across modal close/reopen and page reload; equivalent pseudo-devices collapse; first join meter responds; self-monitoring uses selected output; stop/close releases test resources.

- [ ] **Step 6: Final worktree audit**

List exact task files and verification counts. Separate PASS, FAIL, NOT RUN, and ENV BLOCKED. Do not stage, commit, push, or publish.
