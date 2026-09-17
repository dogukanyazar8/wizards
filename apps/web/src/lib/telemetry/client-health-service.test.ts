import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ApiError } from "@/lib/api";
import {
  ANONYMOUS_CLIENT_HEALTH_KINDS,
  CLIENT_HEALTH_MAX_BYTES,
  CLIENT_HEALTH_MAX_EVENTS,
  parseClientHealthBatch,
  recordClientHealthEvents,
  type ClientHealthStore,
} from "@/lib/telemetry/client-health-service";

const attribution = {
  appVersion: "0.8.15",
  clientType: "MOBILE" as const,
  os: "iOS",
};

function store() {
  const rows: Array<Record<string, unknown>> = [];

  const client: ClientHealthStore = {
    clientHealthEvent: {
      createMany: async (args) => {
        rows.push(...args.data);
        return { count: args.data.length };
      },
    },
  };

  return { client, rows };
}

function batch(count: number, kind = "STARTUP") {
  return {
    events: Array.from({ length: count }, (_, index) => ({
      kind,
      surface: `screen-${index}`,
      valueMs: 120 + index,
    })),
  };
}

describe("client health ingest limits", () => {
  it("accepts a batch at the cap", () => {
    const parsed = parseClientHealthBatch(batch(CLIENT_HEALTH_MAX_EVENTS));

    assert.equal(parsed.events.length, CLIENT_HEALTH_MAX_EVENTS);
  });

  it("refuses one event past the cap", () => {
    assert.throws(
      () => parseClientHealthBatch(batch(CLIENT_HEALTH_MAX_EVENTS + 1)),
      (error: unknown) => error instanceof ApiError && error.status === 400,
    );
  });

  it("refuses a body larger than the size budget", () => {
    const oversized = {
      events: [{ context: { note: "x".repeat(CLIENT_HEALTH_MAX_BYTES) }, kind: "ERROR" }],
    };

    assert.throws(
      () => parseClientHealthBatch(oversized),
      (error: unknown) => error instanceof ApiError && error.status === 400,
    );
  });

  it("enforces the size budget in UTF-8 bytes, including multibyte context", () => {
    const oversized = { events: [{ kind: "ERROR", context: { note: "界".repeat(12_000) } }] };
    assert.ok(JSON.stringify(oversized).length < CLIENT_HEALTH_MAX_BYTES);
    assert.throws(
      () => parseClientHealthBatch(oversized),
      (error: unknown) => error instanceof ApiError && error.status === 400,
    );
  });

  it("refuses an unknown event kind", () => {
    assert.throws(
      () => parseClientHealthBatch({ events: [{ kind: "SOMETHING_ELSE" }] }),
      (error: unknown) => error instanceof ApiError && error.status === 400,
    );
  });
});

describe("client health attribution", () => {
  it("writes the platform from the request headers, not from the body", async () => {
    const { client, rows } = store();

    await recordClientHealthEvents(
      {
        attribution,
        batch: parseClientHealthBatch({
          events: [{ clientType: "WEB", kind: "STARTUP", valueMs: 900 }],
        }),
        userId: "user-1",
      },
      client,
    );

    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.clientType, "MOBILE");
    assert.equal(rows[0]?.appVersion, "0.8.15");
    assert.equal(rows[0]?.userId, "user-1");
  });

  it("keeps anonymous reports for the kinds that can precede a session", async () => {
    const { client, rows } = store();

    await recordClientHealthEvents(
      {
        attribution,
        batch: parseClientHealthBatch({ events: [{ kind: "CRASH" }] }),
        userId: null,
      },
      client,
    );

    assert.equal(rows[0]?.userId, null);
    assert.deepEqual([...ANONYMOUS_CLIENT_HEALTH_KINDS], ["CRASH", "ERROR"]);
  });

  it("refuses anonymous measurements that a signed-in client should have sent", async () => {
    const { client, rows } = store();

    await assert.rejects(
      () =>
        recordClientHealthEvents(
          {
            attribution,
            batch: parseClientHealthBatch({ events: [{ kind: "API_LATENCY", valueMs: 40 }] }),
            userId: null,
          },
          client,
        ),
      (error: unknown) => error instanceof ApiError && error.status === 401,
    );
    assert.deepEqual(rows, []);
  });
});

/**
 * The reporter keeps a failed batch and retries it, so the same measurement can
 * arrive twice. The client stamps every sample with an id; the unique index turns
 * the second arrival into a no-op instead of a second data point.
 */
