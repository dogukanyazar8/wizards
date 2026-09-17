"use client";

import { useScreenShare4kFlag } from "@/hooks/use-screen-share-4k-flag";
import React, { useEffect, useLayoutEffect, useMemo, type ReactNode } from "react";

import {
  useReportSettingsStore,
  useSettingsLadderOverrides,
} from "@/components/settings/settings-ladder";
import { getNoiseSuppressionChoice, getNoiseSuppressionPreset } from "@/lib/voice/noise-filter";
import {
  SCREEN_SHARE_FRAME_RATES,
  SCREEN_SHARE_MODES,
  SCREEN_SHARE_RESOLUTIONS,
} from "@wizards/types";
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
  | "screenShare4kAllowed"
  | "screenShareContentMode"
  | "screenShareFrameRate"
  | "screenShareResolution"
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
  setScreenShareContentMode: VoiceStoreState["setScreenShareContentMode"];
  setScreenShareFrameRate: VoiceStoreState["setScreenShareFrameRate"];
  setScreenShareResolution: VoiceStoreState["setScreenShareResolution"];
  setScreenShareVolume: VoiceStoreState["setScreenShareVolume"];
  setVoiceInputMode: VoiceStoreState["setVoiceInputMode"];
};

/**
 * Ekran paylaşımı K4 — `e1` / `e8` / `e9` segment dizinleri ile store eksenleri arasındaki
 * sıra. Ağaçtaki seçenek sırası (`settings.option.e1.1…4`, `e8.1…3`, `e9.1…2`) bu üç listeyle
 * aynı olmak zorunda; `av-settings-bridge.test.tsx` bunu kilitler.
 */
export const SCREEN_SHARE_RESOLUTION_ROW_ORDER = SCREEN_SHARE_RESOLUTIONS;
export const SCREEN_SHARE_FRAME_RATE_ROW_ORDER = SCREEN_SHARE_FRAME_RATES;
export const SCREEN_SHARE_MODE_ROW_ORDER = SCREEN_SHARE_MODES;
/** `e1` dizini 3 = `h2160`; K2 kapısı (`screenShare4kAllowed`) bu dizine bakar. */
export const SCREEN_SHARE_4K_OPTION_INDEX = SCREEN_SHARE_RESOLUTION_ROW_ORDER.indexOf("h2160");

/** Device state, including live device selections, projected into settings rows. */
export function readAvSettingsValues(state: AvVoiceSnapshot): SettingsPatch {
  const { audioPreferences: audio } = state;

  return {
    e1: Math.max(0, SCREEN_SHARE_RESOLUTION_ROW_ORDER.indexOf(state.screenShareResolution)),
    e8: Math.max(0, SCREEN_SHARE_FRAME_RATE_ROW_ORDER.indexOf(state.screenShareFrameRate)),
    e9: Math.max(0, SCREEN_SHARE_MODE_ROW_ORDER.indexOf(state.screenShareContentMode)),
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
  snapshot: AvVoiceSnapshot,
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
        const index = Number(value);
        const resolution = SCREEN_SHARE_RESOLUTION_ROW_ORDER[index];
        if (!resolution) throw new Error(`SETTINGS_WRITE_INVALID:${key}`);

        // K2 — renderer disables 4K; enforce the same gate for programmatic writes.
        if (index === SCREEN_SHARE_4K_OPTION_INDEX && !snapshot.screenShare4kAllowed) {
          throw new Error(`SETTINGS_WRITE_INVALID:${key}`);
        }

        writer.setScreenShareResolution(resolution);
        break;
      }

      case "e8": {
        const frameRate = SCREEN_SHARE_FRAME_RATE_ROW_ORDER[Number(value)];
        if (!frameRate) throw new Error(`SETTINGS_WRITE_INVALID:${key}`);
        writer.setScreenShareFrameRate(frameRate);
        break;
      }

      case "e9": {
        const mode = SCREEN_SHARE_MODE_ROW_ORDER[Number(value)];
        if (!mode) throw new Error(`SETTINGS_WRITE_INVALID:${key}`);
        writer.setScreenShareContentMode(mode);
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
  const screenShare4kEnabled = useScreenShare4kFlag();

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
    hiddenOptions: {
      ...overrides.hiddenOptions,
      e1: screenShare4kEnabled ? [] : [SCREEN_SHARE_4K_OPTION_INDEX],
    },
    disabledOptions: {
      ...overrides.disabledOptions,
      e1: snapshot.screenShare4kAllowed ? [] : [SCREEN_SHARE_4K_OPTION_INDEX],
    },
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
