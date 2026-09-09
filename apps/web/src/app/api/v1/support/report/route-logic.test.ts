import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiError, parseJsonBody } from "@/lib/api";
import {
  submitMobileBugReport,
  type MobileBugReportServiceDependencies,
} from "@/lib/support/bug-report-service";

const routes = import("./route-logic");

const submittedAt = new Date("2026-08-26T09:00:00.000Z");

const submission = {
  appBuild: "1187",
  appVersion: "2.4.1",
  body: "Ses kanalına girince mikrofon bir dakika sonra kendiliğinden kapanıyor.",
  category: "voice",
  deviceInfo: { deviceModel: "Chrome 128", locale: "tr", osName: "macOS", osVersion: "14.5" },
  includesDeviceInfo: true,
  includesLogs: true,
  includesScreenshot: false,
  logExcerpt: "line-1\nline-2",
  platform: "web",
  releaseChannel: "stable",
};

type Written = Record<string, unknown>;

function service(written: Written[]): MobileBugReportServiceDependencies {
  return {
    createBugReport: async (data) => {
      written.push(data as Written);
      return { createdAt: submittedAt };
    },
    createBugReportWithScreenshotClaim: async (data) => {
      written.push(data as Written);
      return { createdAt: submittedAt };
    },
    deleteExpiredBugReports: async () => ({ count: 0 }),
    isUniqueTicketViolation: (error) =>
      typeof error === "object" && error !== null && "code" in error && error.code === "P2002",
    now: () => submittedAt,
    randomTicketSequence: () => 24_817,
  };
}

function request(body?: unknown) {
  return new Request("https://whispr.test/api/v1/support/report", {
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
}

type RouteDependencies = Parameters<Awaited<typeof routes>["supportReportSubmitRoute"]>[1];

function dependencies(
  written: Written[],
  overrides: Partial<RouteDependencies> = {},
): RouteDependencies {
  return {
    authenticate: async () => "user-1",
    enforceRateLimit: async () => undefined,
    parseBody: parseJsonBody,
    submitReport: (input) => submitMobileBugReport(input, service(written)),
    ...overrides,
  } as RouteDependencies;
}

describe("web bug report route", () => {
  it("writes the session user's report and answers with a WSP ticket", async () => {
    const { supportReportSubmitRoute } = await routes;
    const written: Written[] = [];
    const response = await supportReportSubmitRoute(request(submission), dependencies(written));
    const payload = (await response.json()) as { createdAt: string; ticket: string };

    assert.equal(response.status, 201);
    assert.equal(payload.ticket, "WSP-24817");
    assert.equal(payload.createdAt, submittedAt.toISOString());
    assert.equal(written[0]?.userId, "user-1");
    assert.equal(written[0]?.platform, "web");
  });

  it("never lets a report response be cached", async () => {
    const { supportReportSubmitRoute } = await routes;
    const response = await supportReportSubmitRoute(request(submission), dependencies([]));

    assert.equal(response.headers.get("Cache-Control"), "no-store, no-cache, must-revalidate");
  });

  it("carries the same 90-day deletion stamp the mobile surface writes", async () => {
    const { supportReportSubmitRoute } = await routes;
    const written: Written[] = [];
    await supportReportSubmitRoute(request(submission), dependencies(written));

    assert.deepEqual(written[0]?.purgeAfter, new Date("2026-11-24T09:00:00.000Z"));
  });

  it("accepts the desktop platform value as well", async () => {
    const { supportReportSubmitRoute } = await routes;
    const written: Written[] = [];
    const response = await supportReportSubmitRoute(
      request({ ...submission, platform: "desktop", releaseChannel: "uat" }),
      dependencies(written),
    );

    assert.equal(response.status, 201);
    assert.equal(written[0]?.platform, "desktop");
    assert.equal(written[0]?.releaseChannel, "uat");
  });

  it("refuses a draft the window would have kept disabled", async () => {
    const { supportReportSubmitRoute } = await routes;
    const written: Written[] = [];

    const short = await supportReportSubmitRoute(
      request({ ...submission, body: "çalışmıyor" }),
      dependencies(written),
    );
    assert.equal(short.status, 400);

    const categoryless = await supportReportSubmitRoute(
      request({ ...submission, category: undefined }),
      dependencies(written),
    );
    assert.equal(categoryless.status, 400);
    assert.deepEqual(written, []);
  });

  it("rejects a field the privacy note does not mention", async () => {
    const { supportReportSubmitRoute } = await routes;
    const written: Written[] = [];
    const response = await supportReportSubmitRoute(
      request({ ...submission, contactEmail: "ada@example.com" }),
      dependencies(written),
    );

    assert.equal(response.status, 400);
    assert.deepEqual(written, []);
  });

  it("honours each toggle exactly as it was left", async () => {
    const { supportReportSubmitRoute } = await routes;
    const written: Written[] = [];
    await supportReportSubmitRoute(
      request({ ...submission, includesDeviceInfo: false, includesLogs: false }),
      dependencies(written),
    );

    assert.equal(written[0]?.deviceInfo, undefined);
    assert.equal(written[0]?.logExcerpt, null);
    // Version context is not device data: a report nobody can pin to a build is
    // not triageable, so it stays regardless of the toggle.
    assert.equal(written[0]?.appVersion, "2.4.1");
  });

  it("requires a session and rate limits before anything is written", async () => {
    const { supportReportSubmitRoute } = await routes;
    const written: Written[] = [];

    const unauthenticated = await supportReportSubmitRoute(
      request(submission),
      dependencies(written, {
        authenticate: async () => {
          throw new ApiError("Unauthorized", 401);
        },
      }),
    );
    assert.equal(unauthenticated.status, 401);

    const limited = await supportReportSubmitRoute(
      request(submission),
      dependencies(written, {
        enforceRateLimit: async () => {
          throw new ApiError("Too many requests", 429, "RATE_LIMITED");
        },
      }),
    );
    assert.equal(limited.status, 429);
    assert.deepEqual(written, []);
  });

  it("asks the shared budget for the web report action", async () => {
    const { supportReportSubmitRoute } = await routes;
    const actions: string[] = [];

    await supportReportSubmitRoute(
      request(submission),
      dependencies([], {
        enforceRateLimit: async (_userId, action) => {
          actions.push(action);
        },
      }),
    );

    assert.deepEqual(actions, ["support:report"]);
  });
});
