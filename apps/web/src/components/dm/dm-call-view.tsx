"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Loader2, PhoneOff, ShieldCheck } from "lucide-react";

import { useI18n } from "@/components/providers/locale-provider";
import { useVoiceParticipants, useVoiceState } from "@/components/providers/voice-provider";
import {
  ScreenShareStage,
  VoiceControlBar,
  VoiceParticipantTile,
  getParticipantGridClass,
  getParticipantGridStyle,
  renderGridParticipants,
  type VoiceStageFocus,
} from "@/components/voice/room/voice-room-primitives";
import { useDMCallStore } from "@/store/dm-call-store";
import type { DMCallSession } from "@/lib/dm/call-state";

/**
 * The DM call surface. It reuses the voice-room presentation so a call looks like the rest
 * of the app, and it takes over the conversation area rather than the whole window so the
 * sidebar stays reachable.
 */
export function DmCallView({
  onLeave,
  session,
}: {
  onLeave: () => void | Promise<void>;
  session: DMCallSession;
}) {
  const { t } = useI18n();
  const {
    cameraStatus,
    isApplyingScreenShareQuality,
    isCameraEnabled,
    isDeafened,
    isMuted,
    isScreenSharing,
    getParticipantVolume,
    resetParticipantVolume,
    room,
    screenShareQuality,
    setActiveScreenShareId,
    setParticipantVolume,
    setScreenShareQuality,
    stopScreenShare,
    activeScreenShareId,
    toggleCamera,
    toggleDeafen,
    toggleMute,
    toggleScreenShare,
  } = useVoiceState();
  const { participants, screenShares } = useVoiceParticipants();
  const [stageFocus, setStageFocus] = useState<VoiceStageFocus>("screen");
  const [activeCameraParticipantId, setActiveCameraParticipantId] = useState<string | null>(null);
  const setMinimized = useDMCallStore((state) => state.setMinimized);

  const orderedParticipants = useMemo(
    () => renderGridParticipants(room, participants),
    [participants, room],
  );
  const cameraParticipants = useMemo(
    () =>
      orderedParticipants.filter(
        (participant) => participant.isCameraEnabled && participant.cameraTrack,
      ),
    [orderedParticipants],
  );
  const activeCameraParticipant =
    cameraParticipants.find((participant) => participant.userId === activeCameraParticipantId) ??
    cameraParticipants.find((participant) => participant.isLocal) ??
    cameraParticipants[0] ??
    null;
  const activeShare =
    screenShares.find((share) => share.id === activeScreenShareId) ?? screenShares[0] ?? null;
  const screenShareParticipantIds = useMemo(
    () => new Set(screenShares.map((share) => share.participantId)),
    [screenShares],
  );
  const hasStage = Boolean(activeShare || activeCameraParticipant);

  const peerName = session.peer?.displayName ?? session.peer?.username ?? "";
  const statusLabel =
    session.status === "ringing-out"
      ? t("dm.call.ringingOut")
      : session.status === "connecting"
        ? t("dm.call.connecting")
        : session.isVideo
          ? t("dm.call.videoWith", { name: peerName })
          : t("dm.call.voiceWith", { name: peerName });

  return (
    <section
      aria-label={t("dm.call.title")}
      className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-hidden px-3 pb-2 pt-1 md:px-4"
      data-testid="dm-call-view"
    >
      <header className="flex shrink-0 items-center gap-3">
        <button
          aria-label={t("dm.call.minimize")}
          className="inline-flex h-9 w-9 items-center justify-center rounded-2xl text-app-muted transition hover:bg-[hsl(var(--surface-soft)/0.58)] hover:text-app-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
          data-testid="dm-call-minimize"
          onClick={() => setMinimized(true)}
          title={t("dm.call.minimize")}
          type="button"
        >
          <ChevronDown className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 truncate text-sm font-semibold text-app-foreground">
            {session.status === "connecting" || session.status === "ringing-out" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : null}
            {statusLabel}
          </p>
          <p className="flex items-center gap-1.5 text-xs text-app-muted">
            <ShieldCheck className="h-3.5 w-3.5" />
            {t("dm.call.encrypted")}
          </p>
        </div>
        {session.status === "ringing-out" ? (
          <button
            className="inline-flex items-center gap-2 rounded-2xl border border-[hsl(var(--danger)/0.28)] bg-[hsl(var(--danger)/0.1)] px-3 py-2 text-xs font-semibold text-[hsl(var(--danger))] transition hover:bg-[hsl(var(--danger)/0.14)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
            data-testid="dm-call-cancel"
            onClick={() => void onLeave()}
            type="button"
          >
            <PhoneOff className="h-4 w-4" />
            {t("dm.call.cancel")}
          </button>
        ) : null}
      </header>

      <div className="min-h-0 flex-1 overflow-hidden">
        {hasStage ? (
          <ScreenShareStage
            activeCameraParticipant={activeCameraParticipant}
            activeShare={activeShare}
            cameraParticipants={cameraParticipants}
            isApplyingQuality={isApplyingScreenShareQuality}
            onSelectCameraParticipant={setActiveCameraParticipantId}
            onSelectQuality={(qualityId) => {
              void setScreenShareQuality(qualityId);
            }}
            onSelectShare={setActiveScreenShareId}
            onSelectStageFocus={setStageFocus}
            onStopShare={() => {
              void stopScreenShare();
            }}
            screenShares={screenShares}
            selectedQuality={screenShareQuality}
            stageFocus={stageFocus}
          />
        ) : (
          <div
            className={getParticipantGridClass()}
            data-testid="dm-call-participants"
            style={getParticipantGridStyle(orderedParticipants.length)}
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
        )}
      </div>

      <VoiceControlBar
        cameraStatus={cameraStatus}
        isCameraEnabled={isCameraEnabled}
        isDeafened={isDeafened}
        isMuted={isMuted}
        isScreenSharing={isScreenSharing}
        leaveChannel={async () => {
          await onLeave();
        }}
        toggleCamera={toggleCamera}
        toggleDeafen={toggleDeafen}
        toggleMute={toggleMute}
        toggleScreenShare={toggleScreenShare}
      />
    </section>
  );
}
