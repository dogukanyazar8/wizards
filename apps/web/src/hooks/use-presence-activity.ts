"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import type { ClientToServerEvents, ServerToClientEvents } from "@/lib/socket/events";

export type PresenceStatus = "ONLINE" | "IDLE" | "DND" | "OFFLINE";

export const PRESENCE_IDLE_TIMEOUT_OPTIONS = [5, 10, 15, 30, 60] as const;
export const DEFAULT_PRESENCE_IDLE_TIMEOUT_MINUTES = 15;

const PRESENCE_IDLE_TIMEOUT_STORAGE_KEY = "wizards.presence.idleTimeoutMinutes";
const PRESENCE_IDLE_TIMEOUT_EVENT = "wizards:presence-idle-timeout-change";
const ACTIVITY_THROTTLE_MS = 1_000;

type PresenceSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

function normalizeIdleTimeoutMinutes(value: unknown) {
  const numericValue = typeof value === "number" ? value : Number(value);

  return PRESENCE_IDLE_TIMEOUT_OPTIONS.includes(
    numericValue as (typeof PRESENCE_IDLE_TIMEOUT_OPTIONS)[number],
  )
    ? numericValue
    : DEFAULT_PRESENCE_IDLE_TIMEOUT_MINUTES;
}

function readStoredIdleTimeoutMinutes() {
  if (typeof window === "undefined") {
    return DEFAULT_PRESENCE_IDLE_TIMEOUT_MINUTES;
  }

  return normalizeIdleTimeoutMinutes(
    window.localStorage.getItem(PRESENCE_IDLE_TIMEOUT_STORAGE_KEY),
  );
}

function canAutoManagePresence(status: PresenceStatus) {
  return status === "ONLINE" || status === "IDLE";
}

export function usePresenceIdleTimeoutPreference() {
  const [idleTimeoutMinutes, setIdleTimeoutMinutesState] = useState(
    DEFAULT_PRESENCE_IDLE_TIMEOUT_MINUTES,
  );

  useEffect(() => {
    const syncPreference = () => {
      setIdleTimeoutMinutesState(readStoredIdleTimeoutMinutes());
    };

    syncPreference();
    window.addEventListener("storage", syncPreference);
    window.addEventListener(PRESENCE_IDLE_TIMEOUT_EVENT, syncPreference);

    return () => {
      window.removeEventListener("storage", syncPreference);
      window.removeEventListener(PRESENCE_IDLE_TIMEOUT_EVENT, syncPreference);
    };
  }, []);

  const setIdleTimeoutMinutes = useCallback((value: number) => {
    const normalizedValue = normalizeIdleTimeoutMinutes(value);
    setIdleTimeoutMinutesState(normalizedValue);
    window.localStorage.setItem(PRESENCE_IDLE_TIMEOUT_STORAGE_KEY, String(normalizedValue));
    window.dispatchEvent(new Event(PRESENCE_IDLE_TIMEOUT_EVENT));
  }, []);

  return {
    idleTimeoutMinutes,
    setIdleTimeoutMinutes,
  };
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
