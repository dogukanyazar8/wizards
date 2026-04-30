"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  MonitorUp,
  Mic,
  MicOff,
  PhoneOff,
  SlidersHorizontal,
  Video,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";
import type { WorkspaceServerDetail, WorkspaceServerSummary } from "@wizards/types";
import { useI18n } from "@/components/providers/locale-provider";
import { useVoiceConnection } from "@/components/providers/voice-provider";
import { Modal } from "@/components/ui/modal";
import { VoiceSettingsModal } from "@/components/voice/voice-settings-modal";
import { workspaceQueryKeys } from "@/lib/workspace/client";
import { cn } from "@/lib/utils";

function resolveVoiceLocation(
  queryClient: ReturnType<typeof useQueryClient>,
  serverId: string | null,
  channelId: string | null,
) {
  if (!serverId || !channelId) {
    return {
      channelName: null,
      serverName: null,
    };
  }

  const detail = queryClient.getQueryData<WorkspaceServerDetail>(
    workspaceQueryKeys.server(serverId),
  );
  const serverName =
    detail?.server.name ??
    queryClient
      .getQueryData<WorkspaceServerSummary[]>(workspaceQueryKeys.servers)
      ?.find((server) => server.id === serverId)?.name ??
    null;

  const channel =
    [
      ...(detail?.ungroupedChannels ?? []),
      ...(detail?.categories.flatMap((category) => category.channels) ?? []),
    ].find((entry) => entry.id === channelId) ?? null;

  return {
    channelName: channel?.name ?? null,
    serverName,
  };
}

function resolveDisconnectHref(
  queryClient: ReturnType<typeof useQueryClient>,
  serverId: string | null,
) {
  if (!serverId) {
    return "/channels";
  }

  const detail = queryClient.getQueryData<WorkspaceServerDetail>(
    workspaceQueryKeys.server(serverId),
  );

  const textChannel =
    [
      ...(detail?.ungroupedChannels ?? []),
      ...(detail?.categories.flatMap((category) => category.channels) ?? []),
    ].find((channel) => channel.type === "TEXT") ?? null;

  if (textChannel) {
    return `/channels/${serverId}/${textChannel.id}`;
  }

  return `/channels/${serverId}`;
}

type VoiceControlButtonProps = {
  active?: boolean;
  ariaLabel: string;
  destructive?: boolean;
  disabled?: boolean;
  icon: ReactNode;
  onClick?: () => void;
  title?: string;
};

function VoiceControlButton({
  active = false,
  ariaLabel,
  destructive = false,
  disabled = false,
  icon,
  onClick,
  title,
}: VoiceControlButtonProps) {
  return (
    <button
      aria-label={ariaLabel}
      className={cn(
        "flex h-11 w-11 items-center justify-center rounded-2xl border text-app-muted transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)] sm:h-auto sm:w-auto sm:p-2.5",
        destructive
          ? "border-[hsl(var(--danger)/0.32)] bg-[hsl(var(--danger)/0.12)] text-[hsl(var(--danger))] hover:bg-[hsl(var(--danger)/0.18)] hover:text-[hsl(var(--danger))] focus-visible:ring-[hsl(var(--danger)/0.45)]"
          : active
          ? "border-[hsl(var(--primary)/0.4)] bg-[hsl(var(--primary)/0.14)] text-app-foreground"
          : "app-panel-soft hover:opacity-90",
        disabled && "cursor-not-allowed opacity-55",
      )}
      disabled={disabled}
      onClick={onClick}
      title={title}
      type="button"
    >
      {icon}
    </button>
  );
}

export function VoiceConnectionBar() {
  const { t } = useI18n();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const router = useRouter();
  const {
    activeChannelId,
    isDeafened,
    isMuted,
    isScreenSharing,
    leaveChannel,
    participants,
    serverId,
    toggleDeafen,
    toggleMute,
    toggleScreenShare,
  } = useVoiceConnection();
  const [showCameraModal, setShowCameraModal] = useState(false);
  const [showVoiceSettingsModal, setShowVoiceSettingsModal] = useState(false);

  const location = useMemo(
    () => resolveVoiceLocation(queryClient, serverId, activeChannelId),
    [activeChannelId, queryClient, serverId],
  );
  const disconnectHref = useMemo(
    () => resolveDisconnectHref(queryClient, serverId),
    [queryClient, serverId],
  );

  if (!activeChannelId) {
    return null;
  }

  return (
    <>
      <div
        className="app-panel mb-3 rounded-[22px] border p-3 sm:rounded-[24px]"
        data-notification-popup-anchor="voice"
      >
        <div className="mb-3">
          <p className="truncate text-sm font-semibold text-app-foreground">
            {location.channelName
              ? t("voice.bar.connectedChannel", { name: location.channelName })
              : t("voice.bar.connected")}
          </p>
          <p className="truncate text-xs text-app-muted">
            {location.serverName ?? t("voice.bar.unknownServer")} •{" "}
            {t("voice.bar.participants", { count: participants.length })}
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2 min-[380px]:grid-cols-6">
          <VoiceControlButton
            active={isMuted}
            ariaLabel={isMuted ? t("voice.controls.unmute") : t("voice.controls.mute")}
            icon={isMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            onClick={() => {
              void toggleMute();
            }}
            title={isMuted ? t("voice.controls.unmute") : t("voice.controls.mute")}
          />
          <VoiceControlButton
            active={isDeafened}
            ariaLabel={isDeafened ? t("voice.controls.undeafen") : t("voice.controls.deafen")}
            icon={
              isDeafened ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />
            }
            onClick={() => {
              void toggleDeafen();
            }}
            title={isDeafened ? t("voice.controls.undeafen") : t("voice.controls.deafen")}
          />
          <VoiceControlButton
            active={isScreenSharing}
            ariaLabel={
              isScreenSharing
                ? t("voice.screenShare.stop")
                : t("voice.screenShare.share")
            }
            icon={<MonitorUp className="h-4 w-4" />}
            onClick={() => {
              void toggleScreenShare();
            }}
            title={
              isScreenSharing
                ? t("voice.screenShare.stop")
                : t("voice.screenShare.share")
            }
          />
          <VoiceControlButton
            ariaLabel={t("voice.controls.settings")}
            icon={<SlidersHorizontal className="h-4 w-4" />}
            onClick={() => setShowVoiceSettingsModal(true)}
            title={t("voice.controls.settings")}
          />
          <VoiceControlButton
            ariaLabel={t("voice.controls.camera")}
            icon={<Video className="h-4 w-4" />}
            onClick={() => setShowCameraModal(true)}
            title={t("voice.controls.cameraSoon")}
          />
          <VoiceControlButton
            ariaLabel={t("voice.controls.disconnect")}
            destructive
            icon={<PhoneOff className="h-4 w-4" />}
            onClick={() => {
              void leaveChannel().then(() => {
                if (
                  serverId &&
                  activeChannelId &&
                  pathname === `/channels/${serverId}/${activeChannelId}`
                ) {
                  router.push(disconnectHref);
                }
              });
            }}
            title={t("voice.controls.disconnect")}
          />
        </div>
      </div>

      <Modal
        description={t("voice.controls.cameraSoon")}
        onClose={() => setShowCameraModal(false)}
        open={showCameraModal}
        title={t("voice.controls.camera")}
      >
        <p className="text-sm text-app-muted">{t("voice.controls.cameraPhase8")}</p>
      </Modal>

      <VoiceSettingsModal
        onClose={() => setShowVoiceSettingsModal(false)}
        open={showVoiceSettingsModal}
      />
    </>
  );
}
