import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  percentileMs,
  readClientHealthMeasuredUnit,
  readClientHealthMeasuredValue,
  rollUpClientHealthEvents,
  summarizeClientHealthRows,
  summarizeScreenShareHealthRows,
  type ClientHealthRawRow,
  type ClientHealthRollupStore,
  type ClientHealthSummaryRow,
} from "@/lib/telemetry/client-health-rollup";

const NOW = new Date("2026-07-27T12:00:00.000Z");

function rawRow(overrides: Partial<ClientHealthRawRow> = {}): ClientHealthRawRow {
  return {
    id: "event-1",
    appVersion: "0.8.15",
    clientType: "MOBILE",
    createdAt: new Date("2026-06-01T08:00:00.000Z"),
    kind: "STARTUP",
    surface: null,
    valueMs: 500,
    ...overrides,
  };
}

function store(rows: ClientHealthRawRow[]) {
  const upserts: ClientHealthSummaryRow[] = [];
  const deletes: Date[] = [];
  let remaining = [...rows];

  const client: ClientHealthRollupStore = {
    $transaction: async (operation) => operation(client),
    clientHealthDailySummary: {
      upsert: async (args) => {
        upserts.push(args.create as ClientHealthSummaryRow);
      },
    },
    clientHealthEvent: {
      deleteMany: async (args) => {
        const ids = ((args.where?.id as { in?: string[] } | undefined)?.in ?? []) as string[];
        const deleted = new Set(ids);
        const count = remaining.filter((row) => deleted.has(row.id)).length;
        remaining = remaining.filter((row) => !deleted.has(row.id));
        return { count };
      },
      findMany: async (args) => {
        const createdAt = args.where?.createdAt as { lt?: Date } | undefined;
        if (createdAt?.lt) {
          deletes.push(createdAt.lt);
        }
        return remaining;
      },
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
  it("increments an existing UTC-day count instead of replacing it", async () => {
    let update: unknown;
    const { client } = store([rawRow()]);
    client.clientHealthDailySummary.upsert = async (args) => {
      update = args.update;
    };

    await rollUpClientHealthEvents({ now: NOW }, client);

    assert.deepEqual(update, {
      count: { increment: 1 },
      p50Ms: 500,
      p95Ms: 500,
      p99Ms: 500,
    });
  });

  it("pages through a large UTC day and deletes exactly the summarized ids", async () => {
    const rows = Array.from({ length: 10_001 }, (_, index) =>
      rawRow({ id: `event-${index + 1}`, valueMs: index + 1 }),
    );
    let remaining = [...rows];
    const deletedIds: string[] = [];
    let reads = 0;
    let upserts = 0;
    const { client } = store([]);

    client.clientHealthEvent.findMany = async (args) => {
      reads += 1;
      const cursorId = (args.cursor as { id?: string } | undefined)?.id;
      const start = cursorId ? remaining.findIndex((row) => row.id === cursorId) + 1 : 0;
      return remaining.slice(start, start + Number(args.take ?? remaining.length));
    };
    client.clientHealthEvent.deleteMany = async (args) => {
      const ids = (args.where?.id as { in?: string[] } | undefined)?.in ?? [];
      deletedIds.push(...ids);
      const deleted = new Set(ids);
      remaining = remaining.filter((row) => !deleted.has(row.id));
      return { count: ids.length };
    };
    client.clientHealthDailySummary.upsert = async () => {
      upserts += 1;
    };

    const result = await rollUpClientHealthEvents({ now: NOW }, client);

    assert.equal(reads, 4);
    assert.equal(upserts, 1);
    assert.equal(result.deleted, 10_001);
    assert.equal(new Set(deletedIds).size, 10_001);
    assert.equal(deletedIds.includes("event-10001"), true);
  });

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
    assert.equal(deletes[0]?.toISOString(), "2026-06-27T00:00:00.000Z");
  });

  it("does nothing when no row is old enough", async () => {
    const { client, deletes, upserts } = store([]);

    const result = await rollUpClientHealthEvents({ now: NOW }, client);

    assert.deepEqual(result, { deleted: 0, summarized: 0 });
    assert.deepEqual(upserts, []);
    assert.deepEqual(deletes, [new Date("2026-06-27T00:00:00.000Z")]);
  });
});

/**
 * A percentile pooled across surfaces is not actionable: a slow conversation hides
 * behind a fast inbox when both are just "SCREEN_LOAD".
 */
