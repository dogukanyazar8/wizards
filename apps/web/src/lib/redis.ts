import Redis, { type RedisOptions } from "ioredis";

let redis: Redis | null = null;
let redisSub: Redis | null = null;

const DEFAULT_REDIS_URL = "redis://localhost:6379";
const REDIS_PROTOCOLS = new Set(["redis:", "rediss:"]);

function getRedisUrl() {
  const redisUrl = process.env.REDIS_URL?.trim();
  if (redisUrl) {
    return redisUrl;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("REDIS_URL is required in production.");
  }

  return DEFAULT_REDIS_URL;
}

function getRedisOptions(): RedisOptions {
  const redisUrl = getRedisUrl();
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(redisUrl);
  } catch {
    throw new Error("REDIS_URL must be a valid Redis connection URL.");
  }

  if (!REDIS_PROTOCOLS.has(parsedUrl.protocol)) {
    throw new Error("REDIS_URL must use the redis:// or rediss:// protocol.");
  }

  const dbPath = parsedUrl.pathname.replace(/^\//, "");
  let db: number | undefined;

  if (dbPath) {
    const parsedDb = Number.parseInt(dbPath, 10);

    if (!Number.isInteger(parsedDb) || parsedDb < 0) {
      throw new Error("REDIS_URL database index must be a non-negative integer.");
    }

    db = parsedDb;
  }

  return {
    host: parsedUrl.hostname || "localhost",
    port: parsedUrl.port ? Number.parseInt(parsedUrl.port, 10) : 6379,
    ...(parsedUrl.username
      ? { username: decodeURIComponent(parsedUrl.username) }
      : {}),
    ...(parsedUrl.password
      ? { password: decodeURIComponent(parsedUrl.password) }
      : {}),
    ...(db === undefined ? {} : { db }),
    ...(parsedUrl.protocol === "rediss:" ? { tls: {} } : {}),
  };
}

function createRedisClient() {
  return new Redis({
    ...getRedisOptions(),
    retryStrategy: (times) => Math.min(times * 50, 2000),
    maxRetriesPerRequest: null,
  });
}

export function getRedis(): Redis {
  if (!redis) {
    redis = createRedisClient();
  }
  return redis;
}

export function getRedisSub(): Redis {
  if (!redisSub) {
    redisSub = createRedisClient();
  }
  return redisSub;
}
