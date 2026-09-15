"use client";

import React, { useEffect, useLayoutEffect, useMemo, type ReactNode } from "react";

import {
  useReportSettingsStore,
  useSettingsLadderOverrides,
} from "@/components/settings/settings-ladder";
import { getNoiseSuppressionChoice, getNoiseSuppressionPreset } from "@/lib/voice/noise-filter";
import {
  DEFAULT_SCREEN_SHARE_QUALITY_ID,
  SCREEN_SHARE_QUALITY_OPTIONS,
  type ScreenShareQualityId,
} from "@/lib/voice/screen-share";
import {
  SettingsRowRuntimeContext,
  SettingsValueContext,
  SettingsValueStore,
  useSettingsRowRuntimeState,
  type SettingsPatch,
  type SettingsRowRuntime,
  type SettingValue,
} from "@/lib/settings/use-setting-value";
import { AV_UNAVAILABLE_ROWS } from "@/lib/settings/availability";
import {
  MAX_PUSH_TO_TALK_HANGOVER_MS,
  MIN_PUSH_TO_TALK_HANGOVER_MS,
  useVoiceStore,
} from "@/store/voice-store";

/** Derive adapter types from the existing persisted voice store. */
type VoiceStoreState = ReturnType<typeof useVoiceStore.getState>;

/** Audio/video preferences are local to this device. The shared settings store
 * reports actual writes to the window header; microphone preview is session-only. */

/** Referans `i5` sırası: Ses etkinliği · Bas-konuş. */
const INPUT_MODES = ["voice-activity", "push-to-talk"] as const;

export type AvVoiceSnapshot = Pick<
  VoiceStoreState,
  | "audioPreferences"
  | "cameraPreferences"
  | "pushToTalkHangoverMs"
  | "screenShareAudioEnabled"
  | "masterOutputVolume"
  | "screenShareAllowSourceSwitch"
  | "screenShareExcludeSelfWindow"
  | "screenShareQuality"
  | "screenShareVolume"
  | "voiceInputMode"
>;

export type AvVoiceWriter = {
  setAudioPreferences: VoiceStoreState["setAudioPreferences"];
  setAudioPreference: VoiceStoreState["setAudioPreference"];
  setMasterOutputVolume: VoiceStoreState["setMasterOutputVolume"];
  setScreenShareAllowSourceSwitch: VoiceStoreState["setScreenShareAllowSourceSwitch"];
  setScreenShareExcludeSelfWindow: VoiceStoreState["setScreenShareExcludeSelfWindow"];
  setCameraPreference: VoiceStoreState["setCameraPreference"];
  setPushToTalkHangoverMs: VoiceStoreState["setPushToTalkHangoverMs"];
  setScreenShareAudioEnabled: VoiceStoreState["setScreenShareAudioEnabled"];
  setScreenShareQuality: VoiceStoreState["setScreenShareQuality"];
  setScreenShareVolume: VoiceStoreState["setScreenShareVolume"];
  setVoiceInputMode: VoiceStoreState["setVoiceInputMode"];
};

/** Device state, including live device selections, projected into settings rows. */
export function readAvSettingsValues(state: AvVoiceSnapshot): SettingsPatch {
  const { audioPreferences: audio } = state;

  return {
    e1: Math.max(
      0,
      SCREEN_SHARE_QUALITY_OPTIONS.findIndex((option) => option.id === state.screenShareQuality),
    ),
    e2: state.screenShareAudioEnabled,
    e3: state.screenShareVolume,
    e4: state.screenShareExcludeSelfWindow,
    e5: state.screenShareAllowSourceSwitch,
    i1: audio.inputDeviceId,
    u1: audio.outputDeviceId,
    i5: Math.max(0, INPUT_MODES.indexOf(state.voiceInputMode)),
    i6: state.pushToTalkHangoverMs,
    u3: state.masterOutputVolume,
    k3: state.cameraPreferences.backgroundBlur,
    p4: audio.echoCancellation,
    p5: audio.autoGainControl,
    p7: getNoiseSuppressionChoice(audio),
  };
}

/** Independent echo and gain controls. Noise cancellation uses an atomic preset. */
const AUDIO_FILTER_ROWS = {
  p4: "echoCancellation",
  p5: "autoGainControl",
} as const;

