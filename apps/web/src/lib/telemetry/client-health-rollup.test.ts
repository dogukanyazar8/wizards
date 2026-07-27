import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CLIENT_HEALTH_RETENTION_DAYS,
  percentileMs,
  rollUpClientHealthEvents,
  summarizeClientHealthRows,
  type ClientHealthRawRow,
  type ClientHealthRollupStore,
  type ClientHealthSummaryRow,
} from "@/lib/telemetry/client-health-rollup";

const NOW = new Date("2026-07-27T12:00:00.000Z");

function rawRow(overrides: Partial<ClientHealthRawRow> = {}): ClientHealthRawRow {
  return {
    appVersion: "0.8.15",
    clientType: "MOBILE",
    createdAt: new Date("2026-06-01T08:00:00.000Z"),
    kind: "STARTUP",
    valueMs: 500,
    ...overrides,
  };
}

function store(rows: ClientHealthRawRow[]) {
  const upserts: ClientHealthSummaryRow[] = [];
  const deletes: Date[] = [];

  const client: ClientHealthRollupStore = {
    clientHealthDailySummary: {
      upsert: async (args) => {
        upserts.push(args.create as ClientHealthSummaryRow);
      },
    },
    clientHealthEvent: {
      deleteMany: async (args) => {
        const createdAt = args.where?.createdAt as { lt: Date };
        deletes.push(createdAt.lt);
        return { count: rows.length };
      },
      findMany: async () => rows,
    },
  };

  return { client, deletes, upserts };
}

describe("client health percentiles", () => {
  it("uses the nearest rank so a small sample is not invented", () => {
    assert.equal(percentileMs([100, 200, 300, 400], 50), 200);
    assert.equal(percentileMs([100, 200, 300, 400], 95), 400);
    assert.equal(percentileMs([], 50), null);
  });
});

describe("client health rollup", () => {
  it("groups a day, platform, version and kind into one row", () => {
    const summaries = summarizeClientHealthRows([
      rawRow({ createdAt: new Date("2026-06-01T08:00:00.000Z"), valueMs: 100 }),
      rawRow({ createdAt: new Date("2026-06-01T23:30:00.000Z"), valueMs: 300 }),
      rawRow({ createdAt: new Date("2026-06-02T01:00:00.000Z"), valueMs: 900 }),
      rawRow({ clientType: "WEB", createdAt: new Date("2026-06-01T09:00:00.000Z"), valueMs: 50 }),
    ]);

    assert.equal(summaries.length, 3);

    const firstDay = summaries.find(
      (summary) =>
        summary.clientType === "MOBILE" &&
        summary.date.toISOString() === "2026-06-01T00:00:00.000Z",
    );

    assert.equal(firstDay?.count, 2);
    assert.equal(firstDay?.p50Ms, 100);
    assert.equal(firstDay?.p95Ms, 300);
  });

  it("counts events that carry no measurement without faking a latency", () => {
    const [summary] = summarizeClientHealthRows([rawRow({ kind: "CRASH", valueMs: null })]);

    assert.equal(summary?.count, 1);
    assert.equal(summary?.p50Ms, null);
    assert.equal(summary?.p95Ms, null);
  });

  it("summarizes before deleting and cuts at the retention boundary", async () => {
    const { client, deletes, upserts } = store([rawRow()]);

    const result = await rollUpClientHealthEvents({ now: NOW }, client);

    assert.equal(upserts.length, 1);
    assert.equal(result.deleted, 1);
    assert.equal(
      deletes[0]?.toISOString(),
      new Date(NOW.getTime() - CLIENT_HEALTH_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString(),
    );
  });

  it("does nothing when no row is old enough", async () => {
    const { client, deletes, upserts } = store([]);

    const result = await rollUpClientHealthEvents({ now: NOW }, client);

    assert.deepEqual(result, { deleted: 0, summarized: 0 });
    assert.deepEqual(upserts, []);
    assert.deepEqual(deletes, []);
  });
});
