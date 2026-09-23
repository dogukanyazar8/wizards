"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { requireBrowserLocalStorage } from "@/lib/browser-local-storage";
import type { ScreenShareQualityId } from "@/lib/voice/screen-share";
import {
  DEFAULT_DESKTOP_GAME_OVERLAY_ANCHOR,
  DEFAULT_DESKTOP_GAME_OVERLAY_SIZE,
  DEFAULT_DESKTOP_GAME_OVERLAY_SPEAKING_ONLY,
  sanitizeDesktopGameOverlayAnchor,
  sanitizeDesktopGameOverlaySize,
} from "@/lib/desktop/voice-mini";
import {
  type DesktopGameOverlayGamePreference,
  type DesktopGameOverlayGameSettings,
  sanitizeDesktopGameOverlayGamePreference,
  sanitizeDesktopGameOverlayGameSettings,
  normalizeDesktopExecutableName,
} from "@/lib/desktop/game-overlay-process";
import {
  DEFAULT_SCREEN_SHARE_FRAME_RATE,
  DEFAULT_SCREEN_SHARE_MODE,
  DEFAULT_SCREEN_SHARE_RESOLUTION,
  ScreenShareFrameRateSchema,
  ScreenShareModeSchema,
  ScreenShareResolutionSchema,
  splitScreenShareQualityId,
  type ScreenShareFrameRate,
  type ScreenShareHealthSnapshot,
  type ScreenShareMode,
  type ScreenShareResolution,
  type ScreenShareStreamInfo,
  type VoiceOverlayAnchor,
  type VoiceOverlaySize,
} from "@wizards/types";
import { isEnhancedNoiseFilterMode, type EnhancedNoiseFilterMode } from "@/lib/voice/noise-filter";
import { isApplicationShortcutAccelerator } from "@/lib/shortcuts/reserved";

export const DEFAULT_PARTICIPANT_VOLUME = 100;
export const MAX_PARTICIPANT_VOLUME = 100;
export const MIN_PARTICIPANT_VOLUME = 0;
export const DEFAULT_AUDIO_DEVICE_ID = "default";
export const DEFAULT_CAMERA_DEVICE_ID = DEFAULT_AUDIO_DEVICE_ID;
export const VOICE_PREFERENCES_STORAGE_KEY = "wizards-voice";
export const DEFAULT_PUSH_TO_TALK_HANGOVER_MS = 200;
export const DEFAULT_GAME_OVERLAY_PANIC_SHORTCUT = "CmdOrCtrl+Shift+O";
/** F9: detaches the moderation console from wherever the moderator is. */
export const DEFAULT_ADMIN_CONSOLE_SHORTCUT = "CmdOrCtrl+Shift+J";
export const DEFAULT_PUSH_TO_TALK_SHORTCUT = "Alt+V";
export const DEFAULT_TOGGLE_DEAFEN_SHORTCUT = "CmdOrCtrl+Shift+D";
export const DEFAULT_TOGGLE_MUTE_SHORTCUT = "CmdOrCtrl+Shift+M";
export const MAX_PUSH_TO_TALK_HANGOVER_MS = 750;
export const MIN_PUSH_TO_TALK_HANGOVER_MS = 0;

const RESERVED_DESKTOP_VOICE_SHORTCUTS = new Set([
  "alt+escape",
  "alt+f4",
  "alt+space",
  "alt+tab",
  "cmdorctrl+space",
  "control+space",
  "ctrl+alt+delete",
  "ctrl+space",
  "meta+space",
  "super+space",
]);

export type VoiceInputMode = "push-to-talk" | "voice-activity";

export interface VoiceAudioPreferences {
  autoGainControl: boolean;
  echoCancellation: boolean;
  enhancedNoiseFilterMode: EnhancedNoiseFilterMode;
  inputDeviceId: string;
  krispNoiseCancellation: boolean;
  noiseSuppression: boolean;
  outputDeviceId: string;
  voiceIsolation: boolean;
}

export const DEFAULT_VOICE_AUDIO_PREFERENCES: VoiceAudioPreferences = {
  autoGainControl: true,
  echoCancellation: true,
  enhancedNoiseFilterMode: "layered",
  inputDeviceId: DEFAULT_AUDIO_DEVICE_ID,
  krispNoiseCancellation: true,
  noiseSuppression: true,
  outputDeviceId: DEFAULT_AUDIO_DEVICE_ID,
  voiceIsolation: true,
};

export type VoiceCameraRotation = 0 | 90 | 180 | 270;

export interface VoiceCameraPreferences {
  backgroundBlur: boolean;
  deviceId: string;
  mirrorPreview: boolean;
  rotation: VoiceCameraRotation;
  quality: "h720" | "h1080";
  frameRate: 15 | 30;
}

export const DEFAULT_VOICE_CAMERA_PREFERENCES: VoiceCameraPreferences = {
  backgroundBlur: false,
  deviceId: DEFAULT_CAMERA_DEVICE_ID,
  mirrorPreview: true,
  rotation: 0,
  quality: "h1080",
  frameRate: 30,
};

const CLEAN_VOICE_PROCESSING_VERSION = 2;

