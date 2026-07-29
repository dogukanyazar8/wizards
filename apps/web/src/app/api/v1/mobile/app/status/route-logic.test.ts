import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiError } from "@/lib/api";
import { getMobileServiceStatus } from "@/lib/app/service-status";
import type { ReadinessPayload } from "@/lib/health";

const routes = import("./route-logic");

const checkedAt = "2026-07-29T09:00:00.000Z";

function readiness(overrides: Partial<ReadinessPayload> = {}): ReadinessPayload {
  return {
    checks: { database: "ok", redis: "ok" },
    status: "ok",
    timestamp: checkedAt,
    ...overrides,
  };
}

/** Exercises the real reduction rather than a stub of its answer. */
function statusFrom(getReadiness: () => Promise<ReadinessPayload>) {
  return () =>
    getMobileServiceStatus({
      getReadiness,
      now: () => new Date(checkedAt),
      statusUrl: "https://status.whispr.team",
    });
}

function request() {
  return new Request("https://whispr.test/api/v1/mobile/app/status", { method: "GET" });
}

function dependencies(
  getReadiness: () => Promise<ReadinessPayload>,
  overrides: Record<string, unknown> = {},
): Parameters<Awaited<typeof routes>["mobileServiceStatusRoute"]>[1] {
  return {
    authenticate: async () => "user-1",
    enforceRateLimit: async () => undefined,
    getStatus: statusFrom(getReadiness),
    ...overrides,
  } as Parameters<Awaited<typeof routes>["mobileServiceStatusRoute"]>[1];
}

describe("mobile service status route", () => {
  it("reports ok when every dependency answers", async () => {
    const { mobileServiceStatusRoute } = await routes;
    const response = await mobileServiceStatusRoute(
      request(),
      dependencies(async () => readiness()),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      checkedAt,
      level: "ok",
      url: "https://status.whispr.team",
    });
  });

  it("reports degraded when a dependency is down but the app still answers", async () => {
    const { mobileServiceStatusRoute } = await routes;
    const response = await mobileServiceStatusRoute(
      request(),
      dependencies(async () =>
        readiness({ checks: { database: "ok", redis: "error" }, status: "error" }),
      ),
    );
    const payload = (await response.json()) as { level: string };

    // This request was served, so "Kesinti" would be a lie.
    assert.equal(payload.level, "degraded");
  });

  it("reports down when the readiness probe itself never completes", async () => {
    const { mobileServiceStatusRoute } = await routes;
    const response = await mobileServiceStatusRoute(
      request(),
      dependencies(async () => {
        throw new Error("probe timed out");
      }),
    );
    const payload = (await response.json()) as { level: string };

    assert.equal(response.status, 200);
    assert.equal(payload.level, "down");
  });

  it("never sends a display label the client cannot translate", async () => {
    const { mobileServiceStatusRoute } = await routes;
    const response = await mobileServiceStatusRoute(
      request(),
      dependencies(async () => readiness()),
    );

    assert.deepEqual(Object.keys((await response.json()) as object).sort(), [
      "checkedAt",
      "level",
      "url",
    ]);
  });

  it("requires a session and its own rate action", async () => {
    const { mobileServiceStatusRoute } = await routes;
    const actions: string[] = [];

    const allowed = await mobileServiceStatusRoute(
      request(),
      dependencies(async () => readiness(), {
        enforceRateLimit: async (_userId: string, action: string) => {
          actions.push(action);
        },
      }),
    );
    assert.equal(allowed.status, 200);
    assert.deepEqual(actions, ["mobile:app:status"]);

    const unauthenticated = await mobileServiceStatusRoute(
      request(),
      dependencies(async () => readiness(), {
        authenticate: async () => {
          throw new ApiError("Unauthorized", 401, "UNAUTHORIZED");
        },
      }),
    );
    assert.equal(unauthenticated.status, 401);
  });
});
