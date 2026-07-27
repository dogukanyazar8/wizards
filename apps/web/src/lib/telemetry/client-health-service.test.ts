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
