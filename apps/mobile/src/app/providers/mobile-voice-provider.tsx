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
import type { MobileVoiceRuntimeState } from "../../voice/mobile-voice-contract";
import { useMobileMediaRuntime } from "./mobile-media-provider";
import { activeMobileCopy } from "../../locale/mobile-locale-preferences";
import {
  DEFAULT_MOBILE_VOICE_DEVICE_PREFERENCES,
  type MobileVoiceDevicePreferences,
} from "../../voice/mobile-voice-device-contract";

type MobileVoiceRoomRuntime = ReturnType<typeof useMobileVoiceRoom>;

type MobileVoiceRuntime = Omit<MobileVoiceRoomRuntime, "requestMicrophonePermission"> & {
  readonly requestMicrophonePermission: () => Promise<MobileVoiceRuntimeState>;
  readonly selectVoiceInputMode: (mode: MobileVoiceInputMode) => void;
  readonly voiceInputMode: MobileVoiceInputMode;
};

const MobileVoiceRuntimeContext = createContext<MobileVoiceRuntime | null>(null);

export function MobileVoiceProvider({ children }: PropsWithChildren) {
  const { apiClient, session } = useMobileAuth();
  const { requestCameraPermission, state: mediaState } = useMobileMediaRuntime();
  const [voiceInputMode, setVoiceInputMode] = useState<MobileVoiceInputMode>(
    DEFAULT_MOBILE_VOICE_INPUT_MODE,
  );
  const [voiceDevicePreferences, setVoiceDevicePreferences] =
    useState<MobileVoiceDevicePreferences>(DEFAULT_MOBILE_VOICE_DEVICE_PREFERENCES);
  const persistVoiceDevicePreferences = useCallback((preferences: MobileVoiceDevicePreferences) => {
    setVoiceDevicePreferences(preferences);
    void mobileVoicePreferenceRepository.saveDevicePreferences(preferences).catch(() => undefined);
  }, []);
  const voiceRoom = useMobileVoiceRoom({
    apiClient,
    cameraPermissionDeniedMessage: activeMobileCopy.voiceDirectCallCameraPermissionDenied,
    currentUser: session?.user ?? null,
    directCallConnectionErrorMessage: activeMobileCopy.voiceDirectCallConnectionError,
    directCallMicrophonePermissionDeniedMessage:
      activeMobileCopy.voiceDirectCallMicrophonePermissionDenied,
    directCallVideoErrorMessage: activeMobileCopy.voiceDirectCallVideoError,
    onVoiceDevicePreferencesChange: persistVoiceDevicePreferences,
    requestCameraPermissionAfterUserAction: requestCameraPermission,
    voiceDevicePreferences,
    voiceInputMode,
  });

  useEffect(() => {
    let isMounted = true;

    Promise.all([
      mobileVoicePreferenceRepository.loadInputMode(),
      mobileVoicePreferenceRepository.loadDevicePreferences(),
    ])
      .then(([storedInputMode, storedDevicePreferences]) => {
        if (isMounted) {
          setVoiceInputMode(storedInputMode);
          setVoiceDevicePreferences(storedDevicePreferences);
        }
      })
      .catch(() => {
        if (isMounted) {
          setVoiceInputMode(DEFAULT_MOBILE_VOICE_INPUT_MODE);
          setVoiceDevicePreferences(DEFAULT_MOBILE_VOICE_DEVICE_PREFERENCES);
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
    return voiceRoom.requestMicrophonePermission();
    // `voiceRoom.requestMicrophonePermission` is a stable useCallback; depending on
    // the whole `voiceRoom` (a fresh object each render) would rebuild this every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceRoom.requestMicrophonePermission]);

  const toggleCamera = useCallback(async () => {
    if (!voiceRoom.roomState.selfCameraEnabled && !mediaState.hasCameraPermission) {
      const permission = await requestCameraPermission();
      if (!permission.hasCameraPermission) {
        return;
      }
    }
    await voiceRoom.toggleCamera();
  }, [mediaState.hasCameraPermission, requestCameraPermission, voiceRoom]);

  const value = useMemo(
    () => ({
      ...voiceRoom,
      requestMicrophonePermission,
      selectVoiceInputMode,
      toggleCamera,
      voiceInputMode,
    }),
    [requestMicrophonePermission, selectVoiceInputMode, toggleCamera, voiceInputMode, voiceRoom],
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
