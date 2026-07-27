import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Prisma } from "@wizards/db";
import {
  UNKNOWN_ATTRIBUTION,
  resolveVerifiedAttribution,
  type ClientAttribution,
} from "@/lib/analytics/client-attribution";
import {
  getUtcDayStart,
  incrementMetricAcrossInterval,
  incrementUserDailyMetric,
  splitIntervalByUtcDay,
} from "@/lib/analytics/service";

const MOBILE: ClientAttribution = { appVersion: "0.8.15", clientType: "MOBILE" };

function metricClient() {
  const upserts: Prisma.UserDailyMetricUpsertArgs[] = [];

  return {
    client: {
      userDailyMetric: {
        upsert: async (args: Prisma.UserDailyMetricUpsertArgs) => {
          upserts.push(args);
          return undefined;
        },
      },
    },
    upserts,
  };
}

describe("analytics service date helpers", () => {
  it("normalizes metric dates to UTC day starts", () => {
    assert.equal(
      getUtcDayStart(new Date("2026-05-12T21:45:00.000Z")).toISOString(),
      "2026-05-12T00:00:00.000Z",
    );
  });

  it("splits usage intervals across UTC days", () => {
    const segments = splitIntervalByUtcDay(
      new Date("2026-05-12T23:59:30.000Z"),
      new Date("2026-05-13T00:00:30.000Z"),
    );

    assert.deepEqual(
      segments.map((segment) => ({
        date: segment.date.toISOString(),
        seconds: segment.seconds,
      })),
      [
        { date: "2026-05-12T00:00:00.000Z", seconds: 30 },
        { date: "2026-05-13T00:00:00.000Z", seconds: 30 },
      ],
    );
  });
});

describe("daily metric attribution", () => {
  it("keys the row by client so one user can hold two platforms in a day", async () => {
    const { client, upserts } = metricClient();

    await incrementUserDailyMetric(
      "user-1",
      { messageCount: 1 },
      MOBILE,
      new Date("2026-05-12T21:45:00.000Z"),
      client,
    );

    assert.deepEqual(upserts[0]?.where, {
      date_userId_clientType: {
        clientType: "MOBILE",
        date: new Date("2026-05-12T00:00:00.000Z"),
        userId: "user-1",
      },
    });
    assert.equal(upserts[0]?.create.clientType, "MOBILE");
    assert.equal(upserts[0]?.create.appVersion, "0.8.15");
  });

  it("records the last version seen that day, and never erases a known one", async () => {
    const known = metricClient();
    await incrementUserDailyMetric("user-1", { messageCount: 1 }, MOBILE, new Date(), known.client);

    assert.equal(known.upserts[0]?.update.appVersion, "0.8.15");

    const missing = metricClient();
    await incrementUserDailyMetric(
      "user-1",
      { messageCount: 1 },
      { appVersion: null, clientType: "MOBILE" },
      new Date(),
      missing.client,
    );

    assert.equal(missing.upserts[0]?.update.appVersion, undefined);
  });

  it("writes the same attribution to both days of a session that crosses midnight", async () => {
    const { client, upserts } = metricClient();

    await incrementMetricAcrossInterval(
      "user-1",
      new Date("2026-05-12T23:59:30.000Z"),
      new Date("2026-05-13T00:00:30.000Z"),
      "appSeconds",
      MOBILE,
      client,
    );

    assert.equal(upserts.length, 2);
    assert.deepEqual(
      upserts.map((upsert) => [
        (upsert.where.date_userId_clientType as { date: Date }).date.toISOString(),
        upsert.create.clientType,
        upsert.create.appVersion,
      ]),
      [
        ["2026-05-12T00:00:00.000Z", "MOBILE", "0.8.15"],
        ["2026-05-13T00:00:00.000Z", "MOBILE", "0.8.15"],
      ],
    );
  });
});

describe("historical attribution cutoff", () => {
  it("reports a guessed session as UNKNOWN instead of trusting its stored client", () => {
    assert.deepEqual(
      resolveVerifiedAttribution({
        appVersion: null,
        attributionVerified: false,
        clientType: "WEB",
      }),
      UNKNOWN_ATTRIBUTION,
    );
  });

  it("trusts a session that identified itself", () => {
    assert.deepEqual(
      resolveVerifiedAttribution({
        appVersion: "0.8.15",
        attributionVerified: true,
        clientType: "MOBILE",
      }),
      MOBILE,
    );
  });
});
