"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ConnectionState, LocalVideoTrack, type RemoteVideoTrack, type Room } from "livekit-client";
import {
  ChevronDown,
  Loader2,
  Maximize2,
  Mic,
  MicOff,
  MonitorUp,
  PhoneOff,
  RotateCcw,
  Settings2,
  Sparkles,
  Users,
  Video,
  VideoOff,
  Volume2,
  VolumeX,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { useI18n } from "@/components/providers/locale-provider";
import {
  useVoiceConnection,
  type VoiceCameraStatus,
  type VoiceParticipantViewModel,
  type VoiceScreenShareViewModel,
} from "@/components/providers/voice-provider";
import { VoiceSettingsModal } from "@/components/voice/voice-settings-modal";
import { SCREEN_SHARE_QUALITY_OPTIONS, type ScreenShareQualityId } from "@/lib/voice/screen-share";
import { cn } from "@/lib/utils";

type VoiceChannelViewProps = {
  channelId: string;
  serverId: string;
};

type VoiceParticipantTileProps = {
  isScreenSharing: boolean;
  isLocalOutputMuted: boolean;
  onResetVolume: () => void;
  onSetVolume: (volume: number) => void;
  participant: VoiceParticipantViewModel;
  participantVolume: number;
};

type VoiceStageFocus = "camera" | "screen";

type RoomControlButtonProps = {
  active?: boolean;
  ariaLabel: string;
  children?: ReactNode;
  destructive?: boolean;
  disabled?: boolean;
  icon: ReactNode;
  label: string;
  onClick?: () => void;
  showChevron?: boolean;
  testId?: string;
  title?: string;
};

function isReconnectState(state: ConnectionState) {
  return state === ConnectionState.Reconnecting || state === ConnectionState.SignalReconnecting;
}

function getSpeakingClass(isSpeaking: boolean) {
  return isSpeaking
    ? "border-[hsl(var(--primary)/0.46)] shadow-[0_0_0_4px_hsl(var(--primary)/0.12),0_24px_70px_hsl(var(--primary)/0.12)]"
    : "border-[hsl(var(--border)/0.66)] shadow-[0_18px_54px_hsl(var(--shadow-color)/0.08)]";
}

function getParticipantGridClass() {
  return cn(
    "grid h-full min-h-0 w-full gap-3 sm:gap-4",
    "grid-cols-1 grid-rows-[repeat(var(--voice-grid-mobile-rows),minmax(0,1fr))]",
    "sm:grid-cols-[repeat(var(--voice-grid-columns),minmax(0,1fr))] sm:grid-rows-[repeat(var(--voice-grid-rows),minmax(0,1fr))]",
  );
}

function getParticipantGridStyle(count: number): CSSProperties {
  const columns = count <= 1 ? 1 : count <= 4 ? 2 : count <= 9 ? 3 : 4;
  const rows = Math.max(1, Math.ceil(count / columns));

  return {
    "--voice-grid-columns": String(columns),
    "--voice-grid-mobile-rows": String(Math.max(1, count)),
    "--voice-grid-rows": String(rows),
  } as CSSProperties;
}

const VOICE_WAVEFORM_PATTERN = [
  0.14, 0.18, 0.2, 0.28, 0.5, 0.86, 0.44, 0.22, 0.18, 0.24, 0.36, 0.66, 0.94, 0.46, 0.24, 0.18,
  0.22, 0.36, 0.7, 0.98, 0.58, 0.28, 0.2, 0.16,
];

function normalizeWaveformLevel(level: number) {
  if (!Number.isFinite(level)) {
    return 0;
  }

  return Math.min(1, Math.max(0, level));
}

function VoiceLevelWaveform({
  active,
  compact = false,
  level,
  muted = false,
}: {
  active: boolean;
  compact?: boolean;
  level: number;
  muted?: boolean;
}) {
  const normalizedLevel = muted ? 0 : normalizeWaveformLevel(level);
  const displayLevel = active ? Math.max(normalizedLevel, 0.16) : normalizedLevel * 0.42;
  const maxHeight = compact ? 18 : 39;
  const minHeight = compact ? 3 : 5;
  const center = (VOICE_WAVEFORM_PATTERN.length - 1) / 2;

  return (
    <div
      aria-hidden="true"
      className={cn(
        "flex items-center justify-center",
        compact ? "h-5 w-24 gap-[3px]" : "mt-5 h-12 w-full max-w-[29rem] gap-1 sm:gap-1.5",
      )}
    >
      {VOICE_WAVEFORM_PATTERN.map((shape, index) => {
        const distanceFromCenter = Math.abs(index - center) / center;
        const centerBoost = 1 - distanceFromCenter * 0.48;
        const height =
          minHeight + (maxHeight - minHeight) * Math.min(1, displayLevel * shape * centerBoost);
        const isLit = !muted && (active || normalizedLevel > 0.035);

        return (
          <span
            aria-hidden="true"
            className={cn(
              "block rounded-full transition-[height,opacity,background-color,box-shadow] ease-out",
              compact ? "w-[3px]" : "w-1 sm:w-1.5",
              muted
                ? "bg-[hsl(var(--muted)/0.32)]"
                : isLit
                  ? "bg-[hsl(var(--primary))] shadow-[0_0_12px_hsl(var(--primary)/0.28)]"
                  : "bg-[hsl(var(--primary)/0.20)]",
            )}
            key={`${shape}-${index}`}
            style={{
              height: `${height}px`,
              opacity: muted ? 0.46 : isLit ? 0.64 + displayLevel * 0.36 : 0.34,
              transitionDuration: muted ? "150ms" : "70ms",
            }}
          />
        );
      })}
    </div>
  );
}

function MicrophoneStatusPill({ muted }: { muted: boolean }) {
  const { t } = useI18n();

  return (
    <span
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-full border px-4 py-2 text-sm font-bold shadow-[0_14px_38px_hsl(var(--shadow-color)/0.08)] transition",
        muted
          ? "border-[hsl(var(--danger)/0.20)] bg-[hsl(var(--danger)/0.08)] text-[hsl(var(--danger))]"
          : "border-[hsl(var(--success)/0.20)] bg-[hsl(var(--success)/0.10)] text-[hsl(var(--success))]",
      )}
    >
      {muted ? <MicOff className="h-[18px] w-[18px]" /> : <Mic className="h-[18px] w-[18px]" />}
      {muted ? t("voice.room.microphoneClosed") : t("voice.room.microphoneActive")}
    </span>
  );
}

