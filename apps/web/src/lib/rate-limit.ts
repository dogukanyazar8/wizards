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

const RATE_LIMIT_RETRY_SCRIPT = `
local key = KEYS[1]
local windowStart = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])

redis.call("ZREMRANGEBYSCORE", key, "-inf", windowStart)

local count = redis.call("ZCARD", key)
if count < limit then
  return 0
end

local oldest = redis.call("ZRANGE", key, 0, 0, "WITHSCORES")
if not oldest[2] then
  return 0
end

return tonumber(oldest[2])
`;

/**
 * Sınır doluysa **ne kadar** beklenmesi gerektiğini söyler.
 *
 * `checkRateLimit` yalnız "geçti mi" diyor; SPEC-GIRIS-KAYIT §4.5 ve §4.7 ekranda bir geri sayım
 * istiyor (`Tekrar gönder · 00:42`, `Yeniden gönderme 00:58 sonra açılır`). Kayan pencerede
 * kalan süre, penceredeki **en eski** kaydın düşmesine kalan süredir.
 *
 * Sayaç sunucudan okunduğu için sayfa yenilense de doğru kalır ve istemci saatine bağlı değildir.
 */
export async function peekRateLimitRetryAfterMs(
  redis: Redis,
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<number> {
  const now = Date.now();
  const windowMs = windowSeconds * 1000;
  const result = await redis.eval(RATE_LIMIT_RETRY_SCRIPT, 1, key, now - windowMs, limit);
  const oldestScore = Number(result);

  if (!Number.isFinite(oldestScore) || oldestScore <= 0) {
    return 0;
  }

  return Math.max(0, oldestScore + windowMs - now);
}
