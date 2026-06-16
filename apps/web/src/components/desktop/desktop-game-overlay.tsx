"use client";

import { useEffect, useMemo, useState } from "react";
import { MicOff, VolumeX } from "lucide-react";
import {
  parseVoiceMiniSnapshot,
  type VoiceMiniParticipant,
  type VoiceMiniSnapshot,
  type VoiceOverlaySize,
} from "@wizards/types";
import { DEFAULT_DESKTOP_GAME_OVERLAY_PREFERENCES } from "@/lib/desktop/voice-mini";
import { WHISPR_DESKTOP_GAME_OVERLAY_SNAPSHOT_EVENT } from "@/lib/desktop/runtime";
import { cn } from "@/lib/utils";
import { useI18n } from "@/components/providers/locale-provider";

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

const OVERLAY_WAVEFORM_PATTERN = [
  0.18, 0.28, 0.52, 0.86, 0.44, 0.24, 0.34, 0.68, 0.96, 0.5, 0.26, 0.2,
];

function normalizeOverlayWaveformLevel(level: number) {
  if (!Number.isFinite(level)) {
    return 0;
  }

  return Math.min(1, Math.max(0, level));
}

function OverlayAudioWaveform({
  active,
  level,
  muted,
  size,
}: {
  active: boolean;
  level: number;
  muted: boolean;
  size: VoiceOverlaySize;
}) {
  const normalizedLevel = muted ? 0 : normalizeOverlayWaveformLevel(level);
  const displayLevel = active ? Math.max(normalizedLevel, 0.18) : normalizedLevel * 0.38;
  const maxHeight = size === "large" ? 18 : size === "compact" ? 10 : 14;
  const minHeight = size === "compact" ? 2 : 3;
  const center = (OVERLAY_WAVEFORM_PATTERN.length - 1) / 2;

  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex items-center",
        size === "large"
          ? "h-5 w-24 gap-[3px]"
          : size === "compact"
            ? "h-3.5 w-14 gap-[2px]"
            : "h-4 w-20 gap-[2.5px]",
      )}
    >
      {OVERLAY_WAVEFORM_PATTERN.map((shape, index) => {
        const distanceFromCenter = Math.abs(index - center) / center;
        const centerBoost = 1 - distanceFromCenter * 0.46;
        const height =
          minHeight + (maxHeight - minHeight) * Math.min(1, displayLevel * shape * centerBoost);
        const isLit = !muted && (active || normalizedLevel > 0.035);

        return (
          <span
            className={cn(
              "block rounded-full transition-[height,opacity,background-color,box-shadow] ease-out",
              size === "large" ? "w-[3px]" : "w-[2.5px]",
              muted
                ? "bg-white/[0.24]"
                : isLit
                  ? "bg-emerald-300 shadow-[0_0_12px_rgba(110,231,183,0.32)]"
                  : "bg-white/[0.28]",
            )}
            key={`${shape}-${index}`}
            style={{
              height: `${height}px`,
              opacity: muted ? 0.42 : isLit ? 0.62 + displayLevel * 0.34 : 0.34,
              transitionDuration: muted ? "150ms" : "70ms",
            }}
          />
        );
      })}
    </span>
  );
}

function OverlayAvatar({
  participant,
  size,
}: {
  participant: VoiceMiniParticipant;
  size: VoiceOverlaySize;
}) {
  return (
    <span
      className={cn(
        "relative grid shrink-0 place-items-center overflow-hidden rounded-2xl font-bold shadow-[0_8px_22px_rgba(2,6,23,0.34)]",
        size === "large"
          ? "size-11 text-xs"
          : size === "compact"
            ? "size-8 text-[10px]"
            : "size-9 text-[11px]",
        participant.isSpeaking
          ? "bg-emerald-50 text-emerald-700"
          : "bg-white/[0.78] text-indigo-600",
      )}
    >
      {participant.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img alt="" className="h-full w-full object-cover" src={participant.avatarUrl} />
      ) : (
        initials(participant.displayName)
      )}
    </span>
  );
}

function OverlayVoiceStateBadges({
  deafened,
  muted,
  size,
}: {
  deafened: boolean;
  muted: boolean;
  size: VoiceOverlaySize;
}) {
  if (!muted && !deafened) {
    return null;
  }

  const iconSize = size === "compact" ? "h-3 w-3" : "h-3.5 w-3.5";
  const badgeSize =
    size === "large" ? "h-6 w-6" : size === "compact" ? "h-[18px] w-[18px]" : "h-5 w-5";

  return (
    <span aria-hidden="true" className="flex shrink-0 items-center gap-1">
      {muted ? (
        <span
          className={cn(
            "grid place-items-center rounded-full bg-rose-500/[0.18] text-rose-50 shadow-[0_6px_16px_rgba(244,63,94,0.2)] ring-1 ring-rose-100/[0.28] backdrop-blur-md",
            badgeSize,
          )}
        >
          <MicOff className={iconSize} strokeWidth={2.35} />
        </span>
      ) : null}
      {deafened ? (
        <span
          className={cn(
            "grid place-items-center rounded-full bg-amber-300/[0.18] text-amber-50 shadow-[0_6px_16px_rgba(251,191,36,0.18)] ring-1 ring-amber-100/[0.28] backdrop-blur-md",
            badgeSize,
          )}
        >
          <VolumeX className={iconSize} strokeWidth={2.35} />
        </span>
      ) : null}
    </span>
  );
}

