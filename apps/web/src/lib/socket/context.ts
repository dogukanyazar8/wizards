import type Redis from "ioredis";
import type { Socket } from "socket.io";
import type {
  ClientToServerEvents,
  InterServerEvents,
  ServerToClientEvents,
  SocketData,
} from "./events";
import type { AppSocketServer } from "./runtime";

export type AppSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

export type HandlerContext = {
  io: AppSocketServer;
  rateRedis: Redis;
  redis: Redis;
  socket: AppSocket;
  userId: string;
};

export function createHandlerContext(args: {
  io: AppSocketServer;
  rateRedis: Redis;
  redis: Redis;
  socket: AppSocket;
}): HandlerContext {
  return {
    io: args.io,
    rateRedis: args.rateRedis,
    redis: args.redis,
    socket: args.socket,
    userId: args.socket.data.userId,
  };
}
