import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DesktopPlatformCapabilities } from "@/lib/desktop/controls";
import {
  canClaimExplicitHardwareEncoderSelection,
  getDesktopNativeMediaResearchItems,
  getDesktopScreenShareRuntimeMode,
  isNativeMediaCaptureProductionReady,
} from "@/lib/desktop/native-media";

const researchCapabilities: DesktopPlatformCapabilities = {
  arch: "x86_64",
  hardwareEncode: {
    fallback: "os_webview_encoder_selection",
    permission: "not_applicable",
    status: "research_gated",
    strategy: "webrtc_codec_hint_telemetry_only",
    userControl: "codec_hint_only",
  },
  livekitCustomTrack: {
    fallback: "standard_livekit_get_display_media",
    permission: "user_initiated_capture_required",
    status: "research_gated",
    strategy: "livekit_custom_track_factory_spike",
    userControl: "explicit_user_permission_required",
  },
  nativeScreenCapture: {
    fallback: "browser_get_display_media",
    permission: "windows_graphics_capture_picker_required",
    status: "research_gated",
    strategy: "windows_graphics_capture_spike",
    userControl: "explicit_user_permission_required",
  },
  platform: "windows",
  richPresence: {
    fallback: "none",
    permission: "not_applicable",
    status: "available",
    strategy: "local_window_and_tray_activity",
    userControl: "opt_in",
  },
  systemAudioCapture: {
    fallback: "no_system_audio_capture",
    permission: "loopback_capture_user_opt_in_required",
    status: "research_gated",
    strategy: "wasapi_loopback_spike",
    userControl: "explicit_user_permission_required",
  },
};

describe("desktop native media research contract", () => {
  it("keeps native capture behind the WebRTC fallback until the custom track spike is available", () => {
    assert.equal(isNativeMediaCaptureProductionReady(researchCapabilities), false);
    assert.equal(
      getDesktopScreenShareRuntimeMode(researchCapabilities),
      "web_get_display_media_fallback",
    );
  });

  it("does not claim explicit hardware encoder selection for WebRTC codec hints", () => {
    assert.equal(canClaimExplicitHardwareEncoderSelection(researchCapabilities), false);
  });

  it("preserves permission and fallback details for diagnostics without PII", () => {
    const items = getDesktopNativeMediaResearchItems(researchCapabilities);

    assert.deepEqual(
      items.map((item) => item.id),
      ["nativeScreenCapture", "systemAudioCapture", "livekitCustomTrack", "hardwareEncode"],
    );
    assert.equal(items[0]?.fallback, "browser_get_display_media");
    assert.equal(items[1]?.permission, "loopback_capture_user_opt_in_required");
    assert.equal(
      items.some((item) => /email|token|server|channel/i.test(JSON.stringify(item))),
      false,
    );
  });
});
