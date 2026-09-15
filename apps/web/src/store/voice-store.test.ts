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
  useVoiceStore,
} from "./voice-store";
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
