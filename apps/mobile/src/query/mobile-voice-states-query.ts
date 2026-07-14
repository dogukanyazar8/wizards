import { queryOptions, useQuery } from "@tanstack/react-query";
import type {
  MobileVoiceScreenShareUpdateEvent,
  MobileVoiceStateUpdateEvent,
  MobileVoiceStatesResponse,
} from "@wizards/types";

import type { MobileApiClient } from "../api/mobile-api-client";
import { fetchMobileVoiceStates } from "../voice/mobile-voice-client";
import { mobileQueryKeys } from "./mobile-query-keys";

export function getMobileVoiceStatesQueryOptions(client: MobileApiClient, serverId: string) {
  return queryOptions({
    enabled: serverId.length > 0,
    queryFn: () => fetchMobileVoiceStates(client, { serverId }),
    queryKey: mobileQueryKeys.voiceStates(serverId),
    staleTime: 15_000,
  });
}

export function useMobileVoiceStatesQuery(client: MobileApiClient, serverId: string) {
  return useQuery(getMobileVoiceStatesQueryOptions(client, serverId));
}

export function applyMobileVoiceStateUpdate(
  current: MobileVoiceStatesResponse | undefined,
  update: MobileVoiceStateUpdateEvent,
): MobileVoiceStatesResponse | undefined {
  if (!current) return current;

  const existingIndex = current.states.findIndex((state) => state.channelId === update.channelId);
  const existingParticipants = existingIndex >= 0 ? current.states[existingIndex]?.participants ?? [] : [];
  const participants = update.participants.map((participant) => {
    const existing = existingParticipants.find((entry) => entry.userId === participant.userId);
    return {
      ...participant,
      displayName: participant.displayName ?? existing?.displayName ?? null,
      isScreenSharing: participant.isScreenSharing ?? existing?.isScreenSharing ?? false,
    };
  });

  if (update.action === "leave" && participants.length === 0) {
    return existingIndex < 0
      ? current
      : { states: current.states.filter((state) => state.channelId !== update.channelId) };
  }

  const nextState = { channelId: update.channelId, participants };
  return existingIndex < 0
    ? { states: [...current.states, nextState] }
    : {
        states: current.states.map((state, index) => (index === existingIndex ? nextState : state)),
      };
}

export function applyMobileVoiceScreenShareUpdate(
  current: MobileVoiceStatesResponse | undefined,
  update: MobileVoiceScreenShareUpdateEvent,
): MobileVoiceStatesResponse | undefined {
  if (!current) return current;

  let patched = false;
  const states = current.states.map((state) => {
    if (state.channelId !== update.channelId) return state;
    const participants = state.participants.map((participant) => {
      if (participant.userId !== update.userId) return participant;
      patched = participant.isScreenSharing !== update.isScreenSharing;
      return patched ? { ...participant, isScreenSharing: update.isScreenSharing } : participant;
    });
    return patched ? { ...state, participants } : state;
  });

  return patched ? { states } : current;
}
