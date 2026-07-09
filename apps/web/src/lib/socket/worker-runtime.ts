import { setSocketServer, type AppSocketServer } from "@/lib/socket/runtime";
import {
  createSocketServerWithRedisAdapter,
  type SocketAdapterFactory,
} from "@/lib/socket/redis-adapter";

type InitHeadlessSocketServerOptions = {
  adapterFactory?: SocketAdapterFactory | null;
  setRuntimeSocketServer?: (server: AppSocketServer | null) => void;
};

export function initHeadlessSocketServer({
  adapterFactory,
  setRuntimeSocketServer = setSocketServer,
}: InitHeadlessSocketServerOptions = {}) {
  const io = createSocketServerWithRedisAdapter({
    ...(adapterFactory === undefined ? {} : { adapterFactory }),
  });
  setRuntimeSocketServer(io);
  return io;
}

export async function closeHeadlessSocketServer(io: AppSocketServer) {
  io.disconnectSockets(true);
  const adapter = io.of("/").adapter as { close?: () => Promise<void> | void };
  await adapter.close?.();
  setSocketServer(null);
}
