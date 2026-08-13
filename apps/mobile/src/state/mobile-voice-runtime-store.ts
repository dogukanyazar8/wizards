import { createStore, type StoreApi } from "zustand/vanilla";

import type { MobileVoiceInputMode } from "../voice/mobile-voice-ptt-contract";
import type { useMobileVoiceRoom } from "../voice/use-mobile-voice-room";

type MobileVoiceRoomRuntime = ReturnType<typeof useMobileVoiceRoom>;

export interface MobileVoiceRuntimeStoreState {
  readonly permissionState: MobileVoiceRoomRuntime["permissionState"];
  readonly pushToTalkState: MobileVoiceRoomRuntime["pushToTalkState"];
  readonly roomState: MobileVoiceRoomRuntime["roomState"];
  readonly screenShareAudioMuted: MobileVoiceRoomRuntime["screenShareAudioMuted"];
  readonly screenShareQualityId: MobileVoiceRoomRuntime["screenShareQualityId"];
  readonly voiceAudioProcessing: MobileVoiceRoomRuntime["voiceAudioProcessing"];
  readonly voiceInputMode: MobileVoiceInputMode;
}

export type MobileVoiceRuntimeStore = StoreApi<MobileVoiceRuntimeStoreState>;

export function createMobileVoiceRuntimeStore(
  initialState: MobileVoiceRuntimeStoreState,
): MobileVoiceRuntimeStore {
  return createStore<MobileVoiceRuntimeStoreState>()(() => initialState);
}
