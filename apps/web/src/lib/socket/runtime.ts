import { logError } from "@/lib/logger";
import type { Server } from "socket.io";
import type {
  ClientToServerEvents,
  InterServerEvents,
  ServerToClientEvents,
  SocketData,
} from "./events";
import { getAuthSessionSocketRoomName } from "./rooms";

export type AppSocketServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

const SOCKET_SERVER_GLOBAL_KEY = "__WIZARDS_SOCKET_SERVER__";

type GlobalSocketRegistry = typeof globalThis & {
  [SOCKET_SERVER_GLOBAL_KEY]?: AppSocketServer | null;
};

let socketServer: AppSocketServer | null = null;

function getSocketRegistry() {
  return globalThis as GlobalSocketRegistry;
}

export function setSocketServer(server: AppSocketServer | null) {
  socketServer = server;
  getSocketRegistry()[SOCKET_SERVER_GLOBAL_KEY] = server;
}

export function getSocketServer() {
  return socketServer ?? getSocketRegistry()[SOCKET_SERVER_GLOBAL_KEY] ?? null;
}

export function disconnectAuthSessionSockets(
  sessionId: string,
  server: AppSocketServer | null = getSocketServer(),
) {
  const normalizedSessionId = sessionId.trim();
  if (!server || !normalizedSessionId) return;

  server.in(getAuthSessionSocketRoomName(normalizedSessionId)).disconnectSockets(true);
}

export function disconnectUserSockets(
  userId: string,
  server: AppSocketServer | null = getSocketServer(),
) {
  const normalizedUserId = userId.trim();
  if (!server || !normalizedUserId) return;

  server.in(`user:${normalizedUserId}`).disconnectSockets(true);
}

/** A notification failure must never roll back a completed authentication operation. */
export function notifyAccountSecurityChanged(
  userId: string,
  sessionsChanged: boolean,
  server: AppSocketServer | null = getSocketServer(),
) {
  if (!server || !userId.trim()) return;
  try {
    server.to(`user:${userId.trim()}`).emit("account:security:changed", { sessionsChanged });
  } catch (error) {
    logError("[auth] Failed to notify account security change", error);
  }
}
