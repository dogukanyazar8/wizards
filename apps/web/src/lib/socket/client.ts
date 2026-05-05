"use client";

import { io, type Socket } from "socket.io-client";
import type { ClientToServerEvents, ServerToClientEvents } from "./events";

let socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;

function getSocketUrl() {
  return process.env.NEXT_PUBLIC_SOCKET_URL?.trim() || undefined;
}

export function getSocket(): Socket<ServerToClientEvents, ClientToServerEvents> {
  if (!socket) {
    const socketUrl = getSocketUrl();
    const options = {
      autoConnect: false,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      withCredentials: true,
    };
    socket = socketUrl ? io(socketUrl, options) : io(options);
  }
  return socket;
}
