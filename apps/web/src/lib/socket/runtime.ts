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

let socketServer: AppSocketServer | null = null;

export function setSocketServer(server: AppSocketServer) {
  socketServer = server;
}

export function getSocketServer() {
  return socketServer;
}
