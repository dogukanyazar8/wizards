"use client";

import type { DesktopPlatformCapabilities, DesktopPlatformFeature } from "@/lib/desktop/controls";

export type DesktopNativeMediaFeatureId =
  "hardwareEncode" | "livekitCustomTrack" | "nativeScreenCapture" | "systemAudioCapture";

export interface DesktopNativeMediaResearchItem {
  fallback: string;
  id: DesktopNativeMediaFeatureId;
  permission: string;
  status: DesktopPlatformFeature["status"] | "unknown";
  strategy: string;
  userControl: string;
}

export const DESKTOP_NATIVE_MEDIA_WEB_FALLBACK = "browser_get_display_media";
export const DESKTOP_SYSTEM_AUDIO_FALLBACK = "no_system_audio_capture";
export const DESKTOP_HARDWARE_ENCODE_FALLBACK = "os_webview_encoder_selection";

function unknownFeature(fallback: string): DesktopPlatformFeature {
  return {
    fallback,
    permission: "unknown",
    status: "unsupported",
    strategy: "unknown",
    userControl: "not_available",
  };
}

function toResearchItem(
  id: DesktopNativeMediaFeatureId,
  feature: DesktopPlatformFeature | undefined,
  fallback: string,
): DesktopNativeMediaResearchItem {
  const resolvedFeature = feature ?? unknownFeature(fallback);

  return {
    fallback: resolvedFeature.fallback || fallback,
    id,
    permission: resolvedFeature.permission || "unknown",
    status: feature?.status ?? "unknown",
    strategy: resolvedFeature.strategy || "unknown",
    userControl: resolvedFeature.userControl || "not_available",
  };
}

export function getDesktopNativeMediaResearchItems(
  capabilities: DesktopPlatformCapabilities | null,
): DesktopNativeMediaResearchItem[] {
  return [
    toResearchItem(
      "nativeScreenCapture",
      capabilities?.nativeScreenCapture,
      DESKTOP_NATIVE_MEDIA_WEB_FALLBACK,
    ),
    toResearchItem(
      "systemAudioCapture",
      capabilities?.systemAudioCapture,
      DESKTOP_SYSTEM_AUDIO_FALLBACK,
    ),
    toResearchItem(
      "livekitCustomTrack",
      capabilities?.livekitCustomTrack,
      "standard_livekit_get_display_media",
    ),
    toResearchItem(
      "hardwareEncode",
      capabilities?.hardwareEncode,
      DESKTOP_HARDWARE_ENCODE_FALLBACK,
    ),
  ];
}

export function isNativeMediaCaptureProductionReady(
  capabilities: DesktopPlatformCapabilities | null,
) {
  if (!capabilities) {
    return false;
  }

  return (
    capabilities.nativeScreenCapture.status === "available" &&
    capabilities.livekitCustomTrack.status === "available"
  );
}

export function canClaimExplicitHardwareEncoderSelection(
  capabilities: DesktopPlatformCapabilities | null,
) {
  return (
    capabilities?.hardwareEncode.status === "available" &&
    capabilities.hardwareEncode.strategy !== "webrtc_codec_hint_telemetry_only"
  );
}

export function getDesktopScreenShareRuntimeMode(capabilities: DesktopPlatformCapabilities | null) {
  if (isNativeMediaCaptureProductionReady(capabilities)) {
    return "native_spike_ready" as const;
  }

  return "web_get_display_media_fallback" as const;
}
