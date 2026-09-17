import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_GAME_OVERLAY_PANIC_SHORTCUT,
  DEFAULT_PUSH_TO_TALK_HANGOVER_MS,
  DEFAULT_PUSH_TO_TALK_SHORTCUT,
  DEFAULT_TOGGLE_MUTE_SHORTCUT,
  MAX_PUSH_TO_TALK_HANGOVER_MS,
  isReservedDesktopVoiceShortcut,
  sanitizeDesktopVoiceShortcut,
  sanitizePushToTalkHangoverMs,
  sanitizeUniqueDesktopVoiceShortcut,
  sanitizeScreenShareVolume,
  sanitizeVoiceInputMode,
  sanitizeCameraPreferences,
  DEFAULT_VOICE_CAMERA_PREFERENCES,
  mergePersistedVoiceState,
  partializeVoiceState,
  resolvePersistedScreenShareAxes,
  sanitizeScreenShareContentMode,
  sanitizeScreenShareFrameRate,
  sanitizeScreenShareResolution,
  toLegacyScreenShareQualityId,
  useVoiceStore,
} from "./voice-store";
import type { ScreenShareHealthSnapshot } from "@wizards/types";
import {
  DEFAULT_DESKTOP_GAME_OVERLAY_ANCHOR,
  DEFAULT_DESKTOP_GAME_OVERLAY_SIZE,
  sanitizeDesktopGameOverlayAnchor,
  sanitizeDesktopGameOverlaySize,
} from "@/lib/desktop/voice-mini";

describe("screen share audio volume preference", () => {
  it("audio processing presets update subscribers once and preserve other preferences", () => {
    const before = useVoiceStore.getState();
    const updates: unknown[] = [];
    const unsubscribe = useVoiceStore.subscribe((state) => updates.push(state.audioPreferences));
    try {
      before.setAudioPreferences({
        krispNoiseCancellation: false,
        enhancedNoiseFilterMode: "browser_only",
        noiseSuppression: false,
        voiceIsolation: false,
      });
      const after = useVoiceStore.getState();
      assert.equal(updates.length, 1);
      assert.equal(
        after.audioPreferences.echoCancellation,
        before.audioPreferences.echoCancellation,
      );
      assert.equal(after.audioPreferences.autoGainControl, before.audioPreferences.autoGainControl);
      assert.equal(after.audioPreferences.inputDeviceId, before.audioPreferences.inputDeviceId);
      assert.equal(after.hasConfiguredKrispPreference, true);
    } finally {
      unsubscribe();
      useVoiceStore.setState(before);
    }
  });
  it("keeps the listener ceiling inside 0-100 and rounds it", () => {
    assert.equal(sanitizeScreenShareVolume(0), 0);
    assert.equal(sanitizeScreenShareVolume(45.4), 45);
    assert.equal(sanitizeScreenShareVolume(100), 100);
    assert.equal(sanitizeScreenShareVolume(140), 100);
    assert.equal(sanitizeScreenShareVolume(-20), 0);
  });

  it("falls back to full volume for anything that is not a number", () => {
    assert.equal(sanitizeScreenShareVolume(undefined), 100);
    assert.equal(sanitizeScreenShareVolume(null), 100);
    assert.equal(sanitizeScreenShareVolume("70"), 100);
    assert.equal(sanitizeScreenShareVolume(Number.NaN), 100);
  });
});

