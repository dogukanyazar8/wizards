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
