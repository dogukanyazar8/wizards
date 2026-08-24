import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { API_RATE_LIMITS } from "@/lib/api-rate-limit";
import {
  UNAUTHENTICATED,
  createFakeDatabase,
  readJson,
  recordRateLimit,
} from "@/lib/home/home-test-doubles";
import { updateHomePresence } from "@/lib/home/presence-service";
import { PresenceUpdateBodySchema, PresenceUpdateResponseSchema } from "@/lib/home/types";

import { presenceUpdateRoute, type PresenceUpdateRouteDependencies } from "./route-logic";

const NOW = new Date("2026-08-19T09:00:00.000Z");

function presenceDatabase(user: Record<string, unknown> | null = {}) {
  return createFakeDatabase({
    models: {
      user: {
        findUnique: () =>
          user === null
            ? null
            : {
                id: "u1",
                status: "ONLINE",
                statusExpiresAt: null,
                statusFocusMinutes: null,
                statusRestoreTo: null,
                ...user,
              },
        update: (args: unknown) => args,
      },
    },
  });
}

function presenceRequest(body: unknown) {
  return new Request("https://whispr.test/api/v1/users/me/presence", {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method: "PATCH",
  });
}

function routeDependencies(
  overrides: Partial<PresenceUpdateRouteDependencies> = {},
): PresenceUpdateRouteDependencies {
  return {
    authenticate: () => Promise.resolve("u1"),
    enforceRateLimit: () => Promise.resolve(),
    parseBody: (request) =>
      request.json().then((body: unknown) => PresenceUpdateBodySchema.parse(body)),
    updatePresence: () => Promise.resolve({ focus: null, presence: "ONLINE" as const }),
    ...overrides,
  };
}

describe("PATCH /api/v1/users/me/presence", () => {
  it("opens a focus window and remembers where to return", async () => {
    const { calls, database } = presenceDatabase({ status: "IDLE" });
    const announced: unknown[] = [];

    const result = PresenceUpdateResponseSchema.parse(
      await updateHomePresence(
        "u1",
        { focus: { enabled: true, minutes: 25 } },
        {
          broadcast: (input) => {
            announced.push(input);
            return Promise.resolve();
          },
          database,
          now: NOW,
        },
      ),
    );

    assert.deepEqual(result, {
      focus: {
        active: true,
        expiresAt: "2026-08-19T09:25:00.000Z",
        minutesLeft: 25,
        totalMinutes: 25,
      },
      presence: "DND",
    });
    const update = calls.find((call) => call.operation === "user.update")?.args as {
      data?: Record<string, unknown>;
    };
    assert.deepEqual(update?.data, {
      status: "DND",
      statusExpiresAt: new Date("2026-08-19T09:25:00.000Z"),
      statusFocusMinutes: 25,
      statusRestoreTo: "IDLE",
    });
    assert.deepEqual(announced, [{ status: "DND", userId: "u1" }]);
  });

  it("rejects a request without a session", async () => {
    const response = await presenceUpdateRoute(
      presenceRequest({ presence: "ONLINE" }),
      routeDependencies({ authenticate: UNAUTHENTICATED }),
    );

    assert.equal(response.status, 401);
    assert.deepEqual(await readJson(response), { error: "Unauthorized" });
  });

  it("can only ever write the caller's own row", async () => {
    const { calls, database } = presenceDatabase();

    await updateHomePresence(
      "u1",
      { presence: "DND" },
      { broadcast: () => Promise.resolve(), database, now: NOW },
    );

    for (const call of calls) {
      const where = (call.args as { where?: { id?: string } })?.where;
      assert.equal(where?.id, "u1", "no query may name another account");
    }
  });

  it("stores Görünmez as OFFLINE, the way the rest of the app reads it", async () => {
    const { calls, database } = presenceDatabase();

    const result = await updateHomePresence(
      "u1",
      { presence: "INVISIBLE" },
      { broadcast: () => Promise.resolve(), database, now: NOW },
    );

    const update = calls.find((call) => call.operation === "user.update")?.args as {
      data?: { status?: string };
    };
    assert.equal(update?.data?.status, "OFFLINE");
    assert.equal(result.presence, "OFFLINE");
  });

  it("is idempotent: the same body twice does not extend the window", async () => {
    const first = presenceDatabase({ status: "IDLE" });
    await updateHomePresence(
      "u1",
      { focus: { enabled: true, minutes: 25 } },
      { broadcast: () => Promise.resolve(), database: first.database, now: NOW },
    );

    const second = presenceDatabase({
      status: "DND",
      statusExpiresAt: new Date("2026-08-19T09:25:00.000Z"),
      statusFocusMinutes: 25,
      statusRestoreTo: "IDLE",
    });
    const announced: unknown[] = [];
    const result = await updateHomePresence(
      "u1",
      { focus: { enabled: true, minutes: 25 } },
      {
        broadcast: (input) => {
          announced.push(input);
          return Promise.resolve();
        },
        database: second.database,
        now: new Date("2026-08-19T09:05:00.000Z"),
      },
    );

    assert.ok(!second.calls.some((call) => call.operation === "user.update"));
    assert.deepEqual(announced, []);
    assert.deepEqual(result.focus, {
      active: true,
      expiresAt: "2026-08-19T09:25:00.000Z",
      minutesLeft: 20,
      totalMinutes: 25,
    });
  });

  it("is registered in the rate limit table and charged before any work", async () => {
    assert.deepEqual(API_RATE_LIMITS["user:presence:update"], { limit: 30, windowSeconds: 60 });

    const recorded: string[] = [];
    await presenceUpdateRoute(
      presenceRequest({ presence: "ONLINE" }),
      routeDependencies({ enforceRateLimit: recordRateLimit(recorded) }),
    );

    assert.deepEqual(recorded, ["user:presence:update"]);
  });

  it("costs two queries and refuses a body it does not understand", async () => {
    const fake = presenceDatabase();
    await updateHomePresence(
      "u1",
      { presence: "DND" },
      { broadcast: () => Promise.resolve(), database: fake.database, now: NOW },
    );
    assert.equal(fake.queryCount(), 2);

    for (const body of [{}, { focus: { enabled: true, minutes: 3 } }, { presence: "BUSY" }]) {
      const response = await presenceUpdateRoute(presenceRequest(body), routeDependencies());
      assert.equal(response.status, 400);
      const payload = await readJson(response);
      assert.ok(!JSON.stringify(payload).includes("statusRestoreTo"));
    }
  });

  it("repo istemcilerinin göndermediği presence + focus birleşik body'yi reddeder", async () => {
    const response = await presenceUpdateRoute(
      presenceRequest({
        focus: { enabled: true, minutes: 25 },
        presence: "IDLE",
      }),
      routeDependencies(),
    );

    assert.equal(response.status, 400);
  });
});