describe("voice desktop preference sanitizers", () => {
  it("keeps push-to-talk opt-in mode explicit", () => {
    assert.equal(sanitizeVoiceInputMode("push-to-talk"), "push-to-talk");
    assert.equal(sanitizeVoiceInputMode("voice-activity"), "voice-activity");
    assert.equal(sanitizeVoiceInputMode("unexpected"), "voice-activity");
  });

  it("normalizes desktop shortcut strings without accepting unsafe payloads", () => {
    assert.equal(
      sanitizeDesktopVoiceShortcut(" CmdOrCtrl + Shift + M ", DEFAULT_TOGGLE_MUTE_SHORTCUT),
      "CmdOrCtrl+Shift+M",
    );
    assert.equal(
      sanitizeDesktopVoiceShortcut("Alt+Space\n", DEFAULT_PUSH_TO_TALK_SHORTCUT),
      DEFAULT_PUSH_TO_TALK_SHORTCUT,
    );
    assert.equal(
      sanitizeDesktopVoiceShortcut("Alt+Space", DEFAULT_PUSH_TO_TALK_SHORTCUT),
      DEFAULT_PUSH_TO_TALK_SHORTCUT,
    );
    assert.equal(
      sanitizeDesktopVoiceShortcut("Ctrl+Space", DEFAULT_PUSH_TO_TALK_SHORTCUT),
      DEFAULT_PUSH_TO_TALK_SHORTCUT,
    );
    assert.equal(
      sanitizeDesktopVoiceShortcut("Alt+Tab", DEFAULT_PUSH_TO_TALK_SHORTCUT),
      DEFAULT_PUSH_TO_TALK_SHORTCUT,
    );
    assert.equal(
      sanitizeDesktopVoiceShortcut("Alt+F4", DEFAULT_PUSH_TO_TALK_SHORTCUT),
      DEFAULT_PUSH_TO_TALK_SHORTCUT,
    );
    assert.equal(DEFAULT_PUSH_TO_TALK_SHORTCUT, "Alt+V");
    assert.equal(
      sanitizeDesktopVoiceShortcut("A".repeat(65), DEFAULT_PUSH_TO_TALK_SHORTCUT),
      DEFAULT_PUSH_TO_TALK_SHORTCUT,
    );
    assert.equal(
      sanitizeDesktopVoiceShortcut("", DEFAULT_GAME_OVERLAY_PANIC_SHORTCUT),
      DEFAULT_GAME_OVERLAY_PANIC_SHORTCUT,
    );
  });

  it("rejects reserved shortcuts and prevents duplicate desktop shortcut assignments", () => {
    assert.equal(isReservedDesktopVoiceShortcut("Ctrl+Space"), true);
    assert.equal(isReservedDesktopVoiceShortcut("CmdOrCtrl+Shift+Space"), true);
    assert.equal(isReservedDesktopVoiceShortcut("Control+Shift+H"), true);
    assert.equal(isReservedDesktopVoiceShortcut("Meta+Shift+V"), true);
    assert.equal(isReservedDesktopVoiceShortcut("Alt+V"), false);
    assert.equal(
      sanitizeUniqueDesktopVoiceShortcut(
        DEFAULT_TOGGLE_MUTE_SHORTCUT,
        DEFAULT_PUSH_TO_TALK_SHORTCUT,
        [DEFAULT_TOGGLE_MUTE_SHORTCUT],
        DEFAULT_PUSH_TO_TALK_SHORTCUT,
      ),
      DEFAULT_PUSH_TO_TALK_SHORTCUT,
    );
  });

  it("clamps push-to-talk release cushion values", () => {
    assert.equal(sanitizePushToTalkHangoverMs(-1), 0);
    assert.equal(sanitizePushToTalkHangoverMs(177.8), 178);
    assert.equal(sanitizePushToTalkHangoverMs(9999), MAX_PUSH_TO_TALK_HANGOVER_MS);
    assert.equal(sanitizePushToTalkHangoverMs(Number.NaN), DEFAULT_PUSH_TO_TALK_HANGOVER_MS);
  });

  it("keeps desktop overlay layout choices bounded", () => {
    assert.equal(sanitizeDesktopGameOverlayAnchor("bottom-right"), "bottom-right");
    assert.equal(sanitizeDesktopGameOverlayAnchor("center"), DEFAULT_DESKTOP_GAME_OVERLAY_ANCHOR);
    assert.equal(sanitizeDesktopGameOverlaySize("large"), "large");
    assert.equal(sanitizeDesktopGameOverlaySize("full-screen"), DEFAULT_DESKTOP_GAME_OVERLAY_SIZE);
  });
});

it("camera preferences migrate old data and reject unsupported persisted quality", () => {
  assert.deepEqual(sanitizeCameraPreferences({}), DEFAULT_VOICE_CAMERA_PREFERENCES);
  assert.equal(sanitizeCameraPreferences({ quality: "h720", frameRate: 15 }).frameRate, 15);
  assert.equal(sanitizeCameraPreferences({ quality: "h720", frameRate: 15 }).quality, "h720");
  assert.equal(sanitizeCameraPreferences({ quality: "4k", frameRate: 240 }).quality, "h1080");
  assert.equal(sanitizeCameraPreferences({ frameRate: 240 }).frameRate, 30);
});

