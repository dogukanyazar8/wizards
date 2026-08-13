import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useStore } from "zustand";
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
import {
  createMobileVoiceRuntimeStore,
  type MobileVoiceRuntimeStore,
  type MobileVoiceRuntimeStoreState,
} from "../../state/mobile-voice-runtime-store";

type MobileVoiceRoomRuntime = ReturnType<typeof useMobileVoiceRoom>;

type MobileVoiceActions = Omit<
  MobileVoiceRoomRuntime,
  | "permissionState"
  | "pushToTalkState"
  | "requestMicrophonePermission"
  | "roomState"
  | "screenShareAudioMuted"
  | "screenShareQualityId"
  | "toggleCamera"
  | "voiceAudioProcessing"
> & {
  readonly requestMicrophonePermission: () => Promise<MobileVoiceRuntimeState>;
  readonly selectVoiceInputMode: (mode: MobileVoiceInputMode) => void;
  readonly toggleCamera: () => Promise<void>;
};

type MobileVoiceRuntime = MobileVoiceActions & MobileVoiceRuntimeStoreState;

const MobileVoiceActionsContext = createContext<MobileVoiceActions | null>(null);
const MobileVoiceStateStoreContext = createContext<MobileVoiceRuntimeStore | null>(null);

function createMobileVoiceRuntimeFacade(
  actions: MobileVoiceActions,
  store: MobileVoiceRuntimeStore,
): MobileVoiceRuntime {
  return Object.defineProperties(
    { ...actions },
    {
      permissionState: { enumerable: true, get: () => store.getState().permissionState },
      pushToTalkState: { enumerable: true, get: () => store.getState().pushToTalkState },
      roomState: { enumerable: true, get: () => store.getState().roomState },
      screenShareAudioMuted: {
        enumerable: true,
        get: () => store.getState().screenShareAudioMuted,
      },
      screenShareQualityId: {
        enumerable: true,
        get: () => store.getState().screenShareQualityId,
      },
      voiceAudioProcessing: {
        enumerable: true,
        get: () => store.getState().voiceAudioProcessing,
      },
      voiceInputMode: { enumerable: true, get: () => store.getState().voiceInputMode },
    },
  ) as MobileVoiceRuntime;
}

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

  const beginCaptureConsentGuard = voiceRoom.beginCaptureConsentGuard;
  const endCaptureConsentGuard = voiceRoom.endCaptureConsentGuard;
  const roomSelfCameraEnabled = voiceRoom.roomState.selfCameraEnabled;
  const toggleVoiceRoomCamera = voiceRoom.toggleCamera;

  const toggleCamera = useCallback(async () => {
    // The camera-permission dialog backgrounds the app; guard so it cannot tear
    // down an in-progress screen share while the user turns their camera on.
    beginCaptureConsentGuard();
    try {
      if (!roomSelfCameraEnabled && !mediaState.hasCameraPermission) {
        const permission = await requestCameraPermission();
        if (!permission.hasCameraPermission) {
          return;
        }
      }
      await toggleVoiceRoomCamera();
    } finally {
      endCaptureConsentGuard();
    }
  }, [
    beginCaptureConsentGuard,
    endCaptureConsentGuard,
    mediaState.hasCameraPermission,
    requestCameraPermission,
    roomSelfCameraEnabled,
    toggleVoiceRoomCamera,
  ]);

  const latestRuntimeRef = useRef({
    ...voiceRoom,
    requestMicrophonePermission,
    selectVoiceInputMode,
    toggleCamera,
  });
  latestRuntimeRef.current = {
    ...voiceRoom,
    requestMicrophonePermission,
    selectVoiceInputMode,
    toggleCamera,
  };

  const actions = useMemo<MobileVoiceActions>(
    () => ({
      beginCaptureConsentGuard: () => latestRuntimeRef.current.beginCaptureConsentGuard(),
      beginPushToTalk: () => latestRuntimeRef.current.beginPushToTalk(),
      endCaptureConsentGuard: () => latestRuntimeRef.current.endCaptureConsentGuard(),
      endPushToTalk: () => latestRuntimeRef.current.endPushToTalk(),
      flipCamera: () => latestRuntimeRef.current.flipCamera(),
      joinDirectCall: (input) => latestRuntimeRef.current.joinDirectCall(input),
      joinVoiceChannel: (input) => latestRuntimeRef.current.joinVoiceChannel(input),
      leaveVoiceChannel: () => latestRuntimeRef.current.leaveVoiceChannel(),
      refreshVoiceDevices: () => latestRuntimeRef.current.refreshVoiceDevices(),
      requestMicrophonePermission: () => latestRuntimeRef.current.requestMicrophonePermission(),
      selectAudioDeviceOutput: (deviceId) =>
        latestRuntimeRef.current.selectAudioDeviceOutput(deviceId),
      selectAudioInput: (deviceId) => latestRuntimeRef.current.selectAudioInput(deviceId),
      selectAudioOutput: (output) => latestRuntimeRef.current.selectAudioOutput(output),
      selectAudioProcessing: (processing) =>
        latestRuntimeRef.current.selectAudioProcessing(processing),
      selectNoiseSuppression: (enabled) => latestRuntimeRef.current.selectNoiseSuppression(enabled),
      selectScreenShareAudioMuted: (muted) =>
        latestRuntimeRef.current.selectScreenShareAudioMuted(muted),
      selectScreenShareQuality: (qualityId) =>
        latestRuntimeRef.current.selectScreenShareQuality(qualityId),
      selectVoiceInputMode: (mode) => latestRuntimeRef.current.selectVoiceInputMode(mode),
      syncParticipantAudioLevelFromServer: (input) =>
        latestRuntimeRef.current.syncParticipantAudioLevelFromServer(input),
      syncParticipantsFromServer: (input) =>
        latestRuntimeRef.current.syncParticipantsFromServer(input),
      toggleCamera: () => latestRuntimeRef.current.toggleCamera(),
      toggleMute: () => latestRuntimeRef.current.toggleMute(),
      toggleScreenShare: () => latestRuntimeRef.current.toggleScreenShare(),
    }),
    [],
  );

  const [stateStore] = useState(() =>
    createMobileVoiceRuntimeStore({
      permissionState: voiceRoom.permissionState,
      pushToTalkState: voiceRoom.pushToTalkState,
      roomState: voiceRoom.roomState,
      screenShareAudioMuted: voiceRoom.screenShareAudioMuted,
      screenShareQualityId: voiceRoom.screenShareQualityId,
      voiceAudioProcessing: voiceRoom.voiceAudioProcessing,
      voiceInputMode,
    }),
  );

  useLayoutEffect(() => {
    stateStore.setState({
      permissionState: voiceRoom.permissionState,
      pushToTalkState: voiceRoom.pushToTalkState,
      roomState: voiceRoom.roomState,
      screenShareAudioMuted: voiceRoom.screenShareAudioMuted,
      screenShareQualityId: voiceRoom.screenShareQualityId,
      voiceAudioProcessing: voiceRoom.voiceAudioProcessing,
      voiceInputMode,
    });
  }, [
    stateStore,
    voiceInputMode,
    voiceRoom.permissionState,
    voiceRoom.pushToTalkState,
    voiceRoom.roomState,
    voiceRoom.screenShareAudioMuted,
    voiceRoom.screenShareQualityId,
    voiceRoom.voiceAudioProcessing,
  ]);

  return (
    <MobileVoiceActionsContext.Provider value={actions}>
      <MobileVoiceStateStoreContext.Provider value={stateStore}>
        {children}
      </MobileVoiceStateStoreContext.Provider>
    </MobileVoiceActionsContext.Provider>
  );
}

