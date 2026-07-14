import { useCallback, useEffect, useState } from "react";
import type { MobileVoiceStateParticipant } from "@wizards/types";
import { activeMobileCopy } from "../../locale/mobile-locale-preferences";
import type { MobileRealtimeEventEnvelope } from "../../realtime/mobile-realtime-contract";
import {
  getMobileVoiceInviteErrorPayload,
  getMobileVoiceInviteReceivedPayload,
  getMobileVoiceInviteSendResultPayload,
  getMobileVoiceInviteStatusPayload,
  type MobileVoiceInviteReceived,
  type MobileVoiceInviteSendState,
} from "../../voice/mobile-voice-room-contract";

const copy = activeMobileCopy;
const MOBILE_VOICE_INVITE_LIMIT = 3;

type MobileVoiceInviteEntry = MobileVoiceInviteReceived & {
  readonly errorMessage: string | null;
  readonly isAccepting: boolean;
};

type MobileVoiceChannelInput = {
  readonly channelId: string;
  readonly channelName: string;
  readonly serverId: string;
};

function getMobileVoiceStateUpdatePayload(payload: unknown): {
  channelId: string;
  participants: MobileVoiceStateParticipant[];
  serverId: string;
} | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const record = payload as Record<string, unknown>;
  if (
    typeof record.channelId !== "string" ||
    typeof record.serverId !== "string" ||
    !Array.isArray(record.participants)
  ) {
    return null;
  }

  const participants = record.participants
    .filter((participant): participant is Record<string, unknown> => {
      return Boolean(participant) && typeof participant === "object" && !Array.isArray(participant);
    })
    .flatMap((participant) => {
      if (typeof participant.userId !== "string" || typeof participant.username !== "string") {
        return [];
      }

      return [
        {
          avatarUrl: typeof participant.avatarUrl === "string" ? participant.avatarUrl : null,
          displayName: typeof participant.displayName === "string" ? participant.displayName : null,
          isScreenSharing: participant.isScreenSharing === true,
          userId: participant.userId,
          username: participant.username,
        },
      ];
    });

  return {
    channelId: record.channelId,
    participants,
    serverId: record.serverId,
  };
}

function getMobileVoiceAudioLevelUpdatePayload(payload: unknown): {
  audioLevel: number;
  channelId: string;
  isMuted: boolean;
  isSpeaking: boolean;
  userId: string;
} | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const record = payload as Record<string, unknown>;
  if (
    typeof record.audioLevel !== "number" ||
    typeof record.channelId !== "string" ||
    typeof record.isMuted !== "boolean" ||
    typeof record.isSpeaking !== "boolean" ||
    typeof record.userId !== "string"
  ) {
    return null;
  }

  return {
    audioLevel: record.audioLevel,
    channelId: record.channelId,
    isMuted: record.isMuted,
    isSpeaking: record.isSpeaking,
    userId: record.userId,
  };
}

