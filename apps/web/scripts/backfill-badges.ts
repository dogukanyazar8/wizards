import { prisma, type Prisma } from "@wizards/db";

import {
  advanceBadgeProgress,
  BADGE_ACTIVE_DAY_MIN_SECONDS,
} from "../src/lib/badges/badge-service";
import {
  parseBadgeBackfillArgs,
  planBadgeBackfill,
  recordBadgeDistribution,
  renderBadgeDistributionTable,
  type BadgeBackfillFacts,
  type BadgeDistribution,
} from "../src/lib/badges/badge-backfill";

/**
 * One-off, hand-run backfill for the badge counters. It is deliberately not
 * wired into deployment: it walks the whole user table and reads
 * `UserDailyMetric`, which is exactly what the live engine is built to avoid.
 *
 *   pnpm --filter @wizards/web exec tsx scripts/backfill-badges.ts
 *   pnpm --filter @wizards/web exec tsx scripts/backfill-badges.ts --commit
 *
 * `--dry-run` is the default; nothing is written without `--commit`.
 */

type MetricDayRow = {
  userId: string;
  date: Date;
  _sum: {
    appSeconds: number | null;
    dmMessageCount: number | null;
    messageCount: number | null;
    screenShareSeconds: number | null;
    voiceSeconds: number | null;
  };
};

async function collectFacts(userIds: readonly string[]): Promise<Map<string, BadgeBackfillFacts>> {
  const facts = new Map<string, BadgeBackfillFacts>();
  for (const userId of userIds) {
    facts.set(userId, {
      acceptedInvites: 0,
      activeDays: [],
      isBetaTester: false,
      largestOwnedServerMembers: 0,
      lastMessageDay: null,
      messageDays: 0,
      resolvedBugReports: 0,
      screenShareSeconds: 0,
      shippedIdeas: 0,
      userId,
      voiceSeconds: 0,
    });
  }

  // One day-grouped pass feeds four badges. A user has one row per clientType
  // per day, so the group sums across clients before anything is compared.
  const metrics = (await prisma.userDailyMetric.groupBy({
    by: ["userId", "date"],
    where: { userId: { in: [...userIds] } },
    _sum: {
      appSeconds: true,
      dmMessageCount: true,
      messageCount: true,
      screenShareSeconds: true,
      voiceSeconds: true,
    },
  })) as unknown as MetricDayRow[];

  const activeDays = new Map<string, Date[]>();
  const messageDays = new Map<string, Date[]>();

  for (const row of metrics) {
    const entry = facts.get(row.userId);
    if (!entry) {
      continue;
    }

    entry.voiceSeconds += row._sum.voiceSeconds ?? 0;
    entry.screenShareSeconds += row._sum.screenShareSeconds ?? 0;

    if ((row._sum.appSeconds ?? 0) >= BADGE_ACTIVE_DAY_MIN_SECONDS) {
      activeDays.set(row.userId, [...(activeDays.get(row.userId) ?? []), row.date]);
    }

    if ((row._sum.messageCount ?? 0) + (row._sum.dmMessageCount ?? 0) > 0) {
      messageDays.set(row.userId, [...(messageDays.get(row.userId) ?? []), row.date]);
    }
  }

  for (const [userId, days] of activeDays) {
    const entry = facts.get(userId);
    if (entry) {
      entry.activeDays = days;
    }
  }

  for (const [userId, days] of messageDays) {
    const entry = facts.get(userId);
    if (entry) {
      const sorted = [...days].sort((left, right) => left.getTime() - right.getTime());
      entry.messageDays = sorted.length;
      entry.lastMessageDay = sorted[sorted.length - 1] ?? null;
    }
  }

  // Self-invites are excluded in memory: comparing two columns is not something
  // an aggregate `where` can express here.
  const invites = await prisma.serverInvite.findMany({
    where: { createdById: { in: [...userIds] } },
    select: { createdById: true, targetUserId: true, uses: true },
  });
  for (const invite of invites) {
    if (invite.targetUserId !== null && invite.targetUserId === invite.createdById) {
      continue;
    }
    const entry = facts.get(invite.createdById);
    if (entry) {
      entry.acceptedInvites += invite.uses;
    }
  }

  const servers = await prisma.server.findMany({
    where: { ownerId: { in: [...userIds] } },
    select: { _count: { select: { members: true } }, ownerId: true },
  });
  for (const server of servers) {
    const entry = facts.get(server.ownerId);
    if (entry) {
      entry.largestOwnedServerMembers = Math.max(
        entry.largestOwnedServerMembers,
        server._count.members,
      );
    }
  }

  const bugReports = await prisma.bugReport.groupBy({
    by: ["userId"],
    where: { status: "RESOLVED", userId: { in: [...userIds] } },
    _count: { _all: true },
  });
  for (const row of bugReports) {
    const entry = row.userId === null ? undefined : facts.get(row.userId);
    if (entry) {
      entry.resolvedBugReports = row._count._all;
    }
  }

  const shipped = await prisma.feedback.findMany({
    where: { roadmapItem: { status: "SHIPPED" }, userId: { in: [...userIds] } },
    select: { roadmapItemId: true, userId: true },
  });
  const shippedItems = new Map<string, Set<string>>();
  for (const row of shipped) {
    if (row.roadmapItemId === null) {
      continue;
    }
    const seen = shippedItems.get(row.userId) ?? new Set<string>();
    seen.add(row.roadmapItemId);
    shippedItems.set(row.userId, seen);
  }
  for (const [userId, items] of shippedItems) {
    const entry = facts.get(userId);
    if (entry) {
      entry.shippedIdeas = items.size;
    }
  }

  const betaSessions = await prisma.appSession.groupBy({
    by: ["userId"],
    where: { user: { preferredReleaseChannel: "BETA" }, userId: { in: [...userIds] } },
    _count: { _all: true },
  });
  for (const row of betaSessions) {
    const entry = facts.get(row.userId);
    if (entry && row._count._all > 0) {
      entry.isBetaTester = true;
    }
  }

  return facts;
}

