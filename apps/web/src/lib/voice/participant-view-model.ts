import type { LocalVideoTrack, RemoteVideoTrack, Room, TrackPublication } from "livekit-client";

import { getParticipantAudioActivity } from "@/lib/voice/provider-lifecycle";
import {
  getParticipantCameraState,
  getParticipantDeafenState,
  getParticipantProfile,
  type VoiceCurrentUser,
  type VoiceParticipantRosterEntry,
} from "@/lib/voice/participant-mapping";

export interface VoiceParticipantViewModel {
  audioLevel: number;
  avatarUrl: string | null;
  /** Carried so a tile can ask this publication for the layer it needs. */
  cameraPublication: TrackPublication | null;
  cameraTrack: LocalVideoTrack | RemoteVideoTrack | null;
  displayName: string | null;
  isCameraEnabled: boolean;
  isDeafened: boolean;
  isLocal: boolean;
  isMuted: boolean;
  isSpeaking: boolean;
  userId: string;
  username: string;
}

export function collectVoiceParticipants(
  targetRoom: Room,
  currentUser: VoiceCurrentUser,
  roster: readonly VoiceParticipantRosterEntry[] = [],
): VoiceParticipantViewModel[] {
  return [targetRoom.localParticipant, ...targetRoom.remoteParticipants.values()].map(
    (participant) => {
      const profile = getParticipantProfile(participant, currentUser, roster);
      const audioActivity = getParticipantAudioActivity(participant);
      const cameraState = getParticipantCameraState(participant);
      const isLocal = participant.identity === currentUser.id;

      return {
        ...profile,
        ...audioActivity,
        ...cameraState,
        isDeafened: getParticipantDeafenState(participant, roster),
        isLocal,
      };
    },
  );
}