export function useMobileVoiceRuntimeState<T>(
  selector: (state: MobileVoiceRuntimeStoreState) => T,
): T {
  const store = useContext(MobileVoiceStateStoreContext);
  if (!store) {
    throw new Error("Mobile voice provider is missing.");
  }

  return useStore(store, selector);
}

export function useMobileVoiceActions(): MobileVoiceActions {
  const actions = useContext(MobileVoiceActionsContext);
  if (!actions) {
    throw new Error("Mobile voice provider is missing.");
  }
  return actions;
}

function useOptionalMobileVoiceRuntimeFacade(): MobileVoiceRuntime | null {
  const actions = useContext(MobileVoiceActionsContext);
  const store = useContext(MobileVoiceStateStoreContext);
  return useMemo(
    () => (actions && store ? createMobileVoiceRuntimeFacade(actions, store) : null),
    [actions, store],
  );
}

export function useMobileVoiceRuntime(): MobileVoiceRuntime {
  const runtime = useOptionalMobileVoiceRuntimeFacade();
  if (!runtime) {
    throw new Error("Mobile voice provider is missing.");
  }
  return runtime;
}

/**
 * For surfaces that can start a call but do not belong to the voice feature —
 * the friends list's "Katıl" pill, for one. They render standalone in tests and
 * previews, where throwing on a missing provider would be the wrong answer:
 * without it there is simply nothing to join.
 */
export function useOptionalMobileVoiceRuntime(): MobileVoiceRuntime | null {
  return useOptionalMobileVoiceRuntimeFacade();
}