/** Ekran paylaşımı paketi Ş0.1 — K4 eksenleri, K20 varsayılanları, migration. */
describe("screen share quality axes (K4)", () => {
  const sendSample: ScreenShareHealthSnapshot = {
    direction: "send",
    sampledAt: 1,
    fps: 60,
    width: 1920,
    height: 1080,
    bitrateKbps: null,
    qualityLimitationReason: "none",
    qualityLimitationDurationsMs: { none: 0, cpu: 0, bandwidth: 0, other: 0 },
    encoderImplementation: "libvpx",
    decoderImplementation: null,
    powerEfficientEncoder: false,
    framesDropped: null,
    freezeCount: null,
    totalFreezesDurationMs: null,
    jitterBufferDelayMs: null,
    packetsLost: 0,
    roundTripTimeMs: 20,
  };
  const receiveSample: ScreenShareHealthSnapshot = {
    ...sendSample,
    direction: "receive",
    encoderImplementation: null,
    decoderImplementation: "libvpx",
    qualityLimitationReason: null,
    qualityLimitationDurationsMs: null,
  };

  function withStore(run: () => void) {
    const before = useVoiceStore.getState();
    try {
      run();
    } finally {
      useVoiceStore.setState(before, true);
    }
  }

  it("starts at 1080p · 60 fps · text, with K20 audio defaults and no session fields", () => {
    const state = useVoiceStore.getState();

    assert.equal(state.screenShareResolution, "h1080");
    assert.equal(state.screenShareFrameRate, 60);
    assert.equal(state.screenShareContentMode, "text");
    assert.equal(state.screenShareQuality, "h1080fps60");
    assert.equal(state.screenShare4kAllowed, false);
    assert.equal(state.screenShareHealth, null);
    assert.deepEqual(state.screenShareViewerCounts, {});
    assert.equal(state.goLive, null);
    assert.equal(state.screenShareStreamInfo, null);
    // K20 — tree defaults follow the store: e2 off, e3 100.
    assert.equal(state.screenShareAudioEnabled, false);
    assert.equal(state.screenShareVolume, 100);
  });

  it("derives the legacy quality id from the resolution axis, clamped to the old ladder", () => {
    withStore(() => {
      useVoiceStore.getState().setScreenShareResolution("h2160");
      assert.equal(useVoiceStore.getState().screenShareResolution, "h2160");
      assert.equal(useVoiceStore.getState().screenShareQuality, "h1440fps60");

      useVoiceStore.getState().setScreenShareFrameRate(15);
      assert.equal(useVoiceStore.getState().screenShareFrameRate, 15);
      assert.equal(useVoiceStore.getState().screenShareQuality, "h1440fps60");

      useVoiceStore.getState().setScreenShareResolution("h720");
      assert.equal(useVoiceStore.getState().screenShareQuality, "h720fps60");
    });

    assert.equal(toLegacyScreenShareQualityId("h2160"), "h1440fps60");
    assert.equal(toLegacyScreenShareQualityId("h1080"), "h1080fps60");
  });

  it("routes the legacy setter through the split so both axes stay the source of truth", () => {
    withStore(() => {
      useVoiceStore.getState().setScreenShareQuality("h1440fps60");
      assert.equal(useVoiceStore.getState().screenShareResolution, "h1440");
      assert.equal(useVoiceStore.getState().screenShareFrameRate, 60);
      assert.equal(useVoiceStore.getState().screenShareQuality, "h1440fps60");

      const before = useVoiceStore.getState();
      useVoiceStore.getState().setScreenShareQuality("not-a-preset" as never);
      assert.equal(useVoiceStore.getState(), before);
    });
  });

  it("sanitizes each axis and the content mode", () => {
    assert.equal(sanitizeScreenShareResolution("h1440"), "h1440");
    assert.equal(sanitizeScreenShareResolution("h4320"), "h1080");
    assert.equal(sanitizeScreenShareFrameRate(15), 15);
    assert.equal(sanitizeScreenShareFrameRate("60"), 60);
    assert.equal(sanitizeScreenShareFrameRate(24), 60);
    assert.equal(sanitizeScreenShareContentMode("motion"), "motion");
    assert.equal(sanitizeScreenShareContentMode("balanced"), "text");

    withStore(() => {
      useVoiceStore.getState().setScreenShareContentMode("motion");
      assert.equal(useVoiceStore.getState().screenShareContentMode, "motion");
      useVoiceStore.getState().setScreenShareContentMode("nope" as never);
      assert.equal(useVoiceStore.getState().screenShareContentMode, "text");
    });
  });

  it("splits the old single `screenShareQuality` on rehydrate — aliases become real 30 fps", () => {
    assert.deepEqual(resolvePersistedScreenShareAxes({ screenShareQuality: "h1080fps60" }), {
      frameRate: 60,
      resolution: "h1080",
    });
    // `h720fps30` was an alias for 720p60 on the web; frame rate is its own axis now, so the
    // stored 30 is honoured rather than lifted to 60.
    assert.deepEqual(resolvePersistedScreenShareAxes({ screenShareQuality: "h720fps30" }), {
      frameRate: 30,
      resolution: "h720",
    });
    assert.deepEqual(resolvePersistedScreenShareAxes({ screenShareQuality: "4k" }), {
      frameRate: 60,
      resolution: "h1080",
    });
    assert.deepEqual(resolvePersistedScreenShareAxes(null), {
      frameRate: 60,
      resolution: "h1080",
    });
    // New axes win over a stale legacy value left behind by an older build.
    assert.deepEqual(
      resolvePersistedScreenShareAxes({
        screenShareFrameRate: 15,
        screenShareQuality: "h720fps60",
        screenShareResolution: "h2160",
      }),
      { frameRate: 15, resolution: "h2160" },
    );
    assert.deepEqual(resolvePersistedScreenShareAxes({ screenShareResolution: "h1440" }), {
      frameRate: 60,
      resolution: "h1440",
    });
  });

  it("merges persisted state through the split and drops the legacy key from persistence", () => {
    const merged = mergePersistedVoiceState(
      { screenShareQuality: "h720fps30", screenShareContentMode: "motion" },
      useVoiceStore.getState(),
    );
    assert.equal(merged.screenShareResolution, "h720");
    assert.equal(merged.screenShareFrameRate, 30);
    assert.equal(merged.screenShareContentMode, "motion");
    assert.equal(merged.screenShareQuality, "h720fps60");
    assert.equal(merged.screenShareAudioEnabled, false);
    assert.equal(merged.screenShareVolume, 100);

    const persisted = partializeVoiceState(merged) as Record<string, unknown>;
    assert.equal("screenShareQuality" in persisted, false);
    assert.equal(persisted.screenShareResolution, "h720");
    assert.equal(persisted.screenShareFrameRate, 30);
    assert.equal(persisted.screenShareContentMode, "motion");
    for (const sessionKey of [
      "screenShare4kAllowed",
      "screenShareHealth",
      "screenShareViewerCounts",
      "goLive",
      "screenShareStreamInfo",
    ]) {
      assert.equal(sessionKey in persisted, false, sessionKey);
    }
  });

  it("holds the health sample, viewer counts, Go Live and stream info as session state", () => {
    withStore(() => {
      const store = useVoiceStore.getState();
      store.setScreenShare4kAllowed(true);
      store.setScreenShareHealth(sendSample);
      store.setScreenShareViewerCount("user-1", 2.6);
      store.setScreenShareViewerCount("user-2", -3);
      store.setGoLive({ gameId: "custom:0a1b2c3d4e5f", label: "Hades" });
      store.setScreenShareStreamInfo({ kind: "game", gameId: "valorant", label: null });

      const next = useVoiceStore.getState();
      assert.equal(next.screenShare4kAllowed, true);
      assert.equal(next.screenShareHealth, sendSample);
      assert.deepEqual(next.screenShareViewerCounts, { "user-1": 3, "user-2": 0 });
      assert.deepEqual(next.goLive, { gameId: "custom:0a1b2c3d4e5f", label: "Hades" });
      assert.deepEqual(next.screenShareStreamInfo, {
        kind: "game",
        gameId: "valorant",
        label: null,
      });

      next.clearScreenShareViewerCount("user-2");
      assert.deepEqual(useVoiceStore.getState().screenShareViewerCounts, { "user-1": 3 });

      // Own share ended: the send sample is stale, Go Live and stream info are gone.
      next.clearScreenShareState();
      const cleared = useVoiceStore.getState();
      assert.equal(cleared.screenShareHealth, null);
      assert.equal(cleared.goLive, null);
      assert.equal(cleared.screenShareStreamInfo, null);
      assert.deepEqual(cleared.screenShareViewerCounts, { "user-1": 3 });
      assert.equal(cleared.screenShare4kAllowed, true);

      // A sample from a share we are *watching* survives our own share ending.
      cleared.setScreenShareHealth(receiveSample);
      cleared.clearScreenShareState();
      assert.equal(useVoiceStore.getState().screenShareHealth, receiveSample);

      useVoiceStore.getState().leave();
      const left = useVoiceStore.getState();
      assert.equal(left.screenShareHealth, null);
      assert.deepEqual(left.screenShareViewerCounts, {});
      assert.equal(left.goLive, null);
      assert.equal(left.screenShareStreamInfo, null);
      // Preferences are not session state.
      assert.equal(left.screenShareResolution, "h1080");
      assert.equal(left.screenShareContentMode, "text");
    });
  });
});
