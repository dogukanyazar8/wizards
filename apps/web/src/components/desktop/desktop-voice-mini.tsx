"use client";

import React, { useEffect, useState } from "react";
import {
  GripVertical,
  Headphones,
  HeadphoneOff,
  Mic,
  MicOff,
  PhoneOff,
  Signal,
} from "lucide-react";
import type { VoiceMiniParticipant, VoiceMiniSnapshot } from "@wizards/types";
import { postDesktopVoiceMiniCommand } from "@/lib/desktop/controls";
import { subscribeVoiceMiniSnapshots } from "@/lib/desktop/voice-mini-snapshots";
import { cn } from "@/lib/utils";
import { useI18n } from "@/components/providers/locale-provider";

function MiniAvatar({ participant }: { participant: VoiceMiniParticipant }) {
  const { t } = useI18n();
  const label = [
    participant.displayName,
    participant.isMuted ? t("desktop.voiceMini.muted") : null,
    participant.isSpeaking ? t("desktop.voiceMini.speaking") : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const initials = participant.displayName
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <span
      aria-label={label}
      role="img"
      title={label}
      className={cn(
        "relative grid size-8 shrink-0 place-items-center rounded-full border-2 bg-[hsl(var(--surface-soft))] text-[10px] font-bold text-[hsl(var(--text-secondary))]",
        participant.isSpeaking ? "border-[hsl(var(--success))]" : "border-[hsl(var(--border))]",
      )}
    >
      {participant.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img alt="" className="size-full rounded-full object-cover" src={participant.avatarUrl} />
      ) : (
        initials
      )}
      {participant.isMuted && (
        <span className="absolute -bottom-1 -right-1 grid size-4 place-items-center rounded-full bg-[hsl(var(--surface-card))] text-[var(--danger-readable)]">
          <MicOff aria-hidden="true" className="size-2.5" />
        </span>
      )}
    </span>
  );
}

