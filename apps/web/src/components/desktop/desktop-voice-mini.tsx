"use client";

import { useEffect, useMemo, useState } from "react";
import { Headphones, Mic, MicOff, PhoneOff, Signal } from "lucide-react";
import {
  parseVoiceMiniSnapshot,
  type VoiceMiniParticipant,
  type VoiceMiniSnapshot,
} from "@wizards/types";
import { postDesktopVoiceMiniCommand } from "@/lib/desktop/controls";
import { WHISPR_DESKTOP_VOICE_MINI_SNAPSHOT_EVENT } from "@/lib/desktop/runtime";
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

function MiniAvatar({ participant }: { participant: VoiceMiniParticipant }) {
  return (
    <span
      className={cn(
        "relative grid size-10 shrink-0 place-items-center overflow-hidden rounded-2xl border text-xs font-bold shadow-[0_10px_26px_rgba(99,102,241,0.12)]",
        participant.isSpeaking
          ? "border-emerald-300 bg-emerald-50 text-emerald-700"
          : "border-indigo-100 bg-indigo-50 text-indigo-600",
      )}
    >
      {participant.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img alt="" className="h-full w-full object-cover" src={participant.avatarUrl} />
      ) : (
        initials(participant.displayName)
      )}
      <span
        className={cn(
          "absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-white",
          participant.isSpeaking ? "bg-emerald-400" : "bg-slate-300",
        )}
      />
    </span>
  );
}

function VoiceMiniAction({
  active,
  "aria-label": ariaLabel,
  children,
  onClick,
  tone = "neutral",
}: {
  active?: boolean;
  "aria-label": string;
  children: React.ReactNode;
  onClick: () => void;
  tone?: "danger" | "neutral";
}) {
  return (
    <button
      aria-label={ariaLabel}
      className={cn(
        "grid size-8 place-items-center rounded-xl border text-slate-600 transition hover:-translate-y-0.5 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-indigo-400/60",
        active
          ? "border-indigo-200 bg-indigo-50 text-indigo-600"
          : "border-slate-200/80 bg-white/78 hover:bg-indigo-50 hover:text-indigo-600",
        tone === "danger" && "hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600",
      )}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

export function DesktopVoiceMini() {
  const { t } = useI18n();
  const [snapshot, setSnapshot] = useState<VoiceMiniSnapshot | null>(null);

  useEffect(() => {
    const handleSnapshot = (event: Event) => {
      const nextSnapshot = parseVoiceMiniSnapshot((event as CustomEvent<unknown>).detail);

      if (nextSnapshot) {
        setSnapshot(nextSnapshot);
      }
    };

    window.addEventListener(WHISPR_DESKTOP_VOICE_MINI_SNAPSHOT_EVENT, handleSnapshot);
    return () => {
      window.removeEventListener(WHISPR_DESKTOP_VOICE_MINI_SNAPSHOT_EVENT, handleSnapshot);
    };
  }, []);

  const visibleParticipants = useMemo(() => {
    const participants = snapshot?.participants ?? [];
    const speaking = participants.filter((participant) => participant.isSpeaking);
    return (speaking.length > 0 ? speaking : participants).slice(0, 3);
  }, [snapshot]);
  const localParticipant = snapshot?.participants.find((participant) => participant.isLocal);
  const quality = snapshot?.connection.quality ?? "unknown";

  return (
    <main className="h-dvh w-dvw overflow-hidden bg-transparent p-2">
      <section
        aria-label={t("desktop.voiceMini.aria")}
        className="flex h-full w-full items-center gap-3 rounded-[26px] border border-slate-200/90 bg-white/[0.94] px-3.5 py-3 text-slate-900 shadow-[0_18px_54px_rgba(79,70,229,0.16)] backdrop-blur-xl"
        data-tauri-drag-region
      >
        <div className="flex min-w-0 flex-1 items-center gap-3" data-tauri-drag-region>
          <div className="flex -space-x-2" data-tauri-drag-region>
            {visibleParticipants.length > 0 ? (
              visibleParticipants.map((participant) => (
                <MiniAvatar key={participant.userId} participant={participant} />
              ))
            ) : (
              <span className="grid size-10 place-items-center rounded-2xl border border-indigo-100 bg-indigo-50 text-indigo-600">
                <Signal className="h-4 w-4" />
              </span>
            )}
          </div>

          <div className="min-w-0" data-tauri-drag-region>
            <p className="truncate text-sm font-semibold tracking-[-0.01em] text-slate-950">
              {visibleParticipants[0]?.displayName ?? t("desktop.voiceMini.idle")}
            </p>
            <p className="mt-0.5 flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  quality === "lost" ? "bg-rose-400" : "bg-emerald-400",
                )}
              />
              {quality === "lost"
                ? t("desktop.voiceMini.reconnecting")
                : t("desktop.voiceMini.connected")}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <VoiceMiniAction
            active={Boolean(localParticipant?.isMuted)}
            aria-label={t("desktop.voiceMini.toggleMute")}
            onClick={() => postDesktopVoiceMiniCommand("toggleMute")}
          >
            {localParticipant?.isMuted ? (
              <MicOff className="h-4 w-4" />
            ) : (
              <Mic className="h-4 w-4" />
            )}
          </VoiceMiniAction>
          <VoiceMiniAction
            active={Boolean(localParticipant?.isDeafened)}
            aria-label={t("desktop.voiceMini.toggleDeafen")}
            onClick={() => postDesktopVoiceMiniCommand("toggleDeafen")}
          >
            <Headphones className="h-4 w-4" />
          </VoiceMiniAction>
          <VoiceMiniAction
            aria-label={t("desktop.voiceMini.leaveVoice")}
            onClick={() => postDesktopVoiceMiniCommand("leaveVoice")}
            tone="danger"
          >
            <PhoneOff className="h-4 w-4" />
          </VoiceMiniAction>
        </div>
      </section>
    </main>
  );
}
