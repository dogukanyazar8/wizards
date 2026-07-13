import type { VideoCaptureOptions } from "livekit-client";

export type MobileCameraFacingMode = "environment" | "user";

export const DEFAULT_MOBILE_CAMERA_FACING_MODE: MobileCameraFacingMode = "user";

export function sanitizeMobileCameraFacingMode(value: unknown): MobileCameraFacingMode {
  return value === "environment" ? "environment" : DEFAULT_MOBILE_CAMERA_FACING_MODE;
}

export function getNextMobileCameraFacingMode(
  current: MobileCameraFacingMode,
): MobileCameraFacingMode {
  return current === "user" ? "environment" : "user";
}

export function getMobileCameraCaptureOptions(
  facingMode: MobileCameraFacingMode,
): VideoCaptureOptions {
  return { facingMode };
}
