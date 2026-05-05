import { prisma } from "@wizards/db";
import { getRedis } from "@/lib/redis";

const HEALTH_CHECK_TIMEOUT_MS = 1000;

function withTimeout<T>(promise: Promise<T>, timeoutMs = HEALTH_CHECK_TIMEOUT_MS) {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("Health check timed out")), timeoutMs);
    }),
  ]);
}

export async function GET(request: Request) {
  const wantsReadiness = new URL(request.url).searchParams.get("ready") === "1";

  if (!wantsReadiness) {
    return Response.json({
      status: "ok",
      timestamp: new Date().toISOString(),
    });
  }

  const checks = await Promise.allSettled([
    withTimeout(prisma.$queryRaw`SELECT 1`),
    withTimeout(getRedis().ping()),
  ]);
  const isReady = checks.every((check) => check.status === "fulfilled");

  return Response.json(
    {
      checks: {
        database: checks[0]?.status === "fulfilled" ? "ok" : "error",
        redis: checks[1]?.status === "fulfilled" ? "ok" : "error",
      },
      status: isReady ? "ok" : "error",
      timestamp: new Date().toISOString(),
    },
    { status: isReady ? 200 : 503 },
  );
}
