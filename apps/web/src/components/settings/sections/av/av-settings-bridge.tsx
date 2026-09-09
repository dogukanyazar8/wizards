"use client";

import React, { useEffect, useMemo, type ReactNode } from "react";

import { useI18n } from "@/components/providers/locale-provider";
import {
  useReportSettingsStore,
  useSettingsLadderOverrides,
} from "@/components/settings/settings-ladder";
import {
  applyCleanAudioProfile,
  CLEAN_AUDIO_PROFILE_FILTERS,
  isCleanAudioProfileActive,
} from "@/lib/voice/clean-audio-profile";
import { ENHANCED_NOISE_FILTER_MODES } from "@/lib/voice/noise-filter";
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

/**
 * `VoiceStoreState` dışa aktarılmıyor (`store/voice-store.ts` yerel tutuyor) ve o dosya bu
 * şeritte **yazılmaz**. Kutunun tipi zaten `useVoiceStore` üzerinden okunabiliyor; tek bir
 * yardımcı tip, on satırlık bir kopya tanımdan iyi.
 */
type VoiceStoreState = ReturnType<typeof useVoiceStore.getState>;

/**
 * Ses ve Video bölümünün **taşıma yolu** — Ş6 §2.1'in bıraktığı `write` dikişi.
 *
 * Satır motoru hangi ucun hangi anahtarı yazdığını bilmez; bu bölümün cevabı "hiçbir uç":
 * ses, kamera ve ekran paylaşımı tercihleri **cihaz** tercihleridir ve `useVoiceStore`'da
 * (persist) yaşar. Sunucuya gönderilseler bir kullanıcının iki bilgisayarı aynı mikrofonu
 * paylaşmak zorunda kalırdı.
 *
 * Eşleme iki **saf** fonksiyonda duruyor (`readAvSettingsValues` / `applyAvSettingsPatch`):
 * React ağacı kurmadan "p1 açılınca beş filtre önerilen kümeye gitti mi", "p2 değişince p1
 * kendiliğinden kapandı mı" sorularını ancak böyle sorabiliyoruz.
 *
 * F2 — dört satır (`i4`, `u3`, `e4`, `e5`) eskiden hiçbir yere yazılmıyor, yalnız kutuda
 * duruyordu; kutu yazmayı başarılı sayıp `Kaydedildi` gösteriyordu. Artık dördünün de
 * `voice-store` alanı var (persist) ve `applyAvSettingsPatch` bilinmeyen anahtarda **düşer**.
 */

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
  | "selfMonitorEnabled"
  | "voiceInputMode"
>;

export type AvVoiceWriter = {
  setAudioPreference: VoiceStoreState["setAudioPreference"];
  setMasterOutputVolume: VoiceStoreState["setMasterOutputVolume"];
  setScreenShareAllowSourceSwitch: VoiceStoreState["setScreenShareAllowSourceSwitch"];
  setScreenShareExcludeSelfWindow: VoiceStoreState["setScreenShareExcludeSelfWindow"];
  setSelfMonitorEnabled: VoiceStoreState["setSelfMonitorEnabled"];
  setCameraPreference: VoiceStoreState["setCameraPreference"];
  setPushToTalkHangoverMs: VoiceStoreState["setPushToTalkHangoverMs"];
  setScreenShareAudioEnabled: VoiceStoreState["setScreenShareAudioEnabled"];
  setScreenShareQuality: VoiceStoreState["setScreenShareQuality"];
  setScreenShareVolume: VoiceStoreState["setScreenShareVolume"];
  setVoiceInputMode: VoiceStoreState["setVoiceInputMode"];
};

/** Cihaz durumundan satır değerlerine. Cihaz kimlikleri burada **yok**: onları menü çizer. */
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
    i4: state.selfMonitorEnabled,
    i5: Math.max(0, INPUT_MODES.indexOf(state.voiceInputMode)),
    i6: state.pushToTalkHangoverMs,
    u3: state.masterOutputVolume,
    k3: state.cameraPreferences.backgroundBlur,
    p1: isCleanAudioProfileActive(audio),
    p2: audio.noiseSuppression,
    p3: audio.voiceIsolation,
    p4: audio.echoCancellation,
    p5: audio.autoGainControl,
    p6: audio.krispNoiseCancellation,
    p7: Math.max(0, ENHANCED_NOISE_FILTER_MODES.indexOf(audio.enhancedNoiseFilterMode)),
  };
}

/** Satır anahtarı ↔ `VoiceAudioPreferences` alanı; `p1` türev olduğu için listede yok. */
const AUDIO_FILTER_ROWS = {
  p2: "noiseSuppression",
  p3: "voiceIsolation",
  p4: "echoCancellation",
  p5: "autoGainControl",
  p6: "krispNoiseCancellation",
} as const;

/**
 * Yamayı cihaz durumuna yazar.
 *
 * `p1` bir anahtar değil bir **karar**: açıldığında beş filtreyi birden önerilen kümeye
 * eşitler. Kapanışı ayrıca kodlanmaz — kullanıcı bir filtreye dokunduğunda profil zaten
 * `isCleanAudioProfileActive` üzerinden kapanır (`clean-audio-profile.ts`).
 */
export function applyAvSettingsPatch(
  patch: SettingsPatch,
  snapshot: AvVoiceSnapshot,
  writer: AvVoiceWriter,
): void {
  for (const [key, value] of Object.entries(patch)) {
    switch (key) {
      case "p1": {
        if (value !== true) {
          break;
        }

        const next = applyCleanAudioProfile({ ...snapshot.audioPreferences }, true);

        for (const filter of CLEAN_AUDIO_PROFILE_FILTERS) {
          writer.setAudioPreference(filter, next[filter]);
        }

        break;
      }

      case "p2":
      case "p3":
      case "p4":
      case "p5":
      case "p6":
        writer.setAudioPreference(AUDIO_FILTER_ROWS[key], Boolean(value));
        break;

      case "p7": {
        const mode = ENHANCED_NOISE_FILTER_MODES[Number(value)];

        if (mode) {
          writer.setAudioPreference("enhancedNoiseFilterMode", mode);
        }

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

      case "i4":
        writer.setSelfMonitorEnabled(Boolean(value));
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

/** `p9` satırının alt metni — gerçek filtre kararından türer, sabit değil. */
export function resolveAudioProcessingStateKey(state: AvVoiceSnapshot): string {
  const { enhancedNoiseFilterMode, krispNoiseCancellation, noiseSuppression, voiceIsolation } =
    state.audioPreferences;

  if (krispNoiseCancellation && enhancedNoiseFilterMode === "layered") {
    return "settings.block.audio.state.layered";
  }

  if (krispNoiseCancellation && enhancedNoiseFilterMode === "krisp_only") {
    return "settings.block.audio.state.krisp";
  }

  if (noiseSuppression || voiceIsolation) {
    return "settings.block.audio.state.browser";
  }

  return "settings.block.audio.state.off";
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
  const { t } = useI18n();
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
  useEffect(() => {
    store.applyRemote(readAvSettingsValues(snapshot));
  }, [snapshot, store]);

  const ladder = useSettingsLadderOverrides();

  const runtime = useSettingsRowRuntimeState({
    ...ladder,
    ...overrides,
    disabledRows: { ...AV_UNAVAILABLE_ROWS, ...overrides.disabledRows },
    data: {
      audioProcessingState: t(resolveAudioProcessingStateKey(snapshot)),
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
