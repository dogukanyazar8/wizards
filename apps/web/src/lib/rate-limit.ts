import { randomUUID } from "node:crypto";
import type Redis from "ioredis";

export async function checkRateLimit(
  redis: Redis,
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  const now = Date.now();
  const windowStart = now - windowSeconds * 1000;

  await redis.zremrangebyscore(key, "-inf", windowStart);

  const count = await redis.zcard(key);
  if (count >= limit) {
    return false;
  }

  await redis.zadd(key, now, `${now}:${randomUUID()}`);
  await redis.expire(key, windowSeconds);
  return true;
}