function OutputStatusPill({ muted }: { muted: boolean }) {
  const { t } = useI18n();

  return (
    <span
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-full border px-4 py-2 text-sm font-bold shadow-[0_14px_38px_hsl(var(--shadow-color)/0.08)] transition",
        muted
          ? "border-[hsl(var(--danger)/0.20)] bg-[hsl(var(--danger)/0.08)] text-[hsl(var(--danger))]"
          : "border-[hsl(var(--success)/0.20)] bg-[hsl(var(--success)/0.10)] text-[hsl(var(--success))]",
      )}
    >
      {muted ? (
        <VolumeX className="h-[18px] w-[18px]" />
      ) : (
        <Volume2 className="h-[18px] w-[18px]" />
      )}
      {muted ? t("voice.room.outputClosed") : t("voice.room.outputActive")}
    </span>
  );
}

function CameraStatusPill({ enabled }: { enabled: boolean }) {
  const { t } = useI18n();

  return (
    <span
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-full border px-4 py-2 text-sm font-bold shadow-[0_14px_38px_hsl(var(--shadow-color)/0.08)] transition",
        enabled
          ? "border-[hsl(var(--success)/0.20)] bg-[hsl(var(--success)/0.10)] text-[hsl(var(--success))]"
          : "border-[hsl(var(--border)/0.62)] bg-[hsl(var(--surface-soft)/0.52)] text-app-muted",
      )}
    >
      {enabled ? (
        <Video className="h-[18px] w-[18px]" />
      ) : (
        <VideoOff className="h-[18px] w-[18px]" />
      )}
      {enabled ? t("voice.room.cameraActive") : t("voice.room.cameraClosed")}
    </span>
  );
}

