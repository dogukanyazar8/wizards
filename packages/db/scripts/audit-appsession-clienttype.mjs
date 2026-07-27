// Step 0 of the telemetry backbone: measure what `AppSession.clientType`
// actually holds before any attribution code changes it. The claim under test is
// that mobile and desktop sessions are recorded as WEB because no client sends
// `x-whispr-client` and the user-agent fallback guesses wrong.
//
// Read-only. Run against the environment that owns the data:
//   node --import tsx packages/db/scripts/audit-appsession-clienttype.mjs
import { createPrismaClient } from "../src/client-factory.js";

const WINDOW_DAYS = Number.parseInt(process.env.AUDIT_WINDOW_DAYS ?? "7", 10);

function since(days) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

async function main() {
  const prisma = createPrismaClient();
  const startedAfter = since(WINDOW_DAYS);

  try {
    const total = await prisma.appSession.count();
    const windowed = await prisma.appSession.count({ where: { startedAt: { gte: startedAfter } } });

    console.info(`AppSession rows: ${total} total, ${windowed} in the last ${WINDOW_DAYS} days`);

    const distribution = await prisma.appSession.groupBy({
      by: ["clientType", "deviceType"],
      where: { startedAt: { gte: startedAfter } },
      _count: { _all: true },
      orderBy: { _count: { id: "desc" } },
    });

    console.info("\nclientType x deviceType (window):");
    if (distribution.length === 0) {
      console.info("  (no rows in window)");
    }
    for (const row of distribution) {
      console.info(`  ${row.clientType.padEnd(8)} ${row.deviceType.padEnd(8)} ${row._count._all}`);
    }

    const agents = await prisma.appSession.findMany({
      where: { startedAt: { gte: startedAfter } },
      distinct: ["os", "browser"],
      orderBy: { startedAt: "desc" },
      take: 20,
      select: { browser: true, clientType: true, deviceType: true, os: true, startedAt: true },
    });

    console.info("\nlast 20 distinct os/browser pairs:");
    if (agents.length === 0) {
      console.info("  (no rows in window)");
    }
    for (const agent of agents) {
      console.info(
        `  ${agent.startedAt.toISOString()} os=${agent.os ?? "-"} browser=${agent.browser ?? "-"} ` +
          `clientType=${agent.clientType} deviceType=${agent.deviceType}`,
      );
    }

    const mobileTokens = await prisma.appSession.count({
      where: {
        startedAt: { gte: startedAfter },
        OR: [
          { os: { contains: "Android", mode: "insensitive" } },
          { os: { contains: "iOS", mode: "insensitive" } },
          { browser: { contains: "okhttp", mode: "insensitive" } },
          { browser: { contains: "Expo", mode: "insensitive" } },
        ],
      },
    });

    console.info(
      `\nsessions whose os/browser looks mobile: ${mobileTokens}` +
        " (any of these recorded as WEB proves the miscount)",
    );
  } finally {
    await prisma.$disconnect();
  }
}

void main();