export function useMobileVoiceInviteFeature({
  emitVoiceInviteAccept,
  emitVoiceInviteDecline,
  emitVoiceInviteSend,
  joinVoiceChannel,
  onOpenVoiceInvite,
  onVoiceRoomJoined,
  subscribe,
  syncParticipantAudioLevelFromServer,
  syncParticipantsFromServer,
  voiceChannelId,
  voiceServerId,
}: {
  readonly emitVoiceInviteAccept: (input: {
    channelId: string;
    inviteId: string;
    serverId: string;
  }) => void;
  readonly emitVoiceInviteDecline: (input: {
    channelId: string;
    inviteId: string;
    serverId: string;
  }) => void;
  readonly emitVoiceInviteSend: (input: {
    channelId: string;
    serverId: string;
    targetUserId: string;
  }) => void;
  readonly joinVoiceChannel: (input: MobileVoiceChannelInput) => Promise<boolean>;
  readonly onOpenVoiceInvite: (input: MobileVoiceChannelInput) => void;
  readonly onVoiceRoomJoined: (input: MobileVoiceChannelInput) => void;
  readonly subscribe: (listener: (event: MobileRealtimeEventEnvelope) => void) => () => void;
  readonly syncParticipantAudioLevelFromServer: (input: {
    audioLevel: number;
    channelId: string;
    isMuted: boolean;
    isSpeaking: boolean;
    userId: string;
  }) => void;
  readonly syncParticipantsFromServer: (input: {
    channelId: string;
    participants: MobileVoiceStateParticipant[];
    serverId: string;
  }) => void;
  readonly voiceChannelId: string | null;
  readonly voiceServerId: string | null;
}) {
  const [voiceInviteEntries, setVoiceInviteEntries] = useState<MobileVoiceInviteEntry[]>([]);
  const [voiceInviteSendStates, setVoiceInviteSendStates] = useState<
    Record<string, MobileVoiceInviteSendState>
  >({});

  const handleSendVoiceInvite = useCallback(
    (targetUserId: string) => {
      const normalizedTargetUserId = targetUserId.trim();

      if (!voiceChannelId || !voiceServerId || !normalizedTargetUserId) {
        setVoiceInviteSendStates((current) => ({
          ...current,
          [normalizedTargetUserId]: {
            errorMessage: copy.voiceInviteRealtimeUnavailable,
            expiresAt: null,
            inviteId: null,
            status: "failed",
          },
        }));
        return;
      }

      setVoiceInviteSendStates((current) => ({
        ...current,
        [normalizedTargetUserId]: {
          errorMessage: null,
          expiresAt: null,
          inviteId: null,
          status: "sending",
        },
      }));

      emitVoiceInviteSend({
        channelId: voiceChannelId,
        serverId: voiceServerId,
        targetUserId: normalizedTargetUserId,
      });
    },
    [emitVoiceInviteSend, voiceChannelId, voiceServerId],
  );

  const handleAcceptVoiceInvite = useCallback(
    (inviteId: string) => {
      const invite = voiceInviteEntries.find((entry) => entry.id === inviteId);

      if (!invite) {
        return;
      }

      setVoiceInviteEntries((current) =>
        current.map((entry) =>
          entry.id === inviteId ? { ...entry, errorMessage: null, isAccepting: true } : entry,
        ),
      );
      emitVoiceInviteAccept({
        channelId: invite.channelId,
        inviteId: invite.id,
        serverId: invite.serverId,
      });
      onOpenVoiceInvite({
        channelId: invite.channelId,
        channelName: invite.channelName,
        serverId: invite.serverId,
      });
      void joinVoiceChannel({
        channelId: invite.channelId,
        channelName: invite.channelName,
        serverId: invite.serverId,
      }).then((joined) => {
        if (joined) {
          onVoiceRoomJoined({
            channelId: invite.channelId,
            channelName: invite.channelName,
            serverId: invite.serverId,
          });
          setVoiceInviteEntries((current) => current.filter((entry) => entry.id !== invite.id));
          return;
        }

        setVoiceInviteEntries((current) =>
          current.map((entry) =>
            entry.id === invite.id
              ? { ...entry, errorMessage: copy.voiceRoomError, isAccepting: false }
              : entry,
          ),
        );
      });
    },
    [
      emitVoiceInviteAccept,
      joinVoiceChannel,
      onOpenVoiceInvite,
      onVoiceRoomJoined,
      voiceInviteEntries,
    ],
  );

  const handleDeclineVoiceInvite = useCallback(
    (inviteId: string) => {
      const invite = voiceInviteEntries.find((entry) => entry.id === inviteId);

      if (invite) {
        emitVoiceInviteDecline({
          channelId: invite.channelId,
          inviteId: invite.id,
          serverId: invite.serverId,
        });
      }

      setVoiceInviteEntries((current) => current.filter((entry) => entry.id !== inviteId));
    },
    [emitVoiceInviteDecline, voiceInviteEntries],
  );

  const handleLocalRealtimeEvent = useCallback(
    (event: MobileRealtimeEventEnvelope) => {
      const voicePayload =
        event.eventName === "voice:state:update"
          ? getMobileVoiceStateUpdatePayload(event.payload)
          : null;
      const voiceAudioPayload =
        event.eventName === "voice:audio-level:update"
          ? getMobileVoiceAudioLevelUpdatePayload(event.payload)
          : null;
      const voiceInviteReceivedPayload =
        event.eventName === "voice:invite:received"
          ? getMobileVoiceInviteReceivedPayload(event.payload)
          : null;
      const voiceInviteSentPayload =
        event.eventName === "voice:invite:sent"
          ? getMobileVoiceInviteSendResultPayload(event.payload)
          : null;
      const voiceInviteStatusPayload =
        event.eventName === "voice:invite:status" || event.eventName === "voice:invite:accepted"
          ? getMobileVoiceInviteStatusPayload(event.payload)
          : null;
      const voiceInviteErrorPayload =
        event.eventName === "voice:invite:error"
          ? getMobileVoiceInviteErrorPayload(event.payload)
          : null;

      if (voicePayload) {
        syncParticipantsFromServer(voicePayload);
      }

      if (voiceAudioPayload) {
        syncParticipantAudioLevelFromServer(voiceAudioPayload);
      }

      if (voiceInviteReceivedPayload) {
        const expiresAtMs = Date.parse(voiceInviteReceivedPayload.expiresAt);
        if (Number.isNaN(expiresAtMs) || expiresAtMs > Date.now()) {
          setVoiceInviteEntries((current) => {
            const nextEntry: MobileVoiceInviteEntry = {
              ...voiceInviteReceivedPayload,
              errorMessage: null,
              isAccepting: false,
            };
            const withoutDuplicate = current.filter(
              (entry) => entry.id !== voiceInviteReceivedPayload.id,
            );
            return [nextEntry, ...withoutDuplicate].slice(0, MOBILE_VOICE_INVITE_LIMIT);
          });
        }
      }

      if (voiceInviteSentPayload) {
        setVoiceInviteSendStates((current) => ({
          ...current,
          [voiceInviteSentPayload.targetUserId]: {
            errorMessage: null,
            expiresAt: voiceInviteSentPayload.expiresAt,
            inviteId: voiceInviteSentPayload.inviteId,
            status: "sent",
          },
        }));
      }

      if (voiceInviteStatusPayload) {
        setVoiceInviteSendStates((current) => ({
          ...current,
          [voiceInviteStatusPayload.targetUserId]: {
            errorMessage: null,
            expiresAt: null,
            inviteId: voiceInviteStatusPayload.inviteId,
            status: voiceInviteStatusPayload.status,
          },
        }));
        setVoiceInviteEntries((current) =>
          current.filter((entry) => entry.id !== voiceInviteStatusPayload.inviteId),
        );
      }

      if (voiceInviteErrorPayload) {
        if (voiceInviteErrorPayload.targetUserId) {
          setVoiceInviteSendStates((current) => ({
            ...current,
            [voiceInviteErrorPayload.targetUserId as string]: {
              errorMessage: voiceInviteErrorPayload.message,
              expiresAt: null,
              inviteId: voiceInviteErrorPayload.inviteId,
              status: "failed",
            },
          }));
        }

        if (voiceInviteErrorPayload.inviteId) {
          setVoiceInviteEntries((current) =>
            current.map((entry) =>
              entry.id === voiceInviteErrorPayload.inviteId
                ? {
                    ...entry,
                    errorMessage: voiceInviteErrorPayload.message,
                    isAccepting: false,
                  }
                : entry,
            ),
          );
        }
      }
    },
    [syncParticipantAudioLevelFromServer, syncParticipantsFromServer],
  );

  useEffect(() => subscribe(handleLocalRealtimeEvent), [handleLocalRealtimeEvent, subscribe]);

  return {
    handleAcceptVoiceInvite,
    handleDeclineVoiceInvite,
    handleSendVoiceInvite,
    voiceInviteEntries,
    voiceInviteSendStates,
  };
}
