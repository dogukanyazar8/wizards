import type Redis from "ioredis";

import { getRedisOp } from "@/lib/redis";

export const SERVER_ROOM_IDS_CACHE_TTL_SECONDS = 300;

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

export async function readCachedServerRoomIds(redis: Redis, userId: string) {
  if (!isRedisReady(redis)) {
    return null;
  }

  try {
    return parseCachedServerRoomIds(await redis.get(getServerRoomIdsCacheKey(userId)));
  } catch {
    return null;
  }
}

export async function writeCachedServerRoomIds(redis: Redis, userId: string, serverIds: string[]) {
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
  redis: Redis = getRedisOp(),
) {
  await redis.del(getServerRoomIdsCacheKey(userId)).catch(() => undefined);
}
