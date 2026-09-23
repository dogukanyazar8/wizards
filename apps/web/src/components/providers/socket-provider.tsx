"use client";

import { createContext, useEffect } from "react";
import type { Socket } from "socket.io-client";
import { getSocket } from "@/lib/socket/client";
import { attachSocketLifecycle } from "@/lib/socket/connection-lifecycle";
import { createReconnectRefresh } from "@/lib/socket/reconnect-refresh";
import { useQueryClient } from "@tanstack/react-query";
import type { ClientToServerEvents, ServerToClientEvents } from "@/lib/socket/events";

export const SocketContext = createContext<Socket<
  ServerToClientEvents,
  ClientToServerEvents
> | null>(null);

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const socket = getSocket();
  const queryClient = useQueryClient();

  useEffect(() => {
    const refresh = createReconnectRefresh(queryClient);
    socket.on("connect", refresh);
    const lifecycle = attachSocketLifecycle(socket);
    const visible = () => {
      if (document.visibilityState === "visible") lifecycle.wake();
    };
    window.addEventListener("online", lifecycle.wake);
    document.addEventListener("visibilitychange", visible);

    return () => {
      window.removeEventListener("online", lifecycle.wake);
      document.removeEventListener("visibilitychange", visible);
      lifecycle.stop();
      socket.off("connect", refresh);
    };
  }, [queryClient, socket]);

  return <SocketContext.Provider value={socket}>{children}</SocketContext.Provider>;
}
