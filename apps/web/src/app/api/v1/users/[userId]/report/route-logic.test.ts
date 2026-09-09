import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiError } from "@/lib/api";
import type { ApiRateLimitAction } from "@/lib/api-rate-limit";

import { userReportRoute, type UserReportRouteDependencies } from "./route-logic";

type Recorded = { limits: ApiRateLimitAction[]; reports: unknown[] };

function dependencies(overrides: Partial<UserReportRouteDependencies> = {}): {
  dependencies: UserReportRouteDependencies;
  recorded: Recorded;
} {
  const recorded: Recorded = { limits: [], reports: [] };

  return {
    recorded,
    dependencies: {
      authenticate: async () => "user-1",
      createReport: async (input) => {
        recorded.reports.push(input);
        return { reportId: "report-1" };
      },
      enforceRateLimit: async (_userId, action) => {
        recorded.limits.push(action);
      },
      ...overrides,
    },
  };
}

function post(body: unknown, subjectId = "user-2") {
  return {
    context: { params: Promise.resolve({ userId: subjectId }) },
    request: new Request(`https://whispr.test/api/v1/users/${subjectId}/report`, {
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
      method: "POST",
    }),
  };
}

/** Karar K12 — §15.5's `Bildir` row. */
describe("web user report route", () => {
  it("files the case under a narrow per-user bucket", async () => {
    const { dependencies: deps, recorded } = dependencies();
    const { context, request } = post({ details: "spam links", reason: "spam" });

    const response = await userReportRoute(request, context, deps);

    assert.equal(response.status, 200);
    assert.deepEqual(recorded.limits, ["users:report"]);
    assert.deepEqual(recorded.reports, [
      { details: "spam links", reason: "SPAM", reporterId: "user-1", subjectId: "user-2" },
    ]);
  });

  // Nothing about the reported account may travel back: the response is a
  // receipt, not a lookup anyone holding a user id can trigger.
  it("answers with the report id and nothing else", async () => {
    const { dependencies: deps } = dependencies();
    const { context, request } = post({ reason: "harassment" });

    assert.deepEqual(await (await userReportRoute(request, context, deps)).json(), {
      reportId: "report-1",
    });
  });

  it("refuses a self-report before anything is written", async () => {
    const { dependencies: deps, recorded } = dependencies({
      createReport: async () => {
        throw new ApiError("Cannot report yourself", 400, "SELF_REPORT");
      },
    });
    const { context, request } = post({ reason: "spam" }, "user-1");

    const response = await userReportRoute(request, context, deps);

    assert.equal(response.status, 400);
    assert.deepEqual(recorded.reports, []);
  });

  it("stops at the rate limit without touching the moderation queue", async () => {
    const { dependencies: deps, recorded } = dependencies({
      enforceRateLimit: async () => {
        throw new ApiError("Too many requests", 429, "RATE_LIMITED");
      },
    });
    const { context, request } = post({ reason: "spam" });

    const response = await userReportRoute(request, context, deps);

    assert.equal(response.status, 429);
    assert.deepEqual(recorded.reports, []);
  });

  it("refuses a reason outside the contract", async () => {
    const { dependencies: deps, recorded } = dependencies();
    const { context, request } = post({ reason: "because" });

    const response = await userReportRoute(request, context, deps);

    assert.equal(response.status, 400);
    assert.deepEqual(recorded.reports, []);
  });

  it("does not rate-limit or write when authentication fails", async () => {
    const { dependencies: deps, recorded } = dependencies({
      authenticate: async () => {
        throw new ApiError("Unauthorized", 401, "UNAUTHORIZED");
      },
    });
    const { context, request } = post({ reason: "spam" });

    const response = await userReportRoute(request, context, deps);

    assert.equal(response.status, 401);
    assert.deepEqual(recorded.limits, []);
    assert.deepEqual(recorded.reports, []);
  });
});
