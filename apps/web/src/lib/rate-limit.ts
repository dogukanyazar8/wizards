import { randomUUID } from "node:crypto";
import type Redis from "ioredis";

const RATE_LIMIT_SCRIPT = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local windowStart = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local windowSeconds = tonumber(ARGV[4])
local member = ARGV[5]

redis.call("ZREMRANGEBYSCORE", key, "-inf", windowStart)

local count = redis.call("ZCARD", key)
if count >= limit then
  redis.call("EXPIRE", key, windowSeconds)
  return 0
end

redis.call("ZADD", key, now, member)
redis.call("EXPIRE", key, windowSeconds)
return 1
`;

export async function checkRateLimit(
  redis: Redis,
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  const now = Date.now();
  const windowStart = now - windowSeconds * 1000;

  const result = await redis.eval(
    RATE_LIMIT_SCRIPT,
    1,
    key,
    now,
    windowStart,
    limit,
    windowSeconds,
    `${now}:${randomUUID()}`,
  );

  return String(result) === "1";
}
