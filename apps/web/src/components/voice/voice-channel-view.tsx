"use client";

import { useEffect, useState } from "react";
import { ConnectionState, type Room } from "livekit-client";
import { Loader2, MicOff, RotateCcw, Video, Volume2 } from "lucide-react";
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

type VoiceParticipantCardProps = {
  audioPreferenceBadges: string[];
  isKrispNoiseCancellationActive: boolean;
  onResetVolume: () => void;
  onSetVolume: (volume: number) => void;
  participant: VoiceParticipantViewModel;
  participantVolume: number;
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

function VoiceParticipantCard({
  audioPreferenceBadges,
  isKrispNoiseCancellationActive,
  onResetVolume,
  onSetVolume,
  participant,
  participantVolume,
}: VoiceParticipantCardProps) {
  const { t } = useI18n();
  const displayName = participant.displayName ?? participant.username;

  return (
    <div className="app-panel relative flex h-full min-h-[22rem] flex-col overflow-hidden rounded-[28px] border p-4">
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
              {participant.isLocal ? ` / ${t("voice.grid.you")}` : ""}
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

      <div className="flex flex-1 items-center justify-center rounded-[22px] border border-dashed border-[hsl(var(--border)/0.65)] bg-[hsl(var(--surface-soft)/0.42)] text-center">
        <div className="space-y-2">
          <Video className="mx-auto h-8 w-8 text-app-muted" />
          <p className="text-sm font-medium text-app-foreground">
            {t("voice.grid.videoSoon")}
          </p>
          <p className="text-xs text-app-muted">{t("voice.grid.videoPhase8")}</p>
        </div>
      </div>

      {participant.isLocal ? (
        <div className="app-panel-soft mt-4 rounded-[22px] border p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-app-foreground">
              {t("voice.grid.processing")}
            </p>
            <span className="rounded-full border border-[hsl(var(--border)/0.72)] bg-[hsl(var(--surface-soft)/0.56)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-app-soft">
              {isKrispNoiseCancellationActive
                ? t("voice.grid.krispActive")
                : t("voice.grid.browserProcessing")}
            </span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {audioPreferenceBadges.map((badge) => (
              <span
                className="rounded-full border border-[hsl(var(--border)/0.72)] bg-[hsl(var(--surface-soft)/0.48)] px-3 py-1 text-xs font-medium text-app-foreground"
                key={badge}
              >
                {badge}
              </span>
            ))}
          </div>
        </div>
      ) : (
        <div className="app-panel-soft mt-4 rounded-[22px] border p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-app-foreground">
                {t("voice.grid.remoteVolume")}
              </p>
              <p className="mt-1 text-xs text-app-muted">
                {t("voice.grid.remoteVolumeDescription")}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full border border-[hsl(var(--border)/0.72)] bg-[hsl(var(--surface-soft)/0.56)] px-3 py-1 text-xs font-semibold text-app-foreground">
                {participantVolume}%
              </span>
              <button
                aria-label={t("voice.grid.resetVolume")}
                className="rounded-full border border-[hsl(var(--border)/0.72)] bg-[hsl(var(--surface-soft)/0.48)] p-2 text-app-muted transition hover:text-app-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
                onClick={onResetVolume}
                type="button"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <Volume2 className="h-4 w-4 shrink-0 text-app-muted" />
            <input
              aria-label={t("voice.grid.remoteVolume")}
              className="h-2 w-full cursor-pointer appearance-none rounded-full bg-[hsl(var(--surface-soft)/0.86)] accent-[hsl(var(--primary))]"
              max={100}
              min={0}
              onChange={(event) => onSetVolume(Number(event.target.value))}
              step={5}
              type="range"
              value={participantVolume}
            />
          </div>
        </div>
      )}
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
    audioPreferences,
    connectionState,
    errorMessage,
    getParticipantVolume,
    isJoining,
    isKrispNoiseCancellationActive,
    joinChannel,
    participants,
    resetParticipantVolume,
    room,
    setParticipantVolume,
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
  const participantCount = orderedParticipants.length;
  const localAudioPreferenceBadges = [
    audioPreferences.noiseSuppression ? t("voice.grid.noiseSuppression") : null,
    audioPreferences.echoCancellation ? t("voice.grid.echoCancellation") : null,
    audioPreferences.autoGainControl ? t("voice.grid.autoGainControl") : null,
    audioPreferences.krispNoiseCancellation ? t("voice.grid.krisp") : null,
  ].filter((value): value is string => Boolean(value));

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

        <div
          className="grid flex-1 gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,18rem),1fr))]"
          style={{
            gridAutoRows: participantCount > 0 ? "minmax(0, 1fr)" : undefined,
          }}
        >
          {orderedParticipants.map((participant) => (
            <VoiceParticipantCard
              audioPreferenceBadges={localAudioPreferenceBadges}
              isKrispNoiseCancellationActive={isKrispNoiseCancellationActive}
              key={participant.userId}
              onResetVolume={() => resetParticipantVolume(participant.userId)}
              onSetVolume={(volume) => setParticipantVolume(participant.userId, volume)}
              participant={participant}
              participantVolume={getParticipantVolume(participant.userId)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
