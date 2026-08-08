import {
  DEFAULT_MOBILE_SCREEN_SHARE_QUALITY_ID,
  normalizeMobileScreenShareQualityId,
  type MobileScreenShareQualityId,
} from "./mobile-screen-share";

export type MobileVoiceDeviceKind = "audioinput" | "audiooutput";
export type MobileVoiceOutputLabelKey =
  "bluetooth" | "default" | "earpiece" | "headset" | "other" | "speaker";

export interface MobileVoiceInputDeviceSource {
  readonly deviceId: string;
  readonly label?: string;
}

export interface MobileVoiceInputOption {
  readonly id: string;
  readonly kind: "audioinput";
  readonly label: string | null;
}

export interface MobileVoiceOutputOption {
  readonly id: string;
  readonly kind: "audiooutput";
  readonly labelKey: MobileVoiceOutputLabelKey;
}

export interface MobileVoiceDevicePreferences {
  readonly audioInputId: string | null;
  readonly audioOutputId: string | null;
  readonly noiseSuppressionEnabled: boolean;
  /** Listener-side mute for remote screen-share audio. */
  readonly screenShareAudioMuted: boolean;
  readonly screenShareQualityId: MobileScreenShareQualityId;
}

export interface MobileVoicePreferenceStorage {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
}

export const DEFAULT_MOBILE_VOICE_DEVICE_PREFERENCES: MobileVoiceDevicePreferences = {
  audioInputId: null,
  audioOutputId: null,
  noiseSuppressionEnabled: true,
  screenShareAudioMuted: false,
  screenShareQualityId: DEFAULT_MOBILE_SCREEN_SHARE_QUALITY_ID,
};

export const MOBILE_VOICE_AUDIO_INPUT_STORAGE_KEY = "whispr.mobile.voice.audio-input.v1";
export const MOBILE_VOICE_AUDIO_OUTPUT_STORAGE_KEY = "whispr.mobile.voice.audio-output.v1";
export const MOBILE_VOICE_NOISE_SUPPRESSION_STORAGE_KEY =
  "whispr.mobile.voice.noise-suppression.v1";
export const MOBILE_VOICE_SCREEN_SHARE_QUALITY_STORAGE_KEY =
  "whispr.mobile.voice.screen-share-quality.v1";
export const MOBILE_VOICE_SCREEN_SHARE_AUDIO_MUTED_STORAGE_KEY =
  "whispr.mobile.voice.screen-share-audio-muted.v1";

const MAX_MOBILE_VOICE_DEVICE_ID_LENGTH = 256;
const MAX_MOBILE_VOICE_DEVICE_LABEL_LENGTH = 96;

export function sanitizeMobileVoiceDeviceId(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= MAX_MOBILE_VOICE_DEVICE_ID_LENGTH
    ? normalized
    : null;
}

function sanitizeMobileVoiceDeviceLabel(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized.slice(0, MAX_MOBILE_VOICE_DEVICE_LABEL_LENGTH) : null;
}

function getMobileVoiceOutputLabelKey(id: string): MobileVoiceOutputLabelKey {
  if (id === "force_speaker") {
    return "speaker";
  }

  return id === "bluetooth" ||
    id === "default" ||
    id === "earpiece" ||
    id === "headset" ||
    id === "speaker"
    ? id
    : "other";
}

export function toMobileVoiceInputOptions(
  devices: readonly MobileVoiceInputDeviceSource[],
): MobileVoiceInputOption[] {
  const seen = new Set<string>();
  const options: MobileVoiceInputOption[] = [];

  for (const device of devices) {
    const id = sanitizeMobileVoiceDeviceId(device.deviceId);
    if (!id || seen.has(id)) {
      continue;
    }

    seen.add(id);
    options.push({
      id,
      kind: "audioinput",
      label: sanitizeMobileVoiceDeviceLabel(device.label),
    });
  }

  return options;
}

export function toMobileVoiceOutputOptions(
  deviceIds: readonly string[],
): MobileVoiceOutputOption[] {
  const seen = new Set<string>();
  const options: MobileVoiceOutputOption[] = [];

  for (const rawId of deviceIds) {
    const id = sanitizeMobileVoiceDeviceId(rawId);
    if (!id || seen.has(id)) {
      continue;
    }

    seen.add(id);
    options.push({
      id,
      kind: "audiooutput",
      labelKey: getMobileVoiceOutputLabelKey(id),
    });
  }

  return options;
}

export async function loadMobileVoiceDevicePreferences(
  storage: MobileVoicePreferenceStorage,
): Promise<MobileVoiceDevicePreferences> {
  const [audioInputId, audioOutputId, noiseSuppression, screenShareQuality, screenShareAudioMuted] =
    await Promise.all([
      storage.getItemAsync(MOBILE_VOICE_AUDIO_INPUT_STORAGE_KEY),
      storage.getItemAsync(MOBILE_VOICE_AUDIO_OUTPUT_STORAGE_KEY),
      storage.getItemAsync(MOBILE_VOICE_NOISE_SUPPRESSION_STORAGE_KEY),
      storage.getItemAsync(MOBILE_VOICE_SCREEN_SHARE_QUALITY_STORAGE_KEY),
      storage.getItemAsync(MOBILE_VOICE_SCREEN_SHARE_AUDIO_MUTED_STORAGE_KEY),
    ]);

  return {
    audioInputId: sanitizeMobileVoiceDeviceId(audioInputId),
    audioOutputId: sanitizeMobileVoiceDeviceId(audioOutputId),
    noiseSuppressionEnabled:
      noiseSuppression === "false"
        ? false
        : DEFAULT_MOBILE_VOICE_DEVICE_PREFERENCES.noiseSuppressionEnabled,
    // Only an explicit "true" mutes: a missing or corrupt value must never
    // silence a share the listener never asked to silence.
    screenShareAudioMuted: screenShareAudioMuted === "true",
    screenShareQualityId: normalizeMobileScreenShareQualityId(screenShareQuality),
  };
}

export async function saveMobileVoiceDevicePreferences(
  storage: MobileVoicePreferenceStorage,
  preferences: MobileVoiceDevicePreferences,
): Promise<MobileVoiceDevicePreferences> {
  const normalized: MobileVoiceDevicePreferences = {
    audioInputId: sanitizeMobileVoiceDeviceId(preferences.audioInputId),
    audioOutputId: sanitizeMobileVoiceDeviceId(preferences.audioOutputId),
    noiseSuppressionEnabled: preferences.noiseSuppressionEnabled === false ? false : true,
    screenShareAudioMuted: preferences.screenShareAudioMuted === true,
    screenShareQualityId: normalizeMobileScreenShareQualityId(preferences.screenShareQualityId),
  };

  await Promise.all([
    storage.setItemAsync(MOBILE_VOICE_AUDIO_INPUT_STORAGE_KEY, normalized.audioInputId ?? ""),
    storage.setItemAsync(MOBILE_VOICE_AUDIO_OUTPUT_STORAGE_KEY, normalized.audioOutputId ?? ""),
    storage.setItemAsync(
      MOBILE_VOICE_NOISE_SUPPRESSION_STORAGE_KEY,
      String(normalized.noiseSuppressionEnabled),
    ),
    storage.setItemAsync(
      MOBILE_VOICE_SCREEN_SHARE_QUALITY_STORAGE_KEY,
      normalized.screenShareQualityId,
    ),
    storage.setItemAsync(
      MOBILE_VOICE_SCREEN_SHARE_AUDIO_MUTED_STORAGE_KEY,
      String(normalized.screenShareAudioMuted),
    ),
  ]);

  return normalized;
}
