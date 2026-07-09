import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useMobileAuth } from "../../auth/mobile-auth-context";
import { mobileVoicePreferenceRepository } from "../../voice/expo-mobile-voice-preferences";
import {
  DEFAULT_MOBILE_VOICE_INPUT_MODE,
  sanitizeMobileVoiceInputMode,
  type MobileVoiceInputMode,
} from "../../voice/mobile-voice-ptt-contract";
import { useMobileVoiceRoom } from "../../voice/use-mobile-voice-room";

type MobileVoiceRoomRuntime = ReturnType<typeof useMobileVoiceRoom>;

type MobileVoiceRuntime = Omit<MobileVoiceRoomRuntime, "requestMicrophonePermission"> & {
  readonly requestMicrophonePermission: () => Promise<void>;
  readonly selectVoiceInputMode: (mode: MobileVoiceInputMode) => void;
  readonly voiceInputMode: MobileVoiceInputMode;
};

const MobileVoiceRuntimeContext = createContext<MobileVoiceRuntime | null>(null);

export function MobileVoiceProvider({ children }: PropsWithChildren) {
  const { apiClient, session } = useMobileAuth();
  const [voiceInputMode, setVoiceInputMode] = useState<MobileVoiceInputMode>(
    DEFAULT_MOBILE_VOICE_INPUT_MODE,
  );
  const voiceRoom = useMobileVoiceRoom({
    apiClient,
    currentUser: session?.user ?? null,
    voiceInputMode,
  });

  useEffect(() => {
    let isMounted = true;

    mobileVoicePreferenceRepository
      .loadInputMode()
      .then((storedInputMode) => {
        if (isMounted) {
          setVoiceInputMode(storedInputMode);
        }
      })
      .catch(() => {
        if (isMounted) {
          setVoiceInputMode(DEFAULT_MOBILE_VOICE_INPUT_MODE);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const selectVoiceInputMode = useCallback((mode: MobileVoiceInputMode) => {
    const normalizedMode = sanitizeMobileVoiceInputMode(mode);
    setVoiceInputMode(normalizedMode);
    void mobileVoicePreferenceRepository.saveInputMode(normalizedMode).catch(() => undefined);
  }, []);

  const requestMicrophonePermission = useCallback(async () => {
    await voiceRoom.requestMicrophonePermission();
  }, [voiceRoom.requestMicrophonePermission]);

  const value = useMemo(
    () => ({
      ...voiceRoom,
      requestMicrophonePermission,
      selectVoiceInputMode,
      voiceInputMode,
    }),
    [requestMicrophonePermission, selectVoiceInputMode, voiceInputMode, voiceRoom],
  );

  return (
    <MobileVoiceRuntimeContext.Provider value={value}>
      {children}
    </MobileVoiceRuntimeContext.Provider>
  );
}

export function useMobileVoiceRuntime(): MobileVoiceRuntime {
  const runtime = useContext(MobileVoiceRuntimeContext);
  if (!runtime) {
    throw new Error("Mobile voice provider is missing.");
  }

  return runtime;
}
