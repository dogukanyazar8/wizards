"use client";

import { useContext, useEffect } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { Socket } from "socket.io-client";
import type { ServerToClientEvents, ClientToServerEvents } from "@/lib/socket/events";
import { SocketContext } from "@/components/providers/socket-provider";
import { securityQueryKeys } from "@/lib/settings/security-client";

/** Reuse the authenticated socket; hidden settings rely on refetch-on-focus instead. */
export function useAccountSecurityRefresh(enabled: boolean) {
  const socket = useContext(SocketContext);
  const client = useQueryClient();
  useEffect(() => {
    if (!enabled || !socket) return;
    return subscribeAccountSecurityRefresh(socket, client);
  }, [client, enabled, socket]);
}

export function subscribeAccountSecurityRefresh(
  socket: Pick<Socket<ServerToClientEvents, ClientToServerEvents>, "on" | "off">,
  client: QueryClient,
  isVisible = () => document.visibilityState !== "hidden",
) {
  const refresh = ({ sessionsChanged }: { sessionsChanged: boolean }) => {
    const refetchType = !isVisible() ? "none" : "active";
    void client.invalidateQueries({ queryKey: securityQueryKeys.events, refetchType });
    if (sessionsChanged) {
      void client.invalidateQueries({ queryKey: securityQueryKeys.sessions, refetchType });
    }
  };
  const reconnect = () => refresh({ sessionsChanged: true });
  socket.on("account:security:changed", refresh);
  socket.on("connect", reconnect);
  return () => {
    socket.off("account:security:changed", refresh);
    socket.off("connect", reconnect);
  };
}
