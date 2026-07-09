import type { Server as HTTPServer } from "http";
import { createAdapter } from "@socket.io/redis-adapter";
import { Server } from "socket.io";

import { getRedisPub, getRedisSub } from "@/lib/redis";
import type { AppSocketServer } from "@/lib/socket/runtime";
import type {
  ClientToServerEvents,
  InterServerEvents,
  ServerToClientEvents,
  SocketData,
} from "./events";

export type SocketAdapterFactory = Parameters<AppSocketServer["adapter"]>[0];
type SocketServerOptions = ConstructorParameters<typeof Server>[1];

type CreateSocketServerWithRedisAdapterOptions = {
  adapterFactory?: SocketAdapterFactory | null;
  httpServer?: HTTPServer;
  options?: SocketServerOptions;
};

export function createRedisSocketAdapterFactory(): SocketAdapterFactory {
  return createAdapter(getRedisPub(), getRedisSub());
}

export function createSocketServerWithRedisAdapter({
  adapterFactory = createRedisSocketAdapterFactory(),
  httpServer,
  options,
}: CreateSocketServerWithRedisAdapterOptions = {}) {
  const io: AppSocketServer = httpServer
    ? new Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>(
        httpServer,
        options,
      )
    : new Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>(
        options,
      );

  if (adapterFactory) {
    io.adapter(adapterFactory);
  }

  return io;
}
