import type Redis from "ioredis";
import { PRESENCE_CACHE_TTL_SECONDS } from "@/lib/friends/service";

const PRESENCE_SOCKET_PREFIX = "presence:socket-set:";
const PRESENCE_SOCKET_TTL_SECONDS = 120;
const PRESENCE_SOCKET_TTL_MS = PRESENCE_SOCKET_TTL_SECONDS * 1000;

export function getPresenceSocketsKey(userId: string) {
  return `${PRESENCE_SOCKET_PREFIX}${userId}`;
}

export async function prunePresenceSockets(redis: Redis, userId: string) {
  const key = getPresenceSocketsKey(userId);
  await redis.zremrangebyscore(key, "-inf", Date.now() - PRESENCE_SOCKET_TTL_MS);
  return redis.zcard(key);
}

export async function markPresenceSocketActive(redis: Redis, userId: string, socketId: string) {
  const key = getPresenceSocketsKey(userId);
  await redis
    .pipeline()
    .zadd(key, Date.now(), socketId)
    .expire(key, PRESENCE_SOCKET_TTL_SECONDS)
    .expire(`presence:${userId}`, PRESENCE_CACHE_TTL_SECONDS)
    .exec();
}

export async function addPresenceSocket(redis: Redis, userId: string, socketId: string) {
  const existingSocketCount = await prunePresenceSockets(redis, userId);
  await markPresenceSocketActive(redis, userId, socketId);
  return existingSocketCount === 0;
}

export async function removePresenceSocket(redis: Redis, userId: string, socketId: string) {
  const key = getPresenceSocketsKey(userId);
  await redis.zrem(key, socketId);
  const remainingSocketCount = await prunePresenceSockets(redis, userId);
  if (remainingSocketCount <= 0) {
    await redis.del(key);
  }

  return remainingSocketCount;
}
