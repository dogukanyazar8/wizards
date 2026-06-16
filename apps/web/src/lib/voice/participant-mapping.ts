import {
  Track,
  type LocalVideoTrack,
  type Participant,
  type RemoteVideoTrack,
  type Room,
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

export type VoiceParticipantCameraState = {
  cameraTrack: LocalVideoTrack | RemoteVideoTrack | null;
  isCameraEnabled: boolean;
};

export interface VoiceScreenShareViewModel {
  avatarUrl: string | null;
  displayName: string | null;
  id: string;
  isLocal: boolean;
  participantId: string;
  track: LocalVideoTrack | RemoteVideoTrack | null;
  trackSid: string;
  username: string;
}

type ParticipantMetadata = {
  avatarUrl?: string | null;
  displayName?: string | null;
  isDeafened?: boolean;
  username?: string | null;
};

type ParticipantProfileSource = {
  identity: string;
  metadata?: string | null;
  name?: string | null;
};

export function parseParticipantMetadata(participant: { metadata?: string | null }) {
  if (!participant.metadata) {
    return {};
  }

  try {
    const parsed = JSON.parse(participant.metadata) as ParticipantMetadata;
    return parsed ?? {};
  } catch {
    return {};
  }
}

export function getParticipantProfile(
  participant: ParticipantProfileSource,
  currentUser: VoiceCurrentUser,
): VoiceParticipantProfile {
  if (participant.identity === currentUser.id) {
    return {
      userId: currentUser.id,
      username: currentUser.username,
      displayName: currentUser.displayName,
      avatarUrl: currentUser.avatarUrl ?? null,
    };
  }

  const metadata = parseParticipantMetadata(participant);
  const username =
    metadata.username?.trim() ||
    metadata.displayName?.trim() ||
    participant.name?.trim() ||
    participant.identity;

  return {
    userId: participant.identity,
    username,
    displayName: metadata.displayName?.trim() || participant.name?.trim() || null,
    avatarUrl: metadata.avatarUrl ?? null,
  };
}

export function getParticipantCameraState(participant: Participant): VoiceParticipantCameraState {
  const cameraPublication = participant.getTrackPublication(Track.Source.Camera);
  const cameraTrack = cameraPublication?.videoTrack ?? null;
  const isCameraEnabled = Boolean(cameraTrack) && cameraPublication?.isMuted !== true;

  return {
    cameraTrack: isCameraEnabled ? cameraTrack : null,
    isCameraEnabled,
  };
}

export function getParticipantDeafenState(participant: ParticipantProfileSource) {
  return parseParticipantMetadata(participant).isDeafened === true;
}

export function getScreenShareId(participantId: string, trackSid: string) {
  return `${participantId}:${trackSid}`;
}

export function collectScreenShares(
  targetRoom: Room,
  currentUser: VoiceCurrentUser,
): VoiceScreenShareViewModel[] {
  return [targetRoom.localParticipant, ...targetRoom.remoteParticipants.values()].flatMap(
    (participant) => {
      const profile = getParticipantProfile(participant, currentUser);

      return participant
        .getTrackPublications()
        .filter(
          (publication) => publication.source === Track.Source.ScreenShare && !publication.isMuted,
        )
        .map((publication) => ({
          avatarUrl: profile.avatarUrl,
          displayName: profile.displayName,
          id: getScreenShareId(participant.identity, publication.trackSid),
          isLocal: participant.identity === currentUser.id,
          participantId: participant.identity,
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
