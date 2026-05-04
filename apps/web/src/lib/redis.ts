import Redis from "ioredis";

let redis: Redis | null = null;
let redisSub: Redis | null = null;

function getRedisUrl() {
  const redisUrl = process.env.REDIS_URL?.trim();
  if (redisUrl) {
    return redisUrl;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("REDIS_URL is required in production.");
  }

  return "redis://localhost:6379";
}

export function getRedis(): Redis {
  if (!redis) {
    redis = new Redis(getRedisUrl(), {
      retryStrategy: (times) => Math.min(times * 50, 2000),
      maxRetriesPerRequest: null,
    });
  }
  return redis;
}

export function getRedisSub(): Redis {
  if (!redisSub) {
    redisSub = new Redis(getRedisUrl(), {
      retryStrategy: (times) => Math.min(times * 50, 2000),
      maxRetriesPerRequest: null,
    });
  }
  return redisSub;
}
