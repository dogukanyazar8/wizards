import { DEFAULT_AUDIO_DEVICE_ID } from "@/store/voice-store";

export const DEFAULT_COMMUNICATIONS_DEVICE_ID = "communications";

export type AudioDeviceFallbackOption = {
  deviceId: string;
  kind?: string;
};

export type AudioDeviceFallbackReason =
  | "first-valid"
  | "selected"
  | "system-communications"
  | "system-default";

export type AudioDeviceFallbackResult = {
  changed: boolean;
  deviceId: string;
  reason: AudioDeviceFallbackReason;
};

function isValidDeviceId(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function hasDevice(devices: ReadonlyArray<AudioDeviceFallbackOption>, deviceId: string) {
  return devices.some((device) => device.deviceId === deviceId);
}

function findFirstRealDevice(devices: ReadonlyArray<AudioDeviceFallbackOption>) {
  return devices.find(
    (device) =>
      isValidDeviceId(device.deviceId) &&
      device.deviceId !== DEFAULT_AUDIO_DEVICE_ID &&
      device.deviceId !== DEFAULT_COMMUNICATIONS_DEVICE_ID,
  );
}

export function resolveAudioDeviceFallback({
  devices,
  preferredDeviceId,
}: {
  devices: ReadonlyArray<AudioDeviceFallbackOption>;
  preferredDeviceId: string;
}): AudioDeviceFallbackResult {
  const normalizedPreferred = isValidDeviceId(preferredDeviceId)
    ? preferredDeviceId.trim()
    : DEFAULT_AUDIO_DEVICE_ID;

  if (normalizedPreferred === DEFAULT_AUDIO_DEVICE_ID) {
    return {
      changed: false,
      deviceId: DEFAULT_AUDIO_DEVICE_ID,
      reason: "system-default",
    };
  }

  if (
    normalizedPreferred !== DEFAULT_COMMUNICATIONS_DEVICE_ID &&
    hasDevice(devices, normalizedPreferred)
  ) {
    return {
      changed: false,
      deviceId: normalizedPreferred,
      reason: "selected",
    };
  }

  if (hasDevice(devices, DEFAULT_COMMUNICATIONS_DEVICE_ID)) {
    return {
      changed: normalizedPreferred !== DEFAULT_COMMUNICATIONS_DEVICE_ID,
      deviceId: DEFAULT_COMMUNICATIONS_DEVICE_ID,
      reason: "system-communications",
    };
  }

  if (
    normalizedPreferred === DEFAULT_AUDIO_DEVICE_ID ||
    hasDevice(devices, DEFAULT_AUDIO_DEVICE_ID) ||
    devices.length === 0
  ) {
    return {
      changed: normalizedPreferred !== DEFAULT_AUDIO_DEVICE_ID,
      deviceId: DEFAULT_AUDIO_DEVICE_ID,
      reason: "system-default",
    };
  }

  const firstValidDevice = findFirstRealDevice(devices);
  if (firstValidDevice) {
    return {
      changed: normalizedPreferred !== firstValidDevice.deviceId,
      deviceId: firstValidDevice.deviceId,
      reason: "first-valid",
    };
  }

  return {
    changed: normalizedPreferred !== DEFAULT_AUDIO_DEVICE_ID,
    deviceId: DEFAULT_AUDIO_DEVICE_ID,
    reason: "system-default",
  };
}