function VoiceMiniAction({
  active,
  label,
  children,
  onClick,
  disabled,
  danger = false,
}: {
  active?: boolean;
  label: string;
  children: React.ReactNode;
  onClick: () => void;
  disabled: boolean;
  danger?: boolean;
}) {
  return (
    <button
      aria-label={label}
      aria-pressed={active}
      title={label}
      disabled={disabled}
      className={cn(
        "grid size-10 shrink-0 place-items-center rounded-xl transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))] focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(var(--surface-card))] disabled:cursor-not-allowed disabled:opacity-40",
        danger || active
          ? "bg-[hsl(var(--danger)/0.12)] text-[var(--danger-readable)] enabled:hover:bg-[hsl(var(--danger)/0.22)]"
          : "bg-[hsl(var(--surface-soft))] text-[hsl(var(--text-secondary))] enabled:hover:bg-[hsl(var(--primary)/0.16)] enabled:hover:text-[hsl(var(--primary))]",
      )}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

export function DesktopVoiceMiniView({ snapshot }: { snapshot: VoiceMiniSnapshot | null }) {
  const { t } = useI18n();
  const [commandFailed, setCommandFailed] = useState(false);
  const participants = snapshot?.active ? snapshot.participants : [];
  // Keep the roster visible and give current speakers priority without mutating the snapshot.
  const visibleParticipants = [...participants]
    .sort((a, b) => Number(b.isSpeaking) - Number(a.isSpeaking))
    .slice(0, 3);
  const remaining = participants.length - visibleParticipants.length;
  const localParticipant = participants.find((participant) => participant.isLocal);
  const quality = snapshot?.connection.quality ?? "unknown";
  const connected = Boolean(snapshot?.active) && (quality === "good" || quality === "excellent");
  const connectionLabel = !snapshot?.active
    ? t("desktop.voiceMini.waiting")
    : quality === "lost"
      ? t("desktop.voiceMini.reconnecting")
      : quality === "poor"
        ? t("desktop.voiceMini.poor")
        : connected
          ? t("desktop.voiceMini.connected")
          : t("desktop.voiceMini.connecting");
  const title =
    visibleParticipants.find((participant) => participant.isSpeaking)?.displayName ?? "Voice Mini";
  const sendCommand = (command: Parameters<typeof postDesktopVoiceMiniCommand>[0]) => {
    setCommandFailed(!postDesktopVoiceMiniCommand(command));
  };

  return (
    <main className="h-dvh w-dvw overflow-hidden bg-transparent p-1.5">
      <section
        aria-label={t("desktop.voiceMini.aria")}
        className="flex h-full w-full flex-col justify-between rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-card))] px-3 py-2.5 text-[hsl(var(--text-primary))] shadow-sm"
      >
        <header
          className="flex min-w-0 cursor-grab items-center gap-2 active:cursor-grabbing"
          data-tauri-drag-region
        >
          <GripVertical
            aria-hidden="true"
            className="pointer-events-none size-3.5 shrink-0 text-[hsl(var(--text-muted))]"
          />
          <p
            className="pointer-events-none min-w-0 flex-1 truncate text-xs font-semibold"
            title={title}
          >
            {title}
          </p>
          <span
            role={commandFailed ? "alert" : undefined}
            className={cn(
              "pointer-events-none flex shrink-0 items-center gap-1 text-[10px] font-medium",
              commandFailed
                ? "text-[var(--danger-readable)]"
                : connected
                  ? "text-[var(--success-readable)]"
                  : "text-[hsl(var(--text-muted))]",
            )}
          >
            <Signal aria-hidden="true" className="size-3" />
            {commandFailed ? t("desktop.voiceMini.commandFailed") : connectionLabel}
          </span>
        </header>
        <div className="flex items-center justify-between gap-2">
          <div
            className="flex min-w-0 items-center gap-1.5"
            role="group"
            aria-label={t("desktop.voiceMini.participants", { count: participants.length })}
          >
            {visibleParticipants.map((participant) => (
              <MiniAvatar key={participant.userId} participant={participant} />
            ))}
            {remaining > 0 && (
              <span className="text-[10px] font-semibold text-[hsl(var(--text-muted))]">
                +{remaining}
              </span>
            )}
            {participants.length === 0 && (
              <Headphones aria-hidden="true" className="size-7 text-[hsl(var(--text-muted))]" />
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <VoiceMiniAction
              active={Boolean(localParticipant?.isMuted)}
              label={t("desktop.voiceMini.toggleMute")}
              disabled={!localParticipant}
              onClick={() => sendCommand("toggleMute")}
            >
              {localParticipant?.isMuted ? (
                <MicOff aria-hidden="true" className="size-4" />
              ) : (
                <Mic aria-hidden="true" className="size-4" />
              )}
            </VoiceMiniAction>
            <VoiceMiniAction
              active={Boolean(localParticipant?.isDeafened)}
              label={t("desktop.voiceMini.toggleDeafen")}
              disabled={!localParticipant}
              onClick={() => sendCommand("toggleDeafen")}
            >
              {localParticipant?.isDeafened ? (
                <HeadphoneOff aria-hidden="true" className="size-4" />
              ) : (
                <Headphones aria-hidden="true" className="size-4" />
              )}
            </VoiceMiniAction>
            <VoiceMiniAction
              label={t("desktop.voiceMini.leaveVoice")}
              disabled={!snapshot?.active}
              onClick={() => sendCommand("leaveVoice")}
              danger
            >
              <PhoneOff aria-hidden="true" className="size-4" />
            </VoiceMiniAction>
          </div>
        </div>
      </section>
    </main>
  );
}

export function DesktopVoiceMini() {
  const [snapshot, setSnapshot] = useState<VoiceMiniSnapshot | null>(null);
  useEffect(() => subscribeVoiceMiniSnapshots(window, setSnapshot), []);
  return <DesktopVoiceMiniView snapshot={snapshot} />;
}
