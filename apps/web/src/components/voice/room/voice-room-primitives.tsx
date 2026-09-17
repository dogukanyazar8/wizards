"use client";

import { ScreenShareVideo } from "../screen-share-video";
export { ScreenShareVideo } from "../screen-share-video";
// The default import is what the node test runner's classic JSX transform resolves these
// components' elements against; Next's compiler does not need it.
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  ConnectionQuality,
  ConnectionState,
  type LocalVideoTrack,
  type RemoteVideoTrack,
  type Room,
} from "livekit-client";
import { useShallow } from "zustand/react/shallow";
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
  Users,
  Video,
  VideoOff,
  Volume2,
  VolumeX,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { useI18n } from "@/components/providers/locale-provider";
import {
  type NoiseFilterTier,
  type VoiceCameraStatus,
  type VoiceParticipantViewModel,
  type VoiceScreenShareViewModel,
} from "@/components/providers/voice-provider";
import { VoiceSettingsModal } from "@/components/voice/voice-settings-modal";
import {
  SCREEN_SHARE_QUALITY_OPTIONS,
  isScreenShareAudioSupported,
  type ScreenShareQualityId,
} from "@/lib/voice/screen-share";
import {
  resolveMirror,
  resolveVideoAspect,
  resolveVideoFit,
  type VideoSizeClass,
} from "@/lib/voice/video-layout";
import { setVoiceVideoQualityCeiling } from "@/lib/voice/video-subscription";
import { cn } from "@/lib/utils";
import { useVoiceStore } from "@/store/voice-store";

export type VoiceParticipantTileProps = {
  isScreenSharing: boolean;
  isLocalOutputMuted: boolean;
  onResetVolume: () => void;
  onSetVolume: (volume: number) => void;
  participant: VoiceParticipantViewModel;
  participantVolume: number;
};

export type VoiceStageFocus = "camera" | "screen";

