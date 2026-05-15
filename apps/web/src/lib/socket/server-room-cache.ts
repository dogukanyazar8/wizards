import type Redis from "ioredis";

import { getRedisOp } from "@/lib/redis";

export const SERVER_ROOM_IDS_CACHE_TTL_SECONDS = 300;

type ServerRoomIdsCacheRedis = {
  del(key: string): Promise<unknown>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: "EX", seconds: number): Promise<unknown>;
  status: Redis["status"];
};

let serverRoomIdsCacheRedisForTest: ServerRoomIdsCacheRedis | null = null;

function getServerRoomIdsCacheKey(userId: string) {
  return `socket:v1:user-servers:${userId}`;
}

function parseCachedServerRoomIds(value: string | null) {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed) && parsed.every((serverId) => typeof serverId === "string")) {
      return parsed;
    }
  } catch {
    return null;
  }

  return null;
}

function isRedisReady(redis: Pick<Redis, "status">) {
  return redis.status === "ready";
}

export function setServerRoomIdsCacheRedisForTest(redis: ServerRoomIdsCacheRedis | null) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("setServerRoomIdsCacheRedisForTest is not available in production.");
  }
  serverRoomIdsCacheRedisForTest = redis;
}

export async function readCachedServerRoomIds(redis: ServerRoomIdsCacheRedis, userId: string) {
  if (!isRedisReady(redis)) {
    return null;
  }

  try {
    return parseCachedServerRoomIds(await redis.get(getServerRoomIdsCacheKey(userId)));
  } catch {
    return null;
  }
}

export async function writeCachedServerRoomIds(
  redis: ServerRoomIdsCacheRedis,
  userId: string,
  serverIds: string[],
) {
  if (!isRedisReady(redis)) {
    return;
  }

  await redis
    .set(
      getServerRoomIdsCacheKey(userId),
      JSON.stringify(serverIds),
      "EX",
      SERVER_ROOM_IDS_CACHE_TTL_SECONDS,
    )
    .catch(() => undefined);
}

export async function invalidateServerRoomIdsCache(
  userId: string,
  redis: ServerRoomIdsCacheRedis = serverRoomIdsCacheRedisForTest ?? getRedisOp(),
) {
  await redis.del(getServerRoomIdsCacheKey(userId)).catch(() => undefined);
}
