"use client";

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { UserProfileUpdatedPayload } from "@/lib/socket/events";
import { fetchVoiceStates, voiceQueryKeys } from "@/lib/voice/client";
import type { VoiceChannelStateDTO } from "@/lib/voice/types";
import { useSocket } from "./use-socket";

function applyVoiceStateUpdate(
  current: VoiceChannelStateDTO[] | undefined,
  data: {
    action: "join" | "leave";
    channelId: string;
    participants: Array<{
      userId: string;
      username: string;
      displayName: string | null;
      avatarUrl: string | null;
      isScreenSharing?: boolean;
    }>;
  },
) {
  const nextStates = current ? [...current] : [];
  const existingIndex = nextStates.findIndex((state) => state.channelId === data.channelId);
  const mergedParticipants = data.participants.map((participant) => {
    const existingParticipant =
      existingIndex >= 0
        ? nextStates[existingIndex]?.participants.find(
            (entry) => entry.userId === participant.userId,
          )
        : null;

    return {
      userId: participant.userId,
      username: participant.username,
      avatarUrl: participant.avatarUrl,
      displayName: participant.displayName ?? existingParticipant?.displayName ?? null,
      isScreenSharing:
        participant.isScreenSharing ?? existingParticipant?.isScreenSharing ?? false,
    };
  });

  if (data.action === "leave" && mergedParticipants.length === 0) {
    if (existingIndex >= 0) {
      nextStates.splice(existingIndex, 1);
    }
    return nextStates;
  }

  const nextState: VoiceChannelStateDTO = {
    channelId: data.channelId,
    participants: mergedParticipants,
  };

  if (existingIndex >= 0) {
    nextStates[existingIndex] = nextState;
    return nextStates;
  }

  nextStates.push(nextState);
  return nextStates;
}

function applyVoiceScreenShareUpdate(
  current: VoiceChannelStateDTO[] | undefined,
  data: {
    channelId: string;
    isScreenSharing: boolean;
    userId: string;
  },
) {
  if (!current) {
    return current;
  }

  return current.map((state) => {
    if (state.channelId !== data.channelId) {
      return state;
    }

    return {
      ...state,
      participants: state.participants.map((participant) =>
        participant.userId === data.userId
          ? {
              ...participant,
              isScreenSharing: data.isScreenSharing,
            }
          : participant,
      ),
    };
  });
}

function applyVoiceProfileUpdate(
  current: VoiceChannelStateDTO[] | undefined,
  profile: UserProfileUpdatedPayload,
) {
  if (!current) {
    return current;
  }

  return current.map((state) => ({
    ...state,
    participants: state.participants.map((participant) =>
      participant.userId === profile.userId
        ? {
            ...participant,
            avatarUrl: profile.avatarUrl,
            displayName: profile.displayName ?? profile.username,
            username: profile.username,
          }
        : participant,
    ),
  }));
}

export function useVoiceStates(serverId: string | null) {
  const socket = useSocket();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: serverId ? voiceQueryKeys.serverStates(serverId) : ["voice", "states", "idle"],
    queryFn: () => fetchVoiceStates(serverId!),
    enabled: Boolean(serverId),
    staleTime: 15_000,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (!serverId) {
      return;
    }

    const handleVoiceStateUpdate = (data: {
      action: "join" | "leave";
      channelId: string;
      userId: string;
      participants: Array<{
        userId: string;
        username: string;
        displayName: string | null;
        avatarUrl: string | null;
        isScreenSharing?: boolean;
      }>;
    }) => {
      queryClient.setQueryData<VoiceChannelStateDTO[] | undefined>(
        voiceQueryKeys.serverStates(serverId),
        (current) => applyVoiceStateUpdate(current, data),
      );

      void queryClient.refetchQueries({
        queryKey: voiceQueryKeys.serverStates(serverId),
        type: "active",
      });
    };

    const handleVoiceScreenShareUpdate = (data: {
      channelId: string;
      isScreenSharing: boolean;
      userId: string;
    }) => {
      queryClient.setQueryData<VoiceChannelStateDTO[] | undefined>(
        voiceQueryKeys.serverStates(serverId),
        (current) => applyVoiceScreenShareUpdate(current, data),
      );
    };

    const handleProfileUpdate = (data: UserProfileUpdatedPayload) => {
      queryClient.setQueryData<VoiceChannelStateDTO[] | undefined>(
        voiceQueryKeys.serverStates(serverId),
        (current) => applyVoiceProfileUpdate(current, data),
      );
    };

    socket.on("voice:state:update", handleVoiceStateUpdate);
    socket.on("voice:screenshare:update", handleVoiceScreenShareUpdate);
    socket.on("user:profile:updated", handleProfileUpdate);
    return () => {
      socket.off("voice:state:update", handleVoiceStateUpdate);
      socket.off("voice:screenshare:update", handleVoiceScreenShareUpdate);
      socket.off("user:profile:updated", handleProfileUpdate);
    };
  }, [queryClient, serverId, socket]);

  return query;
}
