export type MobileVoiceInputMode = "push-to-talk" | "voice-activity";
export type MobilePushToTalkPhase = "idle" | "holding" | "release-cushion";

export interface MobilePushToTalkState {
  readonly phase: MobilePushToTalkPhase;
  readonly restoreMuted: boolean;
  readonly startedAt: number | null;
}

export interface MobileVoiceInputModePreferenceStorage {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
}

export type MobilePushToTalkTimerHandle = ReturnType<typeof setTimeout>;

export interface MobilePushToTalkTimers<Handle = MobilePushToTalkTimerHandle> {
  clearTimeout(handle: Handle): void;
  now(): number;
  setTimeout(callback: () => void | Promise<void>, delayMs: number): Handle;
}

export interface MobilePushToTalkController {
  begin(input: { isMicrophoneEnabled: boolean }): Promise<void>;
  cancel(input?: { closeMicrophone?: boolean }): Promise<void>;
  end(): void;
  getState(): MobilePushToTalkState;
}

export const DEFAULT_MOBILE_VOICE_INPUT_MODE: MobileVoiceInputMode = "voice-activity";
export const MOBILE_PUSH_TO_TALK_HANGOVER_MS = 200;
export const MOBILE_VOICE_INPUT_MODE_STORAGE_KEY = "whispr-mobile-voice-input-mode";

const IDLE_MOBILE_PUSH_TO_TALK_STATE: MobilePushToTalkState = {
  phase: "idle",
  restoreMuted: true,
  startedAt: null,
};

export function createInitialMobilePushToTalkState(): MobilePushToTalkState {
  return IDLE_MOBILE_PUSH_TO_TALK_STATE;
}

export function sanitizeMobileVoiceInputMode(value: unknown): MobileVoiceInputMode {
  return value === "push-to-talk" ? "push-to-talk" : DEFAULT_MOBILE_VOICE_INPUT_MODE;
}

export async function loadMobileVoiceInputModePreference(
  storage: MobileVoiceInputModePreferenceStorage,
): Promise<MobileVoiceInputMode> {
  return sanitizeMobileVoiceInputMode(
    await storage.getItemAsync(MOBILE_VOICE_INPUT_MODE_STORAGE_KEY),
  );
}

export async function saveMobileVoiceInputModePreference(
  storage: MobileVoiceInputModePreferenceStorage,
  mode: unknown,
): Promise<MobileVoiceInputMode> {
  const normalizedMode = sanitizeMobileVoiceInputMode(mode);
  await storage.setItemAsync(MOBILE_VOICE_INPUT_MODE_STORAGE_KEY, normalizedMode);
  return normalizedMode;
}

export function createMobilePushToTalkController<Handle = MobilePushToTalkTimerHandle>({
  onStateChange,
  setMicrophoneEnabled,
  timers,
}: {
  onStateChange?(state: MobilePushToTalkState): void;
  setMicrophoneEnabled(enabled: boolean): Promise<void>;
  timers: MobilePushToTalkTimers<Handle>;
}): MobilePushToTalkController {
  let state = createInitialMobilePushToTalkState();
  let releaseTimer: Handle | null = null;

  const setState = (nextState: MobilePushToTalkState) => {
    state = nextState;
    onStateChange?.(state);
  };

  const clearReleaseTimer = () => {
    if (releaseTimer === null) {
      return;
    }

    timers.clearTimeout(releaseTimer);
    releaseTimer = null;
  };

  return {
    async begin({ isMicrophoneEnabled }) {
      clearReleaseTimer();
      const startedAt = timers.now();
      setState({
        phase: "holding",
        restoreMuted: !isMicrophoneEnabled,
        startedAt,
      });
      await setMicrophoneEnabled(true);
    },

    async cancel({ closeMicrophone = false } = {}) {
      clearReleaseTimer();
      setState(createInitialMobilePushToTalkState());
      if (closeMicrophone) {
        await setMicrophoneEnabled(false);
      }
    },

    end() {
      if (state.phase !== "holding") {
        return;
      }

      const releaseStartedAt = state.startedAt;
      const shouldRestoreMuted = state.restoreMuted;
      setState({
        phase: "release-cushion",
        restoreMuted: shouldRestoreMuted,
        startedAt: releaseStartedAt,
      });

      releaseTimer = timers.setTimeout(async () => {
        releaseTimer = null;
        if (
          state.phase !== "release-cushion" ||
          state.startedAt !== releaseStartedAt ||
          state.restoreMuted !== shouldRestoreMuted
        ) {
          return;
        }

        setState(createInitialMobilePushToTalkState());
        if (shouldRestoreMuted) {
          await setMicrophoneEnabled(false);
        }
      }, MOBILE_PUSH_TO_TALK_HANGOVER_MS);
    },

    getState() {
      return state;
    },
  };
}
