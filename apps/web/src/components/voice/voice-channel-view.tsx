"use client";

import { useEffect, useRef, useState } from "react";
import {
  ConnectionState,
  LocalVideoTrack,
  type RemoteVideoTrack,
  type Room,
} from "livekit-client";
import {
  Loader2,
  Maximize2,
  MicOff,
  MonitorUp,
  RotateCcw,
  Video,
  Volume2,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { useI18n } from "@/components/providers/locale-provider";
import {
  useVoiceConnection,
  type VoiceParticipantViewModel,
  type VoiceScreenShareViewModel,
} from "@/components/providers/voice-provider";
import {
  SCREEN_SHARE_QUALITY_OPTIONS,
  type ScreenShareQualityId,
} from "@/lib/voice/screen-share";
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
    <div
      className="app-panel relative flex h-full min-h-[17rem] flex-col overflow-hidden rounded-[24px] border p-3 sm:min-h-[20rem] sm:rounded-[28px] sm:p-4 lg:min-h-[22rem]"
      data-testid="voice-participant-card"
      data-user-id={participant.userId}
      data-username={participant.username}
    >
      <div className="mb-3 flex items-start justify-between gap-3 sm:mb-5">
        <div className="flex min-w-0 items-center gap-3">
          <div className={cn("rounded-full transition", getSpeakingClass(participant))}>
            <Avatar
              alt={displayName}
              className="h-12 w-12 border-none text-sm sm:h-14 sm:w-14"
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

      <div className="flex min-h-[8rem] flex-1 items-center justify-center rounded-[20px] border border-dashed border-[hsl(var(--border)/0.65)] bg-[hsl(var(--surface-soft)/0.42)] text-center sm:rounded-[22px]">
        <div className="space-y-2">
          <Video className="mx-auto h-8 w-8 text-app-muted" />
          <p className="text-sm font-medium text-app-foreground">
            {t("voice.grid.videoSoon")}
          </p>
          <p className="text-xs text-app-muted">{t("voice.grid.videoPhase8")}</p>
        </div>
      </div>

      {participant.isLocal ? (
        <div className="app-panel-soft mt-3 rounded-[20px] border p-3 sm:mt-4 sm:rounded-[22px] sm:p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
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
        <div className="app-panel-soft mt-3 rounded-[20px] border p-3 sm:mt-4 sm:rounded-[22px] sm:p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
                className="flex h-11 w-11 items-center justify-center rounded-full border border-[hsl(var(--border)/0.72)] bg-[hsl(var(--surface-soft)/0.48)] text-app-muted transition hover:text-app-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)] sm:h-auto sm:w-auto sm:p-2"
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
              className="h-3 w-full cursor-pointer appearance-none rounded-full bg-[hsl(var(--surface-soft)/0.86)] accent-[hsl(var(--primary))] sm:h-2"
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

async function toggleElementFullscreen(element: HTMLElement | null) {
  if (!element || typeof document === "undefined") {
    return;
  }

  if (document.fullscreenElement === element) {
    await document.exitFullscreen().catch(() => undefined);
    return;
  }

  await element.requestFullscreen().catch(() => undefined);
}

function ScreenShareVideo({
  track,
}: {
  track: LocalVideoTrack | RemoteVideoTrack | null;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!track || !video) {
      return;
    }

    track.attach(video);
    video.play().catch(() => undefined);

    return () => {
      track.detach(video);
    };
  }, [track]);

  return (
    <video
      autoPlay
      className="h-full w-full rounded-[24px] bg-black object-contain"
      muted={track instanceof LocalVideoTrack}
      playsInline
      ref={videoRef}
    />
  );
}

function ScreenShareStage({
  activeShare,
  isApplyingQuality,
  onSelectShare,
  onSelectQuality,
  onStopShare,
  participants,
  screenShares,
  selectedQuality,
}: {
  activeShare: VoiceScreenShareViewModel | null;
  isApplyingQuality: boolean;
  onSelectShare: (id: string) => void;
  onSelectQuality: (qualityId: ScreenShareQualityId) => void;
  onStopShare: () => void;
  participants: VoiceParticipantViewModel[];
  screenShares: VoiceScreenShareViewModel[];
  selectedQuality: ScreenShareQualityId;
}) {
  const { t } = useI18n();
  const stageRef = useRef<HTMLDivElement | null>(null);
  const sharerName =
    activeShare?.displayName ?? activeShare?.username ?? t("voice.screenShare.unknownSharer");

  return (
    <div
      className="grid flex-1 gap-3 sm:gap-4 lg:grid-cols-[minmax(0,1fr)_16rem]"
      data-testid="voice-screen-share-stage"
    >
      <div className="app-panel relative min-h-[22rem] overflow-hidden rounded-[26px] border p-3 sm:min-h-[30rem] sm:rounded-[32px] sm:p-4">
        <div className="mb-3 flex flex-col gap-3 sm:mb-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-app-soft">
              {t("voice.screenShare.stage")}
            </p>
            <p className="mt-1 truncate text-lg font-semibold text-app-foreground">
              {t("voice.screenShare.sharedBy", { name: sharerName })}
            </p>
          </div>
          {activeShare?.isLocal ? (
            <button
              className="min-h-11 rounded-2xl border border-[hsl(var(--danger)/0.28)] bg-[hsl(var(--danger)/0.12)] px-4 py-2 text-sm font-semibold text-[hsl(var(--danger))] transition hover:bg-[hsl(var(--danger)/0.16)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
              onClick={onStopShare}
              type="button"
            >
              {t("voice.screenShare.stop")}
            </button>
          ) : null}
        </div>

        <div
          className="group relative flex min-h-[16rem] items-center justify-center rounded-[22px] border border-[hsl(var(--border)/0.72)] bg-[hsl(var(--surface-soft)/0.42)] sm:h-[calc(100%-4.75rem)] sm:min-h-[24rem] sm:rounded-[26px]"
          onDoubleClick={() => {
            void toggleElementFullscreen(stageRef.current);
          }}
          ref={stageRef}
          title={t("screenShare.fullscreenHint")}
        >
          {activeShare?.track ? (
            <ScreenShareVideo track={activeShare.track} />
          ) : (
            <div className="text-center">
              <MonitorUp className="mx-auto h-9 w-9 text-app-muted" />
              <p className="mt-3 text-sm font-semibold text-app-foreground">
                {t("voice.screenShare.waitingForTrack")}
              </p>
            </div>
          )}
          <div className="pointer-events-none absolute bottom-4 right-4 inline-flex items-center gap-2 rounded-full border border-white/20 bg-black/46 px-3 py-1.5 text-xs font-semibold text-white opacity-0 shadow-[0_14px_36px_rgba(0,0,0,0.22)] backdrop-blur-xl transition group-hover:opacity-100">
            <Maximize2 className="h-3.5 w-3.5" />
            {t("screenShare.fullscreenHint")}
          </div>
        </div>
      </div>

      <aside className="app-panel flex min-h-[12rem] flex-col rounded-[24px] border p-3 sm:rounded-[28px] sm:p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-app-soft">
          {t("voice.screenShare.activeShares")}
        </p>
        <div className="space-y-2">
          {screenShares.map((share) => {
            const displayName = share.displayName ?? share.username;
            const isActive = activeShare?.id === share.id;

            return (
              <button
                className={cn(
                  "flex min-h-12 w-full items-center gap-3 rounded-2xl border px-3 py-2 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]",
                  isActive
                    ? "border-[hsl(var(--primary)/0.38)] bg-[hsl(var(--primary)/0.14)]"
                    : "border-[hsl(var(--border)/0.72)] bg-[hsl(var(--surface-soft)/0.42)] hover:bg-[hsl(var(--surface-soft)/0.72)]",
                )}
                key={share.id}
                onClick={() => onSelectShare(share.id)}
                type="button"
              >
                <Avatar
                  alt={displayName}
                  className="h-9 w-9 border-none text-xs"
                  fallback={displayName}
                  src={share.avatarUrl}
                />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-app-foreground">
                    {displayName}
                  </p>
                  <p className="truncate text-xs text-app-muted">
                    {share.isLocal
                      ? t("voice.grid.you")
                      : t("voice.screenShare.viewerLabel")}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        {activeShare?.isLocal ? (
          <div className="mt-5 border-t border-app-border pt-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-app-soft">
                  {t("voice.screenShare.quality.title")}
                </p>
                <p className="mt-1 text-xs text-app-muted">
                  {t("voice.screenShare.quality.description")}
                </p>
              </div>
              {isApplyingQuality ? (
                <Loader2 className="h-4 w-4 animate-spin text-app-muted" />
              ) : null}
            </div>
            <div className="grid gap-2">
              {SCREEN_SHARE_QUALITY_OPTIONS.map((option) => {
                const isSelected = selectedQuality === option.id;

                return (
                  <button
                    className={cn(
                      "min-h-14 rounded-2xl border px-3 py-2 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]",
                      isSelected
                        ? "border-[hsl(var(--primary)/0.42)] bg-[hsl(var(--primary)/0.15)]"
                        : "border-[hsl(var(--border)/0.72)] bg-[hsl(var(--surface-soft)/0.42)] hover:bg-[hsl(var(--surface-soft)/0.72)]",
                    )}
                    disabled={isApplyingQuality}
                    data-testid={`screen-share-quality-${option.id}`}
                    key={option.id}
                    onClick={() => onSelectQuality(option.id)}
                    type="button"
                  >
                    <span className="flex items-center justify-between gap-3">
                      <span className="text-sm font-semibold text-app-foreground">
                        {t(option.labelKey)}
                      </span>
                      <span className="rounded-full border border-[hsl(var(--border)/0.72)] bg-[hsl(var(--surface-card)/0.72)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-app-soft">
                        {option.shortLabel}
                      </span>
                    </span>
                    <span className="mt-1 block text-xs text-app-muted">
                      {t(option.descriptionKey)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        <div className="mt-5 border-t border-app-border pt-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-app-soft">
            {t("voice.screenShare.participants")}
          </p>
          <div className="flex flex-wrap gap-2">
            {participants.map((participant) => {
              const displayName = participant.displayName ?? participant.username;

              return (
                <div
                  className={cn(
                    "rounded-full transition",
                    getSpeakingClass(participant),
                  )}
                  key={participant.userId}
                  title={displayName}
                >
                  <Avatar
                    alt={displayName}
                    className="h-9 w-9 border-none text-xs"
                    fallback={displayName}
                    src={participant.avatarUrl}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </aside>
    </div>
  );
}

function renderGridParticipants(
  room: Room | null,
  participants: VoiceParticipantViewModel[],
) {
  if (!room) {
    return participants;
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
    activeScreenShareId,
    audioPreferences,
    connectionState,
    errorMessage,
    getParticipantVolume,
    isApplyingScreenShareQuality,
    isJoining,
    isKrispNoiseCancellationActive,
    joinChannel,
    participants,
    resetParticipantVolume,
    room,
    screenShares,
    setActiveScreenShareId,
    setParticipantVolume,
    setScreenShareQuality,
    stopScreenShare,
    screenShareQuality,
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
  const activeScreenShare =
    screenShares.find((share) => share.id === activeScreenShareId) ??
    screenShares[0] ??
    null;
  const localAudioPreferenceBadges = [
    audioPreferences.noiseSuppression ? t("voice.grid.noiseSuppression") : null,
    audioPreferences.echoCancellation ? t("voice.grid.echoCancellation") : null,
    audioPreferences.autoGainControl ? t("voice.grid.autoGainControl") : null,
    audioPreferences.krispNoiseCancellation ? t("voice.grid.krisp") : null,
  ].filter((value): value is string => Boolean(value));

  if ((!hasRequestedJoin || isJoining) && !errorMessage) {
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

  return (
    <div
      className="relative h-full overflow-y-auto bg-transparent p-3 sm:p-5 md:p-6"
      data-testid="voice-channel-view"
    >
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

      <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col">
        <div className="mb-4 sm:mb-5">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-app-soft">
            {t("voice.view.eyebrow")}
          </p>
          <h1 className="mt-2 text-xl font-semibold text-app-foreground sm:text-2xl">
            {t("voice.view.title")}
          </h1>
          <p className="mt-2 text-sm text-app-muted">
            {t("voice.view.participants", { count: orderedParticipants.length })}
          </p>
        </div>

        {errorMessage ? (
          <div
            className="mb-4 rounded-[24px] border border-[hsl(var(--warning)/0.24)] bg-[hsl(var(--warning)/0.08)] px-4 py-3"
            data-testid="voice-inline-error"
          >
            <p className="text-sm font-medium text-app-foreground">{errorMessage}</p>
          </div>
        ) : null}

        {screenShares.length > 0 ? (
          <ScreenShareStage
            activeShare={activeScreenShare}
            onSelectShare={setActiveScreenShareId}
            onSelectQuality={(qualityId) => {
              void setScreenShareQuality(qualityId);
            }}
            onStopShare={() => {
              void stopScreenShare();
            }}
            participants={orderedParticipants}
            screenShares={screenShares}
            selectedQuality={screenShareQuality}
            isApplyingQuality={isApplyingScreenShareQuality}
          />
        ) : (
          <div
            className="grid flex-1 gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,15rem),1fr))] sm:gap-4 sm:[grid-template-columns:repeat(auto-fit,minmax(min(100%,18rem),1fr))]"
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
        )}
      </div>
    </div>
  );
}
