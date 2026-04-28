"use client";

import { useEffect, useState } from "react";
import { ConnectionState, type Room } from "livekit-client";
import { Loader2, MicOff, Video } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { useI18n } from "@/components/providers/locale-provider";
import {
  useVoiceConnection,
  type VoiceParticipantViewModel,
} from "@/components/providers/voice-provider";
import { cn } from "@/lib/utils";

type VoiceChannelViewProps = {
  channelId: string;
  serverId: string;
};

function getSpeakingClass(participant: VoiceParticipantViewModel) {
  if (participant.isSpeaking) {
    return "ring-4 ring-[hsl(var(--success)/0.55)]";
  }

  return "ring-1 ring-[hsl(var(--border)/0.8)]";
}

function isReconnectState(state: ConnectionState) {
  return (
    state === ConnectionState.Reconnecting ||
    state === ConnectionState.SignalReconnecting
  );
}

function VoiceParticipantCard({ participant }: { participant: VoiceParticipantViewModel }) {
  const { t } = useI18n();
  const displayName = participant.displayName ?? participant.username;

  return (
    <div className="app-panel relative overflow-hidden rounded-[28px] border p-4">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className={cn("rounded-full transition", getSpeakingClass(participant))}>
            <Avatar
              alt={displayName}
              className="h-14 w-14 border-none text-sm"
              fallback={displayName}
              src={participant.avatarUrl}
            />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-app-foreground">
              {displayName}
            </p>
            <p className="truncate text-xs text-app-muted">
              @{participant.username}
              {participant.isLocal ? ` • ${t("voice.grid.you")}` : ""}
            </p>
          </div>
        </div>

        {participant.isMuted ? (
          <span
            className="rounded-full border border-[hsl(var(--danger)/0.28)] bg-[hsl(var(--danger)/0.12)] p-2 text-[hsl(var(--danger))]"
            title={t("voice.grid.muted")}
          >
            <MicOff className="h-4 w-4" />
          </span>
        ) : null}
      </div>

      <div className="flex h-48 items-center justify-center rounded-[22px] border border-dashed border-[hsl(var(--border)/0.65)] bg-[hsl(var(--surface-soft)/0.42)] text-center">
        <div className="space-y-2">
          <Video className="mx-auto h-8 w-8 text-app-muted" />
          <p className="text-sm font-medium text-app-foreground">
            {t("voice.grid.videoSoon")}
          </p>
          <p className="text-xs text-app-muted">{t("voice.grid.videoPhase8")}</p>
        </div>
      </div>
    </div>
  );
}

function renderGridParticipants(
  room: Room | null,
  participants: VoiceParticipantViewModel[],
) {
  if (!room) {
    return [];
  }

  const currentParticipantOrder = new Map(
    [
      room.localParticipant,
      ...room.remoteParticipants.values(),
    ].map((participant, index) => [participant.identity, index]),
  );

  return [...participants].sort((left, right) => {
    return (
      (currentParticipantOrder.get(left.userId) ?? Number.MAX_SAFE_INTEGER) -
      (currentParticipantOrder.get(right.userId) ?? Number.MAX_SAFE_INTEGER)
    );
  });
}

export function VoiceChannelView({ channelId, serverId }: VoiceChannelViewProps) {
  const { t } = useI18n();
  const {
    activeChannelId,
    connectionState,
    errorMessage,
    isJoining,
    joinChannel,
    participants,
    room,
  } = useVoiceConnection();
  const [hasRequestedJoin, setHasRequestedJoin] = useState(false);

  useEffect(() => {
    setHasRequestedJoin(true);
    void joinChannel({ channelId, serverId }).catch(() => {
      // The provider exposes the error message for inline rendering.
    });
  }, [channelId, joinChannel, serverId]);

  const orderedParticipants = renderGridParticipants(room, participants);
  const showReconnectOverlay = isReconnectState(connectionState);

  if ((!hasRequestedJoin || isJoining) && !errorMessage) {
    return (
      <div className="flex h-full items-center justify-center bg-transparent">
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
      <div className="flex h-full items-center justify-center bg-transparent p-6">
        <div className="app-panel max-w-md rounded-[28px] border p-8 text-center">
          <p className="text-base font-semibold text-app-foreground">
            {t("voice.view.disconnectedTitle")}
          </p>
          <p className="mt-2 text-sm text-app-muted">
            {t("voice.view.disconnectedDescription")}
          </p>
          <button
            className="mt-5 rounded-2xl border border-[hsl(var(--primary)/0.32)] bg-[hsl(var(--primary)/0.14)] px-4 py-2 text-sm font-semibold text-app-foreground transition hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
            onClick={() => {
              setHasRequestedJoin(true);
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

  if (errorMessage && !room) {
    return (
      <div className="flex h-full items-center justify-center bg-transparent">
        <div className="max-w-md text-center">
          <p className="text-base font-semibold text-app-foreground">
            {t("voice.view.errorTitle")}
          </p>
          <p className="mt-2 text-sm text-app-muted">{errorMessage}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full overflow-y-auto bg-transparent p-6">
      {showReconnectOverlay ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-[hsl(var(--background)/0.75)] backdrop-blur-sm">
          <div className="app-panel rounded-[28px] border px-6 py-5 text-center shadow-[0_18px_50px_hsl(var(--shadow-color)/0.14)]">
            <Loader2 className="mx-auto h-7 w-7 animate-spin text-app-muted" />
            <p className="mt-3 text-sm font-semibold text-app-foreground">
              {t("voice.view.reconnecting")}
            </p>
          </div>
        </div>
      ) : null}

      <div className="mx-auto flex h-full w-full max-w-6xl flex-col">
        <div className="mb-5">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-app-soft">
            {t("voice.view.eyebrow")}
          </p>
          <h1 className="mt-2 text-2xl font-semibold text-app-foreground">
            {t("voice.view.title")}
          </h1>
          <p className="mt-2 text-sm text-app-muted">
            {t("voice.view.participants", { count: orderedParticipants.length })}
          </p>
        </div>

        <div className="grid flex-1 grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {orderedParticipants.map((participant) => (
            <VoiceParticipantCard key={participant.userId} participant={participant} />
          ))}
        </div>
      </div>
    </div>
  );
}
