# Voice Device Lifecycle and Microphone Test Design

**Date:** 2026-08-18

**Status:** Approved

## Problem

Whispr can publish a LiveKit microphone track that remains `live` while carrying no measurable audio. The first cold application start is the highest-risk path. A user-selected physical input/output device can also appear not to persist because device fallback reconciliation runs before browser enumeration has completed and writes `default` over the stored selection.

Chrome exposes `default` and `communications` pseudo-devices in addition to physical endpoints. Whispr currently relabels both as generic choices and shows both even when they resolve to the same physical endpoint.

Users need a microphone test that verifies the actual selected capture path, displays input level, and optionally monitors the microphone through the selected output without recording or uploading audio.

## Confirmed Evidence

- `useAudioDevices()` initially returns empty arrays while `isLoading` is true.
- `AudioDeviceSelect` immediately runs fallback reconciliation against those empty arrays.
- `resolveAudioDeviceFallback()` converts any non-default preference to `default` when the device list is empty.
- The Zustand store persists the resulting overwrite under `wizards-voice`.
- Cold permission prompting opens `{ audio: true }`, stops that default stream, then LiveKit opens the real capture separately.
- Live runtime inspection showed a published, unmuted LiveKit microphone track with zero local meter energy and no speaking transitions.
- LiveKit server logs showed the microphone track was received and published; traffic matched silence/DTX rather than a missing publication.
- Existing health recovery treats a `live` MediaStreamTrack as healthy and therefore does not repair a silent-but-live capture.

## Goals

1. Preserve explicit device preferences until completed enumeration proves an endpoint disappeared.
2. Remove cold-start double capture and let the selected LiveKit capture own the permission prompt.
3. Avoid redundant pseudo-device choices when `default` and `communications` resolve to the same endpoint.
4. Add an explicit, leak-free microphone test with level meter and optional self-monitoring.
5. Reuse the active outbound LiveKit microphone track when possible so the test represents what peers receive.
6. Keep existing mute, push-to-talk, Krisp, device hot-plug, output routing, desktop, and browser behavior intact.

## Non-goals

- Recording, persisting, analyzing, or uploading microphone audio.
- Automatically restarting a microphone merely because the user is silent.
- Replacing LiveKit capture, Krisp, or existing remote audio rendering.
- Adding dependencies or changing supported browser/runtime versions.

## Design

### 1. Enumeration-safe preference reconciliation

`resolveAudioDeviceFallback()` will treat an empty device list as unverified state and preserve the current preference. `AudioDeviceSelect` will not reconcile while enumeration is loading or failed. Hot-plug reconciliation remains active after a successful enumeration.

Fallback order after completed, non-empty enumeration:

1. Keep selected physical endpoint when present.
2. Keep explicit `default` or `communications` pseudo-device preferences.
3. If a removed physical endpoint was selected, use `default` when exposed.
4. Otherwise use `communications` when exposed.
5. Otherwise use first valid physical endpoint.
6. If no usable endpoint exists, preserve the previous preference; do not destroy user intent.

### 2. Pseudo-device presentation

Only pseudo-devices are deduplicated. Physical device choices remain visible even when they share a `groupId` with a pseudo-device.

`communications` is hidden when it resolves to the same physical target as `default`, determined by matching non-empty `groupId` first and normalized browser labels second. If targets differ, both choices remain visible and keep distinct localized role labels.

### 3. Cold-start capture ownership

Permission-state probing will remain read-only. A `denied` permission blocks capture. `granted`, `prompt`, and unavailable Permissions API states allow LiveKit to attempt capture. The preflight `{ audio: true }` stream will be removed.

LiveKit `setMicrophoneEnabled()` becomes the single owner of the real permission prompt and selected capture constraints. Existing denial/error handling remains responsible for muted state and user-facing errors.

### 4. Microphone test source

The test starts only after an explicit user action.

- Connected, unmuted room with live local microphone: use the existing `LocalAudioTrack.mediaStreamTrack`. The test does not own or stop it.
- No usable outbound track: open a temporary stream with `buildAudioCaptureOptions(audioPreferences)`. The test owns and stops it.
- Level sampling reuses `createAudioLevelMonitor()` to avoid duplicate DSP logic.
- Self-monitoring uses a hidden `<audio>` element and `setSinkId()` when supported.
- Self-monitoring is disabled by default and requires a separate explicit action.
- Input device change, room/mute source change, test stop, component unmount, or modal close disposes monitor resources and owned tracks.

### 5. User interface

The audio settings panel gains a focused card below input/output selectors:

- Idle state with “Start test”.
- Starting state with disabled controls.
- Active level meter with accessible textual status.
- “Hear myself” toggle, off by default, plus headphone feedback warning.
- “Stop test”.
- Safe localized errors for permission denial, unavailable device, output-routing failure, and generic capture failure.

No raw exception, device identifier, stack trace, or audio data is displayed or transmitted.

## Resource and security lifecycle

- At most one test session per mounted panel.
- Owned MediaStreamTracks are stopped exactly once.
- Borrowed LiveKit tracks are never stopped or mutated.
- `AudioContext`, source node, timers, and audio element `srcObject` are released on every exit path.
- Test audio never leaves the browser except through the already-existing LiveKit publication when borrowing that track.
- Self-monitoring never starts automatically, reducing feedback and accidental playback risk.

## Performance

- Level polling uses the existing 33 ms voice meter cadence only while testing.
- No polling, AudioContext, or temporary stream exists in idle state.
- Device option normalization is linear in the small enumerated device list.
- No new dependency or background worker.

## Testing

TDD regression coverage will prove:

- Empty/loading enumeration preserves explicit Logitech-like IDs.
- Completed enumeration keeps available selections and falls back only for absent endpoints.
- `default` wins before `communications` for removed physical endpoints.
- Duplicate pseudo-devices collapse only when they resolve to the same target.
- Permission probing never calls `getUserMedia` before LiveKit capture.
- Test source borrows a live room track without stopping it.
- Test source opens and stops a temporary stream when borrowing is impossible.
- Output routing and cleanup handle success/failure without leaking resources.
- Existing voice tests remain green; web lint and typecheck pass.

## Acceptance criteria

1. Explicit Logitech input/output remains selected after closing/reopening settings and after reload.
2. First room join performs one selected microphone capture rather than default probe plus selected capture.
3. A silent-but-live outbound track is visible as zero in the test UI; the UI does not falsely report activity.
4. Speaking moves the meter and optional self-monitoring plays through selected output.
5. Stopping/closing test immediately releases all test-owned capture and audio resources.
6. Same-target system/communications pseudo-device pair renders once; different-target pair renders twice.
7. No unrelated worktree changes are modified, reset, staged, committed, or published.
