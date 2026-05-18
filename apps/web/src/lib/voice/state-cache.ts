import type { VoiceChannelStateDTO } from "@/lib/voice/types";

export function mapVoiceStateCache(
  states: VoiceChannelStateDTO[] | undefined,
  channelId: string,
  participants: Array<{
    avatarUrl: string | null;
    displayName: string | null;
    isScreenSharing?: boolean;
    userId: string;
    username: string;
  }>,
) {
  const nextStates = states ? [...states] : [];
  const existingIndex = nextStates.findIndex((state) => state.channelId === channelId);

  if (participants.length === 0) {
    if (existingIndex >= 0) {
      nextStates.splice(existingIndex, 1);
    }
    return nextStates;
  }

  const nextState: VoiceChannelStateDTO = {
    channelId,
    participants,
  };

  if (existingIndex >= 0) {
    nextStates[existingIndex] = nextState;
    return nextStates;
  }

  nextStates.push(nextState);
  return nextStates;
}

export function removeVoiceStateParticipantFromCache(
  states: VoiceChannelStateDTO[] | undefined,
  channelId: string,
  userId: string,
) {
  if (!states) {
    return states;
  }

  const existingIndex = states.findIndex((state) => state.channelId === channelId);
  if (existingIndex < 0) {
    return states;
  }

  const existingState = states[existingIndex]!;
  const nextParticipants = existingState.participants.filter(
    (participant) => participant.userId !== userId,
  );
  const nextStates = [...states];

  if (nextParticipants.length === 0) {
    nextStates.splice(existingIndex, 1);
    return nextStates;
  }

  nextStates[existingIndex] = {
    ...existingState,
    participants: nextParticipants,
  };
  return nextStates;
}

export function mapVoiceScreenShareStateCache(
  states: VoiceChannelStateDTO[] | undefined,
  channelId: string,
  userId: string,
  isScreenSharing: boolean,
) {
  if (!states) {
    return states;
  }

  return states.map((state) => {
    if (state.channelId !== channelId) {
      return state;
    }

    return {
      ...state,
      participants: state.participants.map((participant) =>
        participant.userId === userId
          ? {
              ...participant,
              isScreenSharing,
            }
          : participant,
      ),
    };
  });
}
