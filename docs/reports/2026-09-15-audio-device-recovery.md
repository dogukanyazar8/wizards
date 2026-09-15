# Audio device recovery — 2026-09-15

## Evidence and diagnosis

The supplied desktop/web development log shows `OverconstrainedError`, first for the selected microphone and then repeatedly for the purported default/plain capture. LiveKit token and voice-state endpoints return 200. The log does not contain the rejected `constraint` or the actual device identity: the original device becoming invalid is not proven, and neither a broken microphone nor a speaker failure can be inferred from this log.

A deterministic regression test exercises the installed **livekit-client 2.21.0** `Room.localParticipant.createTracks` through a mocked `getUserMedia` boundary. Before the fix, a room constructed with `deviceId: { exact: "disconnected-mic" }` keeps sending that exact device even after application preferences switch to default. `buildAudioCaptureOptions` omitted the default device field; LiveKit's `mergeDefaultOptions` restored the room's old field. The test failed with actual exact-disconnected versus expected ideal-default. After the fix it passes, and later explicit selections remain exact.

## Changes

- Explicit `{ ideal: "default" }` for system microphone selection overrides stale room capture defaults. Explicit user-selected IDs remain `{ exact: id }`.
- Recovery changes preferences only after capture succeeds, and only if the original preference has not since changed. Restart processing and its signature use the effective recovered preferences.
- Constraint-specific classification keeps a working selected microphone when optional voice isolation is rejected. A known non-device constraint is not labelled a missing microphone.
- Removed the misleading immediate "plain constraints" retry that reused the same capture profile. Existing bounded health recovery is retained; no arbitrary delay or new retry loop was added.
- Structured capture diagnostics retain the safe constraint name, without adding device IDs or labels. Recoverable transitions log a warning; terminal recovery failure logs an error.
- Remote voice audio output switches are serialized per audio element. Obsolete requests cannot recover to default or update preferences after a newer selection or disposal. A missing/unreadable selected output (`NotFoundError`/`AbortError`) gets one system-default attempt; permission rejection does not.
- Successful output recovery updates the selected output. Unrecoverable output errors show an actionable localized message instead of being silently swallowed. Unsupported custom output selection is reported honestly.

## Validation

- PASS: 96 focused voice tests, including the actual SDK constraint-merge regression and six output-router lifecycle/failure tests.
- PASS: source TypeScript check, scoped ESLint, `git diff --check`.
- Graphify: first update passed (39,075 nodes / 92,921 edges). The final update after the additional legacy-engine regression test failed during atomic graph replacement with `WinError 5` (access denied to graph.json). No user process was stopped or permissions changed; final graph freshness is not claimed.
- Source TypeScript excludes generated Next route declarations. Full production build, repository-wide suites, Windows device/permission/USB/Bluetooth tests, browser UI and actual two-person voice transmission were not run. All capture/output tests use controlled fakes; no microphone recording occurred.
- No native Rust changes, dependency upgrades, database changes, commit or push. Web dev reload/reopening the voice room uses the changed capture path; native rebuilding is not required for this patch when desktop uses the local web server.

## Acceptance still needed on physical devices

1. Join the same room with the intended microphone, confirm remote speech and the actual active input.
2. Change explicit input to system default and back; switch output rapidly between headset and speakers.
3. Unplug/reconnect a USB or Bluetooth device, then repeat mute/unmute, room departure and rejoin.

These source fixes address demonstrated defects. They do not establish feature or hardware parity with Discord, Zoom or Slack.

## Additional observations

- **medium** — the supplied log also reports `get_desktop_detected_game not allowed`. The static main capability and generated allowlist in `apps/desktop/scripts/run-tauri.mjs` disagree in existing game-activity work. This is separate from audio capture and was left unchanged.
- **minor** — Tauri reports a custom-protocol failure followed by switching to its postMessage IPC transport. This message alone does not establish a microphone permission failure; the capture error here is `OverconstrainedError`.

## Primary references

- LiveKit's default-option merge: https://github.com/livekit/client-sdk-js/blob/main/src/room/track/utils.ts (corroborated against the locally installed 2.21.0 source).
- Constraint error meaning and diagnostic field: https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia

- Audio output failure semantics: https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/setSinkId