export type RoomControlButtonProps = {
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

export function isReconnectState(state: ConnectionState) {
  return state === ConnectionState.Reconnecting || state === ConnectionState.SignalReconnecting;
}

export type VoiceSignalTone = "danger" | "muted" | "primary" | "success" | "warning";

export type VoiceSignalStatus = {
  isLoading?: boolean;
  labelKey: string;
  strength: 0 | 1 | 2 | 3;
  tone: VoiceSignalTone;
};

export const VOICE_SIGNAL_BAR_CLASSES = ["h-1.5", "h-2.5", "h-3.5"] as const;

export function getVoiceSignalStatus({
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

export function getVoiceSignalToneClass(tone: VoiceSignalTone) {
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

export function getKrispQualityLabelKey(tier: NoiseFilterTier) {
  switch (tier) {
    case "krisp_high":
      return "voice.room.krispQualityHigh";
    case "krisp_medium":
      return "voice.room.krispQualityMedium";
    case "krisp_low":
      return "voice.room.krispQualityLow";
    case "browser_native":
    case "off":
    default:
      return null;
  }
}

export function getSpeakingClass(isSpeaking: boolean) {
  return isSpeaking
    ? "border-[hsl(var(--primary)/0.46)] shadow-[0_0_0_4px_hsl(var(--primary)/0.12),0_24px_70px_hsl(var(--primary)/0.12)]"
    : "border-[hsl(var(--border)/0.66)] shadow-[0_18px_54px_hsl(var(--shadow-color)/0.08)]";
}

export function getParticipantGridClass() {
  return cn(
    "grid h-full min-h-0 w-full content-start gap-2.5 overflow-y-auto pr-1 sm:gap-3",
    "grid-cols-1 auto-rows-[minmax(13.5rem,auto)]",
    "md:grid-cols-[repeat(auto-fit,minmax(min(100%,17rem),1fr))] md:auto-rows-fr",
  );
}

export function getParticipantGridStyle(count: number): CSSProperties {
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

export function normalizeWaveformLevel(level: number) {
  if (!Number.isFinite(level)) {
    return 0;
  }

  return Math.min(1, Math.max(0, level));
}

export function VoiceLevelWaveform({
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
      // `voice-level-waveform`: azaltılmış harekette geçişler globals.css'te kapanır (§2.5).
      className={cn(
        "voice-level-waveform flex items-center justify-center",
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

export function MicrophoneStatusPill({ muted }: { muted: boolean }) {
  const { t } = useI18n();

  return (
    <span
      className={cn(
        "inline-flex min-w-0 items-center justify-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold shadow-[0_10px_28px_hsl(var(--shadow-color)/0.07)] transition sm:px-4 sm:py-2 sm:text-sm",
        muted
          ? "border-[hsl(var(--danger)/0.20)] bg-[hsl(var(--danger)/0.08)] text-[hsl(var(--danger))]"
          : "border-[hsl(var(--success)/0.20)] bg-[hsl(var(--success)/0.10)] text-[hsl(var(--success))]",
      )}
    >
      {muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
      <span className="truncate">
        {muted ? t("voice.room.microphoneClosed") : t("voice.room.microphoneActive")}
      </span>
    </span>
  );
}

export function OutputStatusPill({ muted }: { muted: boolean }) {
  const { t } = useI18n();

  return (
    <span
      className={cn(
        "inline-flex min-w-0 items-center justify-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold shadow-[0_10px_28px_hsl(var(--shadow-color)/0.07)] transition sm:px-4 sm:py-2 sm:text-sm",
        muted
          ? "border-[hsl(var(--danger)/0.20)] bg-[hsl(var(--danger)/0.08)] text-[hsl(var(--danger))]"
          : "border-[hsl(var(--success)/0.20)] bg-[hsl(var(--success)/0.10)] text-[hsl(var(--success))]",
      )}
    >
      {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
      <span className="truncate">
        {muted ? t("voice.room.outputClosed") : t("voice.room.outputActive")}
      </span>
    </span>
  );
}

export function CameraStatusPill({ enabled }: { enabled: boolean }) {
  const { t } = useI18n();

  return (
    <span
      className={cn(
        "inline-flex min-w-0 items-center justify-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold shadow-[0_10px_28px_hsl(var(--shadow-color)/0.07)] transition sm:px-4 sm:py-2 sm:text-sm",
        enabled
          ? "border-[hsl(var(--success)/0.20)] bg-[hsl(var(--success)/0.10)] text-[hsl(var(--success))]"
          : "border-[hsl(var(--border)/0.62)] bg-[hsl(var(--surface-soft)/0.52)] text-app-muted",
      )}
    >
      {enabled ? <Video className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />}
      <span className="truncate">
        {enabled ? t("voice.room.cameraActive") : t("voice.room.cameraClosed")}
      </span>
    </span>
  );
}

export function getAvatarGlowStyle(
  participant: VoiceParticipantViewModel,
): CSSProperties | undefined {
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

function readTrackSourceAspect(track: LocalVideoTrack | RemoteVideoTrack | null): number {
  const settings = track?.mediaStreamTrack?.getSettings?.();
  if (!settings) {
    return resolveVideoAspect(null);
  }

  return resolveVideoAspect({ height: settings.height ?? 0, width: settings.width ?? 0 });
}

/**
 * Keeps a tile box on the source instead of a hard-coded 16/9. The capture
 * settings give the box before the first frame arrives; the element's own
 * `resize` event corrects it when the publisher rotates the device.
 */
export function useVideoSourceAspect(track: LocalVideoTrack | RemoteVideoTrack | null) {
  const [state, setState] = useState(() => ({
    aspect: readTrackSourceAspect(track),
    track,
  }));
  const setAspect = useCallback(
    (aspect: number) => {
      setState((current) => (current.track === track ? { ...current, aspect } : current));
    },
    [track],
  );

  if (state.track !== track) {
    const nextState = { aspect: readTrackSourceAspect(track), track };
    setState(nextState);
    return [nextState.aspect, setAspect] as const;
  }

  return [state.aspect, setAspect] as const;
}

export function ParticipantCameraVideo({
  isLocal,
  onSourceAspectChange,
  sizeClass = "stage",
  track,
}: {
  isLocal: boolean;
  onSourceAspectChange?: (aspect: number) => void;
  sizeClass?: VideoSizeClass;
  track: LocalVideoTrack | RemoteVideoTrack;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const { mirrorPreview, rotation } = useVoiceStore(
    useShallow((state) => ({
      mirrorPreview: state.cameraPreferences.mirrorPreview,
      rotation: state.cameraPreferences.rotation,
    })),
  );
  // The mirror preference only ever describes the local front-facing preview, so
  // it reaches the shared rule as a facing mode and can never flip a remote tile.
  const mirrored = resolveMirror({
    facingMode: mirrorPreview ? "user" : "environment",
    isLocal,
  });
  const fit = resolveVideoFit({ sizeClass });
  const localPreviewStyle = useMemo<CSSProperties | undefined>(() => {
    if (!isLocal) {
      return undefined;
    }

    return {
      transform: `scaleX(${mirrored ? -1 : 1}) rotate(${rotation}deg)`,
    };
  }, [isLocal, mirrored, rotation]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    const reportAspect = () => {
      onSourceAspectChange?.(
        resolveVideoAspect({ height: video.videoHeight, width: video.videoWidth }),
      );
    };

    track.attach(video);
    video.play().catch(() => undefined);
    video.addEventListener("loadedmetadata", reportAspect);
    video.addEventListener("resize", reportAspect);
    reportAspect();

    return () => {
      video.removeEventListener("loadedmetadata", reportAspect);
      video.removeEventListener("resize", reportAspect);
      track.detach(video);
    };
  }, [onSourceAspectChange, track]);

  return (
    <video
      autoPlay
      className={cn("h-full w-full bg-black", fit === "cover" ? "object-cover" : "object-contain")}
      data-testid="voice-participant-camera-video"
      data-video-fit={fit}
      muted={isLocal}
      playsInline
      ref={videoRef}
      style={localPreviewStyle}
    />
  );
}

export function VoiceParticipantTile({
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
  const cameraPublication = participant.cameraPublication;
  const videoQualityMode = useVoiceStore((state) => state.videoQualityMode);

  // A grid card is a readable surface, not a corner preview: it asks for the top
  // layer while it holds a camera and stops asking when the camera goes away.
  useEffect(() => {
    setVoiceVideoQualityCeiling(cameraPublication, { isStage: true, videoQualityMode });
  }, [cameraPublication, videoQualityMode]);

  return (
    <article
      className={cn(
        "relative flex h-full min-h-[13.5rem] min-w-0 flex-col overflow-hidden rounded-[22px] border bg-[linear-gradient(180deg,hsl(var(--surface-card)/0.92),hsl(var(--surface-soft)/0.44))] p-2.5 transition sm:min-h-[15rem] sm:rounded-[26px] sm:p-3.5",
        getSpeakingClass(participant.isSpeaking),
      )}
      data-speaking={participant.isSpeaking ? "true" : "false"}
      data-testid="voice-participant-card"
      data-user-id={participant.userId}
      data-username={participant.username}
    >
      <div className="flex shrink-0 items-start justify-between gap-2">
        <div className="inline-flex min-w-0 items-center gap-1.5 rounded-full border border-[hsl(var(--border)/0.62)] bg-[hsl(var(--surface-card)/0.68)] px-2 py-1 text-[10px] font-semibold text-app-muted sm:text-[11px]">
          <span className="h-2.5 w-2.5 rounded-full bg-[hsl(var(--success))] shadow-[0_0_0_4px_hsl(var(--success)/0.12)]" />
          <span className="truncate">
            {participant.isSpeaking ? t("voice.room.speaking") : t("voice.room.connected")}
          </span>
        </div>

        <div className="flex min-w-0 flex-wrap items-center justify-end gap-1.5">
          {isScreenSharing ? (
            <span className="inline-flex max-w-[8rem] items-center gap-1 rounded-full border border-[hsl(var(--primary)/0.24)] bg-[hsl(var(--primary)/0.12)] px-2 py-1 text-[10px] font-semibold text-[hsl(var(--primary))] sm:text-[11px]">
              <MonitorUp className="h-3.5 w-3.5" />
              <span className="truncate">{t("voice.room.screenSharing")}</span>
            </span>
          ) : null}
          {participant.isCameraEnabled ? (
            <span className="inline-flex max-w-[7rem] items-center gap-1 rounded-full border border-[hsl(var(--success)/0.22)] bg-[hsl(var(--success)/0.10)] px-2 py-1 text-[10px] font-semibold text-[hsl(var(--success))] sm:text-[11px]">
              <Video className="h-3.5 w-3.5" />
              <span className="truncate">{t("voice.room.cameraOn")}</span>
            </span>
          ) : null}
          <span
            className={cn(
              "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border sm:h-9 sm:w-9",
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
          <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/72 via-black/34 to-transparent p-3 text-left text-white">
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
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center py-2 text-center sm:py-3">
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
              className="h-[clamp(3.25rem,7vh,5.5rem)] w-[clamp(3.25rem,7vh,5.5rem)] border-none text-lg"
              fallback={displayName}
              src={participant.avatarUrl}
            />
          </div>
          <div className="mt-2 min-w-0 sm:mt-3">
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
        <div className="flex shrink-0 flex-wrap justify-center gap-1.5 pb-1 sm:gap-2">
          <MicrophoneStatusPill muted={participant.isMuted} />
          <CameraStatusPill enabled={participant.isCameraEnabled} />
          <OutputStatusPill muted={isLocalOutputMuted} />
        </div>
      ) : (
        <div className="shrink-0 rounded-2xl border border-[hsl(var(--border)/0.54)] bg-[hsl(var(--surface-card)/0.52)] px-2.5 py-2 sm:rounded-[20px] sm:px-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-app-soft sm:text-xs sm:tracking-[0.16em]">
              {t("voice.grid.remoteVolume")}
            </span>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-app-foreground">
                {participantVolume}%
              </span>
              <button
                aria-label={t("voice.grid.resetVolume")}
                className="flex h-7 w-7 items-center justify-center rounded-full border border-[hsl(var(--border)/0.68)] bg-[hsl(var(--surface-soft)/0.52)] text-app-muted transition hover:text-app-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
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

export function VoiceEmptyState() {
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

export function RoomControlButton({
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
        "group flex min-w-0 flex-col items-center gap-1 rounded-[18px] border px-1.5 py-2 text-[11px] font-semibold transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)] sm:min-w-[4.75rem] sm:rounded-[22px] sm:px-3 sm:text-xs",
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
      <span className="relative flex h-9 w-9 items-center justify-center rounded-full border border-current/10 bg-white/44 shadow-[0_10px_28px_hsl(var(--shadow-color)/0.08)] sm:h-11 sm:w-11">
        {icon}
        {showChevron ? (
          <ChevronDown className="absolute -bottom-1 -right-1 h-3.5 w-3.5 rounded-full border border-[hsl(var(--border)/0.6)] bg-[hsl(var(--surface-card))] p-0.5 text-app-soft" />
        ) : null}
      </span>
      <span className="max-w-full truncate sm:max-w-[5.25rem]">{label}</span>
      {children}
    </button>
  );
}

export function VoiceControlBar({
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
      <div className="sticky bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] z-20 mt-3 flex justify-center sm:bottom-3 sm:mt-5">
        <div className="grid w-full max-w-[25rem] grid-cols-3 gap-1.5 rounded-[24px] border border-[hsl(var(--border)/0.66)] bg-[hsl(var(--surface-card)/0.9)] p-1.5 shadow-[0_24px_70px_hsl(var(--shadow-color)/0.14)] backdrop-blur-xl sm:flex sm:w-auto sm:max-w-full sm:gap-2 sm:rounded-[30px] sm:p-2">
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

/**
 * Screen-share audio support is a browser capability, so it can only be read
 * after hydration — the server render must not claim the toggle exists.
 */
const subscribeToScreenShareAudioSupport = () => () => {};
const getScreenShareAudioSupportSnapshot = () => isScreenShareAudioSupported();
const getServerScreenShareAudioSupportSnapshot = () => false;

export function ScreenShareStage({
  activeCameraParticipant,
  activeShare,
  cameraParticipants,
  isApplyingQuality,
  onSelectCameraParticipant,
  onSelectShare,
  onSelectStageFocus,
  onSelectQuality,
  onResetShareVolume,
  onSetShareVolume,
  onStopShare,
  onToggleShareAudio,
  screenShares,
  selectedQuality,
  shareAudioEnabled = false,
  shareVolume = 100,
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
  onResetShareVolume?: () => void;
  onSetShareVolume?: (volume: number) => void;
  onStopShare: () => void;
  onToggleShareAudio?: (enabled: boolean) => void;
  screenShares: VoiceScreenShareViewModel[];
  selectedQuality: ScreenShareQualityId;
  shareAudioEnabled?: boolean;
  shareVolume?: number;
  stageFocus: VoiceStageFocus;
}) {
  const { t } = useI18n();
  const stageRef = useRef<HTMLDivElement | null>(null);
  const hasShareAudioSupport = useSyncExternalStore(
    subscribeToScreenShareAudioSupport,
    getScreenShareAudioSupportSnapshot,
    getServerScreenShareAudioSupportSnapshot,
  );
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
  // Both picture-in-picture boxes follow their source, so a portrait phone is
  // previewed portrait instead of being cropped into a 16/9 slot.
  const [cameraPipAspect, setCameraPipAspect] = useVideoSourceAspect(activeCameraTrack);
  const [screenPipAspect, setScreenPipAspect] = useVideoSourceAspect(activeShare?.track ?? null);
  const activeCameraPublication = activeCameraParticipant?.cameraPublication ?? null;
  const activeSharePublication = activeShare?.publication ?? null;
  const videoQualityMode = useVoiceStore((state) => state.videoQualityMode);

  // Whichever surface holds the stage asks for the top layer; the one demoted to
  // the corner preview gives it back.
  useEffect(() => {
    setVoiceVideoQualityCeiling(activeCameraPublication, {
      isStage: primaryFocus === "camera",
      videoQualityMode,
    });
  }, [activeCameraPublication, primaryFocus, videoQualityMode]);

  useEffect(() => {
    setVoiceVideoQualityCeiling(activeSharePublication, {
      isStage: primaryFocus === "screen",
      videoQualityMode,
    });
  }, [activeSharePublication, primaryFocus, videoQualityMode]);

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
                  "inline-flex min-h-9 items-center justify-center gap-2 rounded-xl px-3 text-xs font-semibold transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]",
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
                  "inline-flex min-h-9 items-center justify-center gap-2 rounded-xl px-3 text-xs font-semibold transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]",
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
                className="min-h-10 w-full rounded-2xl border border-[hsl(var(--danger)/0.28)] bg-[hsl(var(--danger)/0.12)] px-4 py-2 text-sm font-semibold text-[hsl(var(--danger))] transition hover:bg-[hsl(var(--danger)/0.16)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)] sm:w-auto"
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
              <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/76 via-black/36 to-transparent p-4 text-white">
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
                <ScreenShareVideo
                  interactive
                  onToggleFullscreen={() => void toggleElementFullscreen(stageRef.current)}
                  direct
                  publication={activeShare.publication}
                  track={activeShare.track}
                  onStop={activeShare.isLocal ? onStopShare : undefined}
                />
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
              className="absolute bottom-3 right-3 z-10 w-[min(12rem,54vw)] overflow-hidden rounded-[18px] border border-white/22 bg-black shadow-[0_18px_60px_rgba(0,0,0,0.28)] transition hover:scale-[1.01] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-white/70 sm:bottom-4 sm:right-4 sm:w-[min(14rem,46vw)] sm:rounded-[22px]"
              data-testid="voice-stage-camera-pip"
              onClick={() => onSelectStageFocus("camera")}
              type="button"
            >
              <span className="absolute left-2 top-2 z-10 inline-flex items-center gap-1.5 rounded-full border border-white/18 bg-black/44 px-2 py-1 text-[10px] font-semibold text-white backdrop-blur-xl">
                <Video className="h-3 w-3" />
                {t("voice.screenShare.cameraPreview")}
              </span>
              <div
                data-testid="voice-stage-camera-pip-frame"
                style={{ aspectRatio: cameraPipAspect }}
              >
                <ParticipantCameraVideo
                  isLocal={activeCameraParticipant.isLocal}
                  onSourceAspectChange={setCameraPipAspect}
                  sizeClass="thumbnail"
                  track={activeCameraTrack}
                />
              </div>
              <span className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/72 to-transparent px-3 py-2 text-left text-xs font-semibold text-white">
                {activeCameraName}
              </span>
            </button>
          ) : null}

          {primaryFocus === "camera" && activeShare ? (
            <button
              className="absolute bottom-3 right-3 z-10 w-[min(12rem,54vw)] overflow-hidden rounded-[18px] border border-white/22 bg-black shadow-[0_18px_60px_rgba(0,0,0,0.28)] transition hover:scale-[1.01] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-white/70 sm:bottom-4 sm:right-4 sm:w-[min(15rem,50vw)] sm:rounded-[22px]"
              data-testid="voice-stage-screen-pip"
              onClick={() => onSelectStageFocus("screen")}
              type="button"
            >
              <span className="absolute left-2 top-2 z-10 inline-flex items-center gap-1.5 rounded-full border border-white/18 bg-black/44 px-2 py-1 text-[10px] font-semibold text-white backdrop-blur-xl">
                <MonitorUp className="h-3 w-3" />
                {t("voice.screenShare.focusScreen")}
              </span>
              <div
                data-testid="voice-stage-screen-pip-frame"
                style={{ aspectRatio: screenPipAspect }}
              >
                {activeShare.track ? (
                  <ScreenShareVideo
                    onSourceAspectChange={setScreenPipAspect}
                    track={activeShare.track}
                  />
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
                  "flex min-h-12 w-full items-center gap-3 rounded-2xl border px-3 py-2 text-left transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]",
                  isActive
                    ? "border-[hsl(var(--primary)/0.38)] bg-[hsl(var(--primary)/0.14)]"
                    : "border-[hsl(var(--border)/0.72)] bg-[hsl(var(--surface-soft)/0.42)] hover:bg-[hsl(var(--surface-soft)/0.72)]",
                )}
                key={share.id}
                onClick={() => onSelectShare(share.id)}
                type="button"
              >
                {share.track && (
                  <div className="h-16 w-24 shrink-0">
                    <ScreenShareVideo
                      publication={isActive ? null : share.publication}
                      track={share.track}
                    />
                  </div>
                )}
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
                      "flex min-h-11 w-full items-center gap-3 rounded-2xl border px-3 py-2 text-left transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]",
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
                className="min-h-11 w-full appearance-none rounded-2xl border border-[hsl(var(--border)/0.72)] bg-[hsl(var(--surface-soft)/0.58)] px-3 py-2 pr-9 text-sm font-semibold text-app-foreground transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)] disabled:cursor-not-allowed disabled:opacity-60"
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

            {hasShareAudioSupport && onToggleShareAudio ? (
              <button
                aria-pressed={shareAudioEnabled}
                className={cn(
                  "mt-3 flex w-full items-start gap-2.5 rounded-2xl border p-3 text-left transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]",
                  shareAudioEnabled
                    ? "border-[hsl(var(--primary)/0.42)] bg-[hsl(var(--primary)/0.10)]"
                    : "border-[hsl(var(--border)/0.72)] bg-[hsl(var(--surface-soft)/0.42)] hover:border-[hsl(var(--primary)/0.28)]",
                )}
                data-testid="screen-share-audio-toggle"
                onClick={() => onToggleShareAudio(!shareAudioEnabled)}
                type="button"
              >
                {shareAudioEnabled ? (
                  <Volume2
                    aria-hidden="true"
                    className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--primary))]"
                  />
                ) : (
                  <VolumeX aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-app-muted" />
                )}
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-app-foreground">
                    {t("voice.screenShare.audio.title")}
                  </span>
                  <span className="mt-0.5 block text-xs leading-4 text-app-muted">
                    {t("voice.screenShare.audio.description")}
                  </span>
                </span>
              </button>
            ) : null}
          </div>
        ) : null}

        {activeShare && !activeShare.isLocal && onSetShareVolume ? (
          <div className="mt-4 border-t border-app-border pt-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="truncate text-xs font-semibold uppercase tracking-[0.2em] text-app-soft">
                {t("voice.screenShare.audio.volume")}
              </span>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-app-foreground">{shareVolume}%</span>
                {onResetShareVolume ? (
                  <button
                    aria-label={t("voice.screenShare.audio.resetVolume")}
                    className="flex h-7 w-7 items-center justify-center rounded-full border border-[hsl(var(--border)/0.68)] bg-[hsl(var(--surface-soft)/0.52)] text-app-muted transition hover:text-app-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
                    data-testid="screen-share-audio-volume-reset"
                    onClick={onResetShareVolume}
                    type="button"
                  >
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                ) : null}
              </div>
            </div>
            <div className="flex items-center gap-3">
              {shareVolume === 0 ? (
                <VolumeX aria-hidden="true" className="h-4 w-4 shrink-0 text-app-muted" />
              ) : (
                <Volume2 aria-hidden="true" className="h-4 w-4 shrink-0 text-app-muted" />
              )}
              <input
                aria-label={t("voice.screenShare.audio.volume")}
                className="h-2 w-full cursor-pointer appearance-none rounded-full bg-[hsl(var(--surface-soft)/0.86)] accent-[hsl(var(--primary))]"
                data-testid="screen-share-audio-volume"
                max={100}
                min={0}
                onChange={(event) => onSetShareVolume(Number(event.target.value))}
                step={5}
                type="range"
                value={shareVolume}
              />
            </div>
            <p className="mt-2 text-xs leading-4 text-app-muted">
              {t("voice.screenShare.audio.volumeDescription")}
            </p>
          </div>
        ) : null}
      </aside>
    </div>
  );
}

export function renderGridParticipants(
  room: Room | null,
  participants: VoiceParticipantViewModel[],
) {
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