async function main() {
  const args = parseBadgeBackfillArgs(process.argv.slice(2));
  const distribution: BadgeDistribution = new Map();
  let cursor: string | null = null;
  let scanned = 0;
  let written = 0;

  console.info(
    `badge backfill · mode=${args.commit ? "COMMIT" : "DRY-RUN"} batch=${args.batchSize} badge=${args.badge ?? "all"}`,
  );

  for (;;) {
    // The page filter is annotated so `cursor` does not make the row type
    // depend on its own assignment below.
    const where: Prisma.UserWhereInput = {
      deletedAt: null,
      isBanned: false,
      isBot: false,
      ...(cursor === null ? {} : { id: { gt: cursor } }),
    };
    const users: Array<{ id: string }> = await prisma.user.findMany({
      orderBy: { id: "asc" },
      select: { id: true },
      take: args.batchSize,
      where,
    });

    if (users.length === 0) {
      break;
    }

    cursor = users[users.length - 1]?.id ?? null;
    scanned += users.length;

    const facts = await collectFacts(users.map((user) => user.id));

    for (const user of users) {
      const userFacts = facts.get(user.id);
      if (!userFacts) {
        continue;
      }

      const plan = planBadgeBackfill(userFacts, args.badge);
      recordBadgeDistribution(distribution, plan);

      if (!args.commit) {
        continue;
      }

      for (const entry of plan) {
        if (entry.badge === "streak") {
          // `advanceBadgeProgress` derives the streak counter from day gaps, so
          // a historical best-ever run has to be written straight to the row.
          await prisma.userBadgeProgress.upsert({
            where: { userId_badge: { badge: "streak", userId: user.id } },
            create: {
              badge: "streak",
              lastCountedDay: entry.day,
              streakDays: entry.streakDays,
              userId: user.id,
              value: BigInt(entry.value),
            },
            update: {
              lastCountedDay: entry.day,
              streakDays: entry.streakDays,
              value: BigInt(entry.value),
            },
          });
          await prisma.userBadge.upsert({
            where: { userId_badge: { badge: "streak", userId: user.id } },
            create: { badge: "streak", source: "AWARDED", tier: entry.tier, userId: user.id },
            update: { tier: entry.tier },
          });
          written += 1;
          continue;
        }

        await advanceBadgeProgress({
          amount: entry.value,
          badge: entry.badge,
          ...(entry.day === null ? {} : { day: entry.day }),
          mode: "set",
          // 07 §4: a backfill is a recomputation of history, not news. Left on,
          // one run would push every badge every account ever qualified for
          // into its notification feed at once.
          notify: false,
          userId: user.id,
        });
        written += 1;
      }
    }

    if (users.length < args.batchSize) {
      break;
    }
  }

  console.info("");
  console.info(renderBadgeDistributionTable(distribution, scanned));
  console.info("");
  console.info(
    args.commit
      ? `wrote ${written} badge rows`
      : "dry run — nothing was written. Re-run with --commit to apply.",
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
