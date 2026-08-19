import { DEFAULT_COMMUNICATIONS_DEVICE_ID } from "@/lib/voice/audio-device-fallback";
import { DEFAULT_AUDIO_DEVICE_ID } from "@/store/voice-store";

export type AudioDeviceDescriptor = {
  deviceId: string;
  groupId: string;
  kind: "audioinput" | "audiooutput";
  label: string;
};

type AudioDeviceOptionLabels = {
  communications: string;
  default: string;
  fallback: (index: number) => string;
};

function normalizePseudoDeviceTarget(label: string) {
  const separatorIndex = label.indexOf(" - ");
  const target = separatorIndex >= 0 ? label.slice(separatorIndex + 3) : label;
  return target.trim().toLocaleLowerCase();
}

function resolveSamePseudoDeviceTarget(
  defaultDevice: AudioDeviceDescriptor,
  communicationsDevice: AudioDeviceDescriptor,
) {
  if (defaultDevice.groupId && communicationsDevice.groupId) {
    return defaultDevice.groupId === communicationsDevice.groupId;
  }

  const defaultTarget = normalizePseudoDeviceTarget(defaultDevice.label);
  const communicationsTarget = normalizePseudoDeviceTarget(communicationsDevice.label);
  return Boolean(defaultTarget && communicationsTarget && defaultTarget === communicationsTarget);
}

export function buildAudioDeviceOptions(
  kind: AudioDeviceDescriptor["kind"],
  devices: ReadonlyArray<AudioDeviceDescriptor>,
  labels: AudioDeviceOptionLabels,
): AudioDeviceDescriptor[] {
  const defaultDevice = devices.find((device) => device.deviceId === DEFAULT_AUDIO_DEVICE_ID);
  const communicationsDevice = devices.find(
    (device) => device.deviceId === DEFAULT_COMMUNICATIONS_DEVICE_ID,
  );
  const hideCommunications = Boolean(
    defaultDevice &&
    communicationsDevice &&
    resolveSamePseudoDeviceTarget(defaultDevice, communicationsDevice),
  );
  const normalizedDevices = devices
    .filter(
      (device) => !(hideCommunications && device.deviceId === DEFAULT_COMMUNICATIONS_DEVICE_ID),
    )
    .map((device, index) => ({
      ...device,
      label:
        device.deviceId === DEFAULT_AUDIO_DEVICE_ID
          ? labels.default
          : device.deviceId === DEFAULT_COMMUNICATIONS_DEVICE_ID
            ? labels.communications
            : device.label || labels.fallback(index),
    }));

  if (defaultDevice) {
    return normalizedDevices;
  }

  return [
    {
      deviceId: DEFAULT_AUDIO_DEVICE_ID,
      groupId: "",
      kind,
      label: labels.default,
    },
    ...normalizedDevices,
  ];
}
