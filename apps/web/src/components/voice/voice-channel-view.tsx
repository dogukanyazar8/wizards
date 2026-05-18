"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  ConnectionQuality,
  ConnectionState,
  LocalVideoTrack,
  RoomEvent,
  type Participant,
  type RemoteVideoTrack,
  type Room,
} from "livekit-client";
import { useQuery } from "@tanstack/react-query";
import type { WorkspaceMember } from "@wizards/types";
import { useShallow } from "zustand/react/shallow";
import {
  AlertCircle,
  Check,
  ChevronDown,
  Loader2,
  Maximize2,
  Mic,
  MicOff,
  MonitorUp,
  PhoneOff,
  RotateCcw,
  Send,
  Settings2,
  ShieldCheck,
  ShieldOff,
  Users,
  Video,
  VideoOff,
  Volume2,
  VolumeX,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { useI18n } from "@/components/providers/locale-provider";
import {
  useVoiceParticipants,
  useVoiceState,
  type VoiceCameraStatus,
  type VoiceParticipantViewModel,
  type VoiceScreenShareViewModel,
} from "@/components/providers/voice-provider";
import { VoiceSettingsModal } from "@/components/voice/voice-settings-modal";
import { getSocket } from "@/lib/socket/client";
import type { VoiceInviteStatusPayload } from "@/lib/socket/events";
import { SCREEN_SHARE_QUALITY_OPTIONS, type ScreenShareQualityId } from "@/lib/voice/screen-share";
import { fetchWorkspaceServerMembers } from "@/lib/workspace/client";
import { cn } from "@/lib/utils";
import { useVoiceStore } from "@/store/voice-store";

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

type VoiceSignalTone = "danger" | "muted" | "primary" | "success" | "warning";

type VoiceSignalStatus = {
  isLoading?: boolean;
  labelKey: string;
  strength: 0 | 1 | 2 | 3;
  tone: VoiceSignalTone;
};

const VOICE_SIGNAL_BAR_CLASSES = ["h-1.5", "h-2.5", "h-3.5"] as const;

function getVoiceSignalStatus({
  connectionQuality,
  connectionState,
  hasRoom,
}: {
  connectionQuality: ConnectionQuality;
  connectionState: ConnectionState;
  hasRoom: boolean;
}): VoiceSignalStatus {
  if (!hasRoom || connectionState === ConnectionState.Disconnected) {
    return {
      labelKey: "voice.room.signalOffline",
      strength: 0,
      tone: "muted",
    };
  }

  if (connectionState === ConnectionState.Connecting) {
    return {
      isLoading: true,
      labelKey: "voice.room.signalChecking",
      strength: 1,
      tone: "primary",
    };
  }

  if (isReconnectState(connectionState)) {
    return {
      isLoading: true,
      labelKey: "voice.room.signalReconnecting",
      strength: 1,
      tone: "warning",
    };
  }

  switch (connectionQuality) {
    case ConnectionQuality.Excellent:
      return {
        labelKey: "voice.room.signalExcellent",
        strength: 3,
        tone: "success",
      };
    case ConnectionQuality.Good:
      return {
        labelKey: "voice.room.signalGood",
        strength: 2,
        tone: "primary",
      };
    case ConnectionQuality.Poor:
      return {
        labelKey: "voice.room.signalPoor",
        strength: 1,
        tone: "warning",
      };
    case ConnectionQuality.Lost:
      return {
        labelKey: "voice.room.signalLost",
        strength: 0,
        tone: "danger",
      };
    case ConnectionQuality.Unknown:
    default:
      return {
        isLoading: true,
        labelKey: "voice.room.signalChecking",
        strength: 1,
        tone: "primary",
      };
  }
}

function getVoiceSignalToneClass(tone: VoiceSignalTone) {
  switch (tone) {
    case "danger":
      return "border-[hsl(var(--danger)/0.24)] bg-[hsl(var(--danger)/0.08)] text-[hsl(var(--danger))]";
    case "muted":
      return "border-[hsl(var(--border)/0.72)] bg-[hsl(var(--surface-soft)/0.58)] text-app-muted";
    case "success":
      return "border-[hsl(var(--success)/0.28)] bg-[hsl(var(--success)/0.12)] text-[hsl(var(--success))]";
    case "warning":
      return "border-[hsl(var(--warning)/0.26)] bg-[hsl(var(--warning)/0.10)] text-[hsl(var(--warning))]";
    case "primary":
    default:
      return "border-[hsl(var(--primary)/0.22)] bg-[hsl(var(--primary)/0.10)] text-[hsl(var(--primary))]";
  }
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
  const { mirrorPreview, rotation } = useVoiceStore(
    useShallow((state) => ({
      mirrorPreview: state.cameraPreferences.mirrorPreview,
      rotation: state.cameraPreferences.rotation,
    })),
  );
  const localPreviewStyle = useMemo<CSSProperties | undefined>(() => {
    if (!isLocal) {
      return undefined;
    }

    return {
      transform: `scaleX(${mirrorPreview ? -1 : 1}) rotate(${rotation}deg)`,
    };
  }, [isLocal, mirrorPreview, rotation]);

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
      className="h-full w-full bg-black object-cover"
      data-testid="voice-participant-camera-video"
      muted={isLocal}
      playsInline
      ref={videoRef}
      style={localPreviewStyle}
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
                  "inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full border px-3 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)] disabled:cursor-not-allowed disabled:opacity-60",
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
        "group flex min-w-[4rem] flex-col items-center gap-1 rounded-[20px] border px-2 py-2 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)] sm:min-w-[4.75rem] sm:rounded-[22px] sm:px-3",
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
      <span className="relative flex h-10 w-10 items-center justify-center rounded-full border border-current/10 bg-white/44 shadow-[0_10px_28px_hsl(var(--shadow-color)/0.08)] sm:h-11 sm:w-11">
        {icon}
        {showChevron ? (
          <ChevronDown className="absolute -bottom-1 -right-1 h-3.5 w-3.5 rounded-full border border-[hsl(var(--border)/0.6)] bg-[hsl(var(--surface-card))] p-0.5 text-app-soft" />
        ) : null}
      </span>
      <span className="max-w-[4.25rem] truncate sm:max-w-[5.25rem]">{label}</span>
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
      <div className="sticky bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] z-20 mt-4 flex justify-center sm:bottom-3 sm:mt-5">
        <div className="flex max-w-full gap-1.5 overflow-x-auto overscroll-x-contain rounded-[26px] border border-[hsl(var(--border)/0.66)] bg-[hsl(var(--surface-card)/0.9)] p-1.5 shadow-[0_24px_70px_hsl(var(--shadow-color)/0.14)] backdrop-blur-xl sm:gap-2 sm:rounded-[30px] sm:p-2">
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
      className="grid h-full min-h-0 grid-rows-[minmax(0,1fr)_auto] gap-3 overflow-hidden lg:grid-cols-[minmax(0,1fr)_14rem] lg:grid-rows-1"
      data-testid="voice-screen-share-stage"
    >
      <div className="relative flex h-full min-h-0 flex-col overflow-hidden rounded-[24px] border border-[hsl(var(--border)/0.66)] bg-[hsl(var(--surface-card)/0.72)] p-2.5 sm:rounded-[28px] sm:p-4">
        <div className="mb-2 flex shrink-0 flex-col gap-2 sm:mb-4 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
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
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
            <div
              aria-label={t("voice.screenShare.focusLabel")}
              className="grid w-full grid-cols-2 rounded-2xl border border-[hsl(var(--border)/0.66)] bg-[hsl(var(--surface-soft)/0.44)] p-1 sm:inline-flex sm:w-auto"
              role="group"
            >
              <button
                className={cn(
                  "inline-flex min-h-9 items-center justify-center gap-2 rounded-xl px-3 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]",
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
                  "inline-flex min-h-9 items-center justify-center gap-2 rounded-xl px-3 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]",
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
                className="min-h-10 w-full rounded-2xl border border-[hsl(var(--danger)/0.28)] bg-[hsl(var(--danger)/0.12)] px-4 py-2 text-sm font-semibold text-[hsl(var(--danger))] transition hover:bg-[hsl(var(--danger)/0.16)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)] sm:w-auto"
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
              className="absolute bottom-3 right-3 z-10 w-[min(12rem,54vw)] overflow-hidden rounded-[18px] border border-white/22 bg-black shadow-[0_18px_60px_rgba(0,0,0,0.28)] transition hover:scale-[1.01] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 sm:bottom-4 sm:right-4 sm:w-[min(14rem,46vw)] sm:rounded-[22px]"
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
              className="absolute bottom-3 right-3 z-10 w-[min(12rem,54vw)] overflow-hidden rounded-[18px] border border-white/22 bg-black shadow-[0_18px_60px_rgba(0,0,0,0.28)] transition hover:scale-[1.01] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 sm:bottom-4 sm:right-4 sm:w-[min(15rem,50vw)] sm:rounded-[22px]"
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

          <div className="pointer-events-none absolute bottom-4 left-4 hidden items-center gap-2 rounded-full border border-white/20 bg-black/46 px-3 py-1.5 text-xs font-semibold text-white opacity-0 shadow-[0_14px_36px_rgba(0,0,0,0.22)] backdrop-blur-xl transition group-hover:opacity-100 sm:inline-flex">
            <Maximize2 className="h-3.5 w-3.5" />
            {t("screenShare.fullscreenHint")}
          </div>
        </div>
      </div>

      <aside className="flex max-h-48 min-h-0 flex-col overflow-y-auto rounded-[24px] border border-[hsl(var(--border)/0.66)] bg-[hsl(var(--surface-card)/0.58)] p-3 lg:h-full lg:max-h-none lg:rounded-[28px]">
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
  const [hasRequestedJoin, setHasRequestedJoin] = useState(false);
  const [activeCameraParticipantId, setActiveCameraParticipantId] = useState<string | null>(null);
  const [stageFocus, setStageFocus] = useState<VoiceStageFocus>("screen");
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteStates, setInviteStates] = useState<Record<string, VoiceInviteMember["inviteState"]>>(
    {},
  );
  const [pendingInviteUserIds, setPendingInviteUserIds] = useState<Set<string>>(() => new Set());
  const [localConnectionQuality, setLocalConnectionQuality] = useState(
    ConnectionQuality.Unknown,
  );
  const inviteStateResetTimersRef = useRef(new Map<string, number>());
  const joinChannelRef = useRef(joinChannel);
  const previousScreenShareCountRef = useRef(0);
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
      setLocalConnectionQuality(ConnectionQuality.Unknown);
      return;
    }

    setLocalConnectionQuality(room.localParticipant.connectionQuality ?? ConnectionQuality.Unknown);

    const handleConnectionQualityChanged = (
      quality: ConnectionQuality,
      participant: Participant,
    ) => {
      if (
        participant === room.localParticipant ||
        participant.identity === room.localParticipant.identity
      ) {
        setLocalConnectionQuality(quality);
      }
    };

    room.on(RoomEvent.ConnectionQualityChanged, handleConnectionQualityChanged);

    return () => {
      room.off(RoomEvent.ConnectionQualityChanged, handleConnectionQualityChanged);
    };
  }, [room]);

  useEffect(() => {
    setHasRequestedJoin(true);
    void joinChannelRef.current({ channelId, serverId }).catch(() => {
      // The provider exposes the error message for inline rendering.
    });
  }, [channelId, serverId]);

  useEffect(() => {
    setInviteError(null);
    setInviteStates({});
    setPendingInviteUserIds(new Set());
    inviteStateResetTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    inviteStateResetTimersRef.current.clear();
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

  const isKrispChecking = krispAvailability === "checking" && !isKrispNoiseCancellationActive;
  const krispStatusLabel = isKrispNoiseCancellationActive
    ? t("voice.room.krispActive")
    : isKrispChecking
      ? t("voice.room.krispChecking")
      : t("voice.room.krispInactive");
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
                title={krispStatusLabel}
              >
                {isKrispChecking ? (
                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden="true" />
                ) : isKrispNoiseCancellationActive ? (
                  <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                ) : (
                  <ShieldOff className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                )}
                <span className="truncate">{krispStatusLabel}</span>
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