function getAvatarGlowStyle(participant: VoiceParticipantViewModel): CSSProperties | undefined {
  if (participant.isMuted || !participant.isSpeaking) {
    return undefined;
  }

  const level = normalizeWaveformLevel(participant.audioLevel);

  return {
    boxShadow: `0 0 ${18 + level * 52}px hsl(var(--primary) / ${0.18 + level * 0.22})`,
  };
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

function ScreenShareVideo({ track }: { track: LocalVideoTrack | RemoteVideoTrack | null }) {
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

function ParticipantCameraVideo({
  isLocal,
  track,
}: {
  isLocal: boolean;
  track: LocalVideoTrack | RemoteVideoTrack;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
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
      className={cn("h-full w-full bg-black object-cover", isLocal && "-scale-x-100")}
      data-testid="voice-participant-camera-video"
      muted={isLocal}
      playsInline
      ref={videoRef}
    />
  );
}

function VoiceParticipantTile({
  isScreenSharing,
  isLocalOutputMuted,
  onResetVolume,
  onSetVolume,
  participant,
  participantVolume,
}: VoiceParticipantTileProps) {
  const { t } = useI18n();
  const displayName = participant.displayName ?? participant.username;
  const avatarGlowStyle = getAvatarGlowStyle(participant);
  const cameraTrack =
    participant.isCameraEnabled && participant.cameraTrack ? participant.cameraTrack : null;

  return (
    <article
      className={cn(
        "relative flex h-full min-h-0 flex-col overflow-hidden rounded-[30px] border bg-[linear-gradient(180deg,hsl(var(--surface-card)/0.92),hsl(var(--surface-soft)/0.44))] p-3 transition sm:p-4",
        getSpeakingClass(participant.isSpeaking),
      )}
      data-speaking={participant.isSpeaking ? "true" : "false"}
      data-testid="voice-participant-card"
      data-user-id={participant.userId}
      data-username={participant.username}
    >
      <div className="flex shrink-0 items-start justify-between gap-3">
        <div className="inline-flex items-center gap-2 rounded-full border border-[hsl(var(--border)/0.62)] bg-[hsl(var(--surface-card)/0.68)] px-2.5 py-1 text-[11px] font-semibold text-app-muted">
          <span className="h-2.5 w-2.5 rounded-full bg-[hsl(var(--success))] shadow-[0_0_0_4px_hsl(var(--success)/0.12)]" />
          {participant.isSpeaking ? t("voice.room.speaking") : t("voice.room.connected")}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          {isScreenSharing ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[hsl(var(--primary)/0.24)] bg-[hsl(var(--primary)/0.12)] px-2.5 py-1 text-[11px] font-semibold text-[hsl(var(--primary))]">
              <MonitorUp className="h-3.5 w-3.5" />
              {t("voice.room.screenSharing")}
            </span>
          ) : null}
          {participant.isCameraEnabled ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[hsl(var(--success)/0.22)] bg-[hsl(var(--success)/0.10)] px-2.5 py-1 text-[11px] font-semibold text-[hsl(var(--success))]">
              <Video className="h-3.5 w-3.5" />
              {t("voice.room.cameraOn")}
            </span>
          ) : null}
          <span
            className={cn(
              "inline-flex h-9 w-9 items-center justify-center rounded-full border",
              participant.isMuted
                ? "border-[hsl(var(--danger)/0.26)] bg-[hsl(var(--danger)/0.12)] text-[hsl(var(--danger))]"
                : "border-[hsl(var(--success)/0.22)] bg-[hsl(var(--success)/0.10)] text-[hsl(var(--success))]",
            )}
            title={participant.isMuted ? t("voice.grid.muted") : t("voice.room.microphoneOn")}
          >
            {participant.isMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </span>
        </div>
      </div>

      {cameraTrack ? (
        <div className="relative my-3 min-h-0 flex-1 overflow-hidden rounded-[24px] border border-[hsl(var(--border)/0.58)] bg-black">
          <ParticipantCameraVideo isLocal={participant.isLocal} track={cameraTrack} />
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/72 via-black/34 to-transparent p-3 text-left text-white">
            <p className="truncate text-base font-semibold sm:text-lg">{displayName}</p>
            <p className="mt-1 truncate text-sm font-medium text-white/72">
              @{participant.username}
              {participant.isLocal ? ` / ${t("voice.grid.you")}` : ""}
            </p>
            <VoiceLevelWaveform
              active={participant.isSpeaking}
              compact
              level={participant.audioLevel}
              muted={participant.isMuted}
            />
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center py-3 text-center">
          <div
            className={cn(
              "rounded-full p-1 transition",
              participant.isSpeaking
                ? "bg-[hsl(var(--primary)/0.16)] ring-4 ring-[hsl(var(--primary)/0.12)]"
                : "bg-[hsl(var(--surface-card)/0.58)] ring-1 ring-[hsl(var(--border)/0.58)]",
            )}
            style={avatarGlowStyle}
          >
            <Avatar
              alt={displayName}
              className="h-[clamp(3.75rem,8vh,6rem)] w-[clamp(3.75rem,8vh,6rem)] border-none text-lg"
              fallback={displayName}
              src={participant.avatarUrl}
            />
          </div>
          <div className="mt-3 min-w-0">
            <p className="truncate text-base font-semibold text-app-foreground sm:text-lg">
              {displayName}
            </p>
            <p className="mt-1 truncate text-sm font-medium text-app-muted">
              @{participant.username}
              {participant.isLocal ? ` / ${t("voice.grid.you")}` : ""}
            </p>
          </div>
          <VoiceLevelWaveform
            active={participant.isSpeaking}
            level={participant.audioLevel}
            muted={participant.isMuted}
          />
        </div>
      )}

      {participant.isLocal ? (
        <div className="flex shrink-0 flex-wrap justify-center gap-2 pb-1">
          <MicrophoneStatusPill muted={participant.isMuted} />
          <CameraStatusPill enabled={participant.isCameraEnabled} />
          <OutputStatusPill muted={isLocalOutputMuted} />
        </div>
      ) : (
        <div className="shrink-0 rounded-[20px] border border-[hsl(var(--border)/0.58)] bg-[hsl(var(--surface-card)/0.56)] px-3 py-2">
          <div className="mb-2 flex items-center justify-between gap-3">
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-app-soft">
              {t("voice.grid.remoteVolume")}
            </span>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-app-foreground">
                {participantVolume}%
              </span>
              <button
                aria-label={t("voice.grid.resetVolume")}
                className="flex h-7 w-7 items-center justify-center rounded-full border border-[hsl(var(--border)/0.68)] bg-[hsl(var(--surface-soft)/0.52)] text-app-muted transition hover:text-app-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
                onClick={onResetVolume}
                type="button"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          <div className="flex items-center gap-3">
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
    </article>
  );
}

function VoiceEmptyState() {
  const { t } = useI18n();

  return (
    <div
      className="flex min-h-[22rem] items-center justify-center rounded-[30px] border border-dashed border-[hsl(var(--border)/0.7)] bg-[hsl(var(--surface-soft)/0.32)] p-8 text-center"
      data-testid="voice-empty-state"
    >
      <div className="max-w-sm">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-[22px] border border-[hsl(var(--primary)/0.22)] bg-[hsl(var(--primary)/0.10)] text-[hsl(var(--primary))]">
          <Users className="h-6 w-6" />
        </div>
        <p className="mt-4 text-base font-semibold text-app-foreground">
          {t("voice.room.emptyTitle")}
        </p>
        <p className="mt-2 text-sm text-app-muted">{t("voice.room.emptyDescription")}</p>
      </div>
    </div>
  );
}

function VoiceParticipantsSidebar({
  participants,
  screenShares,
}: {
  participants: VoiceParticipantViewModel[];
  screenShares: VoiceScreenShareViewModel[];
}) {
  const { t } = useI18n();

  return (
    <aside className="flex h-full min-h-0 flex-col overflow-hidden rounded-[30px] border border-[hsl(var(--border)/0.64)] bg-[hsl(var(--surface-card)/0.62)] p-3 shadow-[0_18px_54px_hsl(var(--shadow-color)/0.07)] xl:p-4">
      <div className="mb-3 flex shrink-0 items-center justify-between gap-3 px-1">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-app-soft">
          {t("voice.room.participantsTitle", { count: participants.length })}
        </p>
        <span className="rounded-full border border-[hsl(var(--border)/0.58)] bg-[hsl(var(--surface-soft)/0.44)] px-2 py-0.5 text-xs font-semibold text-app-muted">
          {participants.length}
        </span>
      </div>

      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1">
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
    </aside>
  );
}

function RoomControlButton({
  active = false,
  ariaLabel,
  children,
  destructive = false,
  disabled = false,
  icon,
  label,
  onClick,
  showChevron = false,
  testId,
  title,
}: RoomControlButtonProps) {
  return (
    <button
      aria-label={ariaLabel}
      className={cn(
        "group flex min-w-[4.75rem] flex-col items-center gap-1 rounded-[22px] border px-3 py-2 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]",
        destructive
          ? "border-[hsl(var(--danger)/0.30)] bg-[hsl(var(--danger)/0.12)] text-[hsl(var(--danger))] hover:bg-[hsl(var(--danger)/0.18)] focus-visible:ring-[hsl(var(--danger)/0.45)]"
          : active
            ? "border-[hsl(var(--primary)/0.34)] bg-[hsl(var(--primary)/0.14)] text-[hsl(var(--primary))]"
            : "border-[hsl(var(--border)/0.64)] bg-[hsl(var(--surface-card)/0.78)] text-app-muted hover:bg-[hsl(var(--surface-soft)/0.62)] hover:text-app-foreground",
        disabled && "cursor-not-allowed opacity-55",
      )}
      data-active={active ? "true" : "false"}
      data-testid={testId}
      disabled={disabled}
      onClick={onClick}
      title={title}
      type="button"
    >
      <span className="relative flex h-11 w-11 items-center justify-center rounded-full border border-current/10 bg-white/44 shadow-[0_10px_28px_hsl(var(--shadow-color)/0.08)]">
        {icon}
        {showChevron ? (
          <ChevronDown className="absolute -bottom-1 -right-1 h-3.5 w-3.5 rounded-full border border-[hsl(var(--border)/0.6)] bg-[hsl(var(--surface-card))] p-0.5 text-app-soft" />
        ) : null}
      </span>
      <span className="max-w-[5.25rem] truncate">{label}</span>
      {children}
    </button>
  );
}

function VoiceControlBar({
  cameraStatus,
  isCameraEnabled,
  isDeafened,
  isMuted,
  isScreenSharing,
  leaveChannel,
  toggleCamera,
  toggleDeafen,
  toggleMute,
  toggleScreenShare,
}: {
  cameraStatus: VoiceCameraStatus;
  isCameraEnabled: boolean;
  isDeafened: boolean;
  isMuted: boolean;
  isScreenSharing: boolean;
  leaveChannel: () => Promise<void>;
  toggleCamera: () => Promise<void>;
  toggleDeafen: () => Promise<void>;
  toggleMute: () => Promise<void>;
  toggleScreenShare: () => Promise<void>;
}) {
  const { t } = useI18n();
  const [showVoiceSettingsModal, setShowVoiceSettingsModal] = useState(false);
  const isCameraBusy = cameraStatus === "starting" || cameraStatus === "stopping";
  const cameraTitle = isCameraEnabled
    ? t("voice.controls.stopCamera")
    : cameraStatus === "starting"
      ? t("voice.controls.cameraStarting")
      : cameraStatus === "stopping"
        ? t("voice.controls.cameraStopping")
        : t("voice.controls.camera");

  return (
    <>
      <div className="sticky bottom-3 z-20 mt-5 flex justify-center">
        <div className="flex max-w-full gap-2 overflow-x-auto rounded-[30px] border border-[hsl(var(--border)/0.66)] bg-[hsl(var(--surface-card)/0.88)] p-2 shadow-[0_24px_70px_hsl(var(--shadow-color)/0.14)] backdrop-blur-xl">
          <RoomControlButton
            active={isMuted}
            ariaLabel={isMuted ? t("voice.controls.unmute") : t("voice.controls.mute")}
            icon={isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
            label={isMuted ? t("voice.controls.unmuteShort") : t("voice.controls.muteShort")}
            onClick={() => {
              void toggleMute();
            }}
            testId="voice-room-control-mute"
            title={isMuted ? t("voice.controls.unmute") : t("voice.controls.mute")}
          />
          <RoomControlButton
            active={isDeafened}
            ariaLabel={isDeafened ? t("voice.controls.undeafen") : t("voice.controls.deafen")}
            icon={isDeafened ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
            label={isDeafened ? t("voice.controls.undeafenShort") : t("voice.controls.deafenShort")}
            onClick={() => {
              void toggleDeafen();
            }}
            testId="voice-room-control-deafen"
            title={isDeafened ? t("voice.controls.undeafen") : t("voice.controls.deafen")}
          />
          <RoomControlButton
            active={isScreenSharing}
            ariaLabel={isScreenSharing ? t("voice.screenShare.stop") : t("voice.screenShare.share")}
            icon={<MonitorUp className="h-5 w-5" />}
            label={
              isScreenSharing ? t("voice.controls.stopShareShort") : t("voice.controls.shareShort")
            }
            onClick={() => {
              void toggleScreenShare();
            }}
            testId="voice-room-control-screen-share"
            title={isScreenSharing ? t("voice.screenShare.stop") : t("voice.screenShare.share")}
          />
          <RoomControlButton
            active={isCameraEnabled}
            ariaLabel={
              isCameraEnabled ? t("voice.controls.stopCamera") : t("voice.controls.camera")
            }
            disabled={isCameraBusy}
            icon={
              isCameraBusy ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : isCameraEnabled ? (
                <VideoOff className="h-5 w-5" />
              ) : (
                <Video className="h-5 w-5" />
              )
            }
            label={
              isCameraEnabled
                ? t("voice.controls.stopCameraShort")
                : t("voice.controls.cameraShort")
            }
            onClick={() => {
              void toggleCamera();
            }}
            testId="voice-room-control-camera"
            title={cameraTitle}
          />
          <RoomControlButton
            ariaLabel={t("voice.controls.settings")}
            icon={<Settings2 className="h-5 w-5" />}
            label={t("voice.controls.settingsShort")}
            onClick={() => setShowVoiceSettingsModal(true)}
            testId="voice-room-control-settings"
            title={t("voice.controls.settings")}
          />
          <RoomControlButton
            ariaLabel={t("voice.controls.disconnect")}
            destructive
            icon={<PhoneOff className="h-5 w-5" />}
            label={t("voice.controls.leaveShort")}
            onClick={() => {
              void leaveChannel();
            }}
            testId="voice-room-control-disconnect"
            title={t("voice.controls.disconnect")}
          />
        </div>
      </div>

      <VoiceSettingsModal
        onClose={() => setShowVoiceSettingsModal(false)}
        open={showVoiceSettingsModal}
      />
    </>
  );
}

function ScreenShareStage({
  activeCameraParticipant,
  activeShare,
  cameraParticipants,
  isApplyingQuality,
  onSelectCameraParticipant,
  onSelectShare,
  onSelectStageFocus,
  onSelectQuality,
  onStopShare,
  screenShares,
  selectedQuality,
  stageFocus,
}: {
  activeCameraParticipant: VoiceParticipantViewModel | null;
  activeShare: VoiceScreenShareViewModel | null;
  cameraParticipants: VoiceParticipantViewModel[];
  isApplyingQuality: boolean;
  onSelectCameraParticipant: (participantId: string) => void;
  onSelectShare: (id: string) => void;
  onSelectStageFocus: (focus: VoiceStageFocus) => void;
  onSelectQuality: (qualityId: ScreenShareQualityId) => void;
  onStopShare: () => void;
  screenShares: VoiceScreenShareViewModel[];
  selectedQuality: ScreenShareQualityId;
  stageFocus: VoiceStageFocus;
}) {
  const { t } = useI18n();
  const stageRef = useRef<HTMLDivElement | null>(null);
  const sharerName =
    activeShare?.displayName ?? activeShare?.username ?? t("voice.screenShare.unknownSharer");
  const activeCameraTrack = activeCameraParticipant?.cameraTrack ?? null;
  const activeCameraName =
    activeCameraParticipant?.displayName ??
    activeCameraParticipant?.username ??
    t("voice.screenShare.focusCamera");
  const canFocusCamera = Boolean(activeCameraParticipant && activeCameraTrack);
  const primaryFocus: VoiceStageFocus =
    stageFocus === "camera" && canFocusCamera ? "camera" : "screen";

  return (
    <div
      className="grid h-full min-h-0 gap-3 overflow-hidden lg:grid-cols-[minmax(0,1fr)_14rem]"
      data-testid="voice-screen-share-stage"
    >
      <div className="relative flex h-full min-h-0 flex-col overflow-hidden rounded-[28px] border border-[hsl(var(--border)/0.66)] bg-[hsl(var(--surface-card)/0.72)] p-3 sm:p-4">
        <div className="mb-3 flex shrink-0 flex-col gap-3 sm:mb-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-app-soft">
              {t("voice.screenShare.stage")}
            </p>
            <p className="mt-1 truncate text-lg font-semibold text-app-foreground">
              {primaryFocus === "camera"
                ? t("voice.screenShare.cameraBy", { name: activeCameraName })
                : t("voice.screenShare.sharedBy", { name: sharerName })}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div
              aria-label={t("voice.screenShare.focusLabel")}
              className="inline-flex rounded-2xl border border-[hsl(var(--border)/0.66)] bg-[hsl(var(--surface-soft)/0.44)] p-1"
              role="group"
            >
              <button
                className={cn(
                  "inline-flex min-h-9 items-center gap-2 rounded-xl px-3 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]",
                  primaryFocus === "screen"
                    ? "bg-[hsl(var(--surface-card))] text-app-foreground shadow-[0_10px_28px_hsl(var(--shadow-color)/0.08)]"
                    : "text-app-muted hover:text-app-foreground",
                )}
                data-testid="voice-stage-focus-screen"
                onClick={() => onSelectStageFocus("screen")}
                type="button"
              >
                <MonitorUp className="h-4 w-4" />
                {t("voice.screenShare.focusScreen")}
              </button>
              <button
                className={cn(
                  "inline-flex min-h-9 items-center gap-2 rounded-xl px-3 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]",
                  primaryFocus === "camera"
                    ? "bg-[hsl(var(--surface-card))] text-app-foreground shadow-[0_10px_28px_hsl(var(--shadow-color)/0.08)]"
                    : "text-app-muted hover:text-app-foreground",
                  !canFocusCamera && "cursor-not-allowed opacity-45",
                )}
                data-testid="voice-stage-focus-camera"
                disabled={!canFocusCamera}
                onClick={() => onSelectStageFocus("camera")}
                type="button"
              >
                <Video className="h-4 w-4" />
                {t("voice.screenShare.focusCamera")}
              </button>
            </div>
            {activeShare?.isLocal ? (
              <button
                className="min-h-10 rounded-2xl border border-[hsl(var(--danger)/0.28)] bg-[hsl(var(--danger)/0.12)] px-4 py-2 text-sm font-semibold text-[hsl(var(--danger))] transition hover:bg-[hsl(var(--danger)/0.16)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
                onClick={onStopShare}
                type="button"
              >
                {t("voice.screenShare.stop")}
              </button>
            ) : null}
          </div>
        </div>

        <div
          className="group relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-[24px] border border-[hsl(var(--border)/0.72)] bg-[hsl(var(--surface-soft)/0.42)]"
          onDoubleClick={() => {
            void toggleElementFullscreen(stageRef.current);
          }}
          ref={stageRef}
          title={t("screenShare.fullscreenHint")}
        >
          {primaryFocus === "camera" && activeCameraParticipant && activeCameraTrack ? (
            <div
              className="relative h-full min-h-0 w-full overflow-hidden bg-black"
              data-testid="voice-stage-primary-camera"
            >
              <ParticipantCameraVideo
                isLocal={activeCameraParticipant.isLocal}
                track={activeCameraTrack}
              />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/76 via-black/36 to-transparent p-4 text-white">
                <span className="inline-flex items-center gap-2 rounded-full border border-white/18 bg-black/34 px-3 py-1 text-xs font-semibold backdrop-blur-xl">
                  <Video className="h-3.5 w-3.5" />
                  {t("voice.screenShare.primaryCamera")}
                </span>
                <p className="mt-3 truncate text-xl font-semibold">{activeCameraName}</p>
                <p className="truncate text-sm font-medium text-white/72">
                  @{activeCameraParticipant.username}
                  {activeCameraParticipant.isLocal ? ` / ${t("voice.grid.you")}` : ""}
                </p>
              </div>
            </div>
          ) : (
            <div className="h-full min-h-0 w-full" data-testid="voice-stage-primary-screen">
              {activeShare?.track ? (
                <ScreenShareVideo track={activeShare.track} />
              ) : (
                <div className="flex h-full min-h-0 items-center justify-center text-center">
                  <div>
                    <MonitorUp className="mx-auto h-9 w-9 text-app-muted" />
                    <p className="mt-3 text-sm font-semibold text-app-foreground">
                      {t("voice.screenShare.waitingForTrack")}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {primaryFocus === "screen" && activeCameraParticipant && activeCameraTrack ? (
            <button
              className="absolute bottom-4 right-4 z-10 w-[min(14rem,46vw)] overflow-hidden rounded-[22px] border border-white/22 bg-black shadow-[0_18px_60px_rgba(0,0,0,0.28)] transition hover:scale-[1.01] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
              data-testid="voice-stage-camera-pip"
              onClick={() => onSelectStageFocus("camera")}
              type="button"
            >
              <span className="absolute left-2 top-2 z-10 inline-flex items-center gap-1.5 rounded-full border border-white/18 bg-black/44 px-2 py-1 text-[10px] font-semibold text-white backdrop-blur-xl">
                <Video className="h-3 w-3" />
                {t("voice.screenShare.cameraPreview")}
              </span>
              <div className="aspect-video">
                <ParticipantCameraVideo
                  isLocal={activeCameraParticipant.isLocal}
                  track={activeCameraTrack}
                />
              </div>
              <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/72 to-transparent px-3 py-2 text-left text-xs font-semibold text-white">
                {activeCameraName}
              </span>
            </button>
          ) : null}

          {primaryFocus === "camera" && activeShare ? (
            <button
              className="absolute bottom-4 right-4 z-10 w-[min(15rem,50vw)] overflow-hidden rounded-[22px] border border-white/22 bg-black shadow-[0_18px_60px_rgba(0,0,0,0.28)] transition hover:scale-[1.01] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
              data-testid="voice-stage-screen-pip"
              onClick={() => onSelectStageFocus("screen")}
              type="button"
            >
              <span className="absolute left-2 top-2 z-10 inline-flex items-center gap-1.5 rounded-full border border-white/18 bg-black/44 px-2 py-1 text-[10px] font-semibold text-white backdrop-blur-xl">
                <MonitorUp className="h-3 w-3" />
                {t("voice.screenShare.focusScreen")}
              </span>
              <div className="aspect-video">
                {activeShare.track ? (
                  <ScreenShareVideo track={activeShare.track} />
                ) : (
                  <div className="flex h-full items-center justify-center bg-[hsl(var(--surface-soft)/0.42)] text-white">
                    <MonitorUp className="h-6 w-6 opacity-70" />
                  </div>
                )}
              </div>
            </button>
          ) : null}

          <div className="pointer-events-none absolute bottom-4 left-4 inline-flex items-center gap-2 rounded-full border border-white/20 bg-black/46 px-3 py-1.5 text-xs font-semibold text-white opacity-0 shadow-[0_14px_36px_rgba(0,0,0,0.22)] backdrop-blur-xl transition group-hover:opacity-100">
            <Maximize2 className="h-3.5 w-3.5" />
            {t("screenShare.fullscreenHint")}
          </div>
        </div>
      </div>

      <aside className="flex h-full min-h-0 flex-col overflow-y-auto rounded-[28px] border border-[hsl(var(--border)/0.66)] bg-[hsl(var(--surface-card)/0.58)] p-3">
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
                    {share.isLocal ? t("voice.grid.you") : t("voice.screenShare.viewerLabel")}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        {cameraParticipants.length > 0 ? (
          <div className="mt-4 border-t border-app-border pt-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-app-soft">
              {t("voice.screenShare.cameraPreview")}
            </p>
            <div className="space-y-2">
              {cameraParticipants.map((participant) => {
                const displayName = participant.displayName ?? participant.username;
                const isActive = activeCameraParticipant?.userId === participant.userId;

                return (
                  <button
                    className={cn(
                      "flex min-h-11 w-full items-center gap-3 rounded-2xl border px-3 py-2 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]",
                      isActive
                        ? "border-[hsl(var(--success)/0.38)] bg-[hsl(var(--success)/0.12)]"
                        : "border-[hsl(var(--border)/0.72)] bg-[hsl(var(--surface-soft)/0.42)] hover:bg-[hsl(var(--surface-soft)/0.72)]",
                    )}
                    data-testid={`voice-stage-camera-option-${participant.userId}`}
                    key={participant.userId}
                    onClick={() => {
                      onSelectCameraParticipant(participant.userId);
                      onSelectStageFocus("camera");
                    }}
                    type="button"
                  >
                    <Avatar
                      alt={displayName}
                      className="h-8 w-8 border-none text-xs"
                      fallback={displayName}
                      src={participant.avatarUrl}
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-app-foreground">
                        {displayName}
                      </p>
                      <p className="truncate text-xs text-app-muted">
                        {participant.isLocal ? t("voice.grid.you") : `@${participant.username}`}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {activeShare?.isLocal ? (
          <div className="mt-4 border-t border-app-border pt-4">
            <div className="mb-2 flex items-center justify-between gap-3">
              <label
                className="text-xs font-semibold uppercase tracking-[0.2em] text-app-soft"
                htmlFor="screen-share-quality-select"
              >
                {t("voice.screenShare.quality.title")}
              </label>
              {isApplyingQuality ? (
                <Loader2 className="h-4 w-4 animate-spin text-app-muted" />
              ) : null}
            </div>
            <div className="relative">
              <select
                className="min-h-11 w-full appearance-none rounded-2xl border border-[hsl(var(--border)/0.72)] bg-[hsl(var(--surface-soft)/0.58)] px-3 py-2 pr-9 text-sm font-semibold text-app-foreground transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)] disabled:cursor-not-allowed disabled:opacity-60"
                data-testid="screen-share-quality-select"
                disabled={isApplyingQuality}
                id="screen-share-quality-select"
                onChange={(event) => onSelectQuality(event.target.value as ScreenShareQualityId)}
                value={selectedQuality}
              >
                {SCREEN_SHARE_QUALITY_OPTIONS.map((option) => (
                  <option
                    data-testid={`screen-share-quality-${option.id}`}
                    key={option.id}
                    value={option.id}
                  >
                    {t(option.labelKey)}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-app-muted" />
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {SCREEN_SHARE_QUALITY_OPTIONS.map((option) => (
                <span
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]",
                    selectedQuality === option.id
                      ? "border-[hsl(var(--primary)/0.32)] bg-[hsl(var(--primary)/0.12)] text-[hsl(var(--primary))]"
                      : "border-[hsl(var(--border)/0.66)] bg-[hsl(var(--surface-soft)/0.42)] text-app-soft",
                  )}
                  key={option.id}
                >
                  {option.shortLabel}
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </aside>
    </div>
  );
}

function renderGridParticipants(room: Room | null, participants: VoiceParticipantViewModel[]) {
  if (!room) {
    return participants;
  }

  const currentParticipantOrder = new Map(
    [room.localParticipant, ...room.remoteParticipants.values()].map((participant, index) => [
      participant.identity,
      index,
    ]),
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
    cameraError,
    cameraStatus,
    connectionState,
    errorMessage,
    getParticipantVolume,
    isCameraEnabled,
    isApplyingScreenShareQuality,
    isDeafened,
    isJoining,
    isMuted,
    isScreenSharing,
    joinChannel,
    leaveChannel,
    participants,
    resetParticipantVolume,
    room,
    screenShares,
    setActiveScreenShareId,
    setParticipantVolume,
    setScreenShareQuality,
    stopScreenShare,
    screenShareQuality,
    toggleCamera,
    toggleDeafen,
    toggleMute,
    toggleScreenShare,
  } = useVoiceConnection();
  const [hasRequestedJoin, setHasRequestedJoin] = useState(false);
  const [activeCameraParticipantId, setActiveCameraParticipantId] = useState<string | null>(null);
  const [stageFocus, setStageFocus] = useState<VoiceStageFocus>("screen");
  const previousScreenShareCountRef = useRef(0);

  useEffect(() => {
    setHasRequestedJoin(true);
    void joinChannel({ channelId, serverId }).catch(() => {
      // The provider exposes the error message for inline rendering.
    });
  }, [channelId, joinChannel, serverId]);

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
  const activeCameraParticipant = useMemo(
    () =>
      cameraParticipants.find((participant) => participant.userId === activeCameraParticipantId) ??
      cameraParticipants.find((participant) => participant.isLocal) ??
      cameraParticipants[0] ??
      null,
    [activeCameraParticipantId, cameraParticipants],
  );
  const screenShareParticipantIds = useMemo(
    () => new Set(screenShares.map((share) => share.participantId)),
    [screenShares],
  );

  useEffect(() => {
    const previousCount = previousScreenShareCountRef.current;
    if (screenShares.length > 0 && previousCount === 0) {
      setStageFocus("screen");
    }
    previousScreenShareCountRef.current = screenShares.length;
  }, [screenShares.length]);

  useEffect(() => {
    if (
      activeCameraParticipantId &&
      !cameraParticipants.some((participant) => participant.userId === activeCameraParticipantId)
    ) {
      setActiveCameraParticipantId(null);
    }
  }, [activeCameraParticipantId, cameraParticipants]);

  useEffect(() => {
    if (stageFocus === "camera" && cameraParticipants.length === 0) {
      setStageFocus("screen");
    }
  }, [cameraParticipants.length, stageFocus]);

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
          <p className="mt-2 text-sm text-app-muted">{t("voice.view.disconnectedDescription")}</p>
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
      className="relative h-full overflow-hidden bg-transparent p-2 sm:p-3 md:p-4"
      data-testid="voice-channel-view"
    >
      {showReconnectOverlay ? (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-[hsl(var(--background)/0.75)] backdrop-blur-sm">
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
          <div className="mb-3 flex shrink-0 flex-col gap-3 px-1 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-app-soft">
                {t("voice.view.eyebrow")}
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-app-foreground">
                {t("voice.view.title")}
              </h2>
              <p className="mt-2 text-sm font-medium text-app-muted">
                {t("voice.view.participants", { count: participantCount })}
              </p>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[hsl(var(--primary)/0.22)] bg-[hsl(var(--primary)/0.10)] px-3 py-1.5 text-xs font-semibold text-[hsl(var(--primary))]">
              <Sparkles className="h-3.5 w-3.5" />
              {t("voice.room.premiumSignal")}
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

          <div className="grid min-h-0 flex-1 gap-4 overflow-hidden xl:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="h-full min-h-0 min-w-0 overflow-hidden">
              {screenShares.length > 0 ? (
                <ScreenShareStage
                  activeCameraParticipant={activeCameraParticipant}
                  activeShare={activeScreenShare}
                  cameraParticipants={cameraParticipants}
                  isApplyingQuality={isApplyingScreenShareQuality}
                  onSelectCameraParticipant={setActiveCameraParticipantId}
                  onSelectShare={setActiveScreenShareId}
                  onSelectStageFocus={setStageFocus}
                  onSelectQuality={(qualityId) => {
                    void setScreenShareQuality(qualityId);
                  }}
                  onStopShare={() => {
                    void stopScreenShare();
                  }}
                  screenShares={screenShares}
                  selectedQuality={screenShareQuality}
                  stageFocus={stageFocus}
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
