"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowUpRight,
  Loader2,
  MicOff,
  MonitorUp,
  PhoneOff,
  Video,
  Volume2,
  VolumeX,
} from "lucide-react";
import type { WorkspaceServerDetail } from "@wizards/types";
import { usePathname, useRouter } from "next/navigation";
import { useI18n } from "@/components/providers/locale-provider";
import { useVoiceParticipants, useVoiceState } from "@/components/providers/voice-provider";
import { cn } from "@/lib/utils";
import { fetchWorkspaceServer, workspaceQueryKeys } from "@/lib/workspace/client";

type RouteContext =
  | {
      kind: "channels";
      channelId: string | null;
      serverId: string | null;
    }
  | {
      kind: "settings";
    }
  | {
      kind: "other";
    };

function safeDecodePathSegment(segment: string | undefined) {
  if (!segment) {
    return null;
  }

  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function getRouteContext(pathname: string): RouteContext {
  if (pathname === "/settings" || pathname.startsWith("/settings/")) {
    return { kind: "settings" };
  }

  const [, root, rawServerId, rawChannelId] = pathname.split("/");
  if (root !== "channels") {
    return { kind: "other" };
  }

  return {
    kind: "channels",
    channelId: safeDecodePathSegment(rawChannelId),
    serverId: safeDecodePathSegment(rawServerId),
  };
}

function findVoiceChannel(detail: WorkspaceServerDetail | null | undefined, channelId: string) {
  if (!detail) {
    return null;
  }

  return (
    [
      ...detail.ungroupedChannels,
      ...detail.categories.flatMap((category) => category.channels),
    ].find((channel) => channel.id === channelId) ?? null
  );
}

function shouldShowVoiceReminder(
  route: RouteContext,
  voiceRoute: { channelId: string | null; serverId: string | null },
) {
  if (!voiceRoute.channelId || !voiceRoute.serverId) {
    return false;
  }

  if (route.kind === "settings") {
    return true;
  }

  if (route.kind !== "channels") {
    return false;
  }

  const isActiveVoiceRoute =
    route.serverId === voiceRoute.serverId && route.channelId === voiceRoute.channelId;
  if (isActiveVoiceRoute) {
    return false;
  }

  return route.serverId === "@me" || route.serverId !== voiceRoute.serverId;
}

export function ActiveVoiceReminder() {
  const { t } = useI18n();
  const pathname = usePathname();
  const router = useRouter();
  const {
    activeChannelId,
    isCameraEnabled,
    isDeafened,
    isMuted,
    isScreenSharing,
    leaveChannel,
    serverId,
  } = useVoiceState();
  const { participants } = useVoiceParticipants();
  const [isLeaving, setIsLeaving] = useState(false);
  const route = useMemo(() => getRouteContext(pathname ?? ""), [pathname]);
  const shouldShow = shouldShowVoiceReminder(route, {
    channelId: activeChannelId,
    serverId,
  });
  const voiceServerQueryKey = serverId
    ? workspaceQueryKeys.server(serverId)
    : (["workspace", "server", "voice-reminder-idle"] as const);
  const serverDetailQuery = useQuery({
    enabled: Boolean(shouldShow && serverId),
    queryFn: () => fetchWorkspaceServer(serverId!),
    queryKey: voiceServerQueryKey,
    refetchOnWindowFocus: false,
    staleTime: 30_000,
  });

  if (!shouldShow || !serverId || !activeChannelId) {
    return null;
  }

  const channel = findVoiceChannel(serverDetailQuery.data, activeChannelId);
  const channelName = channel?.name ?? null;
  const serverName = serverDetailQuery.data?.server.name ?? t("voice.bar.unknownServer");
  const participantCount = Math.max(1, participants.length);
  const returnHref = `/channels/${encodeURIComponent(serverId)}/${encodeURIComponent(activeChannelId)}`;
  const description = channelName
    ? t("voice.reminder.description", { channel: channelName, server: serverName })
    : t("voice.reminder.descriptionFallback", { server: serverName });

  const handleLeave = async () => {
    setIsLeaving(true);
    try {
      await leaveChannel();
    } finally {
      setIsLeaving(false);
    }
  };

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-2 bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] z-[60] flex justify-center sm:inset-x-4 sm:bottom-5"
      data-testid="active-voice-reminder"
    >
      <div className="pointer-events-auto flex max-h-[calc(100dvh-2rem)] w-full max-w-3xl flex-col gap-3 overflow-y-auto rounded-[24px] border border-[hsl(var(--border)/0.72)] bg-[linear-gradient(135deg,hsl(var(--surface-card)/0.98),hsl(var(--surface-soft)/0.9))] p-2.5 shadow-[0_24px_80px_hsl(var(--shadow-color)/0.24)] backdrop-blur-2xl sm:flex-row sm:items-center sm:rounded-[28px] sm:p-3.5">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-[hsl(var(--success)/0.28)] bg-[hsl(var(--success)/0.12)] text-[hsl(var(--success))] shadow-[0_14px_32px_hsl(var(--success)/0.12)] sm:h-12 sm:w-12">
            <Volume2 className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <p className="truncate text-sm font-extrabold text-app-foreground sm:text-base">
                {channelName
                  ? t("voice.bar.connectedChannel", { name: channelName })
                  : t("voice.bar.connected")}
              </p>
              <span className="rounded-full border border-[hsl(var(--success)/0.24)] bg-[hsl(var(--success)/0.1)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[hsl(var(--success))]">
                {t("voice.room.connected")}
              </span>
            </div>
            <p className="mt-1 line-clamp-2 text-xs font-medium leading-5 text-app-muted sm:truncate">
              {description}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[hsl(var(--border)/0.62)] bg-[hsl(var(--surface-card)/0.64)] px-2 py-1 text-[11px] font-semibold text-app-muted">
                <Volume2 className="h-3.5 w-3.5" />
                {t("voice.bar.participants", { count: participantCount })}
              </span>
              {isMuted ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[hsl(var(--danger)/0.22)] bg-[hsl(var(--danger)/0.08)] px-2 py-1 text-[11px] font-semibold text-[hsl(var(--danger))]">
                  <MicOff className="h-3.5 w-3.5" />
                  {t("voice.reminder.muted")}
                </span>
              ) : null}
              {isDeafened ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[hsl(var(--danger)/0.22)] bg-[hsl(var(--danger)/0.08)] px-2 py-1 text-[11px] font-semibold text-[hsl(var(--danger))]">
                  <VolumeX className="h-3.5 w-3.5" />
                  {t("voice.reminder.deafened")}
                </span>
              ) : null}
              {isScreenSharing ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[hsl(var(--primary)/0.24)] bg-[hsl(var(--primary)/0.1)] px-2 py-1 text-[11px] font-semibold text-[hsl(var(--primary))]">
                  <MonitorUp className="h-3.5 w-3.5" />
                  {t("voice.reminder.screenSharing")}
                </span>
              ) : null}
              {isCameraEnabled ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[hsl(var(--success)/0.24)] bg-[hsl(var(--success)/0.1)] px-2 py-1 text-[11px] font-semibold text-[hsl(var(--success))]">
                  <Video className="h-3.5 w-3.5" />
                  {t("voice.reminder.cameraOn")}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        <div className="grid w-full shrink-0 grid-cols-2 gap-2 sm:ml-auto sm:flex sm:w-auto">
          <button
            className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-2xl border border-[hsl(var(--primary)/0.3)] bg-[hsl(var(--primary)/0.12)] px-3 text-sm font-bold text-[hsl(var(--primary))] transition hover:bg-[hsl(var(--primary)/0.16)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)] sm:flex-none"
            data-testid="active-voice-reminder-return"
            onClick={() => router.push(returnHref)}
            type="button"
          >
            <ArrowUpRight className="h-4 w-4" />
            <span className="truncate">{t("voice.reminder.return")}</span>
          </button>
          <button
            className={cn(
              "inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-2xl border border-[hsl(var(--danger)/0.28)] bg-[hsl(var(--danger)/0.1)] px-3 text-sm font-bold text-[hsl(var(--danger))] transition hover:bg-[hsl(var(--danger)/0.14)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)] disabled:cursor-wait disabled:opacity-65 sm:flex-none",
              isLeaving && "cursor-wait",
            )}
            data-testid="active-voice-reminder-leave"
            disabled={isLeaving}
            onClick={() => {
              void handleLeave();
            }}
            type="button"
          >
            {isLeaving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <PhoneOff className="h-4 w-4" />
            )}
            <span className="truncate">{t("voice.reminder.leave")}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
