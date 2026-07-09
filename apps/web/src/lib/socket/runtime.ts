import type { Server } from "socket.io";
import type {
  ClientToServerEvents,
  InterServerEvents,
  ServerToClientEvents,
  SocketData,
} from "./events";

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
