import { prisma } from "@wizards/db";
import { getRedis } from "@/lib/redis";

export const HEALTH_CHECK_TIMEOUT_MS = 1000;
export const HEALTH_RESPONSE_HEADERS = {
  "Cache-Control": "no-store",
} as const;

type DependencyStatus = "error" | "ok";

type ReadinessDependencyChecks = {
  database?: () => Promise<unknown>;
  redis?: () => Promise<unknown>;
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
  const [database, redis] = await Promise.allSettled([
    withTimeout((checks.database ?? defaultDatabaseCheck)(), timeoutMs),
    withTimeout((checks.redis ?? defaultRedisCheck)(), timeoutMs),
  ]);

  const databaseStatus = database.status === "fulfilled" ? "ok" : "error";
  const redisStatus = redis.status === "fulfilled" ? "ok" : "error";
  const isReady = databaseStatus === "ok" && redisStatus === "ok";

  return {
    checks: {
      database: databaseStatus,
      redis: redisStatus,
    },
    status: isReady ? "ok" : "error",
    timestamp: now.toISOString(),
  };
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
