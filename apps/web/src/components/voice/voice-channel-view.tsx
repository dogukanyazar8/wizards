"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps } from "react";
import { ConnectionQuality, RoomEvent, type Participant } from "livekit-client";
import { useQuery } from "@tanstack/react-query";
import type { WorkspaceMember } from "@wizards/types";
import {
  AlertCircle,
  Check,
  Loader2,
  Mic,
  MicOff,
  MonitorUp,
  Send,
  ShieldCheck,
  ShieldOff,
  Video,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { useI18n } from "@/components/providers/locale-provider";
import {
  useVoiceParticipants,
  useVoiceState,
  type VoiceParticipantViewModel,
  type VoiceScreenShareViewModel,
} from "@/components/providers/voice-provider";
import { getSocket } from "@/lib/socket/client";
import type { VoiceInviteStatusPayload } from "@/lib/socket/events";
import { fetchWorkspaceServerMembers } from "@/lib/workspace/client";
import { cn } from "@/lib/utils";
import {
  ScreenShareStage,
  VOICE_SIGNAL_BAR_CLASSES,
  VoiceControlBar,
  VoiceEmptyState,
  VoiceLevelWaveform,
  VoiceParticipantTile,
  getKrispQualityLabelKey,
  getParticipantGridClass,
  getParticipantGridStyle,
  getVoiceSignalStatus,
  getVoiceSignalToneClass,
  isReconnectState,
  renderGridParticipants,
  type VoiceStageFocus,
} from "@/components/voice/room/voice-room-primitives";

type VoiceChannelViewProps = {
  channelId: string;
  serverId: string;
};

type VoiceInviteMember = WorkspaceMember & {
  inviteState?: "accepted" | "declined" | "error" | "idle" | "pending" | "waiting";
};

function isVoiceMemberOnline(member: WorkspaceMember) {
  return member.status !== "OFFLINE";
}

function getSidebarInviteErrorMessage(t: ReturnType<typeof useI18n>["t"], code: string) {
  if (code === "VOICE_INVITE_TARGET_FORBIDDEN") {
    return t("voice.invite.targetPermissionDenied");
  }
  if (code === "VOICE_INVITE_FORBIDDEN") {
    return t("voice.invite.permissionDenied");
  }
  if (code === "VOICE_INVITE_TARGET_OFFLINE") {
    return t("voice.invite.offline");
  }
  if (code === "VOICE_INVITE_TARGET_ALREADY_JOINED") {
    return t("voice.invite.alreadyJoined");
  }
  if (code === "VOICE_INVITE_RATE_LIMITED") {
    return t("voice.invite.rateLimited");
  }
  return t("voice.invite.unavailable");
}

function VoiceParticipantsSidebar({
  inviteError,
  inviteMembers,
  onSendInvite,
  participants,
  pendingInviteUserIds,
  screenShares,
}: {
  inviteError: string | null;
  inviteMembers: VoiceInviteMember[];
  onSendInvite: (member: WorkspaceMember) => void;
  participants: VoiceParticipantViewModel[];
  pendingInviteUserIds: Set<string>;
  screenShares: VoiceScreenShareViewModel[];
}) {
  const { t } = useI18n();
  const onlineMembers = inviteMembers.filter(isVoiceMemberOnline);
  const offlineMembers = inviteMembers.filter((member) => !isVoiceMemberOnline(member));

  return (
    <aside className="flex max-h-[28rem] min-h-0 flex-col overflow-hidden rounded-[24px] border border-[hsl(var(--border)/0.64)] bg-[hsl(var(--surface-card)/0.62)] p-3 shadow-[0_18px_54px_hsl(var(--shadow-color)/0.07)] xl:h-full xl:max-h-none xl:rounded-[30px] xl:p-4">
      <div className="mb-3 flex shrink-0 items-center justify-between gap-3 px-1">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-app-soft">
          {t("voice.room.participantsTitle", { count: participants.length })}
        </p>
        <span className="rounded-full border border-[hsl(var(--border)/0.58)] bg-[hsl(var(--surface-soft)/0.44)] px-2 py-0.5 text-xs font-semibold text-app-muted">
          {participants.length}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <div className="space-y-1.5">
          {participants.length > 0 ? (
            participants.map((participant) => {
              const displayName = participant.displayName ?? participant.username;
              const isScreenSharing = screenShares.some(
                (share) => share.participantId === participant.userId,
              );

              return (
                <div
                  className={cn(
                    "flex min-w-0 items-center gap-3 rounded-[22px] border px-2.5 py-2 transition",
                    participant.isSpeaking
                      ? "border-[hsl(var(--primary)/0.32)] bg-[hsl(var(--primary)/0.10)]"
                      : "border-transparent bg-transparent hover:border-[hsl(var(--border)/0.56)] hover:bg-[hsl(var(--surface-soft)/0.34)]",
                  )}
                  key={participant.userId}
                >
                  <div className="relative shrink-0">
                    <Avatar
                      alt={displayName}
                      className="h-10 w-10 border-none text-xs"
                      fallback={displayName}
                      src={participant.avatarUrl}
                    />
                    <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-[hsl(var(--surface-card))] bg-[hsl(var(--success))]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-app-foreground">
                      {displayName}
                    </p>
                    <p className="truncate text-xs font-medium text-app-muted">
                      @{participant.username}
                      {participant.isLocal ? ` / ${t("voice.grid.you")}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5 text-app-muted">
                    {isScreenSharing ? (
                      <MonitorUp
                        aria-label={t("voice.room.screenSharing")}
                        className="h-3.5 w-3.5 text-[hsl(var(--primary))]"
                      />
                    ) : null}
                    {participant.isCameraEnabled ? (
                      <Video
                        aria-label={t("voice.room.cameraOn")}
                        className="h-3.5 w-3.5 text-[hsl(var(--success))]"
                      />
                    ) : null}
                    {participant.isMuted ? (
                      <MicOff
                        aria-label={t("voice.grid.muted")}
                        className="h-3.5 w-3.5 text-[hsl(var(--danger))]"
                      />
                    ) : (
                      <Mic
                        aria-label={t("voice.room.microphoneOn")}
                        className="h-3.5 w-3.5 text-[hsl(var(--success))]"
                      />
                    )}
                    <VoiceLevelWaveform
                      active={participant.isSpeaking}
                      compact
                      level={participant.audioLevel}
                      muted={participant.isMuted}
                    />
                  </div>
                </div>
              );
            })
          ) : (
            <div className="rounded-[24px] border border-dashed border-[hsl(var(--border)/0.66)] bg-[hsl(var(--surface-soft)/0.28)] px-4 py-6 text-center text-sm font-medium text-app-muted">
              {t("voice.room.emptyTitle")}
            </div>
          )}
        </div>

        <div className="mt-4 border-t border-app-border pt-4">
          <div className="mb-3 flex items-center justify-between gap-3 px-1">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-app-soft">
              {t("voice.room.inviteMembersTitle")}
            </p>
            <span className="rounded-full border border-[hsl(var(--border)/0.58)] bg-[hsl(var(--surface-soft)/0.44)] px-2 py-0.5 text-[10px] font-bold text-app-muted">
              {inviteMembers.length}
            </span>
          </div>

          {inviteError ? (
            <div className="mb-3 flex items-center gap-2 rounded-2xl border border-[hsl(var(--danger)/0.18)] bg-[hsl(var(--danger)/0.08)] px-3 py-2 text-xs font-semibold text-[hsl(var(--danger))]">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              <span>{inviteError}</span>
            </div>
          ) : null}

          {inviteMembers.length > 0 ? (
            <div className="space-y-3">
              <VoiceInviteMemberGroup
                members={onlineMembers}
                onSendInvite={onSendInvite}
                pendingInviteUserIds={pendingInviteUserIds}
                title={t("voice.room.onlineMembers")}
              />
              <VoiceInviteMemberGroup
                members={offlineMembers}
                onSendInvite={onSendInvite}
                pendingInviteUserIds={pendingInviteUserIds}
                title={t("voice.room.offlineMembers")}
              />
            </div>
          ) : (
            <div className="rounded-[24px] border border-dashed border-[hsl(var(--border)/0.66)] bg-[hsl(var(--surface-soft)/0.28)] px-4 py-6 text-center text-sm font-medium text-app-muted">
              {t("voice.room.noInviteMembers")}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

function VoiceInviteMemberGroup({
  members,
  onSendInvite,
  pendingInviteUserIds,
  title,
}: {
  members: VoiceInviteMember[];
  onSendInvite: (member: WorkspaceMember) => void;
  pendingInviteUserIds: Set<string>;
  title: string;
}) {
  const { t } = useI18n();

  if (members.length === 0) {
    return null;
  }

  return (
    <section className="space-y-1.5">
      <div className="flex items-center justify-between px-1 text-[10px] font-bold uppercase tracking-[0.16em] text-app-soft">
        <span>{title}</span>
        <span>{members.length}</span>
      </div>
      {members.map((member) => {
        const isOnline = isVoiceMemberOnline(member);
        const isPending = pendingInviteUserIds.has(member.userId);
        const inviteState = member.inviteState ?? "idle";

        return (
          <div
            className="flex min-w-0 items-center gap-2 rounded-[20px] border border-transparent px-2.5 py-2 transition hover:border-[hsl(var(--border)/0.56)] hover:bg-[hsl(var(--surface-soft)/0.34)]"
            key={member.userId}
          >
            <div className="relative shrink-0">
              <Avatar
                alt={member.displayName}
                className="h-9 w-9 border-none text-xs"
                fallback={member.displayName}
                src={member.avatarUrl}
              />
              <span
                className={cn(
                  "absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-[hsl(var(--surface-card))]",
                  isOnline ? "bg-[hsl(var(--success))]" : "bg-[hsl(var(--muted-foreground)/0.42)]",
                )}
              />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-app-foreground">
                {member.displayName}
              </p>
              <p className="truncate text-xs font-medium text-app-muted">@{member.username}</p>
            </div>
            {isOnline ? (
              <button
                aria-label={t("voice.room.inviteAction")}
                className={cn(
                  "inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full border px-3 text-xs font-bold transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)] disabled:cursor-not-allowed disabled:opacity-60",
                  inviteState === "accepted"
                    ? "border-[hsl(var(--success)/0.24)] bg-[hsl(var(--success)/0.10)] text-[hsl(var(--success))]"
                    : inviteState === "declined" || inviteState === "error"
                      ? "border-[hsl(var(--danger)/0.22)] bg-[hsl(var(--danger)/0.08)] text-[hsl(var(--danger))]"
                      : inviteState === "waiting"
                        ? "border-[hsl(var(--warning)/0.28)] bg-[hsl(var(--warning)/0.10)] text-app-foreground"
                        : "border-[hsl(var(--primary)/0.28)] bg-[hsl(var(--primary)/0.10)] text-[hsl(var(--primary))] hover:bg-[hsl(var(--primary)/0.16)]",
                )}
                disabled={isPending}
                onClick={() => onSendInvite(member)}
                type="button"
              >
                {isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : inviteState === "accepted" ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  <Send className="h-3.5 w-3.5" />
                )}
                <span className="hidden 2xl:inline">
                  {inviteState === "accepted"
                    ? t("voice.room.inviteAcceptedShort")
                    : inviteState === "declined"
                      ? t("voice.room.inviteDeclinedShort")
                      : inviteState === "error"
                        ? t("voice.room.inviteFailedShort")
                        : inviteState === "waiting"
                          ? t("voice.room.inviteAwaitingShort")
                          : t("voice.room.inviteAction")}
                </span>
              </button>
            ) : (
              <span className="shrink-0 rounded-full border border-[hsl(var(--border)/0.58)] bg-[hsl(var(--surface-soft)/0.42)] px-2.5 py-1 text-[10px] font-bold text-app-soft">
                {t("voice.room.offlineShort")}
              </span>
            )}
          </div>
        );
      })}
    </section>
  );
}

type ScreenShareStagePanelProps = Omit<
  ComponentProps<typeof ScreenShareStage>,
  "activeCameraParticipant" | "onSelectCameraParticipant" | "onSelectStageFocus" | "stageFocus"
>;

function ScreenShareStagePanel(props: ScreenShareStagePanelProps) {
  const [selectedCameraParticipantId, setSelectedCameraParticipantId] = useState<string | null>(
    null,
  );
  const [selectedStageFocus, setSelectedStageFocus] = useState<VoiceStageFocus>("screen");
  const activeCameraParticipant =
    props.cameraParticipants.find(
      (participant) => participant.userId === selectedCameraParticipantId,
    ) ??
    props.cameraParticipants.find((participant) => participant.isLocal) ??
    props.cameraParticipants[0] ??
    null;
  const stageFocus =
    selectedStageFocus === "camera" && props.cameraParticipants.length === 0
      ? "screen"
      : selectedStageFocus;

  return (
    <ScreenShareStage
      {...props}
      activeCameraParticipant={activeCameraParticipant}
      onSelectCameraParticipant={setSelectedCameraParticipantId}
      onSelectStageFocus={setSelectedStageFocus}
      stageFocus={stageFocus}
    />
  );
}

export function VoiceChannelView(props: VoiceChannelViewProps) {
  return <VoiceChannelViewContent {...props} key={`${props.serverId}:${props.channelId}`} />;
}

function VoiceChannelViewContent({ channelId, serverId }: VoiceChannelViewProps) {
  const { t } = useI18n();
  const {
    activeChannelId,
    activeNoiseFilterTier,
    activeScreenShareId,
    cameraError,
    cameraStatus,
    connectionState,
    errorMessage,
    getParticipantVolume,
    isCameraEnabled,
    isApplyingScreenShareQuality,
    isDeafened,
    isJoining,
    isKrispNoiseCancellationActive,
    isMuted,
    isScreenSharing,
    joinChannel,
    krispAvailability,
    leaveChannel,
    resetParticipantVolume,
    room,
    setActiveScreenShareId,
    setParticipantVolume,
    setScreenShareQuality,
    stopScreenShare,
    screenShareQuality,
    toggleCamera,
    toggleDeafen,
    toggleMute,
    toggleScreenShare,
  } = useVoiceState();
  const { participants, screenShares } = useVoiceParticipants();
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteStates, setInviteStates] = useState<
    Record<string, VoiceInviteMember["inviteState"]>
  >({});
  const [pendingInviteUserIds, setPendingInviteUserIds] = useState<Set<string>>(() => new Set());
  const [reportedConnectionQuality, setReportedConnectionQuality] = useState(
    ConnectionQuality.Unknown,
  );
  const inviteStateResetTimersRef = useRef(new Map<string, number>());
  const joinChannelRef = useRef(joinChannel);
  const serverMembersQuery = useQuery({
    enabled: Boolean(serverId),
    queryFn: () => fetchWorkspaceServerMembers(serverId, { limit: 100 }),
    queryKey: ["workspace", "server", serverId, "voice-invite-members"],
    refetchInterval: 30_000,
  });

  useEffect(() => {
    joinChannelRef.current = joinChannel;
  }, [joinChannel]);

  useEffect(() => {
    if (!room) {
      return;
    }

    const handleConnectionQualityChanged = (
      quality: ConnectionQuality,
      participant: Participant,
    ) => {
      if (
        participant === room.localParticipant ||
        participant.identity === room.localParticipant.identity
      ) {
        setReportedConnectionQuality(quality);
      }
    };

    room.on(RoomEvent.ConnectionQualityChanged, handleConnectionQualityChanged);

    return () => {
      room.off(RoomEvent.ConnectionQualityChanged, handleConnectionQualityChanged);
    };
  }, [room]);

  useEffect(() => {
    void joinChannelRef.current({ channelId, serverId }).catch(() => {
      // The provider exposes the error message for inline rendering.
    });
  }, [channelId, serverId]);

  useEffect(() => {
    const timers = inviteStateResetTimersRef.current;
    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      timers.clear();
    };
  }, []);

  useEffect(() => {
    if (!inviteError) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setInviteError(null);
    }, 5_000);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [inviteError]);

  const orderedParticipants = useMemo(
    () => renderGridParticipants(room, participants),
    [participants, room],
  );
  const showReconnectOverlay = isReconnectState(connectionState);
  const participantCount = orderedParticipants.length;
  const activeScreenShare =
    screenShares.find((share) => share.id === activeScreenShareId) ?? screenShares[0] ?? null;
  const cameraParticipants = useMemo(
    () =>
      orderedParticipants.filter(
        (participant) => participant.isCameraEnabled && participant.cameraTrack,
      ),
    [orderedParticipants],
  );
  const localConnectionQuality = room
    ? (room.localParticipant.connectionQuality ?? reportedConnectionQuality)
    : ConnectionQuality.Unknown;
  const screenShareParticipantIds = useMemo(
    () => new Set(screenShares.map((share) => share.participantId)),
    [screenShares],
  );
  const participantUserIds = useMemo(
    () => new Set(orderedParticipants.map((participant) => participant.userId)),
    [orderedParticipants],
  );
  const inviteMembers = useMemo<VoiceInviteMember[]>(() => {
    return (serverMembersQuery.data?.members ?? [])
      .filter((member) => !participantUserIds.has(member.userId))
      .map((member) => ({
        ...member,
        inviteState: inviteStates[member.userId] ?? "idle",
      }));
  }, [inviteStates, participantUserIds, serverMembersQuery.data?.members]);

  const scheduleInviteStateReset = useCallback((userId: string) => {
    const existingTimer = inviteStateResetTimersRef.current.get(userId);
    if (existingTimer) {
      window.clearTimeout(existingTimer);
    }

    const timer = window.setTimeout(() => {
      inviteStateResetTimersRef.current.delete(userId);
      setInviteStates((current) => ({
        ...current,
        [userId]: "idle",
      }));
    }, 5_000);

    inviteStateResetTimersRef.current.set(userId, timer);
  }, []);

  useEffect(() => {
    const socket = getSocket();

    const handleInviteSent = (data: {
      channelId: string;
      expiresAt: string;
      inviteId: string;
      targetUserId: string;
    }) => {
      if (data.channelId !== channelId) {
        return;
      }

      setInviteError(null);
      setPendingInviteUserIds((current) => {
        const next = new Set(current);
        next.delete(data.targetUserId);
        return next;
      });
      setInviteStates((current) => ({
        ...current,
        [data.targetUserId]: "waiting",
      }));
      scheduleInviteStateReset(data.targetUserId);
    };

    const handleInviteStatus = (data: VoiceInviteStatusPayload) => {
      if (data.channelId !== channelId) {
        return;
      }

      setPendingInviteUserIds((current) => {
        const next = new Set(current);
        next.delete(data.targetUserId);
        return next;
      });
      setInviteStates((current) => ({
        ...current,
        [data.targetUserId]: data.status,
      }));
      scheduleInviteStateReset(data.targetUserId);
    };

    const handleInviteError = (error: {
      channelId?: string;
      code: string;
      targetUserId?: string;
    }) => {
      if (error.channelId && error.channelId !== channelId) {
        return;
      }

      if (error.targetUserId) {
        setPendingInviteUserIds((current) => {
          const next = new Set(current);
          next.delete(error.targetUserId!);
          return next;
        });
        setInviteStates((current) => ({
          ...current,
          [error.targetUserId!]: "error",
        }));
        scheduleInviteStateReset(error.targetUserId);
      }
      setInviteError(getSidebarInviteErrorMessage(t, error.code));
    };

    socket.on("voice:invite:sent", handleInviteSent);
    socket.on("voice:invite:status", handleInviteStatus);
    socket.on("voice:invite:error", handleInviteError);

    return () => {
      socket.off("voice:invite:sent", handleInviteSent);
      socket.off("voice:invite:status", handleInviteStatus);
      socket.off("voice:invite:error", handleInviteError);
    };
  }, [channelId, scheduleInviteStateReset, t]);

  const sendVoiceInvite = (member: WorkspaceMember) => {
    if (!isVoiceMemberOnline(member)) {
      setInviteError(t("voice.invite.offline"));
      return;
    }

    setInviteError(null);
    setInviteStates((current) => ({
      ...current,
      [member.userId]: "idle",
    }));
    setPendingInviteUserIds((current) => {
      const next = new Set(current);
      next.add(member.userId);
      return next;
    });
    getSocket().emit("voice:invite:send", {
      channelId,
      serverId,
      targetUserId: member.userId,
    });
  };

  if (isJoining && !errorMessage) {
    return (
      <div
        className="flex h-full items-center justify-center bg-transparent"
        data-testid="voice-connecting-state"
      >
        <div className="text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-app-muted" />
          <p className="mt-3 text-sm font-medium text-app-foreground">
            {t("voice.view.connecting")}
          </p>
        </div>
      </div>
    );
  }

  if (!room && !errorMessage && activeChannelId !== channelId) {
    return (
      <div
        className="flex h-full items-center justify-center bg-transparent p-6"
        data-testid="voice-disconnected-state"
      >
        <div className="app-panel max-w-md rounded-[28px] border p-8 text-center">
          <p className="text-base font-semibold text-app-foreground">
            {t("voice.view.disconnectedTitle")}
          </p>
          <p className="mt-2 text-sm text-app-muted">{t("voice.view.disconnectedDescription")}</p>
          <button
            className="mt-5 rounded-2xl border border-[hsl(var(--primary)/0.32)] bg-[hsl(var(--primary)/0.14)] px-4 py-2 text-sm font-semibold text-app-foreground transition hover:opacity-95 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
            onClick={() => {
              void joinChannel({ channelId, serverId }).catch(() => {
                // The provider exposes the error message for inline rendering.
              });
            }}
            type="button"
          >
            {t("voice.view.reconnectAction")}
          </button>
        </div>
      </div>
    );
  }

  if (errorMessage && !room && activeChannelId !== channelId) {
    return (
      <div
        className="flex h-full items-center justify-center bg-transparent"
        data-testid="voice-error-state"
      >
        <div className="max-w-md text-center">
          <p className="text-base font-semibold text-app-foreground">
            {t("voice.view.errorTitle")}
          </p>
          <p className="mt-2 text-sm text-app-muted">{errorMessage}</p>
        </div>
      </div>
    );
  }

  const isKrispChecking = krispAvailability === "checking" && !isKrispNoiseCancellationActive;
  const krispStatusLabel = isKrispNoiseCancellationActive
    ? t("voice.room.krispActive")
    : isKrispChecking
      ? t("voice.room.krispChecking")
      : t("voice.room.krispInactive");
  const krispQualityLabelKey = isKrispNoiseCancellationActive
    ? getKrispQualityLabelKey(activeNoiseFilterTier)
    : null;
  const krispQualityLabel = krispQualityLabelKey ? t(krispQualityLabelKey) : null;
  const krispStatusTitle = krispQualityLabel
    ? `${krispStatusLabel} - ${krispQualityLabel}`
    : krispStatusLabel;
  const voiceSignalStatus = getVoiceSignalStatus({
    connectionQuality: localConnectionQuality,
    connectionState,
    hasRoom: Boolean(room),
  });
  const voiceSignalLabel = t(voiceSignalStatus.labelKey);

  return (
    <div
      className="relative h-full overflow-hidden bg-transparent p-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:p-3 md:p-4"
      data-testid="voice-channel-view"
    >
      {showReconnectOverlay ? (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-[hsl(var(--background)/0.75)] backdrop-blur-xs">
          <div className="app-panel rounded-[28px] border px-6 py-5 text-center shadow-[0_18px_50px_hsl(var(--shadow-color)/0.14)]">
            <Loader2 className="mx-auto h-7 w-7 animate-spin text-app-muted" />
            <p className="mt-3 text-sm font-semibold text-app-foreground">
              {t("voice.view.reconnecting")}
            </p>
          </div>
        </div>
      ) : null}

      <div className="flex h-full min-h-0 w-full flex-col">
        <section className="flex h-full min-h-0 flex-1 flex-col bg-transparent p-0">
          <div className="mb-2 flex shrink-0 flex-col gap-2 px-1 sm:mb-3 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-app-soft">
                {t("voice.view.eyebrow")}
              </p>
              <h2 className="mt-1 text-xl font-semibold text-app-foreground sm:mt-2 sm:text-2xl">
                {t("voice.view.title")}
              </h2>
              <p className="mt-1 text-sm font-medium text-app-muted sm:mt-2">
                {t("voice.view.participants", { count: participantCount })}
              </p>
            </div>
            <div className="flex max-w-full flex-wrap items-center justify-start gap-2 sm:justify-end">
              <div
                className={cn(
                  "inline-flex min-w-0 max-w-full items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold",
                  isKrispNoiseCancellationActive
                    ? "border-[hsl(var(--success)/0.28)] bg-[hsl(var(--success)/0.12)] text-[hsl(var(--success))]"
                    : isKrispChecking
                      ? "border-[hsl(var(--warning)/0.26)] bg-[hsl(var(--warning)/0.10)] text-[hsl(var(--warning))]"
                      : "border-[hsl(var(--border)/0.72)] bg-[hsl(var(--surface-soft)/0.58)] text-app-muted",
                )}
                data-testid="voice-krisp-status"
                title={krispStatusTitle}
              >
                {isKrispChecking ? (
                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden="true" />
                ) : isKrispNoiseCancellationActive ? (
                  <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                ) : (
                  <ShieldOff className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                )}
                <span className="truncate">{krispStatusLabel}</span>
                {krispQualityLabel ? (
                  <span
                    className="shrink-0 rounded-full border border-[hsl(var(--success)/0.28)] bg-[hsl(var(--success)/0.14)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[hsl(var(--success))]"
                    data-testid="voice-krisp-quality-badge"
                  >
                    {krispQualityLabel}
                  </span>
                ) : null}
              </div>
              <div
                className={cn(
                  "inline-flex min-w-0 max-w-full items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                  getVoiceSignalToneClass(voiceSignalStatus.tone),
                )}
                data-testid="voice-signal-status"
                title={voiceSignalLabel}
              >
                {voiceSignalStatus.isLoading ? (
                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden="true" />
                ) : voiceSignalStatus.tone === "danger" ? (
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                ) : (
                  <span className="flex h-3.5 shrink-0 items-end gap-0.5" aria-hidden="true">
                    {VOICE_SIGNAL_BAR_CLASSES.map((heightClass, index) => (
                      <span
                        className={cn(
                          "w-1 rounded-full bg-current transition-opacity",
                          heightClass,
                          index < voiceSignalStatus.strength ? "opacity-100" : "opacity-25",
                        )}
                        key={heightClass}
                      />
                    ))}
                  </span>
                )}
                <span className="truncate">{voiceSignalLabel}</span>
              </div>
            </div>
          </div>

          {errorMessage ? (
            <div
              className="mb-4 rounded-[24px] border border-[hsl(var(--warning)/0.24)] bg-[hsl(var(--warning)/0.08)] px-4 py-3"
              data-testid="voice-inline-error"
            >
              <p className="text-sm font-medium text-app-foreground">{errorMessage}</p>
            </div>
          ) : null}

          {cameraError ? (
            <div
              className="mb-4 rounded-[24px] border border-[hsl(var(--warning)/0.24)] bg-[hsl(var(--warning)/0.08)] px-4 py-3"
              data-testid="voice-camera-error"
            >
              <p className="text-sm font-medium text-app-foreground">{cameraError}</p>
            </div>
          ) : null}

          <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_auto] gap-3 overflow-hidden xl:grid-cols-[minmax(0,1fr)_20rem] xl:grid-rows-1 xl:gap-4">
            <div className="h-full min-h-0 min-w-0 overflow-hidden">
              {screenShares.length > 0 ? (
                <ScreenShareStagePanel
                  activeShare={activeScreenShare}
                  cameraParticipants={cameraParticipants}
                  isApplyingQuality={isApplyingScreenShareQuality}
                  onSelectShare={setActiveScreenShareId}
                  onSelectQuality={(qualityId) => {
                    void setScreenShareQuality(qualityId);
                  }}
                  onStopShare={() => {
                    void stopScreenShare();
                  }}
                  screenShares={screenShares}
                  selectedQuality={screenShareQuality}
                />
              ) : participantCount > 0 ? (
                <div
                  className={getParticipantGridClass()}
                  style={getParticipantGridStyle(participantCount)}
                >
                  {orderedParticipants.map((participant) => (
                    <VoiceParticipantTile
                      isLocalOutputMuted={isDeafened}
                      isScreenSharing={screenShareParticipantIds.has(participant.userId)}
                      key={participant.userId}
                      onResetVolume={() => resetParticipantVolume(participant.userId)}
                      onSetVolume={(volume) => setParticipantVolume(participant.userId, volume)}
                      participant={participant}
                      participantVolume={getParticipantVolume(participant.userId)}
                    />
                  ))}
                </div>
              ) : (
                <VoiceEmptyState />
              )}
            </div>

            <VoiceParticipantsSidebar
              inviteError={inviteError}
              inviteMembers={inviteMembers}
              onSendInvite={sendVoiceInvite}
              pendingInviteUserIds={pendingInviteUserIds}
              participants={orderedParticipants}
              screenShares={screenShares}
            />
          </div>

          <VoiceControlBar
            cameraStatus={cameraStatus}
            isCameraEnabled={isCameraEnabled}
            isDeafened={isDeafened}
            isMuted={isMuted}
            isScreenSharing={isScreenSharing}
            leaveChannel={leaveChannel}
            toggleCamera={toggleCamera}
            toggleDeafen={toggleDeafen}
            toggleMute={toggleMute}
            toggleScreenShare={toggleScreenShare}
          />
        </section>
      </div>
    </div>
  );
}
