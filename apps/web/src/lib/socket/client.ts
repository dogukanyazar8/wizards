"use client";

import { io, type Socket } from "socket.io-client";
import { WHISPR_BUILD_ID } from "@/lib/app-version";
import { isWhisprDesktopRuntime } from "@/lib/desktop/runtime";
import type { ClientToServerEvents, ServerToClientEvents } from "./events";

let socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;

function getSocketUrl() {
  return process.env.NEXT_PUBLIC_SOCKET_URL?.trim() || undefined;
}

/**
 * Browsers refuse custom headers on a WebSocket handshake, so the web client
 * declares itself through the handshake auth payload instead. The desktop build
 * loads this same frontend inside Tauri, which is why the shell is detected at
 * runtime rather than compiled in.
 */
function getClientAttributionAuth() {
  return {
    client: isWhisprDesktopRuntime() ? "desktop" : "web",
    clientVersion: WHISPR_BUILD_ID,
  };
}

export function getSocket(): Socket<ServerToClientEvents, ClientToServerEvents> {
  if (!socket) {
    const socketUrl = getSocketUrl();
    const options = {
      auth: getClientAttributionAuth(),
      autoConnect: false,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      withCredentials: true,
    };
    socket = socketUrl ? io(socketUrl, options) : io(options);
  }
  return socket;
}
