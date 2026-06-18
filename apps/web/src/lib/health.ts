import { prisma } from "@wizards/db";
import { getRedis } from "@/lib/redis";

export const HEALTH_CHECK_TIMEOUT_MS = 1000;
export const DEFAULT_READINESS_CACHE_TTL_MS = 2_000;
export const HEALTH_RESPONSE_HEADERS = {
  "Cache-Control": "no-store",
} as const;

type DependencyStatus = "error" | "ok";

type ReadinessDependencyChecks = {
  database?: () => Promise<unknown>;
  redis?: () => Promise<unknown>;
};

type ReadinessCacheEntry = {
  expiresAt: number;
  payload: ReadinessPayload;
};

export type HealthPayload = {
  status: "ok";
  timestamp: string;
};

export type ReadinessPayload = {
  checks: {
    database: DependencyStatus;
    redis: DependencyStatus;
  };
  status: DependencyStatus;
  timestamp: string;
};

export type OperationalProbeResponse = {
  body: HealthPayload | ReadinessPayload | { message: string; status: "error" };
  headers?: Record<string, string>;
  status: number;
};

function withTimeout<T>(promise: Promise<T>, timeoutMs = HEALTH_CHECK_TIMEOUT_MS) {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Health check timed out")), timeoutMs);

    void promise.then(resolve, reject).finally(() => clearTimeout(timeout));
  });
}

let defaultReadinessCache: ReadinessCacheEntry | null = null;

function readPositiveIntegerEnv(name: string, fallback: number) {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function getReadinessCacheTtlMs() {
  return readPositiveIntegerEnv("WHISPR_READY_CACHE_MS", DEFAULT_READINESS_CACHE_TTL_MS);
}

function usesDefaultReadinessChecks(checks: ReadinessDependencyChecks) {
  return !checks.database && !checks.redis;
}

export function resetReadinessCacheForTests() {
  defaultReadinessCache = null;
}

function defaultDatabaseCheck() {
  return prisma.$queryRaw`SELECT 1`;
}

function defaultRedisCheck() {
  return getRedis().ping();
}

export function getHealthPayload(now = new Date()): HealthPayload {
  return {
    status: "ok",
    timestamp: now.toISOString(),
  };
}

export async function getReadinessPayload({
  checks = {},
  now = new Date(),
  timeoutMs = HEALTH_CHECK_TIMEOUT_MS,
}: {
  checks?: ReadinessDependencyChecks;
  now?: Date;
  timeoutMs?: number;
} = {}): Promise<ReadinessPayload> {
  const shouldUseCache = usesDefaultReadinessChecks(checks);
  const cacheTtlMs = getReadinessCacheTtlMs();
  const nowMs = now.getTime();

  if (
    shouldUseCache &&
    cacheTtlMs > 0 &&
    defaultReadinessCache &&
    defaultReadinessCache.expiresAt > nowMs
  ) {
    return defaultReadinessCache.payload;
  }

  const [database, redis] = await Promise.allSettled([
    withTimeout((checks.database ?? defaultDatabaseCheck)(), timeoutMs),
    withTimeout((checks.redis ?? defaultRedisCheck)(), timeoutMs),
  ]);

  const databaseStatus = database.status === "fulfilled" ? "ok" : "error";
  const redisStatus = redis.status === "fulfilled" ? "ok" : "error";
  const isReady = databaseStatus === "ok" && redisStatus === "ok";

  const payload: ReadinessPayload = {
    checks: {
      database: databaseStatus,
      redis: redisStatus,
    },
    status: isReady ? "ok" : "error",
    timestamp: now.toISOString(),
  };

  if (shouldUseCache && cacheTtlMs > 0) {
    defaultReadinessCache = {
      expiresAt: nowMs + cacheTtlMs,
      payload,
    };
  }

  return payload;
}

export function getReadinessStatusCode(payload: ReadinessPayload) {
  return payload.status === "ok" ? 200 : 503;
}

export async function getOperationalProbeResponse({
  method = "GET",
  now,
  pathname,
  readiness,
}: {
  method?: string;
  now?: Date;
  pathname: string;
  readiness?: {
    checks?: ReadinessDependencyChecks;
    now?: Date;
    timeoutMs?: number;
  };
}): Promise<OperationalProbeResponse | null> {
  if (pathname !== "/health" && pathname !== "/ready") {
    return null;
  }

  const normalizedMethod = method.toUpperCase();
  if (normalizedMethod !== "GET" && normalizedMethod !== "HEAD") {
    return {
      body: {
        message: "Method not allowed",
        status: "error",
      },
      headers: {
        Allow: "GET, HEAD",
      },
      status: 405,
    };
  }

  if (pathname === "/health") {
    return {
      body: getHealthPayload(now),
      status: 200,
    };
  }

  const body = await getReadinessPayload(readiness);

  return {
    body,
    status: getReadinessStatusCode(body),
  };
}