/** Write only supported settings keys; unknown keys must not report success. */
export function applyAvSettingsPatch(
  patch: SettingsPatch,
  _snapshot: AvVoiceSnapshot,
  writer: AvVoiceWriter,
): void {
  for (const [key, value] of Object.entries(patch)) {
    switch (key) {
      case "i1":
      case "u1":
        if (typeof value !== "string") throw new Error(`SETTINGS_WRITE_INVALID:${key}`);
        writer.setAudioPreference(key === "i1" ? "inputDeviceId" : "outputDeviceId", value);
        break;
      case "p4":
      case "p5":
        writer.setAudioPreference(AUDIO_FILTER_ROWS[key], Boolean(value));
        break;

      case "p7": {
        writer.setAudioPreferences(getNoiseSuppressionPreset(Number(value)));
        break;
      }

      case "i5": {
        const mode = INPUT_MODES[Number(value)];

        if (mode) {
          writer.setVoiceInputMode(mode);
        }

        break;
      }

      case "i6":
        writer.setPushToTalkHangoverMs(
          Math.min(
            MAX_PUSH_TO_TALK_HANGOVER_MS,
            Math.max(MIN_PUSH_TO_TALK_HANGOVER_MS, Number(value)),
          ),
        );
        break;

      case "k3":
        writer.setCameraPreference("backgroundBlur", Boolean(value));
        break;

      case "e1": {
        const quality: ScreenShareQualityId =
          SCREEN_SHARE_QUALITY_OPTIONS[Number(value)]?.id ?? DEFAULT_SCREEN_SHARE_QUALITY_ID;
        void writer.setScreenShareQuality(quality);
        break;
      }

      case "e2":
        writer.setScreenShareAudioEnabled(Boolean(value));
        break;

      case "e3":
        writer.setScreenShareVolume(Number(value));
        break;

      case "u3":
        writer.setMasterOutputVolume(Number(value));
        break;

      case "e4":
        writer.setScreenShareExcludeSelfWindow(Boolean(value));
        break;

      case "e5":
        writer.setScreenShareAllowSourceSwitch(Boolean(value));
        break;

      default:
        // F2 — sessiz `break` yasak: yazılmayan bir anahtar için kutu `Kaydedildi` derdi.
        // Bilinmeyen anahtar bir kodlama hatasıdır; kullanıcıya yalan söylemektense düşer.
        throw new Error(`SETTINGS_WRITE_UNSUPPORTED:${key}`);
    }
  }
}

/** Üç sekmenin paylaştığı **tek** kutu — gerekçesi `useAvSettingsBridge` içinde. */
let sharedAvStore: SettingsValueStore | null = null;

function getAvStore(): SettingsValueStore {
  sharedAvStore ??= new SettingsValueStore({
    values: readAvSettingsValues(useVoiceStore.getState()),
    write: async (patch) => {
      applyAvSettingsPatch(patch, useVoiceStore.getState(), useVoiceStore.getState());
    },
  });

  return sharedAvStore;
}

export type AvSettingsBridge = {
  readonly runtime: SettingsRowRuntime;
  readonly store: SettingsValueStore;
};

export function useAvSettingsBridge(overrides: Partial<SettingsRowRuntime> = {}): AvSettingsBridge {
  const snapshot = useVoiceStore(selectAvSnapshot);

  const store = useMemo(() => getAvStore(), []);

  // F1 — kutunun durumu kabuğun başlığına ve kirli şeridine buradan gider.
  useReportSettingsStore(store);

  // Sökülürken bekleyen yama gönderilir; kutu **kapatılmaz**. Üç sekme aynı kutuyu paylaşıyor:
  // sekme başına bir kutu, `i4`/`u3` gibi karşılığı olmayan satırların değerini sekme
  // değişiminde sıfırlardı.
  useEffect(() => () => store.flush(), [store]);

  // Cihaz durumu dışarıdan da değişir (ses odasındaki hızlı menü, cihaz çıkarılması).
  // `applyRemote` kendi yazması uçuşta olan anahtarı atlar, yani kullanıcının az önceki
  // dokunuşu geri alınmaz.
  useLayoutEffect(() => {
    store.applyRemote(readAvSettingsValues(snapshot));
  }, [snapshot, store]);

  const ladder = useSettingsLadderOverrides();

  const runtime = useSettingsRowRuntimeState({
    ...ladder,
    ...overrides,
    disabledRows: { ...AV_UNAVAILABLE_ROWS, ...overrides.disabledRows },
    data: {
      ...overrides.data,
    },
  });

  return { runtime, store };
}

/** Kutu on iki satırın değerini okuyor; dar bir seçici on iki abonelik demek olurdu. */
function selectAvSnapshot(state: VoiceStoreState): AvVoiceSnapshot {
  return state;
}

export function AvSettingsProvider({
  bridge,
  children,
}: {
  readonly bridge: AvSettingsBridge;
  readonly children: ReactNode;
}) {
  return (
    <SettingsValueContext.Provider value={bridge.store}>
      <SettingsRowRuntimeContext.Provider value={bridge.runtime}>
        {children}
      </SettingsRowRuntimeContext.Provider>
    </SettingsValueContext.Provider>
  );
}

export type { SettingValue };
