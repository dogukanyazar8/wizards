import { prisma } from "@wizards/db";

import {
  collectServerMemberCountDrift,
  recomputeServerMemberCount,
} from "../src/lib/workspace/server-member-counter";

/**
 * `memberCount` is denormalized and written from five call sites, so it can
 * drift. This sweep is run by hand: drift is expected to be rare, and a cron
 * job for a rare repair is complexity nobody asked for (S4 §D). Pass
 * `--dry-run` to report without writing.
 */
const dryRun = process.argv.includes("--dry-run");

try {
  const [servers, grouped] = await Promise.all([
    prisma.server.findMany({ select: { id: true, memberCount: true, name: true } }),
    prisma.serverMember.groupBy({ by: ["serverId"], _count: { _all: true } }),
  ]);

  const actualCounts = new Map(grouped.map((row) => [row.serverId, row._count._all]));
  const drift = collectServerMemberCountDrift(servers, actualCounts);

  for (const server of drift) {
    console.info(
      `[maintenance] ${server.name} (${server.id}): stored ${server.memberCount} -> actual ${server.actual}${
        dryRun ? " (dry run, not written)" : ""
      }`,
    );

    if (!dryRun) {
      await recomputeServerMemberCount(prisma, server.id);
    }
  }

  console.info(
    `[maintenance] Scanned ${servers.length} server(s), ${drift.length} drifted${
      dryRun ? ", nothing written (dry run)" : ", all repaired"
    }.`,
  );
} finally {
  await prisma.$disconnect();
}
