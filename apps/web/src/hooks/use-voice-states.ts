"use client";

import { useEffect } from "react";
import type { ScreenShareStreamInfo } from "@wizards/types";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { UserProfileUpdatedPayload } from "@/lib/socket/events";
import { fetchVoiceStates, voiceQueryKeys } from "@/lib/voice/client";
import type { VoiceChannelStateDTO } from "@/lib/voice/types";
import { useSocket } from "./use-socket";

function applyVoiceStateUpdate(
  current: VoiceChannelStateDTO[] | undefined,
  data: {
    action: "join" | "leave" | "update";
    channelId: string;
    participants: Array<{
      userId: string;
      username: string;
      displayName: string | null;
      avatarUrl: string | null;
      isDeafened: boolean;
      isScreenSharing?: boolean;
      stream?: ScreenShareStreamInfo | null;
      screenShareViewerCount?: number;
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
      isDeafened: participant.isDeafened,
      isScreenSharing: participant.isScreenSharing ?? existingParticipant?.isScreenSharing ?? false,
      stream:
        participant.stream === undefined
          ? (existingParticipant?.stream ?? null)
          : participant.stream,
      screenShareViewerCount:
        participant.screenShareViewerCount ?? existingParticipant?.screenShareViewerCount ?? 0,
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
    stream?: ScreenShareStreamInfo | null;
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
              stream: data.isScreenSharing ? (data.stream ?? null) : null,
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

    const watchVoiceStates = () => {
      socket.emit("voice:states:watch", { serverId });
    };
    const handleServerSettingsUpdated = (data: { serverId: string }) => {
      if (data.serverId === serverId) {
        watchVoiceStates();
      }
    };

    watchVoiceStates();
    socket.on("connect", watchVoiceStates);
    socket.on("server:settings:updated", handleServerSettingsUpdated);

    return () => {
      socket.off("connect", watchVoiceStates);
      socket.off("server:settings:updated", handleServerSettingsUpdated);
      socket.emit("voice:states:unwatch", { serverId });
    };
  }, [serverId, socket]);

  useEffect(() => {
    if (!serverId) {
      return;
    }

    const handleVoiceStateUpdate = (data: {
      action: "join" | "leave" | "update";
      channelId: string;
      userId: string;
      participants: Array<{
        userId: string;
        username: string;
        displayName: string | null;
        avatarUrl: string | null;
        isDeafened: boolean;
        isScreenSharing?: boolean;
      }>;
    }) => {
      queryClient.setQueryData<VoiceChannelStateDTO[] | undefined>(
        voiceQueryKeys.serverStates(serverId),
        (current) => applyVoiceStateUpdate(current, data),
      );
    };

    const handleVoiceScreenShareUpdate = (data: {
      channelId: string;
      isScreenSharing: boolean;
      stream?: ScreenShareStreamInfo | null;
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
