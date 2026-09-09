"use client";

import { useEffect, useRef } from "react";
import type { Socket } from "socket.io-client";
import type { ClientToServerEvents, ServerToClientEvents } from "@/lib/socket/events";
import { usePresenceIdleTimeoutPreference } from "@/hooks/use-presence-idle-timeout-preference";

export type PresenceStatus = "ONLINE" | "IDLE" | "DND" | "OFFLINE";

/**
 * Ş12 / K9 — tercihin kendisi `use-presence-idle-timeout-preference.ts` dosyasına taşındı ve
 * `UserSettings.idleTimeoutMinutes` kolonundan okunur oldu. Buradan yeniden dışa verilmesinin
 * tek nedeni mevcut çağrı yerlerinin (Gizlilik sekmesi) tek bir içe aktarma yolunu sürdürmesi.
 */
export {
  DEFAULT_PRESENCE_IDLE_TIMEOUT_MINUTES,
  PRESENCE_IDLE_TIMEOUT_OPTIONS,
  usePresenceIdleTimeoutPreference,
} from "@/hooks/use-presence-idle-timeout-preference";

const ACTIVITY_THROTTLE_MS = 1_000;

type PresenceSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

function canAutoManagePresence(status: PresenceStatus) {
  return status === "ONLINE" || status === "IDLE";
}

export function usePresenceActivity({
  socket,
  status,
}: {
  socket: PresenceSocket;
  status: PresenceStatus;
}) {
  const { idleTimeoutMinutes } = usePresenceIdleTimeoutPreference();
  const wakeAttemptedRef = useRef(false);

  useEffect(() => {
    if (status !== "IDLE") {
      wakeAttemptedRef.current = false;
    }
  }, [status]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    if (!canAutoManagePresence(status)) {
      return undefined;
    }

    let idleTimer: number | null = null;
    let activityThrottle: number | null = null;

    const clearIdleTimer = () => {
      if (idleTimer) {
        window.clearTimeout(idleTimer);
        idleTimer = null;
      }
    };

    const emitPresenceActivity = (nextStatus: "ONLINE" | "IDLE") => {
      if (!socket.connected) {
        return;
      }

      socket.emit("presence:activity", { status: nextStatus });
    };

    const scheduleIdleTimer = () => {
      clearIdleTimer();
      idleTimer = window.setTimeout(() => {
        emitPresenceActivity("IDLE");
      }, idleTimeoutMinutes * 60_000);
    };

    const markActive = () => {
      if (document.visibilityState === "hidden") {
        return;
      }

      if (status === "IDLE" && !wakeAttemptedRef.current) {
        wakeAttemptedRef.current = true;
        emitPresenceActivity("ONLINE");
      }

      scheduleIdleTimer();
    };

    const markActiveThrottled = () => {
      if (activityThrottle) {
        return;
      }

      markActive();
      activityThrottle = window.setTimeout(() => {
        activityThrottle = null;
      }, ACTIVITY_THROTTLE_MS);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        markActive();
      }
    };

    const handleConnect = () => {
      if (document.visibilityState === "visible" && status === "IDLE") {
        emitPresenceActivity("ONLINE");
      }

      scheduleIdleTimer();
    };

    scheduleIdleTimer();
    socket.on("connect", handleConnect);
    window.addEventListener("focus", markActive);
    window.addEventListener("keydown", markActive);
    window.addEventListener("pointerdown", markActive);
    window.addEventListener("pointermove", markActiveThrottled);
    window.addEventListener("touchstart", markActive);
    window.addEventListener("wheel", markActiveThrottled);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      clearIdleTimer();
      if (activityThrottle) {
        window.clearTimeout(activityThrottle);
      }

      socket.off("connect", handleConnect);
      window.removeEventListener("focus", markActive);
      window.removeEventListener("keydown", markActive);
      window.removeEventListener("pointerdown", markActive);
      window.removeEventListener("pointermove", markActiveThrottled);
      window.removeEventListener("touchstart", markActive);
      window.removeEventListener("wheel", markActiveThrottled);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [idleTimeoutMinutes, socket, status]);
}