describe("client health sample dedupe", () => {
  it("lifts the sample id out of the context and skips duplicates", async () => {
    const calls: {
      data: { context?: unknown; sampleId?: string | null }[];
      skipDuplicates?: boolean;
    }[] = [];
    const store: ClientHealthStore = {
      clientHealthEvent: {
        createMany: async (args) => {
          calls.push(args);
          return { count: args.data.length };
        },
      },
    };

    await recordClientHealthEvents(
      {
        attribution: { appVersion: "0.8.15", clientType: "MOBILE", os: "android" },
        batch: {
          events: [
            {
              context: { route: "ChannelChat", sampleId: "abc-1" },
              kind: "SCREEN_LOAD",
              surface: "channel-messages",
              valueMs: 120,
            },
          ],
        },
        userId: "user-1",
      },
      store,
    );

    const received = calls[0];
    assert.equal(received?.skipDuplicates, true);
    const [row] = received?.data ?? [];
    assert.equal(row?.sampleId, "abc-1");
    // The context keeps the id too: it is what the row was deduped on.
    assert.deepEqual(row?.context, { route: "ChannelChat", sampleId: "abc-1" });
  });

  it("accepts a sample that carries no id", async () => {
    const calls: { data: { sampleId?: string | null }[] }[] = [];
    const store: ClientHealthStore = {
      clientHealthEvent: {
        createMany: async (args) => {
          calls.push(args);
          return { count: args.data.length };
        },
      },
    };

    await recordClientHealthEvents(
      {
        attribution: { appVersion: null, clientType: "MOBILE", os: null },
        batch: { events: [{ kind: "STARTUP", valueMs: 900 }] },
        userId: "user-1",
      },
      store,
    );

    assert.equal(calls[0]?.data[0]?.sampleId, undefined);
  });
});

describe("client health measured values (Ş0.2)", () => {
  function screenShareBatch() {
    // One K16 window as the web reporter ships it: nine send-side rows with the
    // build/platform slices the mobile bridge adds.
    const context = {
      appVersion: "0.9.0",
      buildId: "2026.09.17-1",
      deviceTier: "mid",
      direction: "send",
      environment: "uat",
      networkClass: "wifi",
      osName: "Android",
      osVersion: "14",
      phase: "interval",
      sampleCount: 30,
      windowMs: 60_000,
    };
    const rows: Array<[string, string, number]> = [
      ["screen_share.send.fps", "fps", 58.5],
      ["screen_share.send.bitrate_kbps", "kbps", 5_900],
      ["screen_share.send.height", "count", 1080],
      ["screen_share.send.limit_cpu_pct", "pct", 12.5],
      ["screen_share.send.limit_bw_pct", "pct", 0],
      ["screen_share.encoder", "count", 1],
      ["screen_share.recv.fps", "fps", 30],
      ["screen_share.recv.freeze_count", "count", 2],
      ["screen_share.recv.jitter_buffer_ms", "ms", 42],
    ];

    return {
      events: rows.map(([surface, unit, value]) => ({
        context: { ...context, sampleId: `s:1:${surface}` },
        kind: "API_LATENCY",
        surface,
        unit,
        value,
      })),
    };
  }

  it("still parses a batch that only carries valueMs", () => {
    const parsed = parseClientHealthBatch({ events: [{ kind: "STARTUP", valueMs: 820 }] });

    assert.deepEqual(parsed.events, [{ kind: "STARTUP", valueMs: 820 }]);
  });

  it("accepts a value with its unit and refuses one without the other", () => {
    const parsed = parseClientHealthBatch(screenShareBatch());

    assert.equal(parsed.events.length, 9);
    assert.equal(parsed.events[0]?.unit, "fps");
    assert.equal(parsed.events[0]?.value, 58.5);

    for (const broken of [
      { kind: "API_LATENCY", surface: "screen_share.send.fps", value: 58 },
      { kind: "API_LATENCY", surface: "screen_share.send.fps", unit: "fps" },
      { kind: "API_LATENCY", surface: "screen_share.send.fps", unit: "frames", value: 58 },
      { kind: "API_LATENCY", surface: "screen_share.send.fps", unit: "fps", value: -1 },
      { kind: "API_LATENCY", surface: "screen_share.send.fps", unit: "fps", value: Number.NaN },
    ]) {
      assert.throws(
        () => parseClientHealthBatch({ events: [broken] }),
        (error: unknown) => error instanceof ApiError && error.status === 400,
        JSON.stringify(broken),
      );
    }
  });

  it("keeps the value and unit in the context and mirrors milliseconds into valueMs", async () => {
    const { client, rows } = store();

    await recordClientHealthEvents(
      {
        attribution,
        batch: {
          events: [
            {
              context: { sampleId: "a" },
              kind: "API_LATENCY",
              surface: "screen_share.send.fps",
              unit: "fps",
              value: 58.5,
            },
            {
              context: { sampleId: "b" },
              kind: "API_LATENCY",
              surface: "screen_share.recv.jitter_buffer_ms",
              unit: "ms",
              value: 41.6,
            },
            { kind: "STARTUP", surface: "startup", valueMs: 900 },
          ],
        },
        userId: "user-1",
      },
      client,
    );

    const [fps, jitter, startup] = rows;
    assert.deepEqual(fps?.context, { sampleId: "a", unit: "fps", value: 58.5 });
    assert.equal(fps?.valueMs, undefined);
    assert.deepEqual(jitter?.context, { sampleId: "b", unit: "ms", value: 41.6 });
    assert.equal(jitter?.valueMs, 42);
    assert.equal(startup?.valueMs, 900);
    assert.equal(startup?.context, undefined);
  });

  it("fits a full K16 window well inside the 32 KiB budget", () => {
    const encoded = JSON.stringify(screenShareBatch());

    assert.ok(encoded.length < CLIENT_HEALTH_MAX_BYTES / 8, `${encoded.length} bytes`);
    assert.doesNotThrow(() => parseClientHealthBatch(screenShareBatch()));
  });
});