function OverlayParticipant({
  participant,
  size,
}: {
  participant: VoiceMiniParticipant;
  size: VoiceOverlaySize;
}) {
  return (
    <li
      className={cn(
        "flex items-center text-white drop-shadow-[0_3px_10px_rgba(2,6,23,0.72)] transition-opacity",
        size === "large"
          ? "min-h-14 gap-3.5 px-1.5 py-2"
          : size === "compact"
            ? "min-h-10 gap-2 px-1 py-1"
            : "min-h-12 gap-3 px-1.5 py-1.5",
        participant.isSpeaking ? "opacity-100" : "opacity-90",
      )}
    >
      <OverlayAvatar participant={participant} size={size} />
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "truncate font-semibold leading-5 tracking-[-0.01em]",
            size === "compact" ? "text-xs" : "text-sm",
          )}
        >
          {participant.displayName}
        </p>
        <div className="mt-0.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/[0.62]">
          <OverlayVoiceStateBadges
            deafened={participant.isDeafened}
            muted={participant.isMuted}
            size={size}
          />
          <OverlayAudioWaveform
            active={participant.isSpeaking}
            level={participant.audioLevel}
            muted={participant.isMuted}
            size={size}
          />
        </div>
      </div>
    </li>
  );
}

export function DesktopGameOverlay() {
  const { t } = useI18n();
  const [snapshot, setSnapshot] = useState<VoiceMiniSnapshot | null>(null);

  useEffect(() => {
    document.documentElement.classList.add("whispr-desktop-transparent-surface");
    return () => {
      document.documentElement.classList.remove("whispr-desktop-transparent-surface");
    };
  }, []);

  useEffect(() => {
    const handleSnapshot = (event: Event) => {
      const nextSnapshot = parseVoiceMiniSnapshot((event as CustomEvent<unknown>).detail);

      if (nextSnapshot) {
        setSnapshot(nextSnapshot);
      }
    };

    window.addEventListener(WHISPR_DESKTOP_GAME_OVERLAY_SNAPSHOT_EVENT, handleSnapshot);
    return () => {
      window.removeEventListener(WHISPR_DESKTOP_GAME_OVERLAY_SNAPSHOT_EVENT, handleSnapshot);
    };
  }, []);

  const visibleParticipants = useMemo(() => {
    const participants = snapshot?.participants ?? [];
    const speaking = participants.filter((participant) => participant.isSpeaking);
    const overlay = snapshot?.overlay ?? DEFAULT_DESKTOP_GAME_OVERLAY_PREFERENCES;
    const maxParticipants = overlay.size === "large" ? 8 : overlay.size === "compact" ? 3 : 6;
    if (overlay.speakingOnly) {
      return speaking.slice(0, maxParticipants);
    }

    return participants.slice(0, maxParticipants);
  }, [snapshot]);
  const overlay = snapshot?.overlay ?? DEFAULT_DESKTOP_GAME_OVERLAY_PREFERENCES;

  return (
    <main
      className={cn(
        "pointer-events-none flex h-dvh w-dvw overflow-hidden bg-transparent p-3",
        overlay.anchor.includes("bottom") ? "flex-col justify-end" : "flex-col justify-start",
        overlay.anchor.includes("right") ? "items-end" : "items-start",
      )}
    >
      <section
        aria-label={t("desktop.gameOverlay.aria")}
        className={cn(
          "w-full",
          overlay.size === "large"
            ? "max-w-[356px]"
            : overlay.size === "compact"
              ? "max-w-[244px]"
              : "max-w-[296px]",
        )}
        data-testid="desktop-game-overlay"
      >
        {visibleParticipants.length > 0 ? (
          <ul className="grid gap-2">
            {visibleParticipants.map((participant) => (
              <OverlayParticipant
                key={participant.userId}
                participant={participant}
                size={overlay.size}
              />
            ))}
          </ul>
        ) : (
          <div className="inline-flex rounded-[20px] bg-slate-950/[0.34] px-3 py-2 text-xs font-semibold text-white/[0.72] shadow-[0_14px_34px_rgba(15,23,42,0.18)] backdrop-blur-xl">
            {t("desktop.gameOverlay.idle")}
          </div>
        )}
      </section>
    </main>
  );
}
