"use client";

import { createContext, useEffect } from "react";
import type { Socket } from "socket.io-client";
import { getSocket } from "@/lib/socket/client";
import type { ClientToServerEvents, ServerToClientEvents } from "@/lib/socket/events";

export const SocketContext = createContext<Socket<ServerToClientEvents, ClientToServerEvents> | null>(null);

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const socket = getSocket();

  useEffect(() => {
    socket.connect();
  }, [socket]);

  return <SocketContext.Provider value={socket}>{children}</SocketContext.Provider>;
}
