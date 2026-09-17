"use client";
import { useEffect } from "react";
import { getSocket } from "@/lib/socket/client";
import { useVoiceStore } from "@/store/voice-store";
import { ScreenShareWatchersUpdateSchema } from "@wizards/types";

export function useScreenShareWatch({
  channelId,
  serverId,
  sharerUserId,
  visible,
}: {
  channelId: string | null;
  serverId: string | null;
  sharerUserId: string | null;
  visible: boolean;
}) {
  useEffect(() => {
    if (!channelId || !serverId || !sharerUserId || !visible) return;
    const socket = getSocket();
    return startScreenShareWatchHeartbeat(socket, { channelId, serverId, sharerUserId });
  }, [channelId, serverId, sharerUserId, visible]);
}

/** One listener in the authenticated voice shell also serves the sidebar and overlay. */
export function useScreenShareWatcherUpdates() {
  useEffect(() => {
    const socket = getSocket();
    const update = (raw: unknown) => {
      const result = ScreenShareWatchersUpdateSchema.safeParse(raw);
      if (result.success)
        useVoiceStore
          .getState()
          .setScreenShareViewerCount(result.data.sharerUserId, result.data.count);
    };
    const snapshot: Parameters<typeof socket.on<"voice:state:update">>[1] = (data) => {
      for (const participant of data.participants)
        if (participant.screenShareViewerCount !== undefined)
          useVoiceStore
            .getState()
            .setScreenShareViewerCount(participant.userId, participant.screenShareViewerCount);
    };
    socket.on("voice:state:update", snapshot);
    socket.on("voice:screenshare:watchers:update", update);
    return () => {
      socket.off("voice:screenshare:watchers:update", update);
      socket.off("voice:state:update", snapshot);
    };
  }, []);
}

export function startScreenShareWatchHeartbeat(
  socket: Pick<ReturnType<typeof getSocket>, "connected" | "emit" | "on" | "off">,
  target: { channelId: string; serverId: string; sharerUserId: string },
) {
  const send = (watching: boolean) => {
    if (socket.connected) socket.emit("voice:screenshare:watch", { ...target, watching });
  };
  const refresh = () => send(true);
  refresh();
  socket.on("connect", refresh);
  const interval = setInterval(refresh, 60_000);
  return () => {
    clearInterval(interval);
    socket.off("connect", refresh);
    send(false);
  };
}
