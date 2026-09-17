import type { ScreenShareStreamInfo } from "@wizards/types";
import {
  Track,
  type LocalVideoTrack,
  type Participant,
  type RemoteVideoTrack,
  type Room,
  type TrackPublication,
} from "livekit-client";

export type VoiceCurrentUser = {
  id: string;
  avatarUrl?: string | null;
  displayName: string;
  username: string;
};

export type VoiceParticipantProfile = {
  avatarUrl: string | null;
  displayName: string | null;
  userId: string;
  username: string;
};

export type VoiceParticipantRosterEntry = VoiceParticipantProfile & {
  stream?: ScreenShareStreamInfo | null | undefined;
  isDeafened?: boolean;
};

export type VoiceParticipantCameraState = {
  cameraPublication: TrackPublication | null;
  cameraTrack: LocalVideoTrack | RemoteVideoTrack | null;
  isCameraEnabled: boolean;
};

export interface VoiceScreenShareViewModel {
  stream?: ScreenShareStreamInfo | null;
  avatarUrl: string | null;
  displayName: string | null;
  id: string;
  isLocal: boolean;
  participantId: string;
  /** Carried so a surface can ask this publication for the layer it needs. */
  publication: TrackPublication | null;
  track: LocalVideoTrack | RemoteVideoTrack | null;
  trackSid: string;
  username: string;
}

type ParticipantProfileSource = {
  identity: string;
  metadata?: string | null;
  name?: string | null;
};

export function getParticipantProfile(
  participant: ParticipantProfileSource,
  currentUser: VoiceCurrentUser,
  roster: readonly VoiceParticipantRosterEntry[] = [],
): VoiceParticipantProfile {
  if (participant.identity === currentUser.id) {
    return {
      userId: currentUser.id,
      username: currentUser.username,
      displayName: currentUser.displayName,
      avatarUrl: currentUser.avatarUrl ?? null,
    };
  }

  const rosterProfile = roster.find((entry) => entry.userId === participant.identity);
  if (rosterProfile) {
    return {
      avatarUrl: rosterProfile.avatarUrl,
      displayName: rosterProfile.displayName,
      userId: rosterProfile.userId,
      username: rosterProfile.username,
    };
  }

  // Participant metadata used to win here even though peers could rewrite it.
  // The token name is server-issued; identity is the safe final fallback.
  const name = participant.name?.trim() || participant.identity;

  return {
    userId: participant.identity,
    username: name,
    displayName: participant.name?.trim() || null,
    avatarUrl: null,
  };
}

export function getParticipantCameraState(participant: Participant): VoiceParticipantCameraState {
  const cameraPublication = participant.getTrackPublication(Track.Source.Camera);
  const cameraTrack = cameraPublication?.videoTrack ?? null;
  const isCameraEnabled = Boolean(cameraTrack) && cameraPublication?.isMuted !== true;

  return {
    cameraPublication: isCameraEnabled ? (cameraPublication ?? null) : null,
    cameraTrack: isCameraEnabled ? cameraTrack : null,
    isCameraEnabled,
  };
}

export function getParticipantDeafenState(
  participant: ParticipantProfileSource,
  roster: readonly Pick<VoiceParticipantRosterEntry, "isDeafened" | "userId">[] = [],
) {
  return roster.find((entry) => entry.userId === participant.identity)?.isDeafened === true;
}

export function getScreenShareId(participantId: string, trackSid: string) {
  return `${participantId}:${trackSid}`;
}

export function collectScreenShares(
  targetRoom: Room,
  currentUser: VoiceCurrentUser,
  roster: readonly VoiceParticipantRosterEntry[] = [],
): VoiceScreenShareViewModel[] {
  return [targetRoom.localParticipant, ...targetRoom.remoteParticipants.values()].flatMap(
    (participant) => {
      const profile = getParticipantProfile(participant, currentUser, roster);

      return participant
        .getTrackPublications()
        .filter(
          (publication) => publication.source === Track.Source.ScreenShare && !publication.isMuted,
        )
        .map((publication) => ({
          stream: roster.find((entry) => entry.userId === participant.identity)?.stream ?? null,
          avatarUrl: profile.avatarUrl,
          displayName: profile.displayName,
          id: getScreenShareId(participant.identity, publication.trackSid),
          isLocal: participant.identity === currentUser.id,
          participantId: participant.identity,
          publication,
          track: publication.videoTrack ?? null,
          trackSid: publication.trackSid,
          username: profile.username,
        }));
    },
  );
}

export function countActiveScreenShares(targetRoom: Room) {
  return [targetRoom.localParticipant, ...targetRoom.remoteParticipants.values()].reduce(
    (count, participant) =>
      count +
      participant
        .getTrackPublications()
        .filter(
          (publication) => publication.source === Track.Source.ScreenShare && !publication.isMuted,
        ).length,
    0,
  );
}
