import type { LocalVideoTrack, RemoteVideoTrack, Room } from "livekit-client";

import { getParticipantAudioActivity } from "@/lib/voice/provider-lifecycle";
import {
  getParticipantCameraState,
  getParticipantProfile,
  type VoiceCurrentUser,
} from "@/lib/voice/participant-mapping";

export interface VoiceParticipantViewModel {
  audioLevel: number;
  avatarUrl: string | null;
  cameraTrack: LocalVideoTrack | RemoteVideoTrack | null;
  displayName: string | null;
  isCameraEnabled: boolean;
  isLocal: boolean;
  isMuted: boolean;
  isSpeaking: boolean;
  userId: string;
  username: string;
}

export function collectVoiceParticipants(
  targetRoom: Room,
  currentUser: VoiceCurrentUser,
): VoiceParticipantViewModel[] {
  return [targetRoom.localParticipant, ...targetRoom.remoteParticipants.values()].map(
    (participant) => {
      const profile = getParticipantProfile(participant, currentUser);
      const audioActivity = getParticipantAudioActivity(participant);
      const cameraState = getParticipantCameraState(participant);

      return {
        ...profile,
        ...audioActivity,
        ...cameraState,
        isLocal: participant.identity === currentUser.id,
      };
    },
  );
}