describe("client health rollup keeps surfaces apart", () => {
  const createdAt = new Date("2026-07-28T09:00:00.000Z");

  function row(surface: string | null, valueMs: number): ClientHealthRawRow {
    return {
      appVersion: "0.8.15",
      clientType: "MOBILE",
      createdAt,
      id: `surface-${surface ?? "none"}-${valueMs}`,
      kind: "SCREEN_LOAD",
      surface,
      valueMs,
    };
  }

  it("buckets by surface and reports p50, p95 and p99", () => {
    const summaries = summarizeClientHealthRows([
      ...Array.from({ length: 100 }, (_, index) => row("dm-messages", index + 1)),
      row("dm-inbox", 5),
    ]);

    const dmMessages = summaries.find((summary) => summary.surface === "dm-messages");
    const inbox = summaries.find((summary) => summary.surface === "dm-inbox");

    assert.equal(summaries.length, 2);
    assert.equal(dmMessages?.count, 100);
    assert.equal(dmMessages?.p50Ms, 50);
    assert.equal(dmMessages?.p95Ms, 95);
    assert.equal(dmMessages?.p99Ms, 99);
    assert.equal(inbox?.count, 1);
    assert.equal(inbox?.p99Ms, 5);
  });

  it("puts surfaceless kinds in one bucket rather than inventing a name", () => {
    const summaries = summarizeClientHealthRows([row(null, 10), row(null, 20)]);

    assert.equal(summaries.length, 1);
    assert.equal(summaries[0]?.surface, "");
    assert.equal(summaries[0]?.count, 2);
  });
});

describe("client health measured values (Ş0.2)", () => {
  function fpsRow(value: number, overrides: Partial<ClientHealthRawRow> = {}) {
    return rawRow({
      context: { unit: "fps", value },
      kind: "API_LATENCY",
      surface: "screen_share.send.fps",
      valueMs: null,
      ...overrides,
    });
  }

  it("reads valueMs first and the context value as the fallback", () => {
    assert.equal(readClientHealthMeasuredValue(rawRow({ valueMs: 500 })), 500);
    assert.equal(readClientHealthMeasuredValue(fpsRow(58.5)), 58.5);
    assert.equal(readClientHealthMeasuredValue(rawRow({ valueMs: null })), null);
    assert.equal(
      readClientHealthMeasuredValue(rawRow({ context: { value: "58" }, valueMs: null })),
      null,
    );
    assert.equal(readClientHealthMeasuredValue(rawRow({ context: [1, 2], valueMs: null })), null);

    assert.equal(readClientHealthMeasuredUnit(fpsRow(58.5)), "fps");
    assert.equal(readClientHealthMeasuredUnit(rawRow({ valueMs: 500 })), "ms");
    assert.equal(readClientHealthMeasuredUnit(rawRow({ valueMs: null })), null);
    assert.equal(
      readClientHealthMeasuredUnit(
        rawRow({ context: { unit: "furlongs", value: 1 }, valueMs: null }),
      ),
      null,
    );
  });

  it("rolls a context value into the same percentile columns, keyed apart by surface", () => {
    const summaries = summarizeClientHealthRows([
      fpsRow(60, { id: "1" }),
      fpsRow(58, { id: "2" }),
      fpsRow(30, { id: "3" }),
      fpsRow(59, { id: "4" }),
      rawRow({ id: "5", valueMs: 700 }),
    ]);

    const fps = summaries.find((summary) => summary.surface === "screen_share.send.fps");
    const startup = summaries.find((summary) => summary.kind === "STARTUP");

    assert.equal(fps?.count, 4);
    assert.equal(fps?.p50Ms, 58);
    assert.equal(fps?.p95Ms, 60);
    assert.equal(fps?.p99Ms, 60);
    assert.equal(startup?.p50Ms, 700);
  });

  it("summarizes screen share rows per metric with their unit and ignores other surfaces", () => {
    const rows = summarizeScreenShareHealthRows([
      fpsRow(60),
      fpsRow(58),
      fpsRow(30),
      rawRow({
        context: { unit: "kbps", value: 5_900 },
        surface: "screen_share.send.bitrate_kbps",
        valueMs: null,
      }),
      rawRow({
        context: { unit: "count", value: 2 },
        surface: "screen_share.encoder",
        valueMs: null,
      }),
      rawRow({ context: { phase: "start" }, surface: "screen_share.encoder", valueMs: null }),
      rawRow({ surface: "dm-inbox", valueMs: 140 }),
      rawRow({ surface: null, valueMs: 140 }),
    ]);

    assert.deepEqual(rows, [
      { count: 2, metric: "screen_share.encoder", p50: 2, p95: 2, unit: "count" },
      { count: 1, metric: "screen_share.send.bitrate_kbps", p50: 5_900, p95: 5_900, unit: "kbps" },
      { count: 3, metric: "screen_share.send.fps", p50: 58, p95: 60, unit: "fps" },
    ]);
    assert.deepEqual(summarizeScreenShareHealthRows([]), []);
  });
});
