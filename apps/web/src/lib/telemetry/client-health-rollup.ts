import type { AnalyticsClientType, ClientHealthKind, Prisma } from "@wizards/db";
import { prisma } from "@wizards/db";

/** Raw signals live for a month; after that only the daily shape survives. */
export const CLIENT_HEALTH_RETENTION_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
const ROLLUP_BATCH_SIZE = 5_000;

export type ClientHealthRawRow = {
  appVersion: string | null;
  clientType: AnalyticsClientType;
  createdAt: Date;
  id: string;
  kind: ClientHealthKind;
  surface: string | null;
  valueMs: number | null;
};

export type ClientHealthSummaryRow = {
  /** Empty string stands for "the client did not report a version". */
  appVersion: string;
  clientType: AnalyticsClientType;
  count: number;
  date: Date;
  kind: ClientHealthKind;
  p50Ms: number | null;
  p95Ms: number | null;
  p99Ms: number | null;
  /** Empty string for kinds without a surface, matching the unique key. */
  surface: string;
};

type ClientHealthRollupOperations = {
  clientHealthDailySummary: {
    upsert(args: Prisma.ClientHealthDailySummaryUpsertArgs): Promise<unknown>;
  };
  clientHealthEvent: {
    deleteMany(args: Prisma.ClientHealthEventDeleteManyArgs): Promise<{ count: number }>;
    findMany(args: Prisma.ClientHealthEventFindManyArgs): Promise<ClientHealthRawRow[]>;
  };
};

export type ClientHealthRollupStore = ClientHealthRollupOperations & {
  $transaction<T>(operation: (client: ClientHealthRollupOperations) => Promise<T>): Promise<T>;
};

function utcDayStart(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

/** Nearest-rank percentile: with few samples an interpolated value invents data. */
export function percentileMs(values: number[], percentile: number) {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const rank = Math.ceil((percentile / 100) * sorted.length);
  const index = Math.min(sorted.length - 1, Math.max(0, rank - 1));

  return Math.round(sorted[index] ?? 0);
}

export function summarizeClientHealthRows(rows: ClientHealthRawRow[]): ClientHealthSummaryRow[] {
  const buckets = new Map<string, { row: ClientHealthSummaryRow; values: number[] }>();

  for (const row of rows) {
    const date = utcDayStart(row.createdAt);
    const surface = row.surface ?? "";
    const key = `${date.toISOString()}|${row.clientType}|${row.appVersion ?? ""}|${row.kind}|${surface}`;
    const bucket = buckets.get(key) ?? {
      row: {
        appVersion: row.appVersion ?? "",
        clientType: row.clientType,
        count: 0,
        date,
        kind: row.kind,
        p50Ms: null,
        p95Ms: null,
        p99Ms: null,
        surface,
      },
      values: [],
    };

    bucket.row.count += 1;

    if (row.valueMs !== null) {
      bucket.values.push(row.valueMs);
    }

    buckets.set(key, bucket);
  }

  return [...buckets.values()].map(({ row, values }) => ({
    ...row,
    p50Ms: percentileMs(values, 50),
    p95Ms: percentileMs(values, 95),
    p99Ms: percentileMs(values, 99),
  }));
}

/**
 * A whole UTC day is summarized and deleted in one transaction. Incrementing
 * outside that transaction would double-count a retry after an upsert crash;
 * deleting by the retention predicate would erase rows this pass never read.
 */
export async function rollUpClientHealthEvents(
  args: { now?: Date } = {},
  client: ClientHealthRollupStore = prisma as unknown as ClientHealthRollupStore,
) {
  const now = args.now ?? new Date();
  const cutoff = utcDayStart(new Date(now.getTime() - CLIENT_HEALTH_RETENTION_DAYS * DAY_MS));

  return client.$transaction(async (tx) => {
    let deleted = 0;
    let summarized = 0;

    for (;;) {
      const firstBatch = await tx.clientHealthEvent.findMany({
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: ROLLUP_BATCH_SIZE,
        where: { createdAt: { lt: cutoff } },
        select: {
          appVersion: true,
          clientType: true,
          createdAt: true,
          id: true,
          kind: true,
          surface: true,
          valueMs: true,
        },
      });

      const first = firstBatch[0];
      if (!first) {
        return { deleted, summarized };
      }

      const dayStart = utcDayStart(first.createdAt);
      const dayEnd = new Date(dayStart.getTime() + DAY_MS);
      const rows = firstBatch.filter((row) => row.createdAt < dayEnd);
      let cursorId = rows.at(-1)?.id;

      if (rows.length === firstBatch.length && firstBatch.length === ROLLUP_BATCH_SIZE) {
        for (;;) {
          const batch = await tx.clientHealthEvent.findMany({
            ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            take: ROLLUP_BATCH_SIZE,
            where: { createdAt: { gte: dayStart, lt: dayEnd } },
            select: {
              appVersion: true,
              clientType: true,
              createdAt: true,
              id: true,
              kind: true,
              surface: true,
              valueMs: true,
            },
          });
          rows.push(...batch);
          cursorId = batch.at(-1)?.id;
          if (batch.length < ROLLUP_BATCH_SIZE) {
            break;
          }
        }
      }

      const summaries = summarizeClientHealthRows(rows);
      for (const summary of summaries) {
        await tx.clientHealthDailySummary.upsert({
          create: summary,
          update: {
            count: { increment: summary.count },
            p50Ms: summary.p50Ms,
            p95Ms: summary.p95Ms,
            p99Ms: summary.p99Ms,
          },
          where: {
            date_clientType_appVersion_kind_surface: {
              appVersion: summary.appVersion,
              clientType: summary.clientType,
              date: summary.date,
              kind: summary.kind,
              surface: summary.surface,
            },
          },
        });
      }

      const ids = rows.map((row) => row.id);
      for (let offset = 0; offset < ids.length; offset += ROLLUP_BATCH_SIZE) {
        const removed = await tx.clientHealthEvent.deleteMany({
          where: { id: { in: ids.slice(offset, offset + ROLLUP_BATCH_SIZE) } },
        });
        deleted += removed.count;
      }
      summarized += summaries.length;
    }
  });
}
