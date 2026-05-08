"use client";

import { useEffect, useRef } from "react";
import { ConnectionState, LocalVideoTrack, type RemoteVideoTrack } from "livekit-client";
import { Loader2, Maximize2, MonitorUp, PhoneOff } from "lucide-react";
import type { ActiveDMScreenShare, IncomingDMScreenShare } from "@/hooks/use-dm-screen-share";
import { Avatar } from "@/components/ui/avatar";
import { Modal } from "@/components/ui/modal";
import { useI18n } from "@/components/providers/locale-provider";
import { cn } from "@/lib/utils";

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
      className="h-full w-full rounded-[28px] bg-black object-contain"
      muted={track instanceof LocalVideoTrack}
      playsInline
      ref={videoRef}
    />
  );
}

export function IncomingDMScreenShareModal({
  incomingShare,
  onAccept,
  onDecline,
}: {
  incomingShare: IncomingDMScreenShare | null;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const { t } = useI18n();
  const displayName = incomingShare?.displayName ?? incomingShare?.username ?? "";

  return (
    <Modal
      {...(incomingShare
        ? {
            description: t("dm.screenShare.incomingDescription", {
              name: displayName,
              seconds: incomingShare.countdown,
            }),
          }
        : {})}
      onClose={onDecline}
      open={Boolean(incomingShare)}
      title={t("dm.screenShare.incomingTitle")}
    >
      {incomingShare ? (
        <div className="space-y-5">
          <div className="app-panel-soft flex items-center gap-3 rounded-[22px] border p-4">
            <Avatar
              alt={displayName}
              className="h-12 w-12 border-none text-sm"
              fallback={displayName}
              src={null}
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-app-foreground">{displayName}</p>
              <p className="text-xs text-app-muted">
                {t("dm.screenShare.autoDecline", {
                  seconds: incomingShare.countdown,
                })}
              </p>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button
              className="rounded-2xl border border-[hsl(var(--danger)/0.28)] bg-[hsl(var(--danger)/0.1)] px-4 py-2 text-sm font-semibold text-[hsl(var(--danger))] transition hover:bg-[hsl(var(--danger)/0.14)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
              onClick={onDecline}
              type="button"
            >
              {t("dm.screenShare.decline")}
            </button>
            <button
              className="rounded-2xl border border-[hsl(var(--success)/0.32)] bg-[hsl(var(--success)/0.14)] px-4 py-2 text-sm font-semibold text-[hsl(var(--success))] transition hover:bg-[hsl(var(--success)/0.18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)]"
              onClick={onAccept}
              type="button"
            >
              {t("dm.screenShare.accept")}
            </button>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}

export function DMScreenSharePanel({
  activeShare,
  connectionState,
  onStopSharing,
  onStopViewing,
}: {
  activeShare: ActiveDMScreenShare;
  connectionState: ConnectionState;
  onStopSharing: () => void;
  onStopViewing: () => void;
}) {
  const { t } = useI18n();
  const stageRef = useRef<HTMLDivElement | null>(null);
  const displayName = activeShare.displayName ?? activeShare.username;
  const isReconnecting =
    connectionState === ConnectionState.Reconnecting ||
    connectionState === ConnectionState.SignalReconnecting;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-transparent p-3 sm:p-5">
      <div className="app-panel relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-[26px] border p-3 sm:rounded-[32px] sm:p-4">
        {isReconnecting ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-[hsl(var(--background)/0.72)] backdrop-blur-sm">
            <div className="app-panel rounded-[24px] border px-5 py-4 text-center">
              <Loader2 className="mx-auto h-6 w-6 animate-spin text-app-muted" />
              <p className="mt-3 text-sm font-semibold text-app-foreground">
                {t("screenShare.reconnecting")}
              </p>
            </div>
          </div>
        ) : null}

        <div className="mb-3 flex flex-col gap-3 sm:mb-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-app-soft">
              {t("dm.screenShare.title")}
            </p>
            <p className="mt-1 truncate text-lg font-semibold text-app-foreground">
              {activeShare.isLocal
                ? t("dm.screenShare.sharingWith")
                : t("dm.screenShare.viewing", { name: displayName })}
            </p>
          </div>
          <button
            className={cn(
              "inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-2xl border px-4 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.55)] sm:w-auto",
              activeShare.isLocal
                ? "border-[hsl(var(--danger)/0.28)] bg-[hsl(var(--danger)/0.12)] text-[hsl(var(--danger))] hover:bg-[hsl(var(--danger)/0.16)]"
                : "border-[hsl(var(--border)/0.72)] bg-[hsl(var(--surface-soft)/0.56)] text-app-foreground hover:bg-[hsl(var(--surface-soft)/0.82)]",
            )}
            onClick={activeShare.isLocal ? onStopSharing : onStopViewing}
            type="button"
          >
            {activeShare.isLocal ? (
              <>
                <PhoneOff className="h-4 w-4" />
                {t("dm.screenShare.stopSharing")}
              </>
            ) : (
              <>
                <MonitorUp className="h-4 w-4" />
                {t("dm.screenShare.stopViewing")}
              </>
            )}
          </button>
        </div>

        <div
          className="group relative flex min-h-[16rem] flex-1 items-center justify-center overflow-hidden rounded-[22px] border border-[hsl(var(--border)/0.72)] bg-[hsl(var(--surface-soft)/0.44)] sm:min-h-[24rem] sm:rounded-[28px]"
          onDoubleClick={() => {
            void toggleElementFullscreen(stageRef.current);
          }}
          ref={stageRef}
          title={t("screenShare.fullscreenHint")}
        >
          {activeShare.track ? (
            <ScreenShareVideo track={activeShare.track} />
          ) : (
            <div className="text-center">
              <MonitorUp className="mx-auto h-9 w-9 text-app-muted" />
              <p className="mt-3 text-sm font-semibold text-app-foreground">
                {t("dm.screenShare.waitingForTrack")}
              </p>
            </div>
          )}
          <div className="pointer-events-none absolute bottom-4 right-4 inline-flex items-center gap-2 rounded-full border border-white/20 bg-black/46 px-3 py-1.5 text-xs font-semibold text-white opacity-0 shadow-[0_14px_36px_rgba(0,0,0,0.22)] backdrop-blur-xl transition group-hover:opacity-100">
            <Maximize2 className="h-3.5 w-3.5" />
            {t("screenShare.fullscreenHint")}
          </div>
        </div>
      </div>
    </div>
  );
}
