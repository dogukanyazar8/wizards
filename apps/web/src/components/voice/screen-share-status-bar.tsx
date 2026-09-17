"use client";
import React from "react";
import { usePathname } from "next/navigation";
import { useVoiceState, useVoiceParticipants } from "@/components/providers/voice-context";
import { useI18n } from "@/components/providers/locale-provider";
import { useVoiceStore } from "@/store/voice-store";
import { useScreenShareWatcherUpdates } from "@/hooks/use-screen-share-watch";

export function ScreenShareStatusBar() {
  const voice = useVoiceState();
  const { screenShares } = useVoiceParticipants();
  const pathname = usePathname();
  const { t } = useI18n();
  const local = screenShares.find((share) => share.isLocal);
  const count = useVoiceStore((state) =>
    local ? (state.screenShareViewerCounts[local.participantId] ?? 0) : 0,
  );
  const goLive = useVoiceStore((state) => state.goLive);
  useScreenShareWatcherUpdates();
  const inVoice =
    voice.activeChannelId && pathname === `/channels/${voice.serverId}/${voice.activeChannelId}`;
  const inDirect = voice.activeConversationId && pathname.includes(voice.activeConversationId);
  if (!voice.isScreenSharing || inVoice || inDirect) return null;
  return (
    <div
      role="status"
      data-testid="screen-share-status-bar"
      className="fixed inset-x-0 top-0 z-50 flex flex-wrap items-center justify-center gap-3 bg-[hsl(var(--primary))] px-4 py-2 text-white"
    >
      <span>
        {voice.connectionState === "reconnecting"
          ? t("screenShare.reconnecting")
          : goLive
            ? t("voice.screenShare.bar.goLive", { game: goLive.label })
            : t("voice.screenShare.bar.sharing")}
      </span>
      <span>{t("voice.screenShare.viewers.count", { count })}</span>
      <button
        type="button"
        disabled={voice.screenShareStatus !== "idle"}
        onClick={() => void voice.switchScreenShareSource()}
      >
        {t("voice.screenShare.bar.switch")}
      </button>
      <button type="button" onClick={() => void voice.stopScreenShare()}>
        {t("voice.screenShare.bar.stop")}
      </button>
    </div>
  );
}
