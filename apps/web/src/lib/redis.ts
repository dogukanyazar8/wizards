import Redis from "ioredis";

let redis: Redis | null = null;
let redisSub: Redis | null = null;

export function getRedis(): Redis {
  if (!redis) {
    redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
      retryStrategy: (times) => Math.min(times * 50, 2000),
      maxRetriesPerRequest: null,
    });
  }
  return redis;
}

export function getRedisSub(): Redis {
  if (!redisSub) {
    redisSub = new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
      retryStrategy: (times) => Math.min(times * 50, 2000),
      maxRetriesPerRequest: null,
    });
  }
  return redisSub;
}