function clampParticipantVolume(value: number) {
  return Math.min(MAX_PARTICIPANT_VOLUME, Math.max(MIN_PARTICIPANT_VOLUME, Math.round(value)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Listener-side ceiling on a shared surface's audio, in percent. It multiplies
 * the sharer's participant volume rather than replacing it, so the two controls
 * never fight: whichever is lower wins.
 */
export const DEFAULT_SCREEN_SHARE_VOLUME = 100;

export function sanitizeScreenShareVolume(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_SCREEN_SHARE_VOLUME;
  }

  return clampParticipantVolume(value);
}

function sanitizeParticipantVolumes(value: unknown): Record<string, number> {
  if (!isRecord(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).flatMap(([userId, volume]) =>
      typeof volume === "number" && Number.isFinite(volume)
        ? [[userId, clampParticipantVolume(volume)]]
        : [],
    ),
  );
}

export function sanitizeAudioPreferences(value: unknown): VoiceAudioPreferences {
  if (!isRecord(value)) {
    return DEFAULT_VOICE_AUDIO_PREFERENCES;
  }

  return {
    autoGainControl:
      typeof value.autoGainControl === "boolean"
        ? value.autoGainControl
        : DEFAULT_VOICE_AUDIO_PREFERENCES.autoGainControl,
    echoCancellation:
      typeof value.echoCancellation === "boolean"
        ? value.echoCancellation
        : DEFAULT_VOICE_AUDIO_PREFERENCES.echoCancellation,
    enhancedNoiseFilterMode: isEnhancedNoiseFilterMode(value.enhancedNoiseFilterMode)
      ? value.enhancedNoiseFilterMode
      : DEFAULT_VOICE_AUDIO_PREFERENCES.enhancedNoiseFilterMode,
    inputDeviceId:
      typeof value.inputDeviceId === "string" && value.inputDeviceId.trim()
        ? value.inputDeviceId
        : DEFAULT_VOICE_AUDIO_PREFERENCES.inputDeviceId,
    krispNoiseCancellation:
      typeof value.krispNoiseCancellation === "boolean"
        ? value.krispNoiseCancellation
        : DEFAULT_VOICE_AUDIO_PREFERENCES.krispNoiseCancellation,
    noiseSuppression:
      typeof value.noiseSuppression === "boolean"
        ? value.noiseSuppression
        : DEFAULT_VOICE_AUDIO_PREFERENCES.noiseSuppression,
    outputDeviceId:
      typeof value.outputDeviceId === "string" && value.outputDeviceId.trim()
        ? value.outputDeviceId
        : DEFAULT_VOICE_AUDIO_PREFERENCES.outputDeviceId,
    voiceIsolation:
      typeof value.voiceIsolation === "boolean"
        ? value.voiceIsolation
        : DEFAULT_VOICE_AUDIO_PREFERENCES.voiceIsolation,
  };
}

function sanitizeCameraRotation(value: unknown): VoiceCameraRotation {
  return value === 90 || value === 180 || value === 270 ? value : 0;
}

export function sanitizeCameraPreferences(value: unknown): VoiceCameraPreferences {
  if (!isRecord(value)) {
    return DEFAULT_VOICE_CAMERA_PREFERENCES;
  }

  return {
    backgroundBlur:
      typeof value.backgroundBlur === "boolean"
        ? value.backgroundBlur
        : DEFAULT_VOICE_CAMERA_PREFERENCES.backgroundBlur,
    deviceId:
      typeof value.deviceId === "string" && value.deviceId.trim()
        ? value.deviceId
        : DEFAULT_VOICE_CAMERA_PREFERENCES.deviceId,
    mirrorPreview:
      typeof value.mirrorPreview === "boolean"
        ? value.mirrorPreview
        : DEFAULT_VOICE_CAMERA_PREFERENCES.mirrorPreview,
    rotation: sanitizeCameraRotation(value.rotation),
    quality: value.quality === "h720" ? "h720" : "h1080",
    frameRate: value.frameRate === 15 ? 15 : 30,
  };
}

function needsCleanVoiceMigration(value: unknown) {
  return !isRecord(value) || value.audioProcessingVersion !== CLEAN_VOICE_PROCESSING_VERSION;
}

function applyCleanVoiceDefaults(preferences: VoiceAudioPreferences) {
  return {
    ...preferences,
    autoGainControl: true,
    echoCancellation: true,
    krispNoiseCancellation: true,
    noiseSuppression: true,
    voiceIsolation: true,
  };
}

/**
 * K4 — kalite üç eksene ayrıldı: katman (`h720…h2160`), kare hızı (`15|30|60`) ve mod
 * (`text|motion`). Üçü de cihazda kalır; sunucuya gitmez.
 */
export function sanitizeScreenShareResolution(value: unknown): ScreenShareResolution {
  const parsed = ScreenShareResolutionSchema.safeParse(value);
  return parsed.success ? parsed.data : DEFAULT_SCREEN_SHARE_RESOLUTION;
}

export function sanitizeScreenShareFrameRate(value: unknown): ScreenShareFrameRate {
  const parsed = ScreenShareFrameRateSchema.safeParse(value);
  return parsed.success ? parsed.data : DEFAULT_SCREEN_SHARE_FRAME_RATE;
}

export function sanitizeScreenShareContentMode(value: unknown): ScreenShareMode {
  const parsed = ScreenShareModeSchema.safeParse(value);
  return parsed.success ? parsed.data : DEFAULT_SCREEN_SHARE_MODE;
}

/**
 * Geçiş köprüsü. Eski `screenShareQuality` tüketicileri (`voice-context.tsx`,
 * `live-voice-provider.tsx`, `voice-channel-view.tsx`) üç değerli `ScreenShareQualityId`
 * tipini okuyor; Ş1 onları iki eksene geçirene kadar store bu alanı türetilmiş olarak taşır.
 * Eski presetlerin tek kare hızı 60 ve tavanı 1440p: 4K katmanı 1440p60'a, her fps 60'a
 * kırpılır. Tam preset id'si için `resolveScreenSharePresetId(resolution, frameRate)`.
 */
const LEGACY_SCREEN_SHARE_QUALITY_BY_RESOLUTION: Readonly<
  Record<ScreenShareResolution, ScreenShareQualityId>
> = {
  h720: "h720fps60",
  h1080: "h1080fps60",
  h1440: "h1440fps60",
  h2160: "h1440fps60",
};

export function toLegacyScreenShareQualityId(
  resolution: ScreenShareResolution,
): ScreenShareQualityId {
  return LEGACY_SCREEN_SHARE_QUALITY_BY_RESOLUTION[resolution];
}

function screenShareAxesPatch(resolution: ScreenShareResolution, frameRate: ScreenShareFrameRate) {
  return {
    screenShareFrameRate: frameRate,
    screenShareQuality: toLegacyScreenShareQualityId(resolution),
    screenShareResolution: resolution,
  };
}

/**
 * Rehydrate: yeni eksen alanları varsa onlar kazanır; yoksa eski tek alan `screenShareQuality`
 * (`h1080fps60`, alias'lı `h720fps30` …) `splitScreenShareQualityId` ile ikiye ayrıştırılır ve
 * bir daha yazılmaz (`partialize` dışında). Alias artık gerçek 30 fps'e çözülür: web eskiden
 * `h720fps30`'u 60'a alias'lıyordu, ama kare hızı ayrı bir eksen olduğundan kullanıcının
 * seçtiği 30 korunur.
 */
export function resolvePersistedScreenShareAxes(persisted: unknown): {
  frameRate: ScreenShareFrameRate;
  resolution: ScreenShareResolution;
} {
  if (!isRecord(persisted)) {
    return {
      frameRate: DEFAULT_SCREEN_SHARE_FRAME_RATE,
      resolution: DEFAULT_SCREEN_SHARE_RESOLUTION,
    };
  }

  const resolution = ScreenShareResolutionSchema.safeParse(persisted.screenShareResolution);
  const frameRate = ScreenShareFrameRateSchema.safeParse(persisted.screenShareFrameRate);
  if (resolution.success || frameRate.success) {
    return {
      frameRate: frameRate.success ? frameRate.data : DEFAULT_SCREEN_SHARE_FRAME_RATE,
      resolution: resolution.success ? resolution.data : DEFAULT_SCREEN_SHARE_RESOLUTION,
    };
  }

  const legacy = splitScreenShareQualityId(persisted.screenShareQuality);
  return legacy
    ? { frameRate: legacy.frameRate, resolution: legacy.resolution }
    : {
        frameRate: DEFAULT_SCREEN_SHARE_FRAME_RATE,
        resolution: DEFAULT_SCREEN_SHARE_RESOLUTION,
      };
}

export interface VoiceGoLiveSession {
  /** Katalog id'si veya `custom:<id>` (K22). Exe adı **asla**. */
  gameId: string;
  label: string;
}

export function sanitizeVoiceInputMode(value: unknown): VoiceInputMode {
  return value === "push-to-talk" ? "push-to-talk" : "voice-activity";
}

export function sanitizeDesktopVoiceShortcut(value: unknown, fallback: string) {
  if (typeof value !== "string") {
    return fallback;
  }

  const normalized = value.replace(/\s+/g, "").trim();
  if (
    normalized.length === 0 ||
    normalized.length > 64 ||
    /[\0\r\n]/u.test(normalized) ||
    isReservedDesktopVoiceShortcut(normalized)
  ) {
    return fallback;
  }

  return normalized;
}

function normalizeDesktopShortcutForComparison(value: string) {
  return value.replace(/\s+/g, "").trim().toLowerCase();
}

export function isReservedDesktopVoiceShortcut(value: string) {
  const normalizedKey = normalizeDesktopShortcutForComparison(value);
  return (
    RESERVED_DESKTOP_VOICE_SHORTCUTS.has(normalizedKey) ||
    normalizedKey.endsWith("+space") ||
    isApplicationShortcutAccelerator(normalizedKey)
  );
}

export function sanitizeUniqueDesktopVoiceShortcut(
  value: unknown,
  fallback: string,
  otherShortcuts: string[],
  currentValue: string,
) {
  const unavailableShortcuts = new Set(otherShortcuts.map(normalizeDesktopShortcutForComparison));
  const sanitized = sanitizeDesktopVoiceShortcut(value, fallback);
  if (!unavailableShortcuts.has(normalizeDesktopShortcutForComparison(sanitized))) {
    return sanitized;
  }

  if (!unavailableShortcuts.has(normalizeDesktopShortcutForComparison(currentValue))) {
    return currentValue;
  }

  return unavailableShortcuts.has(normalizeDesktopShortcutForComparison(fallback))
    ? currentValue
    : fallback;
}

function sanitizeDesktopVoiceShortcutSet(value: Partial<PersistedVoiceStoreState>) {
  const toggleMuteShortcut = sanitizeDesktopVoiceShortcut(
    value.toggleMuteShortcut,
    DEFAULT_TOGGLE_MUTE_SHORTCUT,
  );
  const toggleDeafenShortcut = sanitizeUniqueDesktopVoiceShortcut(
    value.toggleDeafenShortcut,
    DEFAULT_TOGGLE_DEAFEN_SHORTCUT,
    [toggleMuteShortcut],
    DEFAULT_TOGGLE_DEAFEN_SHORTCUT,
  );
  const pushToTalkShortcut = sanitizeUniqueDesktopVoiceShortcut(
    value.pushToTalkShortcut,
    DEFAULT_PUSH_TO_TALK_SHORTCUT,
    [toggleMuteShortcut, toggleDeafenShortcut],
    DEFAULT_PUSH_TO_TALK_SHORTCUT,
  );
  const gameOverlayPanicShortcut = sanitizeUniqueDesktopVoiceShortcut(
    value.gameOverlayPanicShortcut,
    DEFAULT_GAME_OVERLAY_PANIC_SHORTCUT,
    [toggleMuteShortcut, toggleDeafenShortcut, pushToTalkShortcut],
    DEFAULT_GAME_OVERLAY_PANIC_SHORTCUT,
  );
  const adminConsoleShortcut = sanitizeUniqueDesktopVoiceShortcut(
    value.adminConsoleShortcut,
    DEFAULT_ADMIN_CONSOLE_SHORTCUT,
    [toggleMuteShortcut, toggleDeafenShortcut, pushToTalkShortcut, gameOverlayPanicShortcut],
    DEFAULT_ADMIN_CONSOLE_SHORTCUT,
  );

  return {
    adminConsoleShortcut,
    gameOverlayPanicShortcut,
    pushToTalkShortcut,
    toggleDeafenShortcut,
    toggleMuteShortcut,
  };
}

export function sanitizePushToTalkHangoverMs(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_PUSH_TO_TALK_HANGOVER_MS;
  }

  return Math.min(
    MAX_PUSH_TO_TALK_HANGOVER_MS,
    Math.max(MIN_PUSH_TO_TALK_HANGOVER_MS, Math.round(value)),
  );
}

type PersistedVoiceStoreState = {
  adminConsoleShortcut: string;
  audioProcessingVersion: number;
  audioPreferences: VoiceAudioPreferences;
  cameraPreferences: VoiceCameraPreferences;
  desktopGlobalShortcutsEnabled: boolean;
  desktopGameOverlayAnchor: VoiceOverlayAnchor;
  desktopGameOverlayEnabled: boolean;
  desktopGameOverlayGameSettings: DesktopGameOverlayGameSettings;
  desktopGameOverlayProcessDetectionEnabled: boolean;
  desktopGameOverlaySize: VoiceOverlaySize;
  desktopGameOverlaySpeakingOnly: boolean;
  gameOverlayPanicShortcut: string;
  desktopVoiceMiniEnabled: boolean;
  hasConfiguredKrispPreference: boolean;
  participantVolumes: Record<string, number>;
  pushToTalkHangoverMs: number;
  pushToTalkShortcut: string;
  /**
   * Ayarlar F2 — dört cihaz tercihi. Bunlar bilerek sunucuya gitmez: bir kullanıcının iki
   * bilgisayarı aynı mikrofonu ya da aynı hoparlör seviyesini paylaşmak zorunda değil. Ama
   * "cihazda" demek "bellekte" demek değildi: F2'den önce dördü de yalnız Ayarlar penceresinin
   * kutusunda yaşıyordu ve pencere kapanınca ölüyordu — gösterge yine de `Kaydedildi` diyordu.
   */
  /** `i4` — mikrofonu kulaklığa geri ver. */
  /** `u3` — ana çıkış ses seviyesi, yüzde. */
  masterOutputVolume: number;
  /** `e4` — kendi Whispr penceresini paylaşım kaynaklarından çıkar. */
  screenShareExcludeSelfWindow: boolean;
  /** `e5` — paylaşım sürerken kaynak değiştirmeye izin ver. */
  screenShareAllowSourceSwitch: boolean;
  /** Opt-in: capture the shared surface's audio too. Off by default. */
  screenShareAudioEnabled: boolean;
  /** Listener-side ceiling on remote share audio, in percent. */
  screenShareVolume: number;
  /** K4 `e1` — çözünürlük katmanı. Eski `screenShareQuality` rehydrate'te buraya ayrışır. */
  screenShareResolution: ScreenShareResolution;
  /** K4 `e8` — kare hızı. */
  screenShareFrameRate: ScreenShareFrameRate;
  /**
   * K4/K7 `e9` — `text` (okunurluk) | `motion` (akıcılık).
   *
   * Adı `screenShareMode` **değil**: o alan zaten oturum yüzeyini (`"dm" | "voice" | null`)
   * taşıyor ve `live-voice-provider`, `e2e-voice-provider`, `page-exit` onu okuyor.
   */
  screenShareContentMode: ScreenShareMode;
  toggleDeafenShortcut: string;
  toggleMuteShortcut: string;
  voiceInputMode: VoiceInputMode;
};

export interface VoiceStoreState extends PersistedVoiceStoreState {
  activeChannelId: string | null;
  /** Conversation whose DM call owns the current session, when sessionMode is "direct". */
  activeConversationId: string | null;
  clearParticipantVolumes: () => void;
  clearScreenShareState: () => void;
  desktopGlobalShortcutsEnabled: boolean;
  desktopGameOverlayAnchor: VoiceOverlayAnchor;
  desktopGameOverlayEnabled: boolean;
  desktopGameOverlayGameSettings: DesktopGameOverlayGameSettings;
  desktopGameOverlayProcessDetectionEnabled: boolean;
  desktopGameOverlaySize: VoiceOverlaySize;
  desktopGameOverlaySpeakingOnly: boolean;
  isScreenSharing: boolean;
  isDeafened: boolean;
  isMuted: boolean;
  screenShareActiveSharerId: string | null;
  screenShareChannelId: string | null;
  screenShareConversationId: string | null;
  screenShareError: string | null;
  screenShareMode: "dm" | "voice" | null;
  /**
   * Geçiş köprüsü — `toLegacyScreenShareQualityId(screenShareResolution)`; setter'lar türetir,
   * persist edilmez. Ş1 tüketicileri eksenlere geçirince silinir.
   */
  screenShareQuality: ScreenShareQualityId;
  /** K2 — codec probe'u (`powerEfficient`) yazar; persist edilmez. */
  screenShare4kAllowed: boolean;
  /** K16 — son `getStats` örneği (2 s); Ş0.2 yazar; persist edilmez. */
  screenShareHealth: ScreenShareHealthSnapshot | null;
  /** K11 — `sharerUserId` → izleyen sayısı; persist edilmez. */
  screenShareViewerCounts: Record<string, number>;
  /** K1 — aktif Go Live oturumu; persist edilmez. */
  goLive: VoiceGoLiveSession | null;
  /** K8 — yerel paylaşımın presence bilgisi (`kind`/`gameId`/`label`); persist edilmez. */
  screenShareStreamInfo: ScreenShareStreamInfo | null;
  serverId: string | null;
  sessionId: string | null;
  sessionMode: "channel" | "direct" | null;
  videoQualityMode: "AUTO" | "FULL";
  adminConsoleShortcut: string;
  gameOverlayPanicShortcut: string;
  pushToTalkHangoverMs: number;
  pushToTalkShortcut: string;
  toggleDeafenShortcut: string;
  toggleMuteShortcut: string;
  voiceInputMode: VoiceInputMode;
  join: (input: {
    channelId: string | null;
    conversationId?: string | null;
    serverId: string | null;
    sessionId: string;
    sessionMode?: "channel" | "direct";
  }) => void;
  leave: () => void;
  resetParticipantVolume: (userId: string) => void;
  resetCameraPreferences: () => void;
  setAudioPreferences: (preferences: Partial<VoiceAudioPreferences>) => void;
  setAudioPreference: <Key extends keyof VoiceAudioPreferences>(
    key: Key,
    value: VoiceAudioPreferences[Key],
  ) => void;
  setCameraPreference: <Key extends keyof VoiceCameraPreferences>(
    key: Key,
    value: VoiceCameraPreferences[Key],
  ) => void;
  setDesktopGlobalShortcutsEnabled: (enabled: boolean) => void;
  setDesktopGameOverlayAnchor: (anchor: VoiceOverlayAnchor) => void;
  setDesktopGameOverlayEnabled: (enabled: boolean) => void;
  setDesktopGameOverlayGamePreference: (
    executableName: string,
    preference: Partial<DesktopGameOverlayGamePreference>,
  ) => void;
  setDesktopGameOverlayProcessDetectionEnabled: (enabled: boolean) => void;
  setDesktopGameOverlaySize: (size: VoiceOverlaySize) => void;
  setDesktopGameOverlaySpeakingOnly: (speakingOnly: boolean) => void;
  setDesktopVoiceMiniEnabled: (enabled: boolean) => void;
  setAdminConsoleShortcut: (shortcut: string) => void;
  setGameOverlayPanicShortcut: (shortcut: string) => void;
  setPushToTalkHangoverMs: (hangoverMs: number) => void;
  setPushToTalkShortcut: (shortcut: string) => void;
  setToggleDeafenShortcut: (shortcut: string) => void;
  setToggleMuteShortcut: (shortcut: string) => void;
  setVoiceInputMode: (mode: VoiceInputMode) => void;
  setVideoQualityMode: (mode: "AUTO" | "FULL") => void;
  toggleDeafen: () => void;
  toggleMute: () => void;
  setDeafened: (isDeafened: boolean) => void;
  setMuted: (isMuted: boolean) => void;
  setParticipantVolume: (userId: string, volume: number) => void;
  setScreenShareError: (error: string | null) => void;
  /** Ayarlar F2 — dört cihaz tercihinin yazıcıları. */
  setMasterOutputVolume: (volume: number) => void;
  setScreenShareExcludeSelfWindow: (enabled: boolean) => void;
  setScreenShareAllowSourceSwitch: (enabled: boolean) => void;
  setScreenShareAudioEnabled: (enabled: boolean) => void;
  setScreenShareVolume: (volume: number) => void;
  /** Geçiş köprüsü: eski id'yi `splitScreenShareQualityId` ile iki eksene yazar. */
  setScreenShareQuality: (quality: ScreenShareQualityId) => void;
  setScreenShareResolution: (resolution: ScreenShareResolution) => void;
  setScreenShareFrameRate: (frameRate: ScreenShareFrameRate) => void;
  setScreenShareContentMode: (mode: ScreenShareMode) => void;
  setScreenShare4kAllowed: (allowed: boolean) => void;
  setScreenShareHealth: (snapshot: ScreenShareHealthSnapshot | null) => void;
  setScreenShareViewerCount: (sharerUserId: string, count: number) => void;
  clearScreenShareViewerCount: (sharerUserId: string) => void;
  setGoLive: (goLive: VoiceGoLiveSession | null) => void;
  setScreenShareStreamInfo: (streamInfo: ScreenShareStreamInfo | null) => void;
  setScreenShareState: (input: {
    activeSharerId?: string | null;
    channelId?: string | null;
    conversationId?: string | null;
    isSharing: boolean;
    mode: "dm" | "voice" | null;
  }) => void;
}

/**
 * Persist edilen dilim. `screenShareQuality` bilerek yok: rehydrate onu okuyup iki eksene
 * ayırıyor (`resolvePersistedScreenShareAxes`), sonraki yazımda anahtar düşüyor. Oturum
 * alanları (`screenShareHealth`, `goLive` …) hiç girmez.
 */
export function partializeVoiceState(state: VoiceStoreState): PersistedVoiceStoreState {
  return {
    audioProcessingVersion: state.audioProcessingVersion,
    audioPreferences: state.audioPreferences,
    cameraPreferences: state.cameraPreferences,
    desktopGlobalShortcutsEnabled: state.desktopGlobalShortcutsEnabled,
    desktopGameOverlayAnchor: state.desktopGameOverlayAnchor,
    desktopGameOverlayEnabled: state.desktopGameOverlayEnabled,
    desktopGameOverlayGameSettings: state.desktopGameOverlayGameSettings,
    desktopGameOverlayProcessDetectionEnabled: state.desktopGameOverlayProcessDetectionEnabled,
    desktopGameOverlaySize: state.desktopGameOverlaySize,
    desktopGameOverlaySpeakingOnly: state.desktopGameOverlaySpeakingOnly,
    desktopVoiceMiniEnabled: state.desktopVoiceMiniEnabled,
    adminConsoleShortcut: state.adminConsoleShortcut,
    gameOverlayPanicShortcut: state.gameOverlayPanicShortcut,
    hasConfiguredKrispPreference: state.hasConfiguredKrispPreference,
    participantVolumes: state.participantVolumes,
    pushToTalkHangoverMs: state.pushToTalkHangoverMs,
    pushToTalkShortcut: state.pushToTalkShortcut,
    masterOutputVolume: state.masterOutputVolume,
    screenShareExcludeSelfWindow: state.screenShareExcludeSelfWindow,
    screenShareAllowSourceSwitch: state.screenShareAllowSourceSwitch,
    screenShareAudioEnabled: state.screenShareAudioEnabled,
    screenShareVolume: state.screenShareVolume,
    // Eski `screenShareQuality` bilerek yazılmıyor: rehydrate onu okuyup ikiye ayırıyor,
    // sonraki yazımda anahtar düşüyor.
    screenShareResolution: state.screenShareResolution,
    screenShareFrameRate: state.screenShareFrameRate,
    screenShareContentMode: state.screenShareContentMode,
    toggleDeafenShortcut: state.toggleDeafenShortcut,
    toggleMuteShortcut: state.toggleMuteShortcut,
    voiceInputMode: state.voiceInputMode,
  };
}

/** Rehydrate: her alan sanitize edilir; eksik ya da bozuk değer varsayılana döner. */
export function mergePersistedVoiceState(
  persistedState: unknown,
  currentState: VoiceStoreState,
): VoiceStoreState {
  if (!isRecord(persistedState)) {
    return currentState;
  }

  const desktopShortcuts = sanitizeDesktopVoiceShortcutSet(persistedState);
  const screenShareAxes = resolvePersistedScreenShareAxes(persistedState);

  return {
    ...currentState,
    audioPreferences: needsCleanVoiceMigration(persistedState)
      ? applyCleanVoiceDefaults(sanitizeAudioPreferences(persistedState.audioPreferences))
      : persistedState.hasConfiguredKrispPreference === true
        ? sanitizeAudioPreferences(persistedState.audioPreferences)
        : {
            ...sanitizeAudioPreferences(persistedState.audioPreferences),
            krispNoiseCancellation: true,
          },
    audioProcessingVersion: CLEAN_VOICE_PROCESSING_VERSION,
    hasConfiguredKrispPreference: needsCleanVoiceMigration(persistedState)
      ? false
      : persistedState.hasConfiguredKrispPreference === true,
    cameraPreferences: sanitizeCameraPreferences(persistedState.cameraPreferences),
    desktopGlobalShortcutsEnabled: persistedState.desktopGlobalShortcutsEnabled === true,
    desktopGameOverlayAnchor: sanitizeDesktopGameOverlayAnchor(
      persistedState.desktopGameOverlayAnchor,
    ),
    desktopGameOverlayEnabled: persistedState.desktopGameOverlayEnabled === true,
    desktopGameOverlayGameSettings: sanitizeDesktopGameOverlayGameSettings(
      persistedState.desktopGameOverlayGameSettings,
    ),
    desktopGameOverlayProcessDetectionEnabled:
      persistedState.desktopGameOverlayProcessDetectionEnabled === true,
    desktopGameOverlaySize: sanitizeDesktopGameOverlaySize(persistedState.desktopGameOverlaySize),
    desktopGameOverlaySpeakingOnly: persistedState.desktopGameOverlaySpeakingOnly === true,
    desktopVoiceMiniEnabled: persistedState.desktopVoiceMiniEnabled === true,
    adminConsoleShortcut: desktopShortcuts.adminConsoleShortcut,
    gameOverlayPanicShortcut: desktopShortcuts.gameOverlayPanicShortcut,
    participantVolumes: sanitizeParticipantVolumes(persistedState.participantVolumes),
    pushToTalkHangoverMs: sanitizePushToTalkHangoverMs(persistedState.pushToTalkHangoverMs),
    pushToTalkShortcut: desktopShortcuts.pushToTalkShortcut,
    masterOutputVolume: sanitizeScreenShareVolume(persistedState.masterOutputVolume),
    screenShareExcludeSelfWindow: persistedState.screenShareExcludeSelfWindow !== false,
    screenShareAllowSourceSwitch: persistedState.screenShareAllowSourceSwitch !== false,
    screenShareAudioEnabled: persistedState.screenShareAudioEnabled === true,
    screenShareVolume: sanitizeScreenShareVolume(persistedState.screenShareVolume),
    screenShareResolution: screenShareAxes.resolution,
    screenShareFrameRate: screenShareAxes.frameRate,
    screenShareQuality: toLegacyScreenShareQualityId(screenShareAxes.resolution),
    screenShareContentMode: sanitizeScreenShareContentMode(persistedState.screenShareContentMode),
    toggleDeafenShortcut: desktopShortcuts.toggleDeafenShortcut,
    toggleMuteShortcut: desktopShortcuts.toggleMuteShortcut,
    voiceInputMode: sanitizeVoiceInputMode(persistedState.voiceInputMode),
  };
}

export const useVoiceStore = create<VoiceStoreState>()(
  persist(
    (set) => ({
      activeChannelId: null,
      activeConversationId: null,
      audioProcessingVersion: CLEAN_VOICE_PROCESSING_VERSION,
      audioPreferences: DEFAULT_VOICE_AUDIO_PREFERENCES,
      cameraPreferences: DEFAULT_VOICE_CAMERA_PREFERENCES,
      clearScreenShareState: () =>
        set((state) => ({
          isScreenSharing: false,
          screenShareActiveSharerId: null,
          screenShareChannelId: null,
          screenShareConversationId: null,
          screenShareError: null,
          screenShareMode: null,
          // Yerel paylaşım bitti: gönderim örneği bayat, izlenen paylaşımın örneği değil.
          screenShareHealth:
            state.screenShareHealth?.direction === "send" ? null : state.screenShareHealth,
          goLive: null,
          screenShareStreamInfo: null,
        })),
      clearParticipantVolumes: () =>
        set((state) => {
          if (Object.keys(state.participantVolumes).length === 0) {
            return state;
          }

          return {
            participantVolumes: {},
          };
        }),
      desktopGlobalShortcutsEnabled: false,
      desktopGameOverlayAnchor: DEFAULT_DESKTOP_GAME_OVERLAY_ANCHOR,
      desktopGameOverlayEnabled: false,
      desktopGameOverlayGameSettings: {},
      desktopGameOverlayProcessDetectionEnabled: false,
      desktopGameOverlaySize: DEFAULT_DESKTOP_GAME_OVERLAY_SIZE,
      desktopGameOverlaySpeakingOnly: DEFAULT_DESKTOP_GAME_OVERLAY_SPEAKING_ONLY,
      desktopVoiceMiniEnabled: false,
      adminConsoleShortcut: DEFAULT_ADMIN_CONSOLE_SHORTCUT,
      gameOverlayPanicShortcut: DEFAULT_GAME_OVERLAY_PANIC_SHORTCUT,
      isDeafened: false,
      hasConfiguredKrispPreference: false,
      isMuted: false,
      isScreenSharing: false,
      participantVolumes: {},
      screenShareActiveSharerId: null,
      screenShareChannelId: null,
      screenShareConversationId: null,
      screenShareError: null,
      screenShareMode: null,
      // F2 — referans varsayılanları: `i4` kapalı, `u3` %78, `e4` ve `e5` açık.
      masterOutputVolume: 78,
      screenShareExcludeSelfWindow: true,
      screenShareAllowSourceSwitch: true,
      // K20 — `e2` kapalı, `e3` %100: ağaç değil store otoritedir (persist edilen o).
      screenShareAudioEnabled: false,
      screenShareVolume: DEFAULT_SCREEN_SHARE_VOLUME,
      screenShareResolution: DEFAULT_SCREEN_SHARE_RESOLUTION,
      screenShareFrameRate: DEFAULT_SCREEN_SHARE_FRAME_RATE,
      screenShareContentMode: DEFAULT_SCREEN_SHARE_MODE,
      screenShareQuality: toLegacyScreenShareQualityId(DEFAULT_SCREEN_SHARE_RESOLUTION),
      screenShare4kAllowed: false,
      screenShareHealth: null,
      screenShareViewerCounts: {},
      goLive: null,
      screenShareStreamInfo: null,
      serverId: null,
      sessionId: null,
      sessionMode: null,
      videoQualityMode: "AUTO",
      pushToTalkHangoverMs: DEFAULT_PUSH_TO_TALK_HANGOVER_MS,
      pushToTalkShortcut: DEFAULT_PUSH_TO_TALK_SHORTCUT,
      toggleDeafenShortcut: DEFAULT_TOGGLE_DEAFEN_SHORTCUT,
      toggleMuteShortcut: DEFAULT_TOGGLE_MUTE_SHORTCUT,
      voiceInputMode: "voice-activity",
      join: ({ channelId, conversationId = null, serverId, sessionId, sessionMode = "channel" }) =>
        set({
          activeChannelId: channelId,
          activeConversationId: conversationId,
          serverId,
          sessionId,
          sessionMode,
        }),
      leave: () =>
        set({
          activeChannelId: null,
          activeConversationId: null,
          serverId: null,
          sessionId: null,
          sessionMode: null,
          videoQualityMode: "AUTO",
          isScreenSharing: false,
          screenShareActiveSharerId: null,
          screenShareChannelId: null,
          screenShareConversationId: null,
          screenShareError: null,
          screenShareMode: null,
          screenShareHealth: null,
          screenShareViewerCounts: {},
          goLive: null,
          screenShareStreamInfo: null,
        }),
      resetParticipantVolume: (userId) =>
        set((state) => {
          if (!(userId in state.participantVolumes)) {
            return state;
          }

          const nextParticipantVolumes = { ...state.participantVolumes };
          delete nextParticipantVolumes[userId];

          return {
            participantVolumes: nextParticipantVolumes,
          };
        }),
      resetCameraPreferences: () =>
        set({
          cameraPreferences: DEFAULT_VOICE_CAMERA_PREFERENCES,
        }),
      setAudioPreference: (key, value) =>
        set((state) => {
          if (state.audioPreferences[key] === value) {
            return state;
          }

          return {
            audioPreferences: {
              ...state.audioPreferences,
              [key]: value,
            },
            ...(key === "krispNoiseCancellation" ? { hasConfiguredKrispPreference: true } : {}),
          };
        }),
      setAudioPreferences: (preferences) =>
        set((state) => ({
          audioPreferences: { ...state.audioPreferences, ...preferences },
          ...(preferences.krispNoiseCancellation !== undefined
            ? { hasConfiguredKrispPreference: true }
            : {}),
        })),
      setCameraPreference: (key, value) =>
        set((state) => {
          if (state.cameraPreferences[key] === value) {
            return state;
          }

          return {
            cameraPreferences: {
              ...state.cameraPreferences,
              [key]: value,
            },
          };
        }),
      setDesktopGlobalShortcutsEnabled: (enabled) =>
        set({
          desktopGlobalShortcutsEnabled: enabled,
        }),
      setDesktopGameOverlayAnchor: (anchor) =>
        set({
          desktopGameOverlayAnchor: sanitizeDesktopGameOverlayAnchor(anchor),
        }),
      setDesktopGameOverlayEnabled: (enabled) =>
        set({
          desktopGameOverlayEnabled: enabled,
        }),
      setDesktopGameOverlayGamePreference: (executableName, preference) =>
        set((state) => {
          const normalizedExecutableName = normalizeDesktopExecutableName(executableName);
          if (!normalizedExecutableName) {
            return state;
          }

          return {
            desktopGameOverlayGameSettings: {
              ...state.desktopGameOverlayGameSettings,
              [normalizedExecutableName]: sanitizeDesktopGameOverlayGamePreference({
                ...state.desktopGameOverlayGameSettings[normalizedExecutableName],
                ...preference,
              }),
            },
          };
        }),
      setDesktopGameOverlayProcessDetectionEnabled: (enabled) =>
        set({
          desktopGameOverlayProcessDetectionEnabled: enabled,
        }),
      setDesktopGameOverlaySize: (size) =>
        set({
          desktopGameOverlaySize: sanitizeDesktopGameOverlaySize(size),
        }),
      setDesktopGameOverlaySpeakingOnly: (speakingOnly) =>
        set({
          desktopGameOverlaySpeakingOnly: speakingOnly,
        }),
      setDesktopVoiceMiniEnabled: (enabled) =>
        set({
          desktopVoiceMiniEnabled: enabled,
        }),
      setAdminConsoleShortcut: (shortcut) =>
        set((state) => ({
          adminConsoleShortcut: sanitizeUniqueDesktopVoiceShortcut(
            shortcut,
            DEFAULT_ADMIN_CONSOLE_SHORTCUT,
            [
              state.gameOverlayPanicShortcut,
              state.pushToTalkShortcut,
              state.toggleDeafenShortcut,
              state.toggleMuteShortcut,
            ],
            state.adminConsoleShortcut,
          ),
        })),
      setGameOverlayPanicShortcut: (shortcut) =>
        set((state) => ({
          gameOverlayPanicShortcut: sanitizeUniqueDesktopVoiceShortcut(
            shortcut,
            DEFAULT_GAME_OVERLAY_PANIC_SHORTCUT,
            [state.pushToTalkShortcut, state.toggleDeafenShortcut, state.toggleMuteShortcut],
            state.gameOverlayPanicShortcut,
          ),
        })),
      setPushToTalkHangoverMs: (hangoverMs) =>
        set({
          pushToTalkHangoverMs: sanitizePushToTalkHangoverMs(hangoverMs),
        }),
      setPushToTalkShortcut: (shortcut) =>
        set((state) => ({
          pushToTalkShortcut: sanitizeUniqueDesktopVoiceShortcut(
            shortcut,
            DEFAULT_PUSH_TO_TALK_SHORTCUT,
            [state.gameOverlayPanicShortcut, state.toggleDeafenShortcut, state.toggleMuteShortcut],
            state.pushToTalkShortcut,
          ),
        })),
      setToggleDeafenShortcut: (shortcut) =>
        set((state) => ({
          toggleDeafenShortcut: sanitizeUniqueDesktopVoiceShortcut(
            shortcut,
            DEFAULT_TOGGLE_DEAFEN_SHORTCUT,
            [state.gameOverlayPanicShortcut, state.pushToTalkShortcut, state.toggleMuteShortcut],
            state.toggleDeafenShortcut,
          ),
        })),
      setToggleMuteShortcut: (shortcut) =>
        set((state) => ({
          toggleMuteShortcut: sanitizeUniqueDesktopVoiceShortcut(
            shortcut,
            DEFAULT_TOGGLE_MUTE_SHORTCUT,
            [state.gameOverlayPanicShortcut, state.pushToTalkShortcut, state.toggleDeafenShortcut],
            state.toggleMuteShortcut,
          ),
        })),
      setVoiceInputMode: (mode) =>
        set({
          voiceInputMode: sanitizeVoiceInputMode(mode),
        }),
      setVideoQualityMode: (mode) => set({ videoQualityMode: mode }),
      toggleDeafen: () =>
        set((state) => ({
          isDeafened: !state.isDeafened,
        })),
      toggleMute: () =>
        set((state) => ({
          isMuted: !state.isMuted,
        })),
      setDeafened: (isDeafened) =>
        set({
          isDeafened,
        }),
      setMuted: (isMuted) =>
        set({
          isMuted,
        }),
      setParticipantVolume: (userId, volume) =>
        set((state) => {
          const nextVolume = clampParticipantVolume(volume);
          if ((state.participantVolumes[userId] ?? DEFAULT_PARTICIPANT_VOLUME) === nextVolume) {
            return state;
          }

          return {
            participantVolumes: {
              ...state.participantVolumes,
              [userId]: nextVolume,
            },
          };
        }),
      setScreenShareError: (error) =>
        set({
          screenShareError: error,
        }),
      setMasterOutputVolume: (volume) =>
        set((state) => {
          const next = sanitizeScreenShareVolume(volume);

          return state.masterOutputVolume === next ? state : { masterOutputVolume: next };
        }),
      setScreenShareExcludeSelfWindow: (enabled) =>
        set((state) =>
          state.screenShareExcludeSelfWindow === enabled
            ? state
            : { screenShareExcludeSelfWindow: enabled },
        ),
      setScreenShareAllowSourceSwitch: (enabled) =>
        set((state) =>
          state.screenShareAllowSourceSwitch === enabled
            ? state
            : { screenShareAllowSourceSwitch: enabled },
        ),
      setScreenShareAudioEnabled: (enabled) =>
        set((state) => {
          if (state.screenShareAudioEnabled === enabled) {
            return state;
          }

          return {
            screenShareAudioEnabled: enabled,
          };
        }),
      setScreenShareVolume: (volume) =>
        set((state) => {
          const nextVolume = sanitizeScreenShareVolume(volume);

          if (state.screenShareVolume === nextVolume) {
            return state;
          }

          return {
            screenShareVolume: nextVolume,
          };
        }),
      setScreenShareQuality: (quality) =>
        set((state) => {
          const split = splitScreenShareQualityId(quality);
          if (!split) {
            return state;
          }

          if (
            state.screenShareResolution === split.resolution &&
            state.screenShareFrameRate === split.frameRate
          ) {
            return state;
          }

          return screenShareAxesPatch(split.resolution, split.frameRate);
        }),
      setScreenShareResolution: (resolution) =>
        set((state) => {
          const next = sanitizeScreenShareResolution(resolution);

          return state.screenShareResolution === next
            ? state
            : screenShareAxesPatch(next, state.screenShareFrameRate);
        }),
      setScreenShareFrameRate: (frameRate) =>
        set((state) => {
          const next = sanitizeScreenShareFrameRate(frameRate);

          return state.screenShareFrameRate === next
            ? state
            : screenShareAxesPatch(state.screenShareResolution, next);
        }),
      setScreenShareContentMode: (mode) =>
        set((state) => {
          const next = sanitizeScreenShareContentMode(mode);

          return state.screenShareContentMode === next ? state : { screenShareContentMode: next };
        }),
      setScreenShare4kAllowed: (allowed) =>
        set((state) =>
          state.screenShare4kAllowed === allowed ? state : { screenShare4kAllowed: allowed },
        ),
      setScreenShareHealth: (snapshot) =>
        set((state) =>
          state.screenShareHealth === snapshot ? state : { screenShareHealth: snapshot },
        ),
      setScreenShareViewerCount: (sharerUserId, count) =>
        set((state) => {
          const next = Number.isFinite(count) ? Math.max(0, Math.round(count)) : 0;
          if (state.screenShareViewerCounts[sharerUserId] === next) {
            return state;
          }

          return {
            screenShareViewerCounts: { ...state.screenShareViewerCounts, [sharerUserId]: next },
          };
        }),
      clearScreenShareViewerCount: (sharerUserId) =>
        set((state) => {
          if (!(sharerUserId in state.screenShareViewerCounts)) {
            return state;
          }

          const nextCounts = { ...state.screenShareViewerCounts };
          delete nextCounts[sharerUserId];

          return { screenShareViewerCounts: nextCounts };
        }),
      setGoLive: (goLive) => set({ goLive }),
      setScreenShareStreamInfo: (streamInfo) => set({ screenShareStreamInfo: streamInfo }),
      setScreenShareState: ({
        activeSharerId = null,
        channelId = null,
        conversationId = null,
        isSharing,
        mode,
      }) =>
        set({
          isScreenSharing: isSharing,
          screenShareActiveSharerId: activeSharerId,
          screenShareChannelId: channelId,
          screenShareConversationId: conversationId,
          screenShareError: null,
          screenShareMode: mode,
        }),
    }),
    {
      merge: mergePersistedVoiceState,
      name: VOICE_PREFERENCES_STORAGE_KEY,
      partialize: partializeVoiceState,
      storage: createJSONStorage(() => requireBrowserLocalStorage()),
    },
  ),
);
